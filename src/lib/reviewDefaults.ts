const DEFAULT_REVIEW_DUE_DATE_OFFSET_DAYS = 14;

export function getDefaultReviewDueDate(referenceDate = new Date()): string {
  return new Date(
    Date.UTC(
      referenceDate.getUTCFullYear(),
      referenceDate.getUTCMonth(),
      referenceDate.getUTCDate() + DEFAULT_REVIEW_DUE_DATE_OFFSET_DAYS,
    ),
  )
    .toISOString()
    .slice(0, 10);
}
