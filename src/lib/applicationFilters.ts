import {
  getApplicantEmail,
  getApplicantName,
  getApplicationId,
  getFirstChoiceTrack,
  getPriorityColumnIndexes,
  getSheetQuestionLabel,
  parseSheetSectionHeader,
  normalizeSheetTrackName,
  type SheetRow,
  type TrackKey,
} from './googleSheetData';
import type { ApplicationReview, ReviewDecision } from './reviewApi';

export type QueueScope = 'all' | 'assignedToMe';

export function readQueueScope(params: URLSearchParams): QueueScope {
  const value = (params.get('filter') || params.get('name') || '').toLowerCase().replace(/[^a-z]/g, '');
  return ['assignedtome', 'assigned', 'mine'].includes(value) ? 'assignedToMe' : 'all';
}

export type BinaryAnswer = 'yes' | 'no';
export type DecisionStatus = ReviewDecision | 'none';
export interface QuestionFilter {
  question: string;
  answer: BinaryAnswer;
}
export interface ApplicationFilters {
  decisionStatus: DecisionStatus | null;
  firstChoice: TrackKey | null;
  questions: QuestionFilter[];
}
export interface BinaryQuestion {
  header: string;
  label: string;
}

export function normalizeBinaryAnswer(value: string): BinaryAnswer | null {
  const answer = value.trim().toLowerCase();
  return answer === 'yes' || answer === 'no' ? answer : null;
}

export function getBinaryQuestions(headers: string[], rows: SheetRow[]): BinaryQuestion[] {
  const priorityColumns = new Set(getPriorityColumnIndexes(headers).map(({ index }) => index));
  return headers.flatMap((header, index) => {
    // These columns describe review state or identity, not application questions.
    const label = getSheetQuestionLabel(header);
    const metadata = label.toLowerCase().replace(/[^a-z]/g, '');
    if (!header.trim() || priorityColumns.has(index) ||
      ['reviewercomments', 'reviewerdecision', 'reviewerrating', 'reviewer', 'assignedreviewer', 'assigned', 'assignedto', 'assignee', 'owner', 'timestamp', 'email', 'emailaddress', 'name', 'applicantname'].includes(metadata) ||
      headers.indexOf(header) !== index || headers.lastIndexOf(header) !== index) return [];
    const answers = rows.map((row) => row.data[index]?.trim() ?? '').filter(Boolean);
    if (!answers.length || !answers.every((answer) => normalizeBinaryAnswer(answer))) return [];
    const repeated = headers.some((other, otherIndex) => otherIndex !== index && getSheetQuestionLabel(other) === label);
    const section = parseSheetSectionHeader(header).sectionKey;
    return [{ header, label: repeated && section ? `${label} (${section === 'ai' ? 'AI' : section[0].toUpperCase() + section.slice(1)})` : label }];
  });
}

export function readApplicationFilters(params: URLSearchParams): ApplicationFilters {
  const status = params.get('decision');
  const decisionStatus = status === 'accept' || status === 'waitlist' || status === 'reject' || status === 'none' ? status : null;
  const firstChoice = normalizeSheetTrackName(params.get('firstChoice') ?? '') ??
    normalizeSheetTrackName(params.get('filter') ?? '') ??
    (!params.has('filter') ? normalizeSheetTrackName(params.get('name') ?? '') : null);
  const questions: QuestionFilter[] = [];
  for (const value of params.getAll('answer')) {
    try {
      const condition: unknown = JSON.parse(value);
      if (!Array.isArray(condition) || condition.length !== 2) continue;
      const [question, answer] = condition;
      if (typeof question !== 'string' || !question.trim() ||
        (answer !== 'yes' && answer !== 'no') ||
        questions.some((item) => item.question === question)) continue;
      questions.push({ question, answer });
    } catch { /* Ignore malformed links without breaking the review queue. */ }
  }
  return { decisionStatus, firstChoice, questions };
}

export function writeApplicationFilters(params: URLSearchParams, filters: ApplicationFilters): URLSearchParams {
  const next = new URLSearchParams(params);
  // Canonicalize old track links while retaining the independent Assigned scope.
  if (readQueueScope(params) === 'assignedToMe') next.set('filter', 'assignedToMe');
  else next.delete('filter');
  next.delete('application');
  next.delete('name');
  next.delete('firstChoice');
  next.delete('answer');
  next.delete('decision');
  next.set('q', '1');
  if (filters.firstChoice) next.set('firstChoice', filters.firstChoice);
  if (filters.decisionStatus) next.set('decision', filters.decisionStatus);
  for (const { question, answer } of filters.questions) {
    next.append('answer', JSON.stringify([question, answer]));
  }
  return next;
}

export function filterRowsByApplicationFilters(
  rows: SheetRow[],
  headers: string[],
  filters: ApplicationFilters,
  reviews: Readonly<Record<string, Pick<ApplicationReview, 'decision'>>> | null = null,
): SheetRow[] {
  // Unknown review data must never classify every applicant as having no decision.
  if (filters.decisionStatus && reviews === null) return [];
  const conditions = filters.questions.map(({ question, answer }) => ({ index: headers.indexOf(question), answer }));
  return rows.filter((row) =>
    (!filters.decisionStatus || (reviews?.[getApplicationId(row)]?.decision ?? 'none') === filters.decisionStatus) &&
    (!filters.firstChoice || getFirstChoiceTrack(headers, row.data) === filters.firstChoice) &&
    conditions.every(({ index, answer }) => index >= 0 && normalizeBinaryAnswer(row.data[index] ?? '') === answer),
  );
}

// Search is deliberately not part of ApplicationFilters. The filters popover is a
// draft/commit control that replaces the whole object on Apply, which would wipe a
// live search term. Its own parameter also survives writeApplicationFilters, which
// copies the params and only deletes the keys it owns.
export function readApplicantSearch(params: URLSearchParams): string {
  // Keep the typed casing so the UI can quote the term back; matching normalizes separately.
  return (params.get('search') ?? '').trim();
}

// Fold case, accents and repeated spaces so "jose" finds "José" and "maya  patel" finds "Maya Patel".
export function normalizeApplicantSearchText(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// `page` is explicit so the Decisions page, which has no pager, does not gain a stray q=1.
export function writeApplicantSearch(params: URLSearchParams, value: string, page: number | null): URLSearchParams {
  const next = new URLSearchParams(params);
  const search = value.trim();
  if (search) next.set('search', search);
  else next.delete('search');
  if (page !== null) {
    // A pinned application and the old page both point at the wrong person once matches change.
    next.delete('application');
    next.set('q', String(page));
  }
  return next;
}

export function matchesApplicantSearch(headers: string[], rowData: string[], term: string): boolean {
  const search = normalizeApplicantSearchText(term);
  if (!search) return true;
  return normalizeApplicantSearchText(getApplicantName(headers, rowData)).includes(search) ||
    normalizeApplicantSearchText(getApplicantEmail(headers, rowData)).includes(search);
}

export function filterRowsByApplicantSearch(rows: SheetRow[], headers: string[], term: string): SheetRow[] {
  if (!normalizeApplicantSearchText(term)) return rows;
  return rows.filter((row) => matchesApplicantSearch(headers, row.data, term));
}

export function getReviewPage(params: URLSearchParams, count: number): number {
  const requested = Number(params.get('q') ?? 1);
  const page = Number.isSafeInteger(requested) && requested > 0 ? requested : 1;
  return Math.max(1, Math.min(page, count || 1));
}
