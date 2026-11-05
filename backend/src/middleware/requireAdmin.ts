import { createHash, timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";

const adminKey = process.env.ADMIN_API_KEY;

if (!adminKey || !/^[a-f0-9]{64}$/.test(adminKey)) {
    throw new Error(
        "ADMIN_API_KEY must be a generated 64-character hexadecimal key.",
    );
}

const expectedHash = createHash("sha256")
    .update(adminKey)
    .digest();

export const requireAdmin: RequestHandler = (
    request,
    response,
    next,
) => {
    response.setHeader("Cache-Control", "no-store");

    const authorization = request.get("Authorization");

    if (
        !authorization?.startsWith("Bearer ") ||
        authorization.length > 256
    ) {
        response.status(401).json({
            message: "Admin authentication required.",
        });
        return;
    }

    const providedKey = authorization.slice("Bearer ".length);

    const providedHash = createHash("sha256")
        .update(providedKey)
        .digest();

    if (!timingSafeEqual(providedHash, expectedHash)) {
        response.status(401).json({
            message: "Admin authentication required.",
        });
        return;
    }

    next();
};