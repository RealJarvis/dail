CREATE TABLE IF NOT EXISTS students (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    name TEXT NOT NULL,
    email TEXT NOT NULL,

    booking_code_hash VARCHAR(64) NOT NULL UNIQUE,
    lesson_price_cents INTEGER NOT NULL
        CHECK (lesson_price_cents > 0),

    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS students_email_unique
    ON students (LOWER(email));


CREATE TABLE IF NOT EXISTS availability_slots (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    starts_at TIMESTAMPTZ NOT NULL UNIQUE,

    duration_minutes SMALLINT NOT NULL DEFAULT 55
        CHECK (duration_minutes = 55),

    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS availability_slots_starts_at_index
    ON availability_slots (starts_at);