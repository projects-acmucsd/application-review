import {
  getFirstChoiceTrack,
  getPriorityColumnIndexes,
  getSheetQuestionLabel,
  parseSheetSectionHeader,
  normalizeSheetTrackName,
  type SheetRow,
  type TrackKey,
} from './googleSheetData';

export type QueueScope = 'all' | 'assignedToMe';

export function readQueueScope(params: URLSearchParams): QueueScope {
  const value = (params.get('filter') || params.get('name') || '').toLowerCase().replace(/[^a-z]/g, '');
  return ['assignedtome', 'assigned', 'mine'].includes(value) ? 'assignedToMe' : 'all';
}

export type BinaryAnswer = 'yes' | 'no';
export interface QuestionFilter {
  question: string;
  answer: BinaryAnswer;
}
export interface ApplicationFilters {
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
  return { firstChoice, questions };
}

export function writeApplicationFilters(params: URLSearchParams, filters: ApplicationFilters): URLSearchParams {
  const next = new URLSearchParams(params);
  // Canonicalize old track links while retaining the independent Assigned scope.
  if (readQueueScope(params) === 'assignedToMe') next.set('filter', 'assignedToMe');
  else next.delete('filter');
  next.delete('name');
  next.delete('firstChoice');
  next.delete('answer');
  next.set('q', '1');
  if (filters.firstChoice) next.set('firstChoice', filters.firstChoice);
  for (const { question, answer } of filters.questions) {
    next.append('answer', JSON.stringify([question, answer]));
  }
  return next;
}

export function filterRowsByApplicationFilters(rows: SheetRow[], headers: string[], filters: ApplicationFilters): SheetRow[] {
  const conditions = filters.questions.map(({ question, answer }) => ({ index: headers.indexOf(question), answer }));
  return rows.filter((row) =>
    (!filters.firstChoice || getFirstChoiceTrack(headers, row.data) === filters.firstChoice) &&
    conditions.every(({ index, answer }) => index >= 0 && normalizeBinaryAnswer(row.data[index] ?? '') === answer),
  );
}

export function getReviewPage(params: URLSearchParams, count: number): number {
  const requested = Number(params.get('q') ?? 1);
  const page = Number.isSafeInteger(requested) && requested > 0 ? requested : 1;
  return Math.max(1, Math.min(page, count || 1));
}
