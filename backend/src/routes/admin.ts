import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { pool } from "../db.js";
import { syncGeneratedAvailability } from "../services/syncAvailability.js";

const adminRouter = Router();


const adminLimiter = rateLimit({
    windowMs: 60_000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        message: "Too many admin requests. Try again shortly.",
    },
});

adminRouter.use(adminLimiter);
adminRouter.use(requireAdmin);

adminRouter.get("/status", (_request, response) => {
    response.json({
        authenticated: true,
    });
});

adminRouter.get("/availability/rules", async (_request, response) => {
    try {
        const result = await pool.query(
            `
            SELECT
                id::text,
                weekday,
                starts_at::text,
                ends_at::text,
                active
            FROM weekly_availability_rules
            ORDER BY weekday, starts_at
            `,
        );

        response.json({
            timeZone: process.env.TUTOR_TIMEZONE,
            lessonMinutes: 55,
            gapMinutes: 5,
            rules: result.rows.map((rule) => ({
                id: rule.id,
                weekday: rule.weekday,
                startsAt: rule.starts_at,
                endsAt: rule.ends_at,
                active: rule.active,
            })),
        });
    } catch (error: unknown) {
        console.error("Could not load availability rules:", error);

        response.status(500).json({
            message: "Could not load your working hours.",
        });
    }
});

adminRouter.put("/availability/rules", async (request, response) => {
    const body = (request.body ?? {}) as {
        rules?: unknown;
    };

    if (!Array.isArray(body.rules) || body.rules.length > 35) {
        response.status(400).json({
            message: "Rules must be an array with no more than 35 ranges.",
        });
        return;
    }

    const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

    const rules = body.rules.map((rule) => {
        if (
            typeof rule !== "object" ||
            rule === null ||
            !("weekday" in rule) ||
            !("startsAt" in rule) ||
            !("endsAt" in rule)
        ) {
            return null;
        }

        const {
            weekday,
            startsAt,
            endsAt,
        } = rule as {
            weekday: unknown;
            startsAt: unknown;
            endsAt: unknown;
        };

        if (
            typeof weekday !== "number" ||
            !Number.isInteger(weekday) ||
            weekday < 1 ||
            weekday > 7 ||
            typeof startsAt !== "string" ||
            typeof endsAt !== "string" ||
            !timePattern.test(startsAt) ||
            !timePattern.test(endsAt) ||
            startsAt >= endsAt
        ) {
            return null;
        }

        return {
            weekday,
            startsAt,
            endsAt,
        };
    });

    if (rules.some((rule) => rule === null)) {
        response.status(400).json({
            message: "One or more working-hour ranges are invalid.",
        });
        return;
    }

    const validRules = rules.filter(
        (rule): rule is NonNullable<typeof rule> => rule !== null,
    );

    // Ensure ranges on the same weekday don't overlap.
    for (let weekday = 1; weekday <= 7; weekday++) {
        const dayRules = validRules
            .filter((rule) => rule.weekday === weekday)
            .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

        for (let index = 1; index < dayRules.length; index++) {
            const previous = dayRules[index - 1];
            const current = dayRules[index];

            if (
                previous &&
                current &&
                current.startsAt < previous.endsAt
            ) {
                response.status(400).json({
                    message: "Working-hour ranges cannot overlap.",
                });
                return;
            }
        }
    }

    const client = await pool.connect();
    let rulesSaved = false;

    try {
        await client.query("BEGIN");

        await client.query(
            "DELETE FROM weekly_availability_rules",
        );

        for (const rule of validRules) {
            await client.query(
                `
                INSERT INTO weekly_availability_rules (
                    weekday,
                    starts_at,
                    ends_at,
                    active
                )
                VALUES ($1, $2::time, $3::time, TRUE)
                `,
                [
                    rule.weekday,
                    rule.startsAt,
                    rule.endsAt,
                ],
            );
        }

        await client.query("COMMIT");
        rulesSaved = true;
    } catch (error: unknown) {
        await client.query("ROLLBACK");
        console.error("Could not save availability rules:", error);

        response.status(500).json({
            message: "Could not save your working hours.",
        });
        return;
    } finally {
        client.release();
    }

    try {
        const synchronization =
            await syncGeneratedAvailability();

        response.json({
            saved: true,
            ruleCount: validRules.length,
            synchronization,
        });
    } catch (error: unknown) {
        console.error(
            "Rules were saved, but slots could not be synchronized:",
            error,
        );

        response.status(500).json({
            message:
                "Working hours were saved, but upcoming slots could not be updated.",
            rulesSaved,
        });
    }
});

export default adminRouter;