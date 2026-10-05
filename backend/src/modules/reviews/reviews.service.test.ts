import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, beforeEach, test } from 'node:test';

import { createApp } from '../../app.js';
import { env } from '../../config/env.js';
import type { Database } from '../../types/database.js';

type ReviewRow = Database['public']['Tables']['application_reviews']['Row'];
type ReviewResponse = {
  data?: {
    applicationId: string;
    comment: string | null;
    rating: number | null;
    decision: string | null;
    updatedByEmail: string;
    updatedByName: string;
    updatedAt: string;
  };
  error?: string;
};

const rows = new Map<string, ReviewRow>();
const requests: {
  method: string;
  url: URL;
  body: Record<string, unknown>;
  prefer: string;
}[] = [];
const originalEnv = { ...env };
let storageServer: Server;
let apiServer: Server;
let apiUrl: string;
let version = 0;
let failWrites = false;

function nextVersion() {
  version += 1;
  return `2026-10-05T22:38:48.${String(version).padStart(6, '0')}+00:00`;
}

function seedRow(comment: string | null): ReviewRow {
  const row: ReviewRow = {
    application_id: 'sheet-row:1',
    comment,
    rating: 7,
    decision: 'waitlist',
    updated_by_email: 'previous@acmucsd.org',
    updated_by_name: 'Previous Reviewer',
    updated_at: nextVersion(),
  };
  rows.set(row.application_id, row);
  return row;
}

async function listen(server: Server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function close(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeIdleConnections();
  });
}

before(async () => {
  // Only the PostgREST boundary is mocked. Requests run through the real router,
  // service, and supabase-js HTTP client; no production credentials are used.
  storageServer = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const text = Buffer.concat(chunks).toString();
    const body = text ? JSON.parse(text) as Record<string, unknown> : {};
    const preferHeader = req.headers.prefer;
    const prefer = Array.isArray(preferHeader) ? preferHeader.join(',') : preferHeader ?? '';
    requests.push({ method: req.method ?? '', url, body, prefer });
    res.setHeader('Content-Type', 'application/json');

    if (url.pathname !== '/rest/v1/application_reviews') {
      res.writeHead(404).end(JSON.stringify({ message: 'Unexpected table' }));
      return;
    }
    if (failWrites && req.method !== 'GET') {
      res.writeHead(500).end(JSON.stringify({ code: 'XX000', message: 'Storage failure' }));
      return;
    }
    if (req.method === 'GET') {
      res.end(JSON.stringify([...rows.values()]));
      return;
    }
    if (req.method === 'POST') {
      const applicationId = body.application_id as string;
      const existing = rows.get(applicationId);
      if (existing && !prefer.includes('resolution=merge-duplicates')) {
        res.writeHead(409).end(JSON.stringify({ code: '23505', message: 'Duplicate review' }));
        return;
      }
      const row = {
        comment: null,
        ...existing,
        ...body,
        updated_at: nextVersion(),
      } as ReviewRow;
      rows.set(applicationId, row);
      res.writeHead(existing ? 200 : 201).end(JSON.stringify(row));
      return;
    }
    if (req.method === 'PATCH') {
      const applicationId = url.searchParams.get('application_id')?.slice(3) ?? '';
      const expectedUpdatedAt = url.searchParams.get('updated_at')?.slice(3);
      const existing = rows.get(applicationId);
      if (!existing || existing.updated_at !== expectedUpdatedAt) {
        res.end('[]');
        return;
      }
      const row = { ...existing, ...body, updated_at: nextVersion() } as ReviewRow;
      rows.set(applicationId, row);
      // maybeSingle() asks for JSON arrays and converts a one-row result itself.
      res.end(JSON.stringify([row]));
      return;
    }
    res.writeHead(405).end();
  });
  env.nodeEnv = 'test';
  env.supabaseUrl = await listen(storageServer);
  env.supabaseServiceRoleKey = 'isolated-test-service-role';
  apiServer = createServer(createApp());
  apiUrl = await listen(apiServer);
});

after(async () => {
  Object.assign(env, originalEnv);
  if (apiServer?.listening) await close(apiServer);
  if (storageServer?.listening) await close(storageServer);
});

beforeEach(() => {
  rows.clear();
  requests.length = 0;
  version = 0;
  failWrites = false;
});

async function save(body: unknown, token = 'development-access-token') {
  const response = await fetch(`${apiUrl}/api/reviews/sheet-row%3A1`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() as ReviewResponse };
}

test('the API saves comment, rating, decision, and reviewer audit in one insert', async () => {
  const comment = '  Shared feedback\nSecond line  ';
  const response = await save({ comment, rating: 9, decision: 'accept', expectedUpdatedAt: null });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.data, {
    applicationId: 'sheet-row:1',
    comment,
    rating: 9,
    decision: 'accept',
    updatedByEmail: 'test-reviewer@acmucsd.org',
    updatedByName: 'Test Reviewer',
    updatedAt: '2026-10-05T22:38:48.000001+00:00',
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, 'POST');
  assert.equal(requests[0].prefer.includes('resolution=merge-duplicates'), false);

  const list = await fetch(`${apiUrl}/api/reviews`, {
    headers: { Authorization: 'Bearer development-access-token' },
  });
  assert.equal(list.status, 200);
  const result = await list.json() as { data: ReviewResponse['data'][] };
  assert.equal(result.data[0]?.comment, comment);
});

test('a versioned save clears comments and updates review fields atomically', async () => {
  const original = seedRow('Legacy feedback');
  const response = await save({
    comment: '', rating: 10, decision: 'accept', expectedUpdatedAt: original.updated_at,
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.data?.comment, '');
  assert.equal(response.body.data?.rating, 10);
  assert.equal(response.body.data?.decision, 'accept');
  assert.notEqual(response.body.data?.updatedAt, original.updated_at);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, 'PATCH');
  assert.equal(requests[0].url.searchParams.get('application_id'), 'eq.sheet-row:1');
  assert.equal(requests[0].url.searchParams.get('updated_at'), `eq.${original.updated_at}`);
});

test('old and decision-only clients preserve comments by omitting the column from upsert', async () => {
  seedRow('Keep this comment');
  const response = await save({ rating: 8, decision: 'reject' });
  assert.equal(response.status, 200);
  assert.equal(response.body.data?.comment, 'Keep this comment');
  assert.equal(response.body.data?.decision, 'reject');
  assert.equal(Object.hasOwn(requests[0].body, 'comment'), false);
  assert.equal(requests[0].prefer.includes('resolution=merge-duplicates'), true);
});

test('a stale save returns 409 without changing any review fields', async () => {
  const original = seedRow('Newer feedback');
  const response = await save({
    comment: 'Stale feedback', rating: 1, decision: 'reject',
    expectedUpdatedAt: '2026-10-05T20:00:00.123456+00:00',
  });
  assert.equal(response.status, 409);
  assert.match(response.body.error ?? '', /review changed/);
  assert.deepEqual(rows.get(original.application_id), original);
});

test('two reviewers saving the same version produce one success and one conflict', async () => {
  const original = seedRow('Original comment');
  const payload = { rating: 9, decision: 'accept', expectedUpdatedAt: original.updated_at };
  const responses = await Promise.all([
    save({ ...payload, comment: 'Reviewer A' }),
    save({ ...payload, comment: 'Reviewer B' }),
  ]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
  const winner = responses.find((response) => response.status === 200);
  assert.equal(rows.get(original.application_id)?.comment, winner?.body.data?.comment);
});

test('creating a comment against an existing review returns 409 and preserves it', async () => {
  const original = seedRow('Saved feedback');
  const response = await save({ comment: 'Replacement', expectedUpdatedAt: null });
  assert.equal(response.status, 409);
  assert.deepEqual(rows.get(original.application_id), original);
});

test('a storage failure leaves comment, rating, and decision unchanged', async () => {
  const original = seedRow('Saved feedback');
  failWrites = true;
  const response = await save({
    comment: 'Draft', rating: 10, decision: 'accept', expectedUpdatedAt: original.updated_at,
  });
  assert.equal(response.status, 500);
  assert.deepEqual(rows.get(original.application_id), original);
});

test('invalid and unauthenticated comment saves do not reach Supabase', async () => {
  assert.equal((await save({ comment: 'No version' })).status, 400);
  assert.equal((await save({ comment: null, expectedUpdatedAt: null })).status, 400);
  assert.equal((await save({ comment: 'Bad version', expectedUpdatedAt: 'yesterday' })).status, 400);
  assert.equal((await save({ comment: 'No auth', expectedUpdatedAt: null }, '')).status, 401);
  assert.equal(requests.length, 0);
});

test('unmigrated reviews return null comments for the legacy read fallback', async () => {
  seedRow(null);
  const response = await save({ rating: 8, decision: 'waitlist' });
  assert.equal(response.status, 200);
  assert.equal(response.body.data?.comment, null);
});
