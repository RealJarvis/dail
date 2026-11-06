BEGIN;

CREATE TABLE appointments (
                              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

                              availability_slot_id BIGINT NOT NULL
                                  REFERENCES availability_slots(id),

                              lesson_type TEXT NOT NULL
                                  CHECK (lesson_type IN ('regular', 'trial')),

                              duration_minutes SMALLINT NOT NULL
                                  CHECK (
                                      (lesson_type = 'regular' AND duration_minutes = 55)
                                          OR
                                      (lesson_type = 'trial' AND duration_minutes = 40)
                                      ),

                              student_name TEXT NOT NULL,
                              student_email TEXT NOT NULL,

                              status TEXT NOT NULL DEFAULT 'confirmed'
                                  CHECK (status IN ('confirmed', 'cancelled')),

                              calendar_status TEXT NOT NULL DEFAULT 'pending'
                                  CHECK (
                                      calendar_status IN (
                                                          'pending',
                                                          'created',
                                                          'failed'
                                          )
                                      ),

                              google_event_id TEXT UNIQUE,
                              google_meet_url TEXT,

                              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX appointments_active_slot_unique
    ON appointments (availability_slot_id)
    WHERE status = 'confirmed';

CREATE INDEX appointments_student_email_index
    ON appointments (LOWER(student_email));

CREATE INDEX appointments_created_at_index
    ON appointments (created_at);

COMMIT;