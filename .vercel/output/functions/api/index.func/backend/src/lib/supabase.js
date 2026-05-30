import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';
const SUPABASE_CONNECTION_ERROR_MARKERS = [
    'fetch failed',
    'getaddrinfo',
    'enotfound',
    'eai_again',
    'econnrefused',
    'econnreset',
    'etimedout',
];
function assertSupabaseEnv() {
    if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
        throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for privileged Supabase access.');
    }
}
function readStringProperty(error, key) {
    const value = error[key];
    return typeof value === 'string' ? value : '';
}
function getErrorText(error) {
    if (error instanceof Error) {
        const cause = error.cause;
        const causeText = typeof cause === 'object' && cause !== null ? getErrorText(cause) : '';
        return `${error.message} ${causeText}`;
    }
    if (typeof error === 'object' && error !== null) {
        return [
            readStringProperty(error, 'message'),
            readStringProperty(error, 'details'),
            readStringProperty(error, 'hint'),
            readStringProperty(error, 'code'),
        ].join(' ');
    }
    return typeof error === 'string' ? error : '';
}
export function isSupabaseConnectionError(error) {
    const errorText = getErrorText(error).toLowerCase();
    return SUPABASE_CONNECTION_ERROR_MARKERS.some((marker) => errorText.includes(marker));
}
export function shouldUseSupabaseReadFallback(error) {
    return env.nodeEnv !== 'production' && isSupabaseConnectionError(error);
}
export function createSupabaseUnavailableError() {
    const error = new Error('Supabase is currently unreachable. Check SUPABASE_URL and whether the Supabase project is active.');
    error.statusCode = 503;
    return error;
}
export function getSupabaseAdmin() {
    assertSupabaseEnv();
    return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });
}
//# sourceMappingURL=supabase.js.map