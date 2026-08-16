import { useState } from "react";
import './App.css'

function BookingCalendar() {
  const [currentDate, setCurrentDate] = useState(new Date());

  function toNextMonth() {
    setCurrentDate((date) => {
      const newDate = new Date(date);
      newDate.setMonth(newDate.getMonth() + 1);
      return newDate;
    });
  }

  function toPrevMonth() {
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
          {/* calendar days will go here */}
        </div>
      </div>
    </>
  );
}

export default BookingCalendar;