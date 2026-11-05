BEGIN;

CREATE TABLE weekly_availability_rules (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- Monday = 1, Sunday = 7
    weekday SMALLINT NOT NULL
        CHECK (weekday BETWEEN 1 AND 7),

    starts_at TIME NOT NULL,
    ends_at TIME NOT NULL,

    active BOOLEAN NOT NULL DEFAULT TRUE,

    CHECK (ends_at > starts_at),

    UNIQUE (weekday, starts_at, ends_at)
);

CREATE TABLE availability_date_overrides (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    local_date DATE NOT NULL UNIQUE,

    -- TRUE means no availability on this date
    is_closed BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE availability_override_ranges (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    override_id BIGINT NOT NULL
        REFERENCES availability_date_overrides(id)
        ON DELETE CASCADE,

    starts_at TIME NOT NULL,
    ends_at TIME NOT NULL,

    CHECK (ends_at > starts_at),

    UNIQUE (override_id, starts_at, ends_at)
);

ALTER TABLE availability_slots
    ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'
        CHECK (source IN ('manual', 'generated'));

COMMIT;