import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { handleRequest } from '../src/worker.mjs';

function fixture(t) {
  const sqlite = new DatabaseSync(':memory:'); sqlite.exec('PRAGMA foreign_keys=ON');
  sqlite.exec(readFileSync(new URL('../drizzle/0000_scheduler.sql', import.meta.url), 'utf8'));
  t.after(() => sqlite.close());
  const wrapper = (sql, args = []) => ({
    bind(...values) { return wrapper(sql, values); },
    async first() { return sqlite.prepare(sql).get(...args) || null; },
    async run() { const result = sqlite.prepare(sql).run(...args); return { success: true, meta: { changes: Number(result.changes) } }; },
    async all() { return { success: true, results: sqlite.prepare(sql).all(...args) }; },
    execute() {
      if (/^\s*SELECT/i.test(sql)) return { success: true, results: sqlite.prepare(sql).all(...args), meta: { changes: 0 } };
      return { success: true, results: [], meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) } };
    },
  });
  const db = { prepare: wrapper, withSession() { return this; }, async batch(statements) {
    sqlite.exec('BEGIN');
    try { const results = statements.map(statement => statement.execute()); sqlite.exec('COMMIT'); return results; }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  } };
  const origin = 'https://meetings.example';
  const env = { DB: db, PUBLIC_ORIGIN: origin, OWNER_EMAIL: 'owner@example.org', INITIAL_OWNER_SLOTS: '["0-9","2-12"]' };
  const owner = { 'oai-authenticated-user-id': 'verified-site-user', 'oai-authenticated-user-email': env.OWNER_EMAIL };
  async function request(action, payload, extra = {}) {
    const response = await handleRequest(new Request(origin + '/api/scheduler/' + action, {
      method: payload === undefined ? 'GET' : 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...extra },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    }), env);
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0], headers: response.headers };
  }
  return { request, owner, sqlite };
}

test('anonymous and other signed-in accounts cannot edit organizer; participant edits affect only their own slots', async t => {
  const f = fixture(t);
  assert.deepEqual((await f.request('state')).data.people[0].slots, ['0-9','2-12']);
  assert.equal((await f.request('slot', { slot: '0-9', available: false, isOwner: true, personId: 'owner' })).status, 401);
  const wrongAccount = { 'oai-authenticated-user-id': 'someone-else', 'oai-authenticated-user-email': 'other@example.org' };
  assert.equal((await f.request('clear-participants', {}, wrongAccount)).status, 401);
  assert.equal((await f.request('state', undefined, { 'oai-authenticated-user-email': 'owner@example.org' })).data.isOwner, false);
  const participant = await f.request('join', { name: 'Alex', id: 'owner', role: 'owner' });
  assert.equal(participant.status, 200); assert.match(participant.headers.get('set-cookie'), /HttpOnly; Secure; SameSite=Lax/);
  const session = { Cookie: participant.cookie };
  assert.equal((await f.request('clear-participants', {}, session)).status, 403);
  assert.equal((await f.request('slot', { slot: '0-9', available: false, personId: 'owner' }, session)).status, 403);
  assert.equal((await f.request('slot', { slot: '0-9', available: true }, session)).status, 200);
  const state = (await f.request('state', undefined, session)).data;
  assert.equal(state.isOwner, false); assert.notEqual(state.actorId, 'owner');
  assert.deepEqual(state.people[0].slots, ['0-9','2-12']); assert.deepEqual(state.people[1].slots, ['0-9']);
  assert.equal((await f.request('slot', { slot: '4-16', available: true }, f.owner)).status, 200);
  assert.deepEqual((await f.request('state')).data.people[0].slots, ['0-9','2-12','4-16']);
});

test('reset removes other slots and sessions atomically, preserves owner, and never reseeds cleared hours', async t => {
  const f = fixture(t); const participant = await f.request('join', { name: 'Alex' }); const session = { Cookie: participant.cookie };
  await f.request('slot', { slot: '1-10', available: true }, session);
  assert.equal((await f.request('clear-participants', {}, f.owner)).status, 200);
  let state = (await f.request('state')).data;
  assert.equal(state.people.length, 1); assert.deepEqual(state.people[0].slots, ['0-9','2-12']);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM sessions').get().n, 0);
  assert.equal((await f.request('slot', { slot: '1-10', available: true }, session)).status, 401);
  await f.request('clear-mine', {}, f.owner); await f.request('clear-participants', {}, f.owner);
  assert.deepEqual((await f.request('state')).data.people[0].slots, []);
});

test('cross-origin writes, invalid slots, duplicate identity, and removed prototype endpoints are rejected', async t => {
  const f = fixture(t);
  assert.equal((await f.request('slot', { slot: '0-9', available: false }, { ...f.owner, Origin: 'https://elsewhere.example' })).status, 403);
  assert.equal((await f.request('slot', { slot: '4-17', available: true }, f.owner)).status, 400);
  assert.equal((await f.request('slot', { slot: '0-9', available: 'false' }, f.owner)).status, 400);
  assert.equal((await f.request('join', { name: 'James Beattie' })).status, 409);
  for (const action of ['organizer-login', 'examples', 'restore-draft']) assert.equal((await f.request(action, {}, f.owner)).status, 404);
  const person = await f.request('join', { name: '<img onerror=alert(1)>' });
  assert.equal(person.status, 200); // Text-only DOM rendering in the shared client.
  assert.equal((await f.request('logout', {}, { Cookie: person.cookie })).status, 200);
  assert.equal((await f.request('state', undefined, { Cookie: person.cookie })).data.actorId, null);
});

test('individual slot writes retain independent concurrent updates', async t => {
  const f = fixture(t); await f.request('state');
  const edits = [['1-9', true], ['1-10', true], ['0-9', false], ['3-14', true]];
  for (const [slot, available] of edits) assert.equal((await f.request('slot', { slot, available }, f.owner)).status, 200);
  assert.deepEqual((await f.request('state')).data.people[0].slots, ['1-9','1-10','2-12','3-14']);
});
