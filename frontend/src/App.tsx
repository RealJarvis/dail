import { useState } from "react";
import './App.css'

function BookingCalendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
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

  const monthName = currentDate.toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });
  const numberOfDays = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate()
  const calendarDays = Array.from({length: numberOfDays},
                                          (_, index) => index + 1)

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
            calendarDays.map((day) => (
                <div className="day-number" key={day}>
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