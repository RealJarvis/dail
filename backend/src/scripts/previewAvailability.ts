import "dotenv/config";
import { DateTime } from "luxon";
import { pool } from "../db.js";
import { buildUpcomingAvailability } from "../services/buildAvailability.js";

async function main(): Promise<void> {
    const slots = await buildUpcomingAvailability();
    const timeZone = process.env.TUTOR_TIMEZONE!;

    console.log(`Generated ${slots.length} future slots.`);

    console.table(
        slots.slice(0, 12).map((slot) => ({
            localStart: DateTime.fromJSDate(slot.startsAt)
                .setZone(timeZone)
                .toFormat("yyyy-MM-dd HH:mm"),
            localEnd: DateTime.fromJSDate(slot.endsAt)
                .setZone(timeZone)
                .toFormat("HH:mm"),
            startsAtUTC: slot.startsAt.toISOString(),
        })),
    );
}

main()
    .catch((error: unknown) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await pool.end();
    });