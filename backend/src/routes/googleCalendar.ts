import { randomBytes } from "node:crypto";
import { Router } from "express";
import { google } from "googleapis";

const googleCalendarRouter = Router();

let expectedState: string | null = null;

function createOAuthClient() {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
        throw new Error("Google OAuth environment variables are missing.");
    }

    return new google.auth.OAuth2(
        clientId,
        clientSecret,
        redirectUri,
    );
}

function setupIsEnabled(): boolean {
    return process.env.GOOGLE_OAUTH_SETUP_ENABLED === "true";
}

googleCalendarRouter.get("/google/connect", (_request, response) => {
    if (!setupIsEnabled()) {
        response.status(404).send("Google OAuth setup is disabled.");
        return;
    }

    expectedState = randomBytes(24).toString("hex");

    const oauthClient = createOAuthClient();

    const authorizationUrl = oauthClient.generateAuthUrl({
        access_type: "offline",
        prompt: "consent",
        include_granted_scopes: true,
        scope: [
            "https://www.googleapis.com/auth/calendar.freebusy",
        ],
        state: expectedState,
    });

    response.redirect(authorizationUrl);
});

googleCalendarRouter.get(
    "/google/callback",
    async (request, response) => {
        if (!setupIsEnabled()) {
            response.status(404).send("Google OAuth setup is disabled.");
            return;
        }

        const code = request.query.code;
        const returnedState = request.query.state;

        if (
            typeof code !== "string" ||
            typeof returnedState !== "string" ||
            returnedState !== expectedState
        ) {
            response.status(400).send("Invalid Google OAuth callback.");
            return;
        }

        expectedState = null;

        const oauthClient = createOAuthClient();
        const { tokens } = await oauthClient.getToken(code);

        if (!tokens.refresh_token) {
            response
                .status(400)
                .send("Google did not return a refresh token. Try connecting again.");
            return;
        }

        console.log("\nGoogle Calendar connected.");
        console.log("Add this line to backend/.env:");
        console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}\n`);

        response.send(
            "Google Calendar connected. Return to your backend terminal.",
        );
    },
);

export default googleCalendarRouter;