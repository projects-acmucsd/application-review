import { getApplicationId, type SheetRow } from './googleSheetData';
import { getReviewPage } from './applicationFilters';

export function getReviewSelectionIndex({ rows, applicationId, page }: {
  rows: SheetRow[];
  applicationId: string | null;
  page: string | null;
}): number {
  // An explicit application must never silently fall back to a different person.
  if (applicationId !== null) {
    return rows.findIndex((row) => getApplicationId(row) === applicationId);
  }
  return getReviewPage(new URLSearchParams(page === null ? {} : { q: page }), rows.length) - 1;
}
