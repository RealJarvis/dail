import { Router } from "express";
import { pool } from "../db.js";
import {
    createGoogleLessonEvent,
    getGoogleBusyPeriods,
} from "../services/googleCalendar.js";

const appointmentsRouter = Router();

type LessonType = "regular" | "trial";

function getLessonDuration(lessonType: LessonType): number {
    return lessonType === "trial" ? 40 : 55;
}

function isUniqueViolation(error: unknown): boolean {
    return (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "23505"
    );
}

appointmentsRouter.post("/appointments", async (request, response) => {
    const {
        studentName,
        studentEmail,
        lessonType,
        slotId,
    } = (request.body ?? {}) as {
        studentName?: unknown;
        studentEmail?: unknown;
        lessonType?: unknown;
        slotId?: unknown;
    };

    if (
        typeof studentName !== "string" ||
        studentName.trim().length < 2 ||
        studentName.trim().length > 100 ||
        typeof studentEmail !== "string" ||
        studentEmail.trim().length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
            studentEmail.trim(),
        ) ||
        (lessonType !== "regular" &&
            lessonType !== "trial") ||
        typeof slotId !== "string" ||
        !/^\d+$/.test(slotId)
    ) {
        response.status(400).json({
            message:
                "Name, valid email, lesson type and slot are required.",
        });
        return;
    }

    const selectedLessonType: LessonType = lessonType;
    const durationMinutes =
        getLessonDuration(selectedLessonType);

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const slotResult = await client.query(
            `
            SELECT id, starts_at
            FROM availability_slots
            WHERE id = $1::bigint
              AND active = TRUE
              AND starts_at > NOW()
            FOR UPDATE
            `,
            [slotId],
        );

        if (slotResult.rowCount !== 1) {
            await client.query("ROLLBACK");

            response.status(409).json({
                message: "This appointment time is unavailable.",
            });
            return;
        }

        const existingReservation = await client.query(
            `
            SELECT 1
            FROM booking_lessons
            WHERE availability_slot_id = $1::bigint
              AND (
                  status = 'booked'
                  OR (
                      status = 'held'
                      AND hold_expires_at > NOW()
                  )
              )

            UNION ALL

            SELECT 1
            FROM appointments
            WHERE availability_slot_id = $1::bigint
              AND status = 'confirmed'

            LIMIT 1
            `,
            [slotId],
        );

        if (existingReservation.rowCount !== 0) {
            await client.query("ROLLBACK");

            response.status(409).json({
                message:
                    "Someone has already booked this appointment.",
            });
            return;
        }

        const startsAt = new Date(
            slotResult.rows[0].starts_at,
        );

        const endsAt = new Date(
            startsAt.getTime() + durationMinutes * 60_000,
        );

        // Recheck Google Calendar at booking time instead of trusting
        // availability that the browser loaded earlier.
        const busyPeriods = await getGoogleBusyPeriods(
            startsAt,
            endsAt,
        );

        const conflictsWithGoogle = busyPeriods.some(
            (busyPeriod) =>
                startsAt < busyPeriod.end &&
                endsAt > busyPeriod.start,
        );

        if (conflictsWithGoogle) {
            await client.query("ROLLBACK");

            response.status(409).json({
                message:
                    "This time has just become unavailable.",
            });
            return;
        }

        const appointmentResult = await client.query(
            `
            INSERT INTO appointments (
                availability_slot_id,
                lesson_type,
                duration_minutes,
                student_name,
                student_email,
                status,
                calendar_status
            )
            VALUES (
                $1::bigint,
                $2,
                $3,
                $4,
                LOWER($5),
                'confirmed',
                'pending'
            )
            RETURNING
                id,
                lesson_type,
                duration_minutes,
                student_name,
                student_email,
                calendar_status,
                created_at
            `,
            [
                slotId,
                selectedLessonType,
                durationMinutes,
                studentName.trim(),
                studentEmail.trim(),
            ],
        );

        await client.query("COMMIT");

        const appointment = appointmentResult.rows[0];

        let calendarStatus: "created" | "failed" = "created";
        let meetUrl: string | null = null;
        let calendarUrl: string | null = null;
        let warning: string | null = null;

        try {
            const googleEvent = await createGoogleLessonEvent({
                appointmentId: appointment.id,
                lessonType: appointment.lesson_type,
                studentName: appointment.student_name,
                studentEmail: appointment.student_email,
                startsAt,
                endsAt,
            });

            meetUrl = googleEvent.meetUrl;
            calendarUrl = googleEvent.calendarUrl;

            await pool.query(
                `
        UPDATE appointments
        SET
            calendar_status = 'created',
            google_event_id = $1,
            google_meet_url = $2
        WHERE id = $3
        `,
                [
                    googleEvent.eventId,
                    googleEvent.meetUrl,
                    appointment.id,
                ],
            );
        } catch (error: unknown) {
            calendarStatus = "failed";

            warning =
                "Бронювання збережено, але не вдалося надіслати запрошення Google Calendar.";

            console.error(
                "Appointment saved, but Google event creation failed:",
                error,
            );

            await pool.query(
                `
        UPDATE appointments
        SET calendar_status = 'failed'
        WHERE id = $1
        `,
                [appointment.id],
            );
        }

        response.status(201).json({
            appointment: {
                id: appointment.id,
                lessonType: appointment.lesson_type,
                durationMinutes:
                appointment.duration_minutes,
                studentName: appointment.student_name,
                studentEmail: appointment.student_email,
                startsAt: startsAt.toISOString(),
                endsAt: endsAt.toISOString(),
                calendarStatus,
                meetUrl,
                calendarUrl,
            },
            warning,
        });
    } catch (error: unknown) {
        await client.query("ROLLBACK");

        if (isUniqueViolation(error)) {
            response.status(409).json({
                message:
                    "Someone has already booked this appointment.",
            });
            return;
        }

        console.error("Could not create appointment:", error);

        response.status(500).json({
            message: "Could not book the appointment.",
        });
    } finally {
        client.release();
    }
});

export default appointmentsRouter;