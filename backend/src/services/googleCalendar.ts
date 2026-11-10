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

export type CreateLessonEventInput = {
    appointmentId: string;
    lessonType: "regular" | "trial";
    studentName: string;
    studentEmail: string;
    startsAt: Date;
    endsAt: Date;
    trialDetails?: {
        preferredLessonFrequency: string;
        personalMessage: string;
    } | null;
};

export type CreatedGoogleEvent = {
    eventId: string;
    meetUrl: string | null;
    calendarUrl: string | null;
};

export async function createGoogleLessonEvent(
    input: CreateLessonEventInput,
): Promise<CreatedGoogleEvent> {
    const oauthClient = createAuthorizedClient();

    const calendar = google.calendar({
        version: "v3",
        auth: oauthClient,
    });

    const calendarId =
        process.env.GOOGLE_BOOKING_CALENDAR_ID ?? "primary";

    const timeZone =
        process.env.TUTOR_TIMEZONE ?? "Europe/Lisbon";

    const summary =
        input.lessonType === "trial"
            ? `${input.studentName} - Пробний урок англійської`
            : `${input.studentName} - Урок англійської`;

    let description =
        "Урок заброньовано через Dail. " +
        "Для підключення скористайтеся посиланням " +
        "Google Meet у цій події. " +
        "Якщо вам не підходить час, повідомте " +
        "викладача щонайменше за 12 годин до уроку.";

    if (
        input.lessonType === "trial" &&
        input.trialDetails
    ) {
        description +=
            "\n\nБажана кількість занять на тиждень: " +
            input.trialDetails.preferredLessonFrequency;

        if (input.trialDetails.personalMessage) {
            description +=
                "\nПовідомлення студента: " +
                input.trialDetails.personalMessage;
        }
    }

    // Google event IDs only allow a restricted character set.
    // A UUID without hyphens contains valid hexadecimal characters.
    const eventId = `dail${input.appointmentId.replaceAll("-", "")}`;

    const result = await calendar.events.insert({
        calendarId,
        conferenceDataVersion: 1,
        sendUpdates: "all",
        requestBody: {
            id: eventId,
            summary,
            description,
            start: {
                dateTime: input.startsAt.toISOString(),
                timeZone,
            },
            end: {
                dateTime: input.endsAt.toISOString(),
                timeZone,
            },
            attendees: [
                {
                    email: input.studentEmail,
                    displayName: input.studentName,
                },
            ],
            guestsCanInviteOthers: false,
            guestsCanModify: false,
            conferenceData: {
                createRequest: {
                    requestId: `meet-${input.appointmentId}`,
                    conferenceSolutionKey: {
                        type: "hangoutsMeet",
                    },
                },
            },
        },
    });

    if (!result.data.id) {
        throw new Error(
            "Google created an event without returning its ID.",
        );
    }

    const videoEntry =
        result.data.conferenceData?.entryPoints?.find(
            (entryPoint) =>
                entryPoint.entryPointType === "video",
        );

    return {
        eventId: result.data.id,
        meetUrl:
            result.data.hangoutLink ??
            videoEntry?.uri ??
            null,
        calendarUrl: result.data.htmlLink ?? null,
    };
}