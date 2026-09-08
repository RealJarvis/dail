import "dotenv/config";
import cors from "cors";
import express from "express";
import { pool } from "./db.js";
import pricingRouter from "./routes/pricing.js";
import availabilityRouter from "./routes/availability.js";
import googleCalendarRouter from "./routes/googleCalendar.js";
import bookingHoldsRouter from "./routes/bookingHolds.js";

const app = express();

const port = Number(process.env.PORT ?? 3000);
const frontendUrl =
    process.env.FRONTEND_URL ?? "http://localhost:5173";
app.use(express.json());
app.use("/api", bookingHoldsRouter);
app.use("/api", googleCalendarRouter);
app.use(
    cors({
        origin: frontendUrl,
    }),
);

app.use("/api", pricingRouter);
app.use("/api", availabilityRouter);

app.get("/api/health", (_request, response) => {
    response.json({
        status: "ok",
        service: "dail-api",
    });
});

app.get("/api/db-health", async (_request, response) => {
    try {
        const result = await pool.query(
            "SELECT NOW() AS database_time",
        );

        response.json({
            status: "ok",
            databaseTime: result.rows[0].database_time,
        });
    } catch (error) {
        console.error("Database connection failed:", error);

        response.status(500).json({
            status: "error",
            message: "Could not connect to PostgreSQL",
        });
    }
});

app.listen(port, () => {
    console.log(`Dail API is running on port ${port}`);
});