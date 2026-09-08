import "dotenv/config";
import { DateTime } from "luxon";
import { pool } from "../db.js";

const [dateInput, timeInput] = process.argv.slice(2);
const tutorTimeZone = process.env.TUTOR_TIMEZONE ?? "Europe/Lisbon";

if (!dateInput || !timeInput) {
    throw new Error(
        'Usage: npm run slot:create -- "2026-09-10" "10:00"',
    );
}

const startTime = DateTime.fromISO(
    `${dateInput}T${timeInput}`,
    { zone: tutorTimeZone },
);

if (!startTime.isValid) {
    throw new Error(
        `Invalid date or time: ${startTime.invalidExplanation}`,
    );
}

if (startTime <= DateTime.now()) {
    throw new Error("The availability slot must be in the future.");
}

const endTime = startTime.plus({ minutes: 55 });
const startUtc = startTime.toUTC().toISO();
const endUtc = endTime.toUTC().toISO();

if (!startUtc || !endUtc) {
    throw new Error("Could not convert the slot into UTC.");
}

async function createSlot(): Promise<void> {
    const overlap = await pool.query(
        `
      SELECT id
      FROM availability_slots
      WHERE active = TRUE
        AND starts_at < $2::timestamptz
        AND starts_at
            + duration_minutes * INTERVAL '1 minute'
            > $1::timestamptz
      LIMIT 1
    `,
        [startUtc, endUtc],
    );

    if (overlap.rowCount !== 0) {
        throw new Error("This slot overlaps existing availability.");
    }

    const result = await pool.query(
        `
      INSERT INTO availability_slots (
        starts_at,
        duration_minutes,
        active
      )
      VALUES ($1, 55, TRUE)
      ON CONFLICT (starts_at)
      DO UPDATE SET active = TRUE
      RETURNING id
    `,
        [startUtc],
    );

    console.log("\nAvailability created");
    console.log(`Slot ID: ${result.rows[0].id}`);
    console.log(
        `Your time: ${startTime.toFormat("yyyy-LL-dd HH:mm ZZZZ")}`,
    );
    console.log(`Stored UTC: ${startUtc}`);
    console.log("Duration: 55 minutes");
}

createSlot()
    .catch((error: unknown) => {
        console.error(
            error instanceof Error
                ? error.message
                : "Could not create availability.",
        );

        process.exitCode = 1;
    })
    .finally(async () => {
        await pool.end();
    });