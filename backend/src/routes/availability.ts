import { Router } from "express";
import { pool } from "../db.js";
import { getGoogleBusyPeriods } from "../services/googleCalendar.js";

const availabilityRouter = Router();

type LessonType = "regular" | "trial";

function getLessonDuration(lessonType: LessonType): number {
    return lessonType === "trial" ? 40 : 55;
}

availabilityRouter.get("/availability", async (request, response) => {
    const requestedType = request.query.lessonType ?? "regular";

    if (
        requestedType !== "regular" &&
        requestedType !== "trial"
    ) {
        response.status(400).json({
            message: "Lesson type must be regular or trial.",
        });
        return;
    }

    const lessonType: LessonType = requestedType;
    const durationMinutes = getLessonDuration(lessonType);

    response.setHeader("Cache-Control", "no-store");

    try {
        const result = await pool.query(
            `
                SELECT
                    slots.id,
                    slots.starts_at,
                    slots.starts_at
                        + $1::integer * INTERVAL '1 minute'
                    AS ends_at
                FROM availability_slots AS slots
                WHERE slots.active = TRUE
                  AND slots.starts_at >= NOW()
                  AND slots.starts_at < NOW() + INTERVAL '62 days'

                  AND NOT EXISTS (
                    SELECT 1
                    FROM booking_lessons AS lessons
                    WHERE lessons.availability_slot_id = slots.id
                  AND (
                    lessons.status = 'booked'
                   OR (
                    lessons.status = 'held'
                  AND lessons.hold_expires_at > NOW()
                    )
                    )
                    )

                  AND NOT EXISTS (
                    SELECT 1
                    FROM appointments
                    WHERE appointments.availability_slot_id = slots.id
                  AND appointments.status = 'confirmed'
                    )

                ORDER BY slots.starts_at
            `,
            [durationMinutes],
        );

        if (result.rows.length === 0) {
            response.json({
                lessonType,
                durationMinutes,
                slots: [],
            });
            return;
        }

        const firstSlotStart = new Date(
            result.rows[0].starts_at,
        );

        const lastSlotEnd = new Date(
            result.rows[result.rows.length - 1].ends_at,
        );

        const busyPeriods = await getGoogleBusyPeriods(
            firstSlotStart,
            lastSlotEnd,
        );

        const slots = result.rows
            .filter((row) => {
                const slotStart = new Date(row.starts_at);
                const slotEnd = new Date(row.ends_at);

                return !busyPeriods.some(
                    (busyPeriod) =>
                        slotStart < busyPeriod.end &&
                        slotEnd > busyPeriod.start,
                );
            })
            .map((row) => ({
                id: String(row.id),
                startsAt: new Date(
                    row.starts_at,
                ).toISOString(),
                endsAt: new Date(
                    row.ends_at,
                ).toISOString(),
                durationMinutes,
            }));

        response.json({
            lessonType,
            durationMinutes,
            slots,
        });
    } catch (error: unknown) {
        console.error(
            "Could not load availability:",
            error,
        );

        response.status(503).json({
            message: "Availability is temporarily unavailable.",
        });
    }
});

export default availabilityRouter;