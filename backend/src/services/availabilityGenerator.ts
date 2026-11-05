import { DateTime } from "luxon";

export type GeneratedSlot = {
    startsAt: Date;
    endsAt: Date;
    durationMinutes: number;
};

const LESSON_MINUTES = 55;
const GAP_MINUTES = 5;

export function generateSlotsForRange(
    localDate: string,
    startsAt: string,
    endsAt: string,
    timeZone: string,
): GeneratedSlot[] {
    const start = DateTime.fromISO(
        `${localDate}T${startsAt}`,
        { zone: timeZone },
    );

    const end = DateTime.fromISO(
        `${localDate}T${endsAt}`,
        { zone: timeZone },
    );

    if (!start.isValid || !end.isValid) {
        throw new Error("Invalid date, time or timezone.");
    }

    if (end.toMillis() <= start.toMillis()) {
        throw new Error("Working hours must end after they start.");
    }

    // Do not silently shift times during a daylight-saving transition.
    const expectedStart = startsAt.length === 5
        ? `${startsAt}:00`
        : startsAt;

    const expectedEnd = endsAt.length === 5
        ? `${endsAt}:00`
        : endsAt;

    if (
        start.toISODate() !== localDate ||
        end.toISODate() !== localDate ||
        start.toFormat("HH:mm:ss") !== expectedStart ||
        end.toFormat("HH:mm:ss") !== expectedEnd ||
        start.getPossibleOffsets().length > 1 ||
        end.getPossibleOffsets().length > 1 ||
        start.offset !== end.offset
    ) {
        throw new Error(
            "This range crosses an ambiguous daylight-saving transition.",
        );
    }

    const slots: GeneratedSlot[] = [];
    let cursor = start;

    while (true) {
        const lessonEnd = cursor.plus({
            minutes: LESSON_MINUTES,
        });

        if (lessonEnd.toMillis() > end.toMillis()) {
            break;
        }

        slots.push({
            startsAt: cursor.toUTC().toJSDate(),
            endsAt: lessonEnd.toUTC().toJSDate(),
            durationMinutes: LESSON_MINUTES,
        });

        cursor = cursor.plus({
            minutes: LESSON_MINUTES + GAP_MINUTES,
        });
    }

    return slots;
}