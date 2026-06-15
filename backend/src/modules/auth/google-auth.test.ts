import assert from 'node:assert/strict';
import test from 'node:test';
import type { Request } from 'express';

import {
  createHttpError,
  readBearerToken,
} from './google-auth.js';
import { shouldUseSupabaseReadFallback } from '../../lib/supabase.js';

function createRequestWithAuthorization(authorization: string | undefined) {
  return {
    get(name: string) {
      return name.toLowerCase() === 'authorization' ? authorization : undefined;
    },
  } as Request;
}

test('readBearerToken returns the bearer token', () => {
  const token = readBearerToken(
    createRequestWithAuthorization('Bearer development-access-token'),
  );

  assert.equal(token, 'development-access-token');
});

test('readBearerToken rejects missing authorization', () => {
  assert.throws(
    () => readBearerToken(createRequestWithAuthorization(undefined)),
    (error: unknown) =>
      error instanceof Error &&
      error.message === 'Missing Google access token.' &&
      (error as { statusCode?: number }).statusCode === 401,
  );
});

test('createHttpError preserves status code and message', () => {
  const error = createHttpError(403, 'Admin access is required.');

  assert.equal(error.statusCode, 403);
  assert.equal(error.message, 'Admin access is required.');
});

test('development Supabase read fallback handles missing admin config', () => {
  assert.equal(
    shouldUseSupabaseReadFallback({
      code: 'MISSING_SUPABASE_ADMIN_CONFIG',
    }),
    true,
  );
});
