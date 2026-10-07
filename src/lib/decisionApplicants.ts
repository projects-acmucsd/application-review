import {
  getApplicationId,
  getPriorityColumnIndexes,
  parseSheetSectionHeader,
  type SheetRow,
} from './googleSheetData';
import type { ApplicationReview, ReviewDecision } from './reviewApi';

export interface DecisionApplicant {
  applicationId: string;
  applicationIndex: number | null;
  applicantName: string;
  email: string | null;
  firstChoice: string;
  rating: number | null;
  decision: ReviewDecision;
  updatedAt: string;
  updatedByName: string;
}

export type DecisionGroups = Record<ReviewDecision, DecisionApplicant[]>;

const EMAIL_ADDRESS_PATTERN = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

function getApplicantEmailColumn(headers: string[]): number {
  const generalHeaders = headers.map((header) => {
    const { sectionKey, question } = parseSheetSectionHeader(header);
    return sectionKey && sectionKey !== 'general'
      ? '' : question.toLowerCase().replace(/[^a-z0-9]/g, '');
  });
  const standardColumn = generalHeaders.findIndex((header) =>
    header === 'email' || header === 'emailaddress',
  );
  if (standardColumn !== -1) return standardColumn;

  const schoolColumn = generalHeaders.findIndex((header) =>
    /^(?:ucsd|school|student)email(?:address)?$/.test(header),
  );
  // The original Google Form stores the applicant email in column B.
  return schoolColumn === -1 ? 1 : schoolColumn;
}

export function buildDecisionEmailList(applicants: readonly Pick<DecisionApplicant, 'email'>[]): {
  emails: string[];
  text: string;
  missingEmailCount: number;
} {
  const emails: string[] = [];
  const seen = new Set<string>();
  let missingEmailCount = 0;

  for (const applicant of applicants) {
    const email = applicant.email?.trim() ?? '';
    if (!EMAIL_ADDRESS_PATTERN.test(email)) {
      missingEmailCount += 1;
      continue;
    }
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    emails.push(email);
  }

  return { emails, text: emails.join(', '), missingEmailCount };
}

function compareApplicants(left: DecisionApplicant, right: DecisionApplicant): number {
  if (left.rating === null && right.rating !== null) return 1;
  if (left.rating !== null && right.rating === null) return -1;

  const ratingOrder = (right.rating ?? 0) - (left.rating ?? 0);
  if (ratingOrder !== 0) return ratingOrder;

  const nameOrder = left.applicantName.localeCompare(right.applicantName, 'en', {
    sensitivity: 'base',
  });
  if (nameOrder !== 0) return nameOrder;

  return (
    left.applicationId.localeCompare(right.applicationId, 'en', { numeric: true }) ||
    (left.applicationIndex ?? Number.MAX_SAFE_INTEGER) -
      (right.applicationIndex ?? Number.MAX_SAFE_INTEGER)
  );
}

export function buildDecisionGroups({
  reviews,
  rows,
  headers,
}: {
  reviews: ApplicationReview[];
  rows: SheetRow[];
  headers: string[];
}): DecisionGroups {
  const groups: DecisionGroups = { accept: [], waitlist: [], reject: [] };
  const rowsByApplicationId = new Map(rows.map((row) => [getApplicationId(row), row]));
  const firstChoiceColumn =
    getPriorityColumnIndexes(headers).find((column) => column.priority === 1)?.index ?? 13;

  const emailColumn = getApplicantEmailColumn(headers);

  for (const review of reviews) {
    if (review.decision === null) continue;

    const row = rowsByApplicationId.get(review.applicationId);
    groups[review.decision].push({
      applicationId: review.applicationId,
      // A saved ID alone does not prove that the original application still exists.
      applicationIndex: row?.index ?? null,
      applicantName:
        row?.data[2]?.trim() ||
        (row ? `Application ${row.index}` : `Application ${review.applicationId}`),
      email: row?.data[emailColumn]?.trim() || null,
      firstChoice: row?.data[firstChoiceColumn]?.trim() || 'Unspecified',
      rating: review.rating,
      decision: review.decision,
      updatedAt: review.updatedAt,
      updatedByName:
        review.updatedByName.trim() || review.updatedByEmail.trim() || 'Unknown reviewer',
    });
  }

  for (const applicants of Object.values(groups)) {
    applicants.sort(compareApplicants);
  }

  return groups;
}
