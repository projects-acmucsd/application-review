import { createSupabaseUnavailableError, getSupabaseAdmin, isSupabaseConnectionError, shouldUseSupabaseReadFallback, } from '../../lib/supabase.js';
import { env } from '../../config/env.js';
import { createHttpError, fetchGoogleProfile, } from '../auth/google-auth.js';
import { requireAdmin } from '../admin/admin.service.js';
const REVIEW_SETTINGS_ID = 'default';
const APPLICATION_SOURCE_SETTINGS_ID = 'default';
const DEVELOPMENT_ACCESS_TOKEN = 'development-access-token';
export const DEFAULT_REVIEW_DUE_DATE = '2026-05-03';
export const DEFAULT_APPLICATION_SPREADSHEET_ID = '1lJSS8R-SuGULx3ATWucr9k7FgK_4gmr4E4gUwsUddAY';
export const DEFAULT_APPLICATION_SHEET_NAME = 'Form Responses 1';
export const DEFAULT_APPLICATION_SHEET_RANGE = 'A1:BH';
function normalizeEmail(email) {
    return email.trim().toLowerCase();
}
function assertAcmEmail(email) {
    if (!normalizeEmail(email).endsWith('@acmucsd.org')) {
        throw createHttpError(403, 'An @acmucsd.org account is required.');
    }
}
function toReviewSettings(row) {
    return {
        dueDate: row.due_date,
        updatedByEmail: row.updated_by_email,
        updatedAt: row.updated_at,
    };
}
function toApplicationSourceSettings(row) {
    return {
        spreadsheetId: row.spreadsheet_id,
        spreadsheetUrl: row.spreadsheet_url,
        sheetName: row.sheet_name,
        sheetRange: row.sheet_range,
        updatedByEmail: row.updated_by_email,
        updatedAt: row.updated_at,
    };
}
function defaultReviewSettings() {
    return {
        dueDate: DEFAULT_REVIEW_DUE_DATE,
        updatedByEmail: 'system@acmucsd.org',
        updatedAt: new Date(0).toISOString(),
    };
}
function defaultApplicationSourceSettings() {
    return {
        spreadsheetId: DEFAULT_APPLICATION_SPREADSHEET_ID,
        spreadsheetUrl: buildSpreadsheetUrl(DEFAULT_APPLICATION_SPREADSHEET_ID),
        sheetName: DEFAULT_APPLICATION_SHEET_NAME,
        sheetRange: DEFAULT_APPLICATION_SHEET_RANGE,
        updatedByEmail: 'system@acmucsd.org',
        updatedAt: new Date(0).toISOString(),
    };
}
function isMissingSettingsError(error) {
    return (error?.code === 'PGRST116' ||
        error?.code === 'PGRST205' ||
        error?.code === '42P01');
}
function normalizeDueDate(value) {
    const trimmedValue = value.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmedValue)) {
        throw createHttpError(400, 'Due date must use YYYY-MM-DD format.');
    }
    const parsed = new Date(`${trimmedValue}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) {
        throw createHttpError(400, 'Due date is invalid.');
    }
    const [year, month, day] = trimmedValue.split('-').map(Number);
    if (parsed.getUTCFullYear() !== year ||
        parsed.getUTCMonth() + 1 !== month ||
        parsed.getUTCDate() !== day) {
        throw createHttpError(400, 'Due date is invalid.');
    }
    return trimmedValue;
}
function parseSpreadsheetId(spreadsheetUrl) {
    const trimmedUrl = spreadsheetUrl.trim();
    if (!trimmedUrl) {
        throw createHttpError(400, 'Google Sheet link is required.');
    }
    const docsMatch = trimmedUrl.match(/docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]+)/);
    if (docsMatch?.[1]) {
        return docsMatch[1];
    }
    if (/^[A-Za-z0-9_-]{20,}$/.test(trimmedUrl)) {
        return trimmedUrl;
    }
    throw createHttpError(400, 'Enter a valid Google Sheet URL or spreadsheet id.');
}
function parseSheetGid(spreadsheetUrl) {
    const gidMatch = spreadsheetUrl.match(/[?#&]gid=(\d+)/);
    if (!gidMatch?.[1]) {
        return null;
    }
    const parsedGid = Number.parseInt(gidMatch[1], 10);
    return Number.isFinite(parsedGid) ? parsedGid : null;
}
function buildSpreadsheetUrl(spreadsheetId) {
    return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
}
function normalizeSheetName(sheetName) {
    const normalizedSheetName = (sheetName || DEFAULT_APPLICATION_SHEET_NAME).trim();
    if (!normalizedSheetName) {
        throw createHttpError(400, 'Sheet tab name is required.');
    }
    if (normalizedSheetName.includes('!')) {
        throw createHttpError(400, 'Sheet tab name cannot include "!".');
    }
    return normalizedSheetName;
}
function escapeSheetNameForRange(sheetName) {
    return `'${sheetName.replace(/'/g, "''")}'`;
}
function buildSheetValuesRange(sheetName, sheetRange) {
    return `${escapeSheetNameForRange(sheetName)}!${sheetRange}`;
}
async function getSheetTitleForGid({ accessToken, spreadsheetId, gid, }) {
    const metadataResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=sheets(properties(sheetId,title))`, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
    });
    if (!metadataResponse.ok) {
        const metadataError = (await metadataResponse
            .json()
            .catch(() => ({})));
        throw createHttpError(400, metadataError.error?.message ||
            'Could not inspect tabs for that Google Sheet.');
    }
    const metadata = (await metadataResponse.json());
    const matchingSheet = metadata.sheets?.find((sheet) => sheet.properties?.sheetId === gid);
    const sheetTitle = matchingSheet?.properties?.title?.trim();
    if (!sheetTitle) {
        throw createHttpError(400, 'Could not find the selected tab in that Google Sheet.');
    }
    return sheetTitle;
}
async function resolveSheetNameFromSource({ accessToken, spreadsheetId, spreadsheetUrl, sheetName, }) {
    const normalizedSheetName = normalizeSheetName(sheetName);
    const selectedGid = parseSheetGid(spreadsheetUrl);
    if (selectedGid === null ||
        normalizedSheetName !== DEFAULT_APPLICATION_SHEET_NAME ||
        (accessToken === DEVELOPMENT_ACCESS_TOKEN && env.nodeEnv !== 'production')) {
        return normalizedSheetName;
    }
    return getSheetTitleForGid({
        accessToken,
        spreadsheetId,
        gid: selectedGid,
    });
}
async function validateApplicationSourceAccess({ accessToken, spreadsheetId, sheetName, sheetRange, }) {
    if (accessToken === DEVELOPMENT_ACCESS_TOKEN && env.nodeEnv !== 'production') {
        return;
    }
    const valuesRange = buildSheetValuesRange(sheetName, sheetRange);
    const validationResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(valuesRange)}`, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
    });
    if (validationResponse.ok) {
        return;
    }
    const validationError = (await validationResponse
        .json()
        .catch(() => ({})));
    throw createHttpError(400, validationError.error?.message ||
        'Could not read that Google Sheet tab with the current account.');
}
export async function requireAcmUser(accessToken) {
    const profile = await fetchGoogleProfile(accessToken);
    assertAcmEmail(profile.email);
    return profile;
}
export async function getReviewSettings(accessToken) {
    await requireAcmUser(accessToken);
    const { data, error } = await getSupabaseAdmin()
        .from('review_settings')
        .select('*')
        .eq('id', REVIEW_SETTINGS_ID)
        .maybeSingle();
    if (error) {
        if (isMissingSettingsError(error)) {
            return defaultReviewSettings();
        }
        if (shouldUseSupabaseReadFallback(error)) {
            return defaultReviewSettings();
        }
        throw error;
    }
    return data ? toReviewSettings(data) : defaultReviewSettings();
}
export async function getApplicationSourceSettings(accessToken) {
    await requireAcmUser(accessToken);
    const { data, error } = await getSupabaseAdmin()
        .from('application_source_settings')
        .select('*')
        .eq('id', APPLICATION_SOURCE_SETTINGS_ID)
        .maybeSingle();
    if (error) {
        if (isMissingSettingsError(error)) {
            return defaultApplicationSourceSettings();
        }
        if (shouldUseSupabaseReadFallback(error)) {
            return defaultApplicationSourceSettings();
        }
        throw error;
    }
    return data
        ? toApplicationSourceSettings(data)
        : defaultApplicationSourceSettings();
}
export async function updateReviewDueDate({ accessToken, dueDate, }) {
    const adminProfile = await requireAdmin(accessToken);
    const normalizedDueDate = normalizeDueDate(dueDate);
    const { data, error } = await getSupabaseAdmin()
        .from('review_settings')
        .upsert({
        id: REVIEW_SETTINGS_ID,
        due_date: normalizedDueDate,
        updated_by_email: normalizeEmail(adminProfile.email),
    }, { onConflict: 'id' })
        .select()
        .single();
    if (error) {
        if (isSupabaseConnectionError(error)) {
            throw createSupabaseUnavailableError();
        }
        throw error;
    }
    return toReviewSettings(data);
}
export async function updateApplicationSourceSettings({ accessToken, spreadsheetUrl, sheetName, clearCurrentData, }) {
    const adminProfile = await requireAdmin(accessToken);
    if (!clearCurrentData) {
        throw createHttpError(400, 'Confirm that current assignments and review decisions should be cleared.');
    }
    const spreadsheetId = parseSpreadsheetId(spreadsheetUrl);
    const normalizedSheetName = await resolveSheetNameFromSource({
        accessToken,
        spreadsheetId,
        spreadsheetUrl,
        sheetName,
    });
    const normalizedSheetRange = DEFAULT_APPLICATION_SHEET_RANGE;
    await validateApplicationSourceAccess({
        accessToken,
        spreadsheetId,
        sheetName: normalizedSheetName,
        sheetRange: normalizedSheetRange,
    });
    const { data, error } = await getSupabaseAdmin()
        .from('application_source_settings')
        .upsert({
        id: APPLICATION_SOURCE_SETTINGS_ID,
        spreadsheet_id: spreadsheetId,
        spreadsheet_url: buildSpreadsheetUrl(spreadsheetId),
        sheet_name: normalizedSheetName,
        sheet_range: normalizedSheetRange,
        updated_by_email: normalizeEmail(adminProfile.email),
    }, { onConflict: 'id' })
        .select()
        .single();
    if (error) {
        if (isSupabaseConnectionError(error)) {
            throw createSupabaseUnavailableError();
        }
        throw error;
    }
    return toApplicationSourceSettings(data);
}
//# sourceMappingURL=settings.service.js.map