const MILLISECONDS_PER_DAY = 86_400_000;
const REVIEW_COUNTDOWN_DAYS = 14;

function calendarDay(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / MILLISECONDS_PER_DAY;
}

export function getReviewDeadlineState(dueDateValue: string, referenceDate = new Date()) {
  // A date-only setting belongs to the local calendar, rather than midnight UTC.
  const dueDate = new Date(`${dueDateValue}T12:00:00`);
  const dayDifference = calendarDay(dueDate) - calendarDay(referenceDate);
  const daysLeft = Math.max(0, dayDifference);

  return {
    dueDate,
    daysLeft,
    hasPassed: dayDifference < 0,
    remainingPercentage: Math.min(100, (daysLeft / REVIEW_COUNTDOWN_DAYS) * 100),
  };
}
