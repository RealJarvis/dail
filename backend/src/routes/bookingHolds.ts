import { createHmac } from "node:crypto";
import { Router } from "express";
import { pool } from "../db.js";
import { getGoogleBusyPeriods } from "../services/googleCalendar.js";

const bookingHoldsRouter = Router();

function getStandardPriceCents(): number {
    const price = Number(process.env.LESSON_PRICE_CENTS);

    if (!Number.isInteger(price) || price <= 0) {
        throw new Error("LESSON_PRICE_CENTS is invalid.");
    }

    return price;
}

function hashDiscountCode(code: string): string {
    const pepper = process.env.BOOKING_CODE_PEPPER;

    if (!pepper) {
        throw new Error("BOOKING_CODE_PEPPER is missing.");
    }

    return createHmac("sha256", pepper)
        .update(code.trim().toUpperCase())
        .digest("hex");
}

function isUniqueViolation(error: unknown): boolean {
    return (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "23505"
    );
}

bookingHoldsRouter.post("/bookings/hold", async (request, response) => {
    const {
        studentName,
        studentEmail,
        discountCode,
        slotIds,
    } = request.body as {
        studentName?: unknown;
        studentEmail?: unknown;
        discountCode?: unknown;
        slotIds?: unknown;
    };

    if (
        typeof studentName !== "string" ||
        !studentName.trim() ||
        typeof studentEmail !== "string" ||
        !studentEmail.includes("@") ||
        !Array.isArray(slotIds) ||
        slotIds.length === 0
    ) {
        response.status(400).json({
            message: "Name, email and at least one slot are required.",
        });
        return;
    }

    if (slotIds.length > 10) {
        response.status(400).json({
            message: "You can book no more than 10 lessons at once.",
        });
        return;
    }

    const uniqueSlotIds = [
        ...new Set(
            slotIds
                .map(String)
                .filter((slotId) => /^\d+$/.test(slotId)),
        ),
    ];

    if (uniqueSlotIds.length !== slotIds.length) {
        response.status(400).json({
            message: "The selected slots are invalid.",
        });
        return;
    }

    try {
        /*
         * Check that every requested slot exists and is still in the future.
         * This happens before opening the database transaction because the
         * Google API request could take some time.
         */
        const candidateResult = await pool.query(
            `
        SELECT
          id,
          starts_at,
          starts_at
            + duration_minutes * INTERVAL '1 minute'
            AS ends_at
        FROM availability_slots
        WHERE id = ANY($1::bigint[])
          AND active = TRUE
          AND starts_at > NOW()
        ORDER BY starts_at
      `,
            [uniqueSlotIds],
        );

        if (candidateResult.rows.length !== uniqueSlotIds.length) {
            response.status(409).json({
                message: "One or more selected slots are unavailable.",
            });
            return;
        }

        /*
         * Recheck Google Calendar instead of trusting the availability
         * that React loaded earlier.
         */
        const firstStart = new Date(candidateResult.rows[0].starts_at);
        const lastEnd = new Date(
            candidateResult.rows[candidateResult.rows.length - 1].ends_at,
        );

        const busyPeriods = await getGoogleBusyPeriods(
            firstStart,
            lastEnd,
        );

        const conflictsWithGoogle = candidateResult.rows.some((slot) => {
            const slotStart = new Date(slot.starts_at);
            const slotEnd = new Date(slot.ends_at);

            return busyPeriods.some(
                (busyPeriod) =>
                    slotStart < busyPeriod.end &&
                    slotEnd > busyPeriod.start,
            );
        });

        if (conflictsWithGoogle) {
            response.status(409).json({
                message: "A selected time now conflicts with your calendar.",
            });
            return;
        }

        /*
         * Work out the price on the backend.
         */
        const standardPriceCents = getStandardPriceCents();
        let discountCents = 0;
        let discountStudentId: string | null = null;

        if (
            typeof discountCode === "string" &&
            discountCode.trim()
        ) {
            const codeHash = hashDiscountCode(discountCode);

            const discountResult = await pool.query(
                `
          SELECT id, discount_cents
          FROM students
          WHERE booking_code_hash = $1
            AND LOWER(email) = LOWER($2)
            AND active = TRUE
        `,
                [codeHash, studentEmail.trim()],
            );

            if (discountResult.rowCount === 0) {
                response.status(400).json({
                    message: "The email or discount code is incorrect.",
                });
                return;
            }

            discountStudentId = String(discountResult.rows[0].id);
            discountCents = Number(
                discountResult.rows[0].discount_cents,
            );
        }

        const lessonPriceCents =
            standardPriceCents - discountCents;

        const totalPriceCents =
            lessonPriceCents * uniqueSlotIds.length;

        const currency = (
            process.env.CURRENCY ?? "eur"
        ).toLowerCase();

        /*
         * Create the booking and hold all its slots atomically.
         */
        const client = await pool.connect();

        try {
            await client.query("BEGIN");

            await client.query(
                `
          UPDATE booking_lessons
          SET status = 'expired'
          WHERE status = 'held'
            AND hold_expires_at <= NOW()
        `,
            );

            await client.query(
                `
          UPDATE bookings
          SET status = 'expired'
          WHERE status = 'pending_payment'
            AND expires_at <= NOW()
        `,
            );

            const lockedSlots = await client.query(
                `
          SELECT id
          FROM availability_slots
          WHERE id = ANY($1::bigint[])
            AND active = TRUE
            AND starts_at > NOW()
          FOR UPDATE
        `,
                [uniqueSlotIds],
            );

            if (lockedSlots.rows.length !== uniqueSlotIds.length) {
                throw new Error("SLOT_UNAVAILABLE");
            }

            const bookingResult = await client.query(
                `
          INSERT INTO bookings (
            student_name,
            student_email,
            discount_student_id,
            standard_price_cents,
            discount_cents,
            total_price_cents,
            currency,
            expires_at
          )
          VALUES (
            $1,
            LOWER($2),
            $3,
            $4,
            $5,
            $6,
            $7,
            NOW() + INTERVAL '15 minutes'
          )
          RETURNING id, expires_at
        `,
                [
                    studentName.trim(),
                    studentEmail.trim(),
                    discountStudentId,
                    standardPriceCents,
                    discountCents,
                    totalPriceCents,
                    currency,
                ],
            );

            const booking = bookingResult.rows[0];

            await client.query(
                `
          INSERT INTO booking_lessons (
            booking_id,
            availability_slot_id,
            lesson_price_cents,
            status,
            hold_expires_at
          )
          SELECT
            $1,
            slot_id,
                       $3,
            'held',
            $4
          FROM UNNEST($2::bigint[]) AS slot_id
        `,
                [
                    booking.id,
                    uniqueSlotIds,
                    lessonPriceCents,
                    booking.expires_at,
                ],
            );

            await client.query("COMMIT");

            response.status(201).json({
                bookingId: booking.id,
                expiresAt: booking.expires_at,
                lessonPriceCents,
                totalPriceCents,
                currency,
            });
        } catch (error: unknown) {
            await client.query("ROLLBACK");

            if (
                isUniqueViolation(error) ||
                (error instanceof Error &&
                    error.message === "SLOT_UNAVAILABLE")
            ) {
                response.status(409).json({
                    message: "A selected slot has just become unavailable.",
                });
                return;
            }

            throw error;
        } finally {
            client.release();
        }
    } catch (error: unknown) {
        console.error("Could not create booking hold:", error);

        response.status(500).json({
            message: "Could not reserve the selected lessons.",
        });
    }
});

export default bookingHoldsRouter;