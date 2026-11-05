import "dotenv/config";
import { generateSlotsForRange } from "../services/availabilityGenerator.js";

const timeZone = process.env.TUTOR_TIMEZONE;

if (!timeZone) {
    throw new Error("TUTOR_TIMEZONE is missing.");
}

const slots = generateSlotsForRange(
    "2026-09-21",
    "09:00:00",
    "12:00:00",
    timeZone,
);

console.table(
    slots.map((slot) => ({
        startsAt: slot.startsAt.toISOString(),
        endsAt: slot.endsAt.toISOString(),
        durationMinutes: slot.durationMinutes,
    })),
);