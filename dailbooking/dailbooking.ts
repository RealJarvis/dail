const monthEl = document.getElementById("month-container")
const gridEl = document.getElementById("calendar-gird")

let currentDate: Date = new Date();

function generateCalendarHeader(): void {
    if(monthEl == null) return;

    monthEl.innerText = currentDate.toLocaleString("uk-UA", {
        month: "long", year: "numeric",
    });
}

function toNextMonth(): void {
    currentDate.setMonth(currentDate.getMonth() + 1)
    generateCalendarHeader();
}

function toPrevMonth(): void {
    currentDate.setMonth(currentDate.getMonth() - 1);
    generateCalendarHeader();
}

function generateTimeSlots(): void {
    if (gridEl == null) return;
    const daysOfWeekEN: string[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const daysOfWeekUA: string[] = ["Пон", "Вів", "Сер", "Чет", "Пят", "Суб", "Нед"];

    for (const day of daysOfWeekUA) {
        const weekName: HTMLDivElement = document.createElement("div")
        weekName.classList.add("day-name");
        weekName.innerHTML = day;
        gridEl.appendChild(weekName);
    }

}

generateCalendarHeader();
generateTimeSlots();
console.log(currentDate);


