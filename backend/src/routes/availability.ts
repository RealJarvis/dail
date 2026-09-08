import { Router } from "express";
import { pool } from "../db.js";
import { getGoogleBusyPeriods } from "../services/googleCalendar.js";

const availabilityRouter = Router();

availabilityRouter.get("/availability", async (_request, response) => {
    try {
        const result = await pool.query(
            `
                SELECT
                    slots.id,
                    slots.starts_at,
                    slots.duration_minutes,
                    slots.starts_at
                        + slots.duration_minutes * INTERVAL '1 minute'
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

                ORDER BY slots.starts_at
            `,
        );

        if (result.rows.length === 0) {
            response.json({ slots: [] });
            return;
        }

        const firstSlotStart = new Date(result.rows[0].starts_at);
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

                const conflictsWithGoogle = busyPeriods.some(
                    (busyPeriod) =>
                        slotStart < busyPeriod.end &&
                        slotEnd > busyPeriod.start,
                );

                return !conflictsWithGoogle;
            })
            .map((row) => ({
                id: String(row.id),
                startsAt: new Date(row.starts_at).toISOString(),
                endsAt: new Date(row.ends_at).toISOString(),
                durationMinutes: Number(row.duration_minutes),
            }));

        response.setHeader("Cache-Control", "no-store");
        response.json({ slots });
    } catch (error: unknown) {
        console.error("Could not check Google Calendar:", error);

        response.status(503).json({
            message: "Availability is temporarily unavailable.",
        });
    }
});

export default availabilityRouter;