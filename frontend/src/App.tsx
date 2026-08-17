import { useState } from "react";
import './App.css'

function BookingCalendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  //const [selectedDay, setSelectedDay] = useSate<number | null>(null)
  /*const daysOfWeekEN: string[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];*/
  const daysOfWeekUA: string[] = ["Пон", "Вів", "Сер", "Чет", "Пт", "Суб", "Нед"];

  function toNextMonth(): void {
    setCurrentDate((date) => {
      const newDate = new Date(date);
      newDate.setMonth(newDate.getMonth() + 1);
      return newDate;
    });
  }

  function toPrevMonth(): void {
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
            calendarDays.map((day, index) => (
                <div className="day-number" key={day === null ? `blank-${index}` : `day-${day}`}>
                  {day}
                </div>
            ))

          }


        </div>
      </div>
    </>
  );
}

export default BookingCalendar;