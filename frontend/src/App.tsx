import { useEffect, useState } from "react";
import "./App.css";

function BookingCalendar() {
  type LessonType = "regular" | "trial";

  type AvailabilitySlot = {
    id: string;
    startsAt: string;
    endsAt: string;
    durationMinutes: number;
  };

  type AvailabilityResponse = {
    lessonType: LessonType;
    durationMinutes: number;
    slots: AvailabilitySlot[];
  };

  type BasketItem = AvailabilitySlot & {
    lessonType: LessonType;
  };

  type BatchBookingResponse = {
    booked?: boolean;
    appointmentCount?: number;
    warning?: string | null;
    message?: string;
  };

  const API_URL = import.meta.env.VITE_API_URL;

  const [lessonType, setLessonType] =
      useState<LessonType>("regular");

  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] =
      useState<number | null>(null);

  const [availableSlots, setAvailableSlots] =
      useState<AvailabilitySlot[]>([]);

  const [isLoadingSlots, setIsLoadingSlots] =
      useState(true);

  const [slotsError, setSlotsError] =
      useState<string | null>(null);

  const [selectedLessons, setSelectedLessons] =
      useState<BasketItem[]>([]);

  const [studentName, setStudentName] = useState("");
  const [studentEmail, setStudentEmail] = useState("");

  const [isBooking, setIsBooking] = useState(false);

  const [bookingError, setBookingError] =
      useState<string | null>(null);

  const [bookingSuccess, setBookingSuccess] =
      useState<string | null>(null);

  const daysOfWeekUA = [
    "Пон",
    "Вів",
    "Сер",
    "Чет",
    "Пт",
    "Суб",
    "Нед",
  ];

  function toggleSlot(slot: AvailabilitySlot): void {
    setBookingError(null);
    setBookingSuccess(null);
    setSelectedLessons((currentLessons) => {
      const isAlreadySelected = currentLessons.some(
          (lesson) => lesson.id === slot.id,
      );

      if (isAlreadySelected) {
        return currentLessons.filter(
            (lesson) => lesson.id !== slot.id,
        );
      }

      return [
        ...currentLessons,
        {
          ...slot,
          lessonType,
        },
      ];
    });
  }

  function removeLesson(slotId: string): void {
    setBookingError(null);
    setBookingSuccess(null);
    setSelectedLessons((currentLessons) =>
        currentLessons.filter(
            (lesson) => lesson.id !== slotId,
        ),
    );
  }

  async function confirmBooking(): Promise<void> {
    const cleanName = studentName.trim();
    const cleanEmail = studentEmail.trim();

    if (cleanName.length < 2) {
      setBookingError(
          "Введіть ім’я, яке містить щонайменше 2 символи.",
      );
      return;
    }

    if (
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)
    ) {
      setBookingError(
          "Введіть правильну електронну пошту.",
      );
      return;
    }

    if (selectedLessons.length === 0) {
      setBookingError(
          "Додайте хоча б одне заняття до кошика.",
      );
      return;
    }

    try {
      setIsBooking(true);
      setBookingError(null);
      setBookingSuccess(null);

      const response = await fetch(
          `${API_URL}/api/appointments/batch`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              studentName: cleanName,
              studentEmail: cleanEmail,
              lessons: selectedLessons.map(
                  (lesson) => ({
                    slotId: lesson.id,
                    lessonType:
                    lesson.lessonType,
                  }),
              ),
            }),
          },
      );

      const data =
          (await response.json()) as BatchBookingResponse;

      if (!response.ok) {
        throw new Error(
            data.message ??
            "Не вдалося забронювати заняття.",
        );
      }

      if (
          data.booked !== true ||
          typeof data.appointmentCount !== "number"
      ) {
        throw new Error(
            "Сервер повернув некоректну відповідь.",
        );
      }

      const bookedSlotIds = new Set(
          selectedLessons.map(
              (lesson) => lesson.id,
          ),
      );

      setAvailableSlots((currentSlots) =>
          currentSlots.filter(
              (slot) =>
                  !bookedSlotIds.has(slot.id),
          ),
      );

      setSelectedLessons([]);

      const confirmationMessage =
          `Бронювання підтверджено. Кількість занять: ${data.appointmentCount}.`;

      setBookingSuccess(
          data.warning
              ? `${confirmationMessage} ${data.warning}`
              : `${confirmationMessage} Запрошення надіслано на вашу електронну пошту.`,
      );
    } catch (error: unknown) {
      setBookingError(
          error instanceof Error
              ? error.message
              : "Не вдалося забронювати заняття.",
      );
    } finally {
      setIsBooking(false);
    }
  }

  function selectDay(day: number): void {
    setSelectedDay(day);
  }

  function toNextMonth(): void {
    setSelectedDay(null);

    setCurrentDate((date) =>
        new Date(
            date.getFullYear(),
            date.getMonth() + 1,
            1,
        ),
    );
  }

  function toPrevMonth(): void {
    setSelectedDay(null);

    setCurrentDate((date) =>
        new Date(
            date.getFullYear(),
            date.getMonth() - 1,
            1,
        ),
    );
  }

  const monthName = currentDate.toLocaleString("uk-UA", {
    month: "long",
    year: "numeric",
  });

  const numberOfDays = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth() + 1,
      0,
  ).getDate();

  const firstDayOfWeek =
      (new Date(
          currentDate.getFullYear(),
          currentDate.getMonth(),
          1,
      ).getDay() + 6) % 7;

  const numberOfEmptyDays = Array.from(
      { length: firstDayOfWeek },
      () => null,
  );

  const nonEmptyCalendarDays = Array.from(
      { length: numberOfDays },
      (_, index) => index + 1,
  );

  const calendarDays = [
    ...numberOfEmptyDays,
    ...nonEmptyCalendarDays,
  ];

  useEffect(() => {
    const controller = new AbortController();

    async function loadAvailability(): Promise<void> {
      try {
        setIsLoadingSlots(true);
        setSlotsError(null);

        const response = await fetch(
            `${API_URL}/api/availability?lessonType=${lessonType}`,
            {
              signal: controller.signal,
            },
        );

        if (!response.ok) {
          throw new Error(
              "Не вдалося завантажити доступний час.",
          );
        }

        const data =
            (await response.json()) as AvailabilityResponse;

        setAvailableSlots(data.slots);
      } catch (error: unknown) {
        if (
            error instanceof DOMException &&
            error.name === "AbortError"
        ) {
          return;
        }

        setSlotsError(
            error instanceof Error
                ? error.message
                : "Не вдалося завантажити доступний час.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingSlots(false);
        }
      }
    }

    void loadAvailability();

    return () => {
      controller.abort();
    };
  }, [API_URL, lessonType]);

  const studentTimeZone =
      Intl.DateTimeFormat().resolvedOptions().timeZone;

  const selectedDaySlots = availableSlots.filter(
      (slot) => {
        if (selectedDay === null) {
          return false;
        }

        const slotDate = new Date(slot.startsAt);

        return (
            slotDate.getFullYear() ===
            currentDate.getFullYear() &&
            slotDate.getMonth() ===
            currentDate.getMonth() &&
            slotDate.getDate() === selectedDay
        );
      },
  );

  const timeFormatter = new Intl.DateTimeFormat(
      "uk-UA",
      {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: studentTimeZone,
        hour12: false,
      },
  );

  const basketDateFormatter = new Intl.DateTimeFormat(
      "uk-UA",
      {
        dateStyle: "long",
        timeStyle: "short",
        timeZone: studentTimeZone,
      },
  );

  const sortedSelectedLessons = [
    ...selectedLessons,
  ].sort(
      (firstLesson, secondLesson) =>
          new Date(firstLesson.startsAt).getTime() -
          new Date(secondLesson.startsAt).getTime(),
  );

  return (
      <>
        <div id="step-container"></div>

        <div id="booking-container">
          <section id="lesson-type-selector">
            <h2>Оберіть тип заняття</h2>

            <div className="lesson-type-options">
              <button
                  type="button"
                  className={
                    lessonType === "regular"
                        ? "selected"
                        : ""
                  }
                  onClick={() =>
                      setLessonType("regular")
                  }
              >
                <strong>Звичайний урок</strong>
                <span>55 хвилин</span>
              </button>

              <button
                  type="button"
                  className={
                    lessonType === "trial"
                        ? "selected"
                        : ""
                  }
                  onClick={() =>
                      setLessonType("trial")
                  }
              >
                <strong>Пробний урок</strong>
                <span>40 хвилин</span>
              </button>
            </div>
          </section>

          <div id="calendar-header">
            <button
                id="prev-btn"
                className="nav-btn"
                type="button"
                onClick={toPrevMonth}
                aria-label="Попередній місяць"
            >
              &lt;
            </button>

            <div id="month-container">
              {monthName}
            </div>

            <button
                id="next-btn"
                className="nav-btn"
                type="button"
                onClick={toNextMonth}
                aria-label="Наступний місяць"
            >
              &gt;
            </button>
          </div>

          <div id="calendar-grid">
            {daysOfWeekUA.map((day) => (
                <div
                    className="day-name"
                    key={day}
                >
                  {day}
                </div>
            ))}

            {calendarDays.map((day, index) => {
              if (day === null) {
                return (
                    <div
                        className="day-number"
                        key={`blank-${index}`}
                        aria-hidden="true"
                    />
                );
              }

              return (
                  <button
                      type="button"
                      className={`day-number ${
                          selectedDay === day
                              ? "selected-day"
                              : ""
                      }`}
                      onClick={() => selectDay(day)}
                      key={`day-${day}`}
                  >
                    {day}
                  </button>
              );
            })}
          </div>

          <p>
            Вибраний день:{" "}
            {selectedDay === null
                ? "не вибрано"
                : `${selectedDay}/${
                    currentDate.getMonth() + 1
                }`}
          </p>

          <div id="time-slots">
            <p>
              Ваша часова зона: {studentTimeZone}
            </p>

            {isLoadingSlots && (
                <p>Завантаження доступного часу...</p>
            )}

            {slotsError && (
                <p className="error-message">
                  {slotsError}
                </p>
            )}

            {!isLoadingSlots &&
                !slotsError &&
                selectedDay !== null &&
                selectedDaySlots.length === 0 && (
                    <p>
                      На цей день немає доступних
                      занять.
                    </p>
                )}

            {!isLoadingSlots &&
                !slotsError &&
                selectedDay === null && (
                    <p>
                      Виберіть день, щоб побачити
                      доступний час.
                    </p>
                )}

            {selectedDaySlots.map((slot) => {
              const isSelected =
                  selectedLessons.some(
                      (lesson) =>
                          lesson.id === slot.id,
                  );

              return (
                  <button
                      type="button"
                      className={`time-slot ${
                          isSelected
                              ? "selected"
                              : ""
                      }`}
                      key={slot.id}
                      onClick={() =>
                          toggleSlot(slot)
                      }
                      aria-pressed={isSelected}
                  >
                    {timeFormatter.format(
                        new Date(slot.startsAt),
                    )}
                  </button>
              );
            })}
          </div>

          <section id="student-details">
            <h2>Ваші дані</h2>

            <label htmlFor="student-name">
              Ім’я
            </label>

            <input
                id="student-name"
                type="text"
                value={studentName}
                onChange={(event) =>
                    setStudentName(
                        event.target.value,
                    )
                }
                autoComplete="name"
                placeholder="Ваше ім’я"
            />

            <label htmlFor="student-email">
              Електронна пошта
            </label>

            <input
                id="student-email"
                type="email"
                value={studentEmail}
                onChange={(event) =>
                    setStudentEmail(
                        event.target.value,
                    )
                }
                autoComplete="email"
                placeholder="student@example.com"
            />
          </section>

          <section id="booking-basket">
            <h2>Кошик занять</h2>

            {selectedLessons.length === 0 ? (
                <p>
                  Ви ще не додали жодного заняття.
                </p>
            ) : (
                sortedSelectedLessons.map(
                    (lesson) => (
                        <div
                            className="basket-item"
                            key={lesson.id}
                        >
                          <div>
                            <strong>
                              {lesson.lessonType ===
                              "regular"
                                  ? "Звичайний урок"
                                  : "Пробний урок"}
                            </strong>

                            <p>
                              {basketDateFormatter.format(
                                  new Date(
                                      lesson.startsAt,
                                  ),
                              )}
                            </p>

                            <span>
                              {
                                lesson.durationMinutes
                              }{" "}
                              хвилин
                            </span>
                          </div>

                          <button
                              type="button"
                              onClick={() =>
                                  removeLesson(
                                      lesson.id,
                                  )
                              }
                              aria-label="Видалити заняття з кошика"
                          >
                            Видалити
                          </button>
                        </div>
                    ),
                )
            )}

            {selectedLessons.length > 0 && (
                <p className="basket-count">
                  Усього занять:{" "}
                  <strong>
                    {selectedLessons.length}
                  </strong>
                </p>
            )}
            {bookingError && (
                <p className="booking-error">
                  {bookingError}
                </p>
            )}

            {bookingSuccess && (
                <p className="booking-success">
                  {bookingSuccess}
                </p>
            )}

            {selectedLessons.length > 0 && (
                <button
                    id="confirm-booking-btn"
                    type="button"
                    onClick={() => void confirmBooking()}
                    disabled={isBooking}
                >
                  {isBooking
                      ? "Бронювання..."
                      : "Підтвердити всі заняття"}
                </button>
            )}
          </section>
        </div>
      </>
  );
}

export default BookingCalendar;