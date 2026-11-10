import { Router } from "express";
import { pool } from "../db.js";
import {
    createGoogleLessonEvent,
    getGoogleBusyPeriods,
} from "../services/googleCalendar.js";


const appointmentsRouter = Router();

type LessonType = "regular" | "trial";

type TrialDetails = {
    preferredLessonFrequency: string;
    personalMessage: string;
};

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



appointmentsRouter.post(
    "/appointments/batch",
    async (request, response) => {
        const {
            studentName,
            studentEmail,
            lessons,
            trialDetails,
        } = (request.body ?? {}) as {
            studentName?: unknown;
            studentEmail?: unknown;
            lessons?: unknown;
            trialDetails?: unknown;
        };

        const validName =
            typeof studentName === "string" &&
            studentName.trim().length >= 2 &&
            studentName.trim().length <= 100;

        const validEmail =
            typeof studentEmail === "string" &&
            studentEmail.trim().length <= 254 &&
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
                studentEmail.trim(),
            );




        if (
            !validName ||
            !validEmail ||
            !Array.isArray(lessons) ||
            lessons.length === 0 ||
            lessons.length > 12
        ) {
            response.status(400).json({
                message:
                    "Введіть ім’я, правильну електронну пошту та виберіть від 1 до 12 занять.",
            });
            return;
        }

        const requestedLessons: Array<{
            slotId: string;
            lessonType: LessonType;
        }> = [];

        for (const lesson of lessons) {
            if (
                typeof lesson !== "object" ||
                lesson === null
            ) {
                response.status(400).json({
                    message:
                        "Некоректне заняття в кошику.",
                });
                return;
            }

            const {
                slotId,
                lessonType,
            } = lesson as {
                slotId?: unknown;
                lessonType?: unknown;
            };

            if (
                typeof slotId !== "string" ||
                !/^\d+$/.test(slotId) ||
                (
                    lessonType !== "regular" &&
                    lessonType !== "trial"
                )
            ) {
                response.status(400).json({
                    message:
                        "Некоректний час або тип заняття.",
                });
                return;
            }

            requestedLessons.push({
                slotId,
                lessonType,
            });
        }

        const hasTrialLesson = requestedLessons.some(
            (lesson) => lesson.lessonType === "trial",
        );

        let validatedTrialDetails: TrialDetails | null = null;

        if (hasTrialLesson) {
            if (
                typeof trialDetails !== "object" ||
                trialDetails === null
            ) {
                response.status(400).json({
                    message:
                        "Додайте інформацію про пробний урок.",
                });
                return;
            }

            const {
                preferredLessonFrequency,
                personalMessage,
            } = trialDetails as {
                preferredLessonFrequency?: unknown;
                personalMessage?: unknown;
            };

            if (
                typeof preferredLessonFrequency !== "string" ||
                !["1", "2", "3", "4"].includes(
                    preferredLessonFrequency,
                ) ||
                typeof personalMessage !== "string" ||
                personalMessage.length > 1000
            ) {
                response.status(400).json({
                    message:
                        "Некоректна інформація про пробний урок.",
                });
                return;
            }

            validatedTrialDetails = {
                preferredLessonFrequency,
                personalMessage: personalMessage.trim(),
            };
        }

        const uniqueSlotIds = new Set(
            requestedLessons.map(
                (lesson) => lesson.slotId,
            ),
        );

        if (
            uniqueSlotIds.size !==
            requestedLessons.length
        ) {
            response.status(400).json({
                message:
                    "Один час не можна додати до кошика двічі.",
            });
            return;
        }

        const slotIds = requestedLessons.map(
            (lesson) => lesson.slotId,
        );

        const client = await pool.connect();
        let transactionIsActive = false;

        try {
            await client.query("BEGIN");
            transactionIsActive = true;

            /*
             * FOR UPDATE locks every selected slot until the
             * transaction finishes. Another student cannot reserve
             * one of these slots at the same time.
             */
            const slotResult = await client.query(
                `
                SELECT
                    id::text AS id,
                    starts_at
                FROM availability_slots
                WHERE id = ANY($1::bigint[])
                  AND active = TRUE
                  AND starts_at > NOW()
                ORDER BY id
                FOR UPDATE
                `,
                [slotIds],
            );

            if (
                slotResult.rowCount !==
                requestedLessons.length
            ) {
                await client.query("ROLLBACK");
                transactionIsActive = false;

                response.status(409).json({
                    message:
                        "Одне або кілька вибраних занять більше не доступні.",
                });
                return;
            }

            const existingReservation =
                await client.query(
                    `
                    SELECT
                        availability_slot_id::text AS slot_id
                    FROM booking_lessons
                    WHERE availability_slot_id =
                        ANY($1::bigint[])
                      AND (
                          status = 'booked'
                          OR (
                              status = 'held'
                              AND hold_expires_at > NOW()
                          )
                      )

                    UNION ALL

                    SELECT
                        availability_slot_id::text AS slot_id
                    FROM appointments
                    WHERE availability_slot_id =
                        ANY($1::bigint[])
                      AND status = 'confirmed'

                    LIMIT 1
                    `,
                    [slotIds],
                );

            if (existingReservation.rowCount !== 0) {
                await client.query("ROLLBACK");
                transactionIsActive = false;

                response.status(409).json({
                    message:
                        "Одне з вибраних занять уже забронював інший студент.",
                });
                return;
            }

            const slotsById = new Map<
                string,
                Date
            >();

            for (const row of slotResult.rows) {
                slotsById.set(
                    row.id,
                    new Date(row.starts_at),
                );
            }

            const preparedLessons =
                requestedLessons.map((lesson) => {
                    const startsAt =
                        slotsById.get(lesson.slotId);

                    if (!startsAt) {
                        throw new Error(
                            "A selected availability slot was not found.",
                        );
                    }

                    const durationMinutes =
                        getLessonDuration(
                            lesson.lessonType,
                        );

                    const endsAt = new Date(
                        startsAt.getTime() +
                        durationMinutes * 60_000,
                    );

                    return {
                        ...lesson,
                        durationMinutes,
                        startsAt,
                        endsAt,
                    };
                });

            /*
             * Protect against two selected lessons overlapping
             * inside the basket.
             */
            const chronologicallySorted = [
                ...preparedLessons,
            ].sort(
                (first, second) =>
                    first.startsAt.getTime() -
                    second.startsAt.getTime(),
            );

            for (
                let index = 1;
                index < chronologicallySorted.length;
                index += 1
            ) {
                const previous =
                    chronologicallySorted[index - 1]!;

                const current =
                    chronologicallySorted[index]!;

                if (
                    current.startsAt <
                    previous.endsAt
                ) {
                    await client.query("ROLLBACK");
                    transactionIsActive = false;

                    response.status(400).json({
                        message:
                            "Деякі заняття в кошику перетинаються в часі.",
                    });
                    return;
                }
            }

            /*
             * One Google request covers the complete time range,
             * then every lesson is compared with the returned busy
             * periods.
             */
            const earliestStart =
                chronologicallySorted[0]!.startsAt;

            const latestEnd =
                chronologicallySorted[
                chronologicallySorted.length - 1
                    ]!.endsAt;

            const busyPeriods =
                await getGoogleBusyPeriods(
                    earliestStart,
                    latestEnd,
                );

            const hasGoogleConflict =
                preparedLessons.some((lesson) =>
                    busyPeriods.some(
                        (busyPeriod) =>
                            lesson.startsAt <
                            busyPeriod.end &&
                            lesson.endsAt >
                            busyPeriod.start,
                    ),
                );

            if (hasGoogleConflict) {
                await client.query("ROLLBACK");
                transactionIsActive = false;

                response.status(409).json({
                    message:
                        "Один із вибраних проміжків часу щойно став недоступним. Оновіть сторінку та спробуйте ще раз.",
                });
                return;
            }

            const insertedAppointments: Array<{
                appointment: {
                    id: string;
                    studentName: string;
                    studentEmail: string;
                };
                lessonType: LessonType;
                durationMinutes: number;
                startsAt: Date;
                endsAt: Date;
            }> = [];

            /*
             * All database appointments are inserted inside the same
             * transaction. If one fails, none of them are saved.
             */
            for (const lesson of preparedLessons) {
                const appointmentResult =
                    await client.query(
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
                            student_name,
                            student_email
                        `,
                        [
                            lesson.slotId,
                            lesson.lessonType,
                            lesson.durationMinutes,
                            studentName.trim(),
                            studentEmail.trim(),
                        ],
                    );

                const row =
                    appointmentResult.rows[0];

                insertedAppointments.push({
                    appointment: {
                        id: row.id,
                        studentName:
                        row.student_name,
                        studentEmail:
                        row.student_email,
                    },
                    lessonType:
                    lesson.lessonType,
                    durationMinutes:
                    lesson.durationMinutes,
                    startsAt: lesson.startsAt,
                    endsAt: lesson.endsAt,
                });
            }

            await client.query("COMMIT");
            transactionIsActive = false;

            /*
             * Google events are created after the database commit.
             * A Google failure will not lose the confirmed booking.
             */
            const completedAppointments =
                await Promise.all(
                    insertedAppointments.map(
                        async (item) => {
                            try {
                                const googleEvent =
                                    await createGoogleLessonEvent({
                                        appointmentId:
                                        item.appointment.id,
                                        lessonType:
                                        item.lessonType,
                                        studentName:
                                        item.appointment.studentName,
                                        studentEmail:
                                        item.appointment.studentEmail,
                                        startsAt:
                                        item.startsAt,
                                        endsAt:
                                        item.endsAt,
                                        trialDetails:
                                            item.lessonType === "trial"
                                                ? validatedTrialDetails
                                                : null,
                                    });

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
                                        item.appointment.id,
                                    ],
                                );

                                return {
                                    id:
                                    item.appointment.id,
                                    lessonType:
                                    item.lessonType,
                                    durationMinutes:
                                    item.durationMinutes,
                                    startsAt:
                                        item.startsAt.toISOString(),
                                    endsAt:
                                        item.endsAt.toISOString(),
                                    calendarStatus:
                                        "created" as const,
                                    meetUrl:
                                    googleEvent.meetUrl,
                                    calendarUrl:
                                    googleEvent.calendarUrl,
                                };
                            } catch (error: unknown) {
                                console.error(
                                    "Could not create Google event:",
                                    error,
                                );

                                await pool.query(
                                    `
                                    UPDATE appointments
                                    SET calendar_status = 'failed'
                                    WHERE id = $1
                                    `,
                                    [
                                        item.appointment.id,
                                    ],
                                );

                                return {
                                    id:
                                    item.appointment.id,
                                    lessonType:
                                    item.lessonType,
                                    durationMinutes:
                                    item.durationMinutes,
                                    startsAt:
                                        item.startsAt.toISOString(),
                                    endsAt:
                                        item.endsAt.toISOString(),
                                    calendarStatus:
                                        "failed" as const,
                                    meetUrl: null,
                                    calendarUrl: null,
                                };
                            }
                        },
                    ),
                );

            const failedCalendarEvents =
                completedAppointments.filter(
                    (appointment) =>
                        appointment.calendarStatus ===
                        "failed",
                ).length;

            response.status(201).json({
                booked: true,
                appointmentCount:
                completedAppointments.length,
                appointments:
                completedAppointments,
                warning:
                    failedCalendarEvents > 0
                        ? `Бронювання збережено, але не вдалося надіслати ${failedCalendarEvents} запрошень Google Calendar.`
                        : null,
            });
        } catch (error: unknown) {
            if (transactionIsActive) {
                await client.query("ROLLBACK");
            }

            if (isUniqueViolation(error)) {
                response.status(409).json({
                    message:
                        "Одне з вибраних занять уже заброньовано.",
                });
                return;
            }

            console.error(
                "Could not create appointment batch:",
                error,
            );

            response.status(500).json({
                message:
                    "Не вдалося забронювати заняття.",
            });
        } finally {
            client.release();
        }
    },
);

export default appointmentsRouter;