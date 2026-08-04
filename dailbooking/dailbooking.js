"use strict";
const monthEl = document.getElementById("month-container");
const gridEl = document.getElementById("calendar-gird");
let currentDate = new Date();
function generateCalendarHeader() {
    if (monthEl == null)
        return;
    monthEl.innerText = currentDate.toLocaleString("uk-UA", {
        month: "long", year: "numeric",
    });
}
function toNextMonth() {
    currentDate.setMonth(currentDate.getMonth() + 1);
    generateCalendarHeader();
}
function toPrevMonth() {
    currentDate.setMonth(currentDate.getMonth() - 1);
    generateCalendarHeader();
}
function generateTimeSlots() {
    if (gridEl == null)
        return;
    const daysOfWeekEN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const daysOfWeekUA = ["Пон", "Вів", "Сер", "Чет", "Пят", "Суб", "Нед"];
    for (const day of daysOfWeekUA) {
        const weekName = document.createElement("div");
        weekName.classList.add("day-name");
        weekName.innerHTML = day;
        gridEl.appendChild(weekName);
    }
}
generateCalendarHeader();
generateTimeSlots();
console.log(currentDate);
