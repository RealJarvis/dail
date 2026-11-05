import "dotenv/config";
import { DateTime } from "luxon";
import { pool } from "../db.js";
import {
    generateSlotsForRange,
    type GeneratedSlot,
} from "./availabilityGenerator.js";

type WorkingRange = {
    starts_at: string;
    ends_at: string;
};

type WeeklyRule = WorkingRange & {
    weekday: number;
};

type DateOverride = {
    local_date: string;
    is_closed: boolean;
    ranges: WorkingRange[];
};

export async function buildUpcomingAvailability(): Promise<GeneratedSlot[]> {
    const timeZone = process.env.TUTOR_TIMEZONE;

    if (!timeZone) {
        throw new Error("TUTOR_TIMEZONE is missing.");
    }

    const now = DateTime.now().setZone(timeZone);

    if (!now.isValid) {
        throw new Error("TUTOR_TIMEZONE is invalid.");
    }

    const firstDay = now.startOf("day");
    const lastDay = firstDay.plus({ weeks: 8 });

    const weeklyResult = await pool.query<WeeklyRule>(
        `
        SELECT weekday, starts_at::text, ends_at::text
        FROM weekly_availability_rules
        WHERE active = TRUE
        ORDER BY weekday, starts_at
        `,
    );

    const overrideResult = await pool.query<DateOverride>(
        `
        SELECT
            overrides.local_date::text,
            overrides.is_closed,
            COALESCE(
                JSON_AGG(
                    JSON_BUILD_OBJECT(
                        'starts_at', ranges.starts_at::text,
                        'ends_at', ranges.ends_at::text
                    )
                    ORDER BY ranges.starts_at
                ) FILTER (WHERE ranges.id IS NOT NULL),
                '[]'::json
            ) AS ranges
        FROM availability_date_overrides AS overrides
        LEFT JOIN availability_override_ranges AS ranges
            ON ranges.override_id = overrides.id
        WHERE overrides.local_date >= $1::date
          AND overrides.local_date < $2::date
        GROUP BY overrides.id
        ORDER BY overrides.local_date
        `,
        [firstDay.toISODate(), lastDay.toISODate()],
    );

    const overridesByDate = new Map(
        overrideResult.rows.map((override) => [
            override.local_date,
            override,
        ]),
    );

    const slots: GeneratedSlot[] = [];

    for (let offset = 0; offset < 56; offset++) {
        const day = firstDay.plus({ days: offset });
        const localDate = day.toISODate();

        if (!localDate) {
            throw new Error("Could not calculate the local date.");
        }

        const override = overridesByDate.get(localDate);

        const ranges = override
            ? override.is_closed
                ? []
                : override.ranges
            : weeklyResult.rows.filter(
                (rule) => rule.weekday === day.weekday,
            );

        for (const range of ranges) {
            slots.push(
                ...generateSlotsForRange(
                    localDate,
                    range.starts_at,
                    range.ends_at,
                    timeZone,
                ),
            );
        }
    }

    const futureSlots = slots
        .filter((slot) => slot.startsAt.getTime() > now.toMillis())
        .sort(
            (a, b) => a.startsAt.getTime() - b.startsAt.getTime(),
        );

    // Reject overlapping ranges rather than generating unsafe availability.
    for (let index = 1; index < futureSlots.length; index++) {
        const previous = futureSlots[index - 1];
        const current = futureSlots[index];

        if (
            previous &&
            current &&
            current.startsAt.getTime() <
            previous.endsAt.getTime() + 5 * 60_000
        ) {
            throw new Error(
                "Working-hour ranges overlap or leave less than a 5-minute gap.",
            );
        }
    }

    return futureSlots;
}
