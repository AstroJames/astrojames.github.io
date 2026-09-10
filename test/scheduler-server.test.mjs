import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createSchedulerServer } from '../scripts/scheduler-preview-server.mjs';
import { exampleSchedule } from '../assets/js/meeting-scheduler.mjs';

async function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'scheduler-auth-test-'));
  const publicDir = join(dir, 'public'); const privateDir = join(dir, 'private');
  mkdirSync(publicDir); writeFileSync(join(publicDir, 'index.html'), '<h1>Preview</h1>');
  const server = createSchedulerServer({ publicDir, privateDir });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { await new Promise(resolve => server.close(resolve)); rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const key = readFileSync(join(privateDir, 'organizer-key'), 'utf8');
  async function request(action, payload, cookie = '', origin = base) {
    const response = await fetch(`${base}/api/scheduler/${action}`, {
      method: payload === undefined ? 'GET' : 'POST',
      headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    });
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0], headers: response.headers };
  }
  const login = async () => (await request('organizer-login', { key })).cookie;
  return { request, login, key, base, privateDir, publicDir };
}

test('only a server-authenticated organizer can edit owner slots or clear participants', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('slot', { slot: '0-9', available: true, personId: 'owner' })).status, 401);
  assert.equal((await f.request('organizer-login', { key: 'owner' })).status, 403);
  const owner = await f.login();
  assert.ok(owner);
  assert.equal((await f.request('slot', { slot: '0-9', available: true }, owner)).status, 200);
  const participant = (await f.request('join', { name: 'Alex', id: 'owner', isOwner: true })).cookie;
  let state = (await f.request('state', undefined, participant)).data;
  assert.equal(state.isOwner, false); assert.notEqual(state.actorId, 'owner');
  assert.equal((await f.request('slot', { slot: '0-9', available: false, personId: 'owner' }, participant)).status, 403);
  assert.equal((await f.request('clear-mine', { personId: 'owner' }, participant)).status, 403);
  for (const action of ['clear-participants', 'restore-draft', 'examples']) {
    assert.equal((await f.request(action, { schedule: exampleSchedule(), isOwner: true }, participant)).status, 403);
  }
  assert.equal((await f.request('slot', { slot: '0-9', available: true }, participant)).status, 200);
  state = (await f.request('state', undefined, owner)).data;
  assert.deepEqual(state.people[0].slots, ['0-9']);
  assert.deepEqual(state.people[1].slots, ['0-9']);
  assert.equal((await f.request('clear-participants', {}, owner)).status, 200);
  state = (await f.request('state', undefined, owner)).data;
  assert.equal(state.people.length, 1); assert.deepEqual(state.people[0].slots, ['0-9']);
  assert.equal((await f.request('slot', { slot: '1-10', available: true }, participant)).status, 401);
  assert.equal((await f.request('state', undefined, participant)).data.actorId, null);
  assert.equal((await f.request('clear-participants', {}, owner)).status, 200);
  assert.deepEqual((await f.request('state')).data.people[0].slots, ['0-9']);
});

test('private key stays out of public responses, cross-origin writes fail, and logout revokes the session', async t => {
  const f = await fixture(t);
  const login = await f.request('organizer-login', { key: f.key });
  assert.match(login.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
  assert.equal((await f.request('slot', { slot: '0-9', available: true }, login.cookie, 'https://unrelated.example')).status, 403);
  assert.equal((await f.request('state')).headers.get('cache-control'), 'no-store');
  assert.equal(JSON.stringify((await f.request('state')).data).includes(f.key), false);
  for (const path of ['/.local/meeting-scheduler/organizer-key', '/organizer-key', '/%2e%2e/private/organizer-key']) {
    assert.equal((await fetch(f.base + path)).status, 404);
  }
  assert.equal((await f.request('logout', {}, login.cookie)).status, 200);
  assert.equal((await f.request('slot', { slot: '0-9', available: true }, login.cookie)).status, 401);
});

test('owner-approved migration preserves old selections once and survives a server restart', async t => {
  const f = await fixture(t); const owner = await f.login();
  assert.equal((await f.request('state', undefined, owner)).data.canRestore, true);
  assert.equal((await f.request('restore-draft', { schedule: exampleSchedule() }, owner)).status, 200);
  assert.deepEqual((await f.request('state')).data.people, exampleSchedule().people);
  assert.equal((await f.request('restore-draft', { schedule: exampleSchedule() }, owner)).status, 409);
  const otherServer = createSchedulerServer({ publicDir: f.publicDir, privateDir: f.privateDir });
  otherServer.listen(0, '127.0.0.1'); await once(otherServer, 'listening');
  t.after(() => new Promise(resolve => otherServer.close(resolve)));
  const state = await (await fetch(`http://127.0.0.1:${otherServer.address().port}/api/scheduler/state`, { headers: { Cookie: owner } })).json();
  assert.deepEqual(state.people, exampleSchedule().people); assert.equal(state.isOwner, true);
  await f.request('clear-participants', {}, owner); await f.request('clear-mine', {}, owner);
  assert.equal((await f.request('state', undefined, owner)).data.canRestore, false);
  assert.equal((await f.request('restore-draft', { schedule: exampleSchedule() }, owner)).status, 409);
});
