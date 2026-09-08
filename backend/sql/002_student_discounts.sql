ALTER TABLE students
    RENAME COLUMN lesson_price_cents TO discount_cents;

ALTER TABLE students
    DROP CONSTRAINT IF EXISTS students_lesson_price_cents_check;

ALTER TABLE students
    ADD CONSTRAINT students_discount_cents_check
    CHECK (discount_cents > 0 AND discount_cents < 1600);