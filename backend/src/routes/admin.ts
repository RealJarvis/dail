import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { pool } from "../db.js";


const adminRouter = Router();

adminRouter.use(requireAdmin);

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

export default adminRouter;