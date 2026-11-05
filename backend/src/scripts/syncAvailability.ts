import "dotenv/config";
import { pool } from "../db.js";
import { syncGeneratedAvailability } from "../services/syncAvailability.js";

syncGeneratedAvailability()
    .then((result) => {
        console.log("Availability synchronized.");
        console.table(result);
    })
    .catch((error: unknown) => {
        console.error("Availability synchronization failed:", error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await pool.end();
    });