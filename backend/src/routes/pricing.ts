import { createHmac } from "node:crypto";
import { Router } from "express";
import { pool } from "../db.js";

const pricingRouter = Router();

function getStandardPriceCents(): number {
    const price = Number(process.env.LESSON_PRICE_CENTS);

    if (!Number.isInteger(price) || price <= 0) {
        throw new Error("LESSON_PRICE_CENTS is not configured correctly.");
    }

    return price;
}

function hashBookingCode(code: string): string {
    const pepper = process.env.BOOKING_CODE_PEPPER;

    if (!pepper) {
        throw new Error("BOOKING_CODE_PEPPER is missing.");
    }

    return createHmac("sha256", pepper)
        .update(code.trim().toUpperCase())
        .digest("hex");
}

// Public price for students without a discount
pricingRouter.get("/pricing", (_request, response) => {
    const standardPriceCents = getStandardPriceCents();

    response.json({
        standardPriceCents,
        currency: process.env.CURRENCY ?? "eur",
    });
});

// Validate a personal discount code
pricingRouter.post("/discounts/validate", async (request, response) => {
    const { email, code } = request.body as {
        email?: unknown;
        code?: unknown;
    };

    if (
        typeof email !== "string" ||
        typeof code !== "string" ||
        !email.trim() ||
        !code.trim()
    ) {
        response.status(400).json({
            valid: false,
            message: "Email and discount code are required.",
        });
        return;
    }

    const bookingCodeHash = hashBookingCode(code);

    const result = await pool.query(
        `
      SELECT discount_cents
      FROM students
      WHERE booking_code_hash = $1
        AND LOWER(email) = LOWER($2)
        AND active = TRUE
    `,
        [bookingCodeHash, email.trim()],
    );

    if (result.rowCount === 0) {
        response.status(400).json({
            valid: false,
            message: "The email or discount code is incorrect.",
        });
        return;
    }

    const standardPriceCents = getStandardPriceCents();
    const discountCents = result.rows[0].discount_cents;
    const finalPriceCents = standardPriceCents - discountCents;

    response.json({
        valid: true,
        standardPriceCents,
        discountCents,
        finalPriceCents,
        currency: process.env.CURRENCY ?? "eur",
    });
});

export default pricingRouter;