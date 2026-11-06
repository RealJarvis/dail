import { useState } from "react";
import type { FormEvent } from "react";

type AvailabilityRule = {
    id: string;
    weekday: number;
    startsAt: string;
    endsAt: string;
    active: boolean;
};

type EditableRule = {
    clientId: string;
    weekday: number;
    startsAt: string;
    endsAt: string;
};

type AvailabilityResponse = {
    timeZone: string;
    lessonMinutes: number;
    gapMinutes: number;
    rules: AvailabilityRule[];
};

type SaveResponse = {
    saved: true;
    ruleCount: number;
    synchronization: {
        planned: number;
        refreshed: number;
        skipped: number;
    };
};

const weekdayNames = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
];

export default function AdminAvailabilityPage() {
    const [adminKey, setAdminKey] = useState("");

    const [schedule, setSchedule] =
        useState<AvailabilityResponse | null>(null);

    const [rules, setRules] = useState<EditableRule[]>([]);

    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] =
        useState<string | null>(null);

    async function loadSchedule(
        event: FormEvent<HTMLFormElement>,
    ): Promise<void> {
        event.preventDefault();

        setIsLoading(true);
        setError(null);
        setSuccessMessage(null);

        try {
            const response = await fetch(
                `${import.meta.env.VITE_API_URL}/api/admin/availability/rules`,
                {
                    headers: {
                        Authorization: `Bearer ${adminKey.trim()}`,
                    },
                },
            );

            const data = (await response.json()) as
                | AvailabilityResponse
                | { message?: string };

            if (!response.ok) {
                throw new Error(
                    "message" in data && data.message
                        ? data.message
                        : "Could not load your schedule.",
                );
            }

            const availability = data as AvailabilityResponse;

            setSchedule(availability);

            setRules(
                availability.rules
                    .filter((rule) => rule.active)
                    .map((rule) => ({
                        clientId: rule.id,
                        weekday: rule.weekday,
                        startsAt: rule.startsAt.slice(0, 5),
                        endsAt: rule.endsAt.slice(0, 5),
                    })),
            );
        } catch (error: unknown) {
            setSchedule(null);

            setError(
                error instanceof Error
                    ? error.message
                    : "Could not load your schedule.",
            );
        } finally {
            setIsLoading(false);
        }
    }

    function addRange(weekday: number): void {
        setRules((currentRules) => [
            ...currentRules,
            {
                clientId: crypto.randomUUID(),
                weekday,
                startsAt: "09:00",
                endsAt: "12:00",
            },
        ]);

        setSuccessMessage(null);
        setError(null);
    }

    function removeRange(clientId: string): void {
        setRules((currentRules) =>
            currentRules.filter(
                (rule) => rule.clientId !== clientId,
            ),
        );

        setSuccessMessage(null);
        setError(null);
    }

    function updateRange(
        clientId: string,
        field: "startsAt" | "endsAt",
        value: string,
    ): void {
        setRules((currentRules) =>
            currentRules.map((rule) =>
                rule.clientId === clientId
                    ? {
                        ...rule,
                        [field]: value,
                    }
                    : rule,
            ),
        );

        setSuccessMessage(null);
        setError(null);
    }

    async function saveSchedule(): Promise<void> {
        setIsSaving(true);
        setError(null);
        setSuccessMessage(null);

        try {
            const response = await fetch(
                `${import.meta.env.VITE_API_URL}/api/admin/availability/rules`,
                {
                    method: "PUT",
                    headers: {
                        Authorization: `Bearer ${adminKey.trim()}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        rules: rules.map((rule) => ({
                            weekday: rule.weekday,
                            startsAt: rule.startsAt,
                            endsAt: rule.endsAt,
                        })),
                    }),
                },
            );

            const data = (await response.json()) as
                | SaveResponse
                | { message?: string };

            if (!response.ok) {
                throw new Error(
                    "message" in data && data.message
                        ? data.message
                        : "Could not save your schedule.",
                );
            }

            const result = data as SaveResponse;

            setSuccessMessage(
                `Schedule saved. ${result.synchronization.refreshed} upcoming slots updated.`,
            );
        } catch (error: unknown) {
            setError(
                error instanceof Error
                    ? error.message
                    : "Could not save your schedule.",
            );
        } finally {
            setIsSaving(false);
        }
    }

    function lockAdminPage(): void {
        setAdminKey("");
        setSchedule(null);
        setRules([]);
        setError(null);
        setSuccessMessage(null);
    }

    return (
        <main className="admin-page">
            <h1>Your availability</h1>

            {!schedule && (
                <form onSubmit={(event) => void loadSchedule(event)}>
                    <label htmlFor="admin-key">Admin key</label>

                    <input
                        id="admin-key"
                        type="password"
                        value={adminKey}
                        onChange={(event) => {
                            setAdminKey(event.target.value);
                            setError(null);
                        }}
                        autoComplete="off"
                        spellCheck={false}
                        required
                    />

                    <button type="submit" disabled={isLoading}>
                        {isLoading ? "Loading…" : "Open admin page"}
                    </button>
                </form>
            )}

            {error && <p role="alert">{error}</p>}

            {schedule && (
                <>
                    <div className="admin-toolbar">
                        <div>
                            <p>Timezone: {schedule.timeZone}</p>

                            <p>
                                Lesson: {schedule.lessonMinutes} minutes
                                {" · "}
                                Gap: {schedule.gapMinutes} minutes
                            </p>
                        </div>

                        <button type="button" onClick={lockAdminPage}>
                            Lock admin page
                        </button>
                    </div>

                    <div className="admin-week">
                        {weekdayNames.map((name, index) => {
                            const weekday = index + 1;

                            const dayRules = rules
                                .filter((rule) => rule.weekday === weekday)
                                .sort((a, b) =>
                                    a.startsAt.localeCompare(b.startsAt),
                                );

                            return (
                                <section className="admin-day" key={name}>
                                    <div className="admin-day-header">
                                        <h2>{name}</h2>

                                        <button
                                            type="button"
                                            onClick={() => addRange(weekday)}
                                        >
                                            Add hours
                                        </button>
                                    </div>

                                    {dayRules.length === 0 && (
                                        <p>No working hours</p>
                                    )}

                                    {dayRules.map((rule) => (
                                        <div
                                            className="admin-time-range"
                                            key={rule.clientId}
                                        >
                                            <label>
                                                Start
                                                <input
                                                    type="time"
                                                    value={rule.startsAt}
                                                    onChange={(event) =>
                                                        updateRange(
                                                            rule.clientId,
                                                            "startsAt",
                                                            event.target.value,
                                                        )
                                                    }
                                                />
                                            </label>

                                            <label>
                                                End
                                                <input
                                                    type="time"
                                                    value={rule.endsAt}
                                                    onChange={(event) =>
                                                        updateRange(
                                                            rule.clientId,
                                                            "endsAt",
                                                            event.target.value,
                                                        )
                                                    }
                                                />
                                            </label>

                                            <button
                                                type="button"
                                                onClick={() =>
                                                    removeRange(rule.clientId)
                                                }
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    ))}
                                </section>
                            );
                        })}
                    </div>

                    <div className="admin-save-bar">
                        <button
                            type="button"
                            onClick={() => void saveSchedule()}
                            disabled={isSaving}
                        >
                            {isSaving ? "Saving…" : "Save schedule"}
                        </button>

                        {successMessage && (
                            <p role="status">{successMessage}</p>
                        )}
                    </div>
                </>
            )}
        </main>
    );
}