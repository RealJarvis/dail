import "dotenv/config";
import { createHmac, randomInt } from "node:crypto";
import { pool } from "../db.js";

const [name, email, discountInput] = process.argv.slice(2);
const standardPriceCents = Number(process.env.LESSON_PRICE_CENTS);
const pepper = process.env.BOOKING_CODE_PEPPER;

if (!name || !email || !discountInput) {
    throw new Error(
        'Usage: npm run student:create -- "Name" "email@example.com" "2.00"',
    );
}

if (!email.includes("@")) {
    throw new Error("Please provide a valid email address.");
}

if (!Number.isInteger(standardPriceCents) || standardPriceCents <= 0) {
    throw new Error("LESSON_PRICE_CENTS must be a positive integer.");
}

if (!pepper) {
    throw new Error("BOOKING_CODE_PEPPER is missing from .env.");
}

function eurosToCents(value: string): number {
    const normalizedValue = value.replace(",", ".");

    if (!/^\d+(?:\.\d{1,2})?$/.test(normalizedValue)) {
        throw new Error('Discount must look like "2" or "2.50".');
    }

    const [euros, cents = ""] = normalizedValue.split(".");

    return Number(euros) * 100 + Number(cents.padEnd(2, "0"));
}

function generateCodePart(): string {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    return Array.from(
        { length: 4 },
        () => alphabet[randomInt(alphabet.length)],
    ).join("");
}

function generateBookingCode(): string {
    return `DAIL-${generateCodePart()}-${generateCodePart()}`;
}

function hashBookingCode(code: string): string {
    return createHmac("sha256", pepper!)
        .update(code.trim().toUpperCase())
        .digest("hex");
}

async function createStudent(): Promise<void> {
    const discountCents = eurosToCents(discountInput);

    if (discountCents <= 0 || discountCents >= standardPriceCents) {
        throw new Error(
            `Discount must be greater than €0 and lower than €${(
                standardPriceCents / 100
            ).toFixed(2)}.`,
        );
    }

    const bookingCode = generateBookingCode();
    const bookingCodeHash = hashBookingCode(bookingCode);

    const result = await pool.query(
        `
      INSERT INTO students (
        name,
        email,
        booking_code_hash,
        discount_cents
      )
      VALUES ($1, LOWER($2), $3, $4)
      RETURNING id, name, email, discount_cents
    `,
        [name.trim(), email.trim(), bookingCodeHash, discountCents],
    );

    const student = result.rows[0];
    const finalPriceCents = standardPriceCents - student.discount_cents;

    console.log("\nStudent created successfully");
    console.log(`Name: ${student.name}`);
    console.log(`Email: ${student.email}`);
    console.log(`Discount: €${(student.discount_cents / 100).toFixed(2)}`);
    console.log(`Lesson price: €${(finalPriceCents / 100).toFixed(2)}`);
    console.log(`Booking code: ${bookingCode}`);
    console.log("\nSave this code—the database stores only its hash.");
}

createStudent()
    .catch((error: unknown) => {
        console.error(
            error instanceof Error ? error.message : "Could not create student.",
        );
        process.exitCode = 1;
    })
    .finally(async () => {
        await pool.end();
    });