import { pool } from "../db.js";
import { buildUpcomingAvailability } from "./buildAvailability.js";

export async function syncGeneratedAvailability(): Promise<{
    planned: number;
    refreshed: number;
    skipped: number;
}> {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        // Serialize availability changes and slot reservation locks.
        // Ordinary availability reads can still run.
        await client.query(
            "LOCK TABLE availability_slots IN EXCLUSIVE MODE",
        );

        const desiredSlots = await buildUpcomingAvailability();

        // Disable old generated availability, but preserve reservations.
        // We do not delete rows or change manual slots.
        await client.query(`
            UPDATE availability_slots AS slots
            SET active = FALSE
            WHERE slots.source = 'generated'
              AND slots.starts_at > NOW()
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
        `);

        let refreshed = 0;

        for (const slot of desiredSlots) {
            const result = await client.query(
                `
                INSERT INTO availability_slots (
                    starts_at,
                    duration_minutes,
                    active,
                    source
                )
                SELECT $1::timestamptz, $2::smallint, TRUE, 'generated'
                WHERE $1::timestamptz > NOW()
                  AND NOT EXISTS (
                      SELECT 1
                      FROM availability_slots AS existing
                      WHERE (
                          existing.active = TRUE
                          OR EXISTS (
                              SELECT 1
                              FROM booking_lessons AS lessons
                              WHERE lessons.availability_slot_id = existing.id
                                AND (
                                    lessons.status = 'booked'
                                    OR (
                                        lessons.status = 'held'
                                        AND lessons.hold_expires_at > NOW()
                                    )
                                )
                          )
                      )
                      AND existing.starts_at
                          < $3::timestamptz + INTERVAL '5 minutes'
                      AND existing.starts_at
                          + existing.duration_minutes * INTERVAL '1 minute'
                          + INTERVAL '5 minutes'
                          > $1::timestamptz
                  )
                ON CONFLICT (starts_at)
                DO UPDATE SET active = TRUE
                WHERE availability_slots.source = 'generated'
                RETURNING id
                `,
                [
                    slot.startsAt,
                    slot.durationMinutes,
                    slot.endsAt,
                ],
            );

            refreshed += result.rowCount ?? 0;
        }

        await client.query("COMMIT");

        return {
            planned: desiredSlots.length,
            refreshed,
            skipped: desiredSlots.length - refreshed,
        };
    } catch (error: unknown) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}