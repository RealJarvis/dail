CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS bookings (
                                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    student_name TEXT NOT NULL,
    student_email TEXT NOT NULL,

    discount_student_id BIGINT
    REFERENCES students(id)
    ON DELETE SET NULL,

    standard_price_cents INTEGER NOT NULL
    CHECK (standard_price_cents > 0),

    discount_cents INTEGER NOT NULL DEFAULT 0
    CHECK (
              discount_cents >= 0
              AND discount_cents < standard_price_cents
          ),

    total_price_cents INTEGER NOT NULL
    CHECK (total_price_cents > 0),

    currency VARCHAR(3) NOT NULL DEFAULT 'eur',

    status TEXT NOT NULL DEFAULT 'pending_payment'
    CHECK (
              status IN (
              'pending_payment',
              'paid',
              'expired',
              'cancelled',
              'refunded'
                        )
    ),

    stripe_checkout_session_id TEXT UNIQUE,
    stripe_payment_intent_id TEXT UNIQUE,

    expires_at TIMESTAMPTZ NOT NULL,
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

CREATE TABLE IF NOT EXISTS booking_lessons (
                                               id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

                                               booking_id UUID NOT NULL
                                               REFERENCES bookings(id)
    ON DELETE CASCADE,

    availability_slot_id BIGINT NOT NULL
    REFERENCES availability_slots(id),

    lesson_price_cents INTEGER NOT NULL
    CHECK (lesson_price_cents > 0),

    status TEXT NOT NULL DEFAULT 'held'
    CHECK (
              status IN (
              'held',
              'booked',
              'expired',
              'cancelled',
              'refunded'
                        )
    ),

    hold_expires_at TIMESTAMPTZ NOT NULL,

    google_event_id TEXT UNIQUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

CREATE UNIQUE INDEX IF NOT EXISTS booking_lessons_active_slot_unique
    ON booking_lessons (availability_slot_id)
    WHERE status IN ('held', 'booked');

CREATE INDEX IF NOT EXISTS booking_lessons_booking_id_index
    ON booking_lessons (booking_id);

CREATE INDEX IF NOT EXISTS booking_lessons_expiration_index
    ON booking_lessons (hold_expires_at)
    WHERE status = 'held';