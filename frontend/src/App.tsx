import { useEffect, useState } from "react";
import './App.css'

function BookingCalendar() {
  type AvailabilitySlot = {
    id: string;
    startsAt: string;
    endsAt: string;
    durationMinutes: number;
  };

  type AvailabilityResponse = {
    slots: AvailabilitySlot[];
  };

  type PricingResponse = {
    standardPriceCents: number;
    currency: string;
  };

  type DiscountValidationResponse =
      | {
    valid: true;
    standardPriceCents: number;
    discountCents: number;
    finalPriceCents: number;
    currency: string;
  }
      | {
    valid: false;
    message: string;
  };

  const API_URL = import.meta.env.VITE_API_URL;

  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<number | null>(null)

  const [availableSlots, setAvailableSlots] = useState<AvailabilitySlot[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(true);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [selectedSlots, setSelectedSlots] = useState<AvailabilitySlot[]>([]);

  const [standardPriceCents, setStandardPriceCents] =
      useState<number | null>(null);

  const [currency, setCurrency] = useState("EUR");
  const [pricingError, setPricingError] = useState<string | null>(null);

  // filling students' info states

  const [studentName, setStudentName] = useState("");
  const [studentEmail, setStudentEmail] = useState("");
  const [discountCode, setDiscountCode] = useState("");

  const [appliedDiscountCents, setAppliedDiscountCents] = useState(0);
  const [discountMessage, setDiscountMessage] = useState<string | null>(null);
  const [discountError, setDiscountError] = useState<string | null>(null);
  const [isValidatingDiscount, setIsValidatingDiscount] = useState(false);

  /*const daysOfWeekEN: string[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];*/
  const daysOfWeekUA: string[] = ["Пон", "Вів", "Сер", "Чет", "Пт", "Суб", "Нед"];

  function toggleSlot(slot: AvailabilitySlot): void {
    setSelectedSlots((currentSlots) => {
      const isAlreadySelected = currentSlots.some(
          (selectedSlot) => selectedSlot.id === slot.id,
      );

      if (isAlreadySelected) {
        return currentSlots.filter(
            (selectedSlot) => selectedSlot.id !== slot.id,
        );
      }

      return [...currentSlots, slot];
    });
  }

  function selectDay(day: number): void {
    setSelectedDay(day);
  }

  function toNextMonth(): void {
    setSelectedDay(null);

    setCurrentDate((date) => {
      const newDate = new Date(date);
      newDate.setMonth(newDate.getMonth() + 1);
      return newDate;
    });
  }

  function toPrevMonth(): void {
    setSelectedDay(null);

    setCurrentDate((date) => {
      const newDate = new Date(date);
      newDate.setMonth(newDate.getMonth() - 1);
      return newDate;
    });
  }


  const monthName = currentDate.toLocaleString("uk-UA", {
    month: "long",
    year: "numeric",
  });
  const numberOfDays = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate()
  /*the amount of the days for each month*/
  /*the first day of the calendar month*/
  const firstDayOfWeek = (((new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay()) + 6) % 7);

  const numberOfEmptydays = Array.from({length: firstDayOfWeek}, () => null);
  const nonEmptycalendarDays = Array.from({length: numberOfDays},
                                          (_, index) => index + 1)
  const calendarDays = [...numberOfEmptydays, ...nonEmptycalendarDays]

  useEffect(() => {
    async function loadPricing(): Promise<void> {
      try {
        const response = await fetch(`${API_URL}/api/pricing`);

        if (!response.ok) {
          throw new Error("Could not load the lesson price.");
        }

        const data = (await response.json()) as PricingResponse;

        setStandardPriceCents(data.standardPriceCents);
        setCurrency(data.currency.toUpperCase());
      } catch (error: unknown) {
        setPricingError(
            error instanceof Error
                ? error.message
                : "Could not load the lesson price.",
        );
      }
    }

    void loadPricing();
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function loadAvailability(): Promise<void> {
      try {
        setIsLoadingSlots(true);
        setSlotsError(null);

        const response = await fetch(`${API_URL}/api/availability`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Could not load availability.");
        }

        const data = (await response.json()) as AvailabilityResponse;
        setAvailableSlots(data.slots);
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setSlotsError(
            error instanceof Error
                ? error.message
                : "Could not load availability.",
        );
      } finally {
        setIsLoadingSlots(false);
      }
    }

    void loadAvailability();

    return () => {
      controller.abort();
    };
  }, []);


  const studentTimeZone =
      Intl.DateTimeFormat().resolvedOptions().timeZone;

  const selectedDaySlots = availableSlots.filter((slot) => {
    if (selectedDay === null) {
      return false;
    }

    const slotDate = new Date(slot.startsAt);

    return (
        slotDate.getFullYear() === currentDate.getFullYear() &&
        slotDate.getMonth() === currentDate.getMonth() &&
        slotDate.getDate() === selectedDay
    );
  });

  const timeFormatter = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: studentTimeZone,
    hour12: false,
  });

  const lessonPriceCents =
      standardPriceCents === null
          ? null
          : standardPriceCents - appliedDiscountCents;

  const basketTotalCents =
      lessonPriceCents === null
          ? null
          : lessonPriceCents * selectedSlots.length;

  function formatPrice(priceCents: number): string {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).format(priceCents / 100);
  }

  async function validateDiscount(): Promise<void> {
    if (!studentEmail.trim() || !discountCode.trim()) {
      setDiscountError("Введіть електронну пошту та код знижки.");
      return;
    }

    try {
      setIsValidatingDiscount(true);
      setDiscountError(null);
      setDiscountMessage(null);

      const response = await fetch(`${API_URL}/api/discounts/validate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: studentEmail.trim(),
          code: discountCode.trim(),
        }),
      });

      const data =
          (await response.json()) as DiscountValidationResponse;

      if (!data.valid) {
        throw new Error(data.message);
      }

      if (!response.ok) {
        throw new Error("Не вдалося перевірити код.");
      }

      setStandardPriceCents(data.standardPriceCents);
      setAppliedDiscountCents(data.discountCents);
      setCurrency(data.currency.toUpperCase());

      setDiscountMessage(
          `Знижку ${formatPrice(data.discountCents)} застосовано.`,
      );
    } catch (error: unknown) {
      setAppliedDiscountCents(0);

      setDiscountError(
          error instanceof Error
              ? error.message
              : "Не вдалося перевірити код.",
      );
    } finally {
      setIsValidatingDiscount(false);
    }
  }

  return (
    <>
      <div id="step-container"></div>

      <div id="booking-container">
        <div id="calendar-header">
          <button
            id="prev-btn"
            className="nav-btn"
            onClick={toPrevMonth}
          >
            &lt;
          </button>

          <div id="month-container">
            {monthName}
          </div>

          <button
            id="next-btn"
            className="nav-btn"
            onClick={toNextMonth}
          >
            &gt;
          </button>
        </div>

        <div id="calendar-grid">
          {daysOfWeekUA.map((day) => (
              <div className="day-name" key={day}>
                {day}
              </div>
              )
          )}
          {
            calendarDays.map((day, index) => {
               if (day === null) {
                 return (
                  <div className="day-number" key={`blank-${index}`}>
                    {day}
                  </div>
                 );}
                 else {
                   return (<button
                       className={`day-number ${
                           selectedDay === day ? "selected-day" : ""
                       }`}
                       onClick={() => selectDay(day)}
                       key={`day-${day}`}
                   >
                     {day}
                   </button>);
                  }
          })

          }

        </div>

        <section id="student-details">
          <h2>Ваші дані</h2>

          <label htmlFor="student-name">Ім’я</label>
          <input
              id="student-name"
              type="text"
              value={studentName}
              onChange={(event) => setStudentName(event.target.value)}
              autoComplete="name"
              placeholder="Ваше ім’я"
          />

          <label htmlFor="student-email">Електронна пошта</label>
          <input
              id="student-email"
              type="email"
              value={studentEmail}
              onChange={(event) => {
                setStudentEmail(event.target.value);
                setAppliedDiscountCents(0);
                setDiscountMessage(null);
              }}
              autoComplete="email"
              placeholder="student@example.com"
          />

          <label htmlFor="discount-code">
            Код знижки <span>(необов’язково)</span>
          </label>

          <div className="discount-row">
            <input
                id="discount-code"
                type="text"
                value={discountCode}
                onChange={(event) => {
                  setDiscountCode(event.target.value.toUpperCase());
                  setAppliedDiscountCents(0);
                  setDiscountMessage(null);
                }}
                placeholder="DAIL-XXXX-XXXX"
            />

            <button
                type="button"
                onClick={() => void validateDiscount()}
                disabled={isValidatingDiscount}
            >
              {isValidatingDiscount ? "Перевірка..." : "Застосувати"}
            </button>
          </div>

          {discountMessage && (
              <p className="discount-success">{discountMessage}</p>
          )}

          {discountError && (
              <p className="discount-error">{discountError}</p>
          )}
        </section>

        <p>
          Вибраний день: {selectedDay ?? "none"}/{currentDate.getMonth() + 1}
        </p>

        <div id="time-slots">
          <p>Ваша часова зона: {studentTimeZone}</p>

          {isLoadingSlots && <p>Loading available times...</p>}

          {slotsError && <p>{slotsError}</p>}

          {!isLoadingSlots &&
              !slotsError &&
              selectedDay !== null &&
              selectedDaySlots.length === 0 && (
                  <p>No available lessons on this day.</p>
              )}

          {selectedDaySlots.map((slot) => {
            const isSelected = selectedSlots.some(
                (selectedSlot) => selectedSlot.id === slot.id,
            );

            return (
                <button
                    className={`time-slot ${isSelected ? "selected" : ""}`}
                    key={slot.id}
                    onClick={() => toggleSlot(slot)}
                    aria-pressed={isSelected}
                >
                  {timeFormatter.format(new Date(slot.startsAt))}
                </button>
            );
          })}
        </div>

        <div id="booking-basket">
          <h2>Вибрані години:</h2>

          {selectedSlots.length === 0 && (
              <p>Ви ще не вибрали жодного заняття.</p>
          )}

          {selectedSlots.map((slot) => (
              <div key={slot.id}>
      <span>
        {new Intl.DateTimeFormat(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: studentTimeZone,
        }).format(new Date(slot.startsAt))}
      </span>

                {lessonPriceCents !== null && (
                    <span>
          {appliedDiscountCents > 0 &&
              standardPriceCents !== null && (
                  <>
                    <s>{formatPrice(standardPriceCents)}</s>{" "}
                  </>
              )}

                      {formatPrice(lessonPriceCents)}
        </span>
                )}
              </div>
          ))}

          {pricingError && <p>{pricingError}</p>}

          {basketTotalCents !== null && selectedSlots.length > 0 && (
              <p>
                <strong>
                  Сума до сплати: {formatPrice(basketTotalCents)}
                </strong>
              </p>
          )}
        </div>

        {pricingError && <p>{pricingError}</p>}

        {basketTotalCents !== null && selectedSlots.length > 0 && (
            <p>
              <strong>Created by Ihor Hamaniuk </strong>
            </p>
        )}

      </div>
    </>
  );
}

export default BookingCalendar;