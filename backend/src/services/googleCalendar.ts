import { google } from "googleapis";

export type BusyPeriod = {
    start: Date;
    end: Date;
};

function createAuthorizedClient() {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;
    const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

    if (
        !clientId ||
        !clientSecret ||
        !redirectUri ||
        !refreshToken
    ) {
        throw new Error("Google Calendar configuration is incomplete.");
    }

    const oauthClient = new google.auth.OAuth2(
        clientId,
        clientSecret,
        redirectUri,
    );

    oauthClient.setCredentials({
        refresh_token: refreshToken,
    });

    return oauthClient;
}

export async function getGoogleBusyPeriods(
    timeMin: Date,
    timeMax: Date,
): Promise<BusyPeriod[]> {
    const oauthClient = createAuthorizedClient();
    const calendarIds = (
        process.env.GOOGLE_CALENDAR_IDS ?? "primary"
    )
        .split(",")
        .map((calendarId) => calendarId.trim())
        .filter(Boolean);

    const calendar = google.calendar({
        version: "v3",
        auth: oauthClient,
    });

    const result = await calendar.freebusy.query({
        requestBody: {
            timeMin: timeMin.toISOString(),
            timeMax: timeMax.toISOString(),
            items: calendarIds.map((calendarId) => ({
                id: calendarId,
            })),
        },
    });

    const calendarResults = Object.values(
        result.data.calendars ?? {},
    );

    return calendarResults.flatMap((calendarResult) =>
        (calendarResult.busy ?? []).flatMap((period) => {
            if (!period.start || !period.end) {
                return [];
            }

            return [
                {
                    start: new Date(period.start),
                    end: new Date(period.end),
                },
            ];
        }),
    );
}