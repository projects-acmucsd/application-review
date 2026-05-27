import { getGoogleApiClient } from './googleAuth';
import {
  getApplicationSourceSettings,
  type ApplicationSourceSettings,
} from './settingsApi';

export interface SheetRow {
  data: string[];
  index: number;
}

export interface ApplicationSheetData {
  headers: string[];
  rows: SheetRow[];
  source: ApplicationSourceSettings;
}

export type TrackKey = 'ai' | 'design' | 'gameDev' | 'hack';
export type SheetSectionKey = TrackKey | 'general' | 'other';

export const REVIEWER_COMMENTS_HEADER = 'Reviewer Comments';

const FALLBACK_PRIORITY_COLUMN_INDEXES = [13, 14, 15, 16];
const SECTION_HEADER_PREFIX_PATTERN = /^\s*\[([^\]]+)]\s*(.*)$/;
const SHEET_DATA_CACHE_TTL_MS = 5 * 60_000;

interface SheetDataCacheEntry {
  expiresAt: number;
  promise: Promise<ApplicationSheetData>;
}

const sheetDataCache = new Map<string, SheetDataCacheEntry>();

function getSheetDataCacheKey(source: ApplicationSourceSettings): string {
  return [
    source.spreadsheetId,
    source.sheetName,
    source.sheetRange,
    source.updatedAt,
  ].join(':');
}

export function clearApplicationSheetDataCache() {
  sheetDataCache.clear();
}

export function getApplicationId(row: SheetRow): string {
  return `sheet-row:${row.index}`;
}

export function normalizeSheetTrackName(value: string): TrackKey | null {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, '');

  if (normalized === 'ai') return 'ai';
  if (normalized === 'design') return 'design';
  if (normalized === 'hack') return 'hack';
  if (['gamedev', 'gamedevelopment', 'game'].includes(normalized)) {
    return 'gameDev';
  }

  return null;
}

export function normalizeSheetSectionKey(value: string): SheetSectionKey | null {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, '');

  if (['gen', 'general'].includes(normalized)) return 'general';
  if (['other', 'misc', 'miscellaneous'].includes(normalized)) return 'other';

  return normalizeSheetTrackName(value);
}

export function parseSheetSectionHeader(header: string): {
  hasSectionPrefix: boolean;
  question: string;
  sectionKey: SheetSectionKey | null;
} {
  const match = SECTION_HEADER_PREFIX_PATTERN.exec(header);

  if (!match) {
    return {
      hasSectionPrefix: false,
      question: header,
      sectionKey: null,
    };
  }

  const sectionKey = normalizeSheetSectionKey(match[1]);

  return {
    hasSectionPrefix: sectionKey !== null,
    question: match[2].trim() || header,
    sectionKey,
  };
}

export function getSheetQuestionLabel(header: string): string {
  return parseSheetSectionHeader(header).question;
}

export function getPriorityColumnIndexes(
  headers: string[],
): Array<{ index: number; priority: number }> {
  const priorityLabelByName: Record<string, number> = {
    first: 1,
    second: 2,
    third: 3,
    fourth: 4,
  };

  const detectedColumns = headers
    .map((header, index) => {
      const match = /\b(first|second|third|fourth)\s+(?:choice|priority)\b/i.exec(
        header,
      );

      return match
        ? {
            index,
            priority: priorityLabelByName[match[1].toLowerCase()],
          }
        : null;
    })
    .filter((column): column is { index: number; priority: number } =>
      Boolean(column),
    )
    .sort((a, b) => a.priority - b.priority);

  if (detectedColumns.length) {
    return detectedColumns;
  }

  return FALLBACK_PRIORITY_COLUMN_INDEXES.map((index, priorityIndex) => ({
    index,
    priority: priorityIndex + 1,
  }));
}

export function getFirstChoiceTrack(
  headers: string[],
  rowData: string[],
): TrackKey | null {
  const firstChoiceColumn =
    getPriorityColumnIndexes(headers).find((column) => column.priority === 1)
      ?.index ?? FALLBACK_PRIORITY_COLUMN_INDEXES[0];

  return normalizeSheetTrackName(rowData[firstChoiceColumn] || '');
}

export function getColumnLetter(index: number): string {
  let temp = index;
  let letter = '';

  while (temp > 0) {
    letter = String.fromCharCode(65 + ((temp - 1) % 26)) + letter;
    temp = Math.floor((temp - 1) / 26);
  }

  return letter;
}

export function getReviewerCommentsColumnIndex(headers: string[]): number {
  return headers.findIndex(
    (header) =>
      header.trim().toLowerCase() === REVIEWER_COMMENTS_HEADER.toLowerCase(),
  );
}

export function formatSheetNameForRange(sheetName: string): string {
  return `'${sheetName.replace(/'/g, "''")}'`;
}

export function getSheetValuesRange(source: ApplicationSourceSettings): string {
  return `${formatSheetNameForRange(source.sheetName)}!${source.sheetRange}`;
}

export function getSheetHeaderRange(source: ApplicationSourceSettings): string {
  return `${formatSheetNameForRange(source.sheetName)}!1:1`;
}

export function getDynamicSheetValuesRange(
  source: ApplicationSourceSettings,
  headers: string[],
): string {
  const lastColumn = getColumnLetter(headers.length);
  return `${formatSheetNameForRange(source.sheetName)}!A1:${lastColumn}`;
}

export function getSheetCellRange(
  source: ApplicationSourceSettings,
  cellRange: string,
): string {
  return `${formatSheetNameForRange(source.sheetName)}!${cellRange}`;
}

function trimTrailingEmptyCells(values: string[]): string[] {
  const trimmed = [...values];

  while (trimmed.length && !trimmed[trimmed.length - 1]?.trim()) {
    trimmed.pop();
  }

  return trimmed;
}

export async function loadApplicationSheetData(
  source?: ApplicationSourceSettings,
  options: { bypassCache?: boolean } = {},
): Promise<ApplicationSheetData> {
  const applicationSource = source ?? (await getApplicationSourceSettings());
  const cacheKey = getSheetDataCacheKey(applicationSource);
  const cachedData = sheetDataCache.get(cacheKey);

  if (
    !options.bypassCache &&
    cachedData &&
    cachedData.expiresAt > Date.now()
  ) {
    return cachedData.promise;
  }

  const promise = loadApplicationSheetDataFromSource(applicationSource).catch(
    (error: unknown) => {
      sheetDataCache.delete(cacheKey);
      throw error;
    },
  );

  sheetDataCache.set(cacheKey, {
    expiresAt: Date.now() + SHEET_DATA_CACHE_TTL_MS,
    promise,
  });

  return promise;
}

async function loadApplicationSheetDataFromSource(
  applicationSource: ApplicationSourceSettings,
): Promise<ApplicationSheetData> {
  const gapi = await getGoogleApiClient();
  const headerResponse = await gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId: applicationSource.spreadsheetId,
    range: getSheetHeaderRange(applicationSource),
  });

  const headers = trimTrailingEmptyCells(headerResponse.result.values?.[0] || []);
  if (!headers.length) {
    return {
      headers: [],
      rows: [],
      source: applicationSource,
    };
  }

  const valuesResponse = await gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId: applicationSource.spreadsheetId,
    range: getDynamicSheetValuesRange(applicationSource, headers),
  });

  const rows = valuesResponse.result.values || [];
  const resolvedHeaders = trimTrailingEmptyCells(rows[0] || headers);

  return {
    headers: resolvedHeaders,
    rows: rows.slice(1).map((row: string[], index: number) => ({
      data: row,
      index: index + 1,
    })),
    source: applicationSource,
  };
}
