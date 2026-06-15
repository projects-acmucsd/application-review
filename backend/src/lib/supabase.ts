import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { env } from '../config/env.js';
import type { Database } from '../types/database.js';

const SUPABASE_CONNECTION_ERROR_MARKERS = [
  'fetch failed',
  'getaddrinfo',
  'enotfound',
  'eai_again',
  'econnrefused',
  'econnreset',
  'etimedout',
];
const MISSING_SUPABASE_ADMIN_CONFIG_CODE = 'MISSING_SUPABASE_ADMIN_CONFIG';

function assertSupabaseEnv() {
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    throw createMissingSupabaseAdminConfigError();
  }
}

function createMissingSupabaseAdminConfigError(): Error & {
  code: string;
  statusCode: number;
} {
  const error = new Error('Supabase server configuration is missing.') as Error & {
    code: string;
    statusCode: number;
  };
  error.code = MISSING_SUPABASE_ADMIN_CONFIG_CODE;
  error.statusCode = 503;
  return error;
}

function readStringProperty(error: object, key: string): string {
  const value = (error as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : '';
}

function getErrorText(error: unknown): string {
  if (error instanceof Error) {
    const cause = (error as Error & { cause?: unknown }).cause;
    const causeText =
      typeof cause === 'object' && cause !== null ? getErrorText(cause) : '';

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

export function isSupabaseConnectionError(error: unknown): boolean {
  const errorText = getErrorText(error).toLowerCase();

  return SUPABASE_CONNECTION_ERROR_MARKERS.some((marker) =>
    errorText.includes(marker),
  );
}

export function isMissingSupabaseAdminConfigError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === MISSING_SUPABASE_ADMIN_CONFIG_CODE
  );
}

export function shouldUseSupabaseReadFallback(error: unknown): boolean {
  return (
    env.nodeEnv !== 'production' &&
    (isSupabaseConnectionError(error) ||
      isMissingSupabaseAdminConfigError(error))
  );
}

export function createSupabaseUnavailableError(): Error & { statusCode: number } {
  const error = new Error(
    'Supabase is currently unreachable. Check SUPABASE_URL and whether the Supabase project is active.',
  ) as Error & { statusCode: number };
  error.statusCode = 503;
  return error;
}

export function getSupabaseAdmin() {
  assertSupabaseEnv();

  return createClient<Database>(env.supabaseUrl!, env.supabaseServiceRoleKey!, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function readFromSupabaseWithFallback<T>(
  fallbackValue: T,
  read: (supabase: SupabaseClient<Database>) => Promise<T>,
): Promise<T> {
  try {
    return await read(getSupabaseAdmin());
  } catch (error) {
    if (shouldUseSupabaseReadFallback(error)) {
      return fallbackValue;
    }

    throw error;
  }
}
