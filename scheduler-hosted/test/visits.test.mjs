import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { handleVisits } from '../src/visits.mjs';

function fixture(t) {
  const sql = new DatabaseSync(':memory:');
  for (const file of ['0000_scheduler.sql', '0001_website_visits.sql']) sql.exec(readFileSync(new URL('../drizzle/' + file, import.meta.url), 'utf8'));
  t.after(() => sql.close());
  const wrap = (query, args = []) => ({
    bind(...a) { return wrap(query, a); },
    async first() { return sql.prepare(query).get(...args) || null; },
    execute() { return sql.prepare(query).run(...args); },
  });
  const env = { DB: { withSession(mode) { assert.equal(mode, 'first-primary'); return this; }, prepare: wrap,
    async batch(statements) {
      sql.exec('BEGIN');
      try { const results = statements.map(s => s.execute()); sql.exec('COMMIT'); return results; }
      catch (e) { sql.exec('ROLLBACK'); throw e; }
    } } };
  async function request(method = 'GET', payload, headers = {}, customEnv = env) {
    return handleVisits(new Request('https://schedule.astro-beattie.com/api/visits', { method,
      headers: { Origin: 'https://astro-beattie.com', 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0', ...headers },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }) }), customEnv);
  }
  return { sql, request };
}

test('one shared total, idempotent concurrent requests, read-only polling and durable daily totals', async t => {
  const f = fixture(t);
  assert.equal((await (await f.request()).json()).visits, 0);
  const session = crypto.randomUUID();
  await Promise.all(Array.from({length: 20}, () => f.request('POST', { session })));
  assert.equal((await (await f.request()).json()).visits, 1);
  const sessions = Array.from({length: 20}, () => crypto.randomUUID());
  await Promise.all(sessions.map(session => f.request('POST', { session })));
  const totals = await Promise.all(Array.from({length: 10}, async () => (await (await f.request()).json()).visits));
  assert.deepEqual(totals, Array(10).fill(21));
  assert.equal(f.sql.prepare('SELECT sum(visits) AS n FROM website_visit_daily').get().n, 21);
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM people').get().n, 0);
  f.sql.exec('DELETE FROM website_visit_sessions');
  assert.equal((await (await f.request()).json()).visits, 21);
});

test('a new visit after inactivity; active navigation refreshes expiry without inflating totals', async t => {
  const f = fixture(t); const session = crypto.randomUUID();
  await f.request('POST', { session });
  f.sql.exec('UPDATE website_visit_sessions SET expires_at = 0');
  await f.request('POST', { session });
  await f.request('POST', { session });
  assert.equal((await (await f.request()).json()).visits, 2);
});

test('CORS, methods, bots, invalid input and unavailable database never add fabricated visits', async t => {
  const f = fixture(t); const session = crypto.randomUUID();
  const preflight = await f.request('OPTIONS');
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://astro-beattie.com');
  assert.equal((await f.request('POST', { session }, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await f.request('DELETE')).status, 405);
  assert.equal((await f.request('POST', { session: 'invalid' })).status, 400);
  assert.equal((await f.request('POST', { session, extra: 'x'.repeat(300) })).status, 413);
  assert.equal((await f.request('POST', { session }, { 'User-Agent': 'Googlebot' })).status, 200);
  const response = await f.request();
  assert.equal(response.headers.get('cache-control'), 'no-store, max-age=0');
  assert.equal((await response.json()).visits, 0);
  const unavailable = await f.request('GET', undefined, {}, {});
  assert.equal(unavailable.status, 503); assert.equal((await unavailable.json()).visits, undefined);
});
