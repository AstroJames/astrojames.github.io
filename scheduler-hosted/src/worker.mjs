// Sites dispatch authenticates these headers. Never expose this Worker outside dispatch.
const API = '/api/scheduler/';
const COOKIE = '__Host-meeting-participant';
const OWNER = 'owner';
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
function fail(status, message) { throw Object.assign(new Error(message), { status }); }
const json = (value, status = 200, headers = {}) => Response.json(value, { status, headers: {
  'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', ...headers,
} });
async function digest(value) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(v => v.toString(16).padStart(2, '0')).join('');
}
function token() { return [...crypto.getRandomValues(new Uint8Array(32))].map(v => v.toString(16).padStart(2, '0')).join(''); }
function cookie(value, age = SESSION_MS / 1000) { return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`; }
function validSlot(slot) { return typeof slot === 'string' && /^[0-4]-(9|1[0-6])$/.test(slot); }
async function initialize(db, env) {
  const initialized = await db.prepare("SELECT value FROM settings WHERE key = 'initialized'").first();
  if (initialized) return;
  const seed = JSON.parse(env.INITIAL_OWNER_SLOTS || '[]');
  if (!Array.isArray(seed) || seed.some(slot => !validSlot(slot))) throw new Error('Invalid initial schedule');
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO people(id, name, name_key, created_at) VALUES ('owner', 'James Beattie', 'james beattie', 0)"),
    ...[...new Set(seed)].map(slot => {
      const [day, hour] = slot.split('-').map(Number);
      return db.prepare("INSERT OR IGNORE INTO availability(person_id, day, hour) SELECT 'owner', ?, ? WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = 'initialized')").bind(day, hour);
    }),
    db.prepare("INSERT OR IGNORE INTO settings(key, value) VALUES ('initialized', 'true')"),
  ]);
}
async function identity(request, db, env) {
  const userId = request.headers.get('oai-authenticated-user-id');
  const email = request.headers.get('oai-authenticated-user-email');
  if (userId && email && env.OWNER_EMAIL && email.toLowerCase() === env.OWNER_EMAIL.toLowerCase()) return { id: OWNER, isOwner: true };
  const raw = request.headers.get('cookie')?.split(';').map(v => v.trim()).find(v => v.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
  if (!raw || !/^[a-f0-9]{64}$/.test(raw)) return { id: null, isOwner: false };
  const tokenHash = await digest(raw);
  const row = await db.prepare('SELECT person_id FROM sessions WHERE token_hash = ? AND expires > ?').bind(tokenHash, Date.now()).first();
  return { id: row?.person_id || null, isOwner: false, tokenHash };
}
async function state(db, actor) {
  const [people, slots] = await db.batch([
    db.prepare("SELECT id, name FROM people ORDER BY CASE WHEN id = 'owner' THEN 0 ELSE 1 END, created_at, id"),
    db.prepare('SELECT person_id, day, hour FROM availability ORDER BY day, hour'),
  ]);
  const records = people.results.map(person => ({ ...person, slots: slots.results.filter(slot => slot.person_id === person.id).map(slot => `${slot.day}-${slot.hour}`) }));
  return { people: records, actorId: records.some(person => person.id === actor.id) ? actor.id : null, isOwner: actor.isOwner, canRestore: false };
}
async function readBody(request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) fail(415, 'Expected JSON.');
  const reader = request.body?.getReader();
  let data = new Uint8Array();
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      if (data.byteLength + value.byteLength > 4096) { await reader.cancel(); fail(413, 'Request too large.'); }
      const next = new Uint8Array(data.length + value.length); next.set(data); next.set(value, data.length); data = next;
    }
  }
  let parsed;
  try { parsed = JSON.parse(new TextDecoder().decode(data) || '{}'); } catch { fail(400, 'Invalid JSON.'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) fail(400, 'Expected an object.');
  return parsed;
}
export async function handleRequest(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(API)) {
    if (!['GET', 'HEAD'].includes(request.method)) return json({ error: 'Method not allowed.' }, 405);
    const path = url.pathname === '/meeting-scheduler/' ? '/' : url.pathname;
    const asset = STATIC[path];
    if (!asset) return new Response('Page not found', { status: 404 });
    return new Response(request.method === 'HEAD' ? null : asset.body, { headers: { 'Content-Type': asset.type, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY' } });
  }
  try {
    if (!env.DB || !env.PUBLIC_ORIGIN || !env.OWNER_EMAIL) fail(503, 'The scheduler is being configured. Please try again shortly.');
    const db = env.DB.withSession('first-primary');
    await initialize(db, env);
    const actor = await identity(request, db, env);
    const action = url.pathname.slice(API.length);
    if (request.method === 'GET' && action === 'state') return json(await state(db, actor));
    if (request.method !== 'POST') fail(405, 'Method not allowed.');
    if (request.headers.get('origin') !== env.PUBLIC_ORIGIN) fail(403, 'Cross-origin request rejected.');
    const payload = await readBody(request);
    if (!['join', 'logout', 'slot', 'clear-mine', 'clear-participants'].includes(action)) fail(404, 'Unknown action.');
    if (action === 'join') {
      if (actor.id) fail(409, 'You already have a schedule.');
      const name = typeof payload.name === 'string' ? payload.name.trim().normalize('NFKC') : '';
      if (!name || name.length > 60 || /[\p{Cc}\p{Cf}]/u.test(name)) fail(400, 'Enter a name of at most 60 characters.');
      const key = name.toLowerCase();
      const id = crypto.randomUUID(); const secret = token(); const tokenHash = await digest(secret);
      let result;
      try {
        result = await db.batch([
          db.prepare('DELETE FROM sessions WHERE expires <= ?').bind(Date.now()),
          db.prepare('INSERT INTO people(id, name, name_key, created_at) SELECT ?, ?, ?, ? WHERE (SELECT count(*) FROM people) < 200').bind(id, name, key, Date.now()),
          db.prepare('INSERT INTO sessions(token_hash, person_id, expires) SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM people WHERE id = ?)').bind(tokenHash, id, Date.now() + SESSION_MS, id),
        ]);
      } catch (error) {
        if (/UNIQUE constraint failed.*people.name_key/i.test(String(error))) fail(409, 'That name is already listed. Add an initial to distinguish your response.');
        throw error;
      }
      if (!result[1].meta.changes) fail(429, 'This schedule is full. Please contact James.');
      return json({ ok: true }, 200, { 'Set-Cookie': cookie(secret) });
    }
    if (action === 'logout') {
      if (actor.tokenHash) await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(actor.tokenHash).run();
      return json({ ok: true }, 200, { 'Set-Cookie': cookie('', 0) });
    }
    if (!actor.id) fail(401, 'Join or sign in before editing.');
    if (payload.personId !== undefined && payload.personId !== actor.id) fail(403, 'You can only edit your own schedule.');
    if (action === 'clear-participants') {
      if (!actor.isOwner) fail(403, 'Only James can clear participant responses.');
      // One transaction; foreign keys remove participant slots and revoke their sessions.
      await db.prepare("DELETE FROM people WHERE id <> 'owner'").run();
      return json({ ok: true });
    }
    // Recheck the participant session in the actual write, so a reset cannot race a stale edit.
    const authSQL = actor.isOwner ? "person_id = 'owner'" : 'person_id IN (SELECT person_id FROM sessions WHERE token_hash = ? AND expires > ?)';
    const authArgs = actor.isOwner ? [] : [actor.tokenHash, Date.now()];
    if (action === 'clear-mine') {
      await db.prepare(`DELETE FROM availability WHERE ${authSQL}`).bind(...authArgs).run();
      return json({ ok: true });
    }
    if (!validSlot(payload.slot) || typeof payload.available !== 'boolean') fail(400, 'Invalid hourly slot.');
    const [day, hour] = payload.slot.split('-').map(Number);
    if (payload.available) {
      const allowed = actor.isOwner ? "id = 'owner'" : 'id IN (SELECT person_id FROM sessions WHERE token_hash = ? AND expires > ?)';
      await db.prepare(`INSERT OR IGNORE INTO availability(person_id, day, hour) SELECT id, ?, ? FROM people WHERE ${allowed}`).bind(day, hour, ...authArgs).run();
    } else {
      await db.prepare(`DELETE FROM availability WHERE day = ? AND hour = ? AND ${authSQL}`).bind(day, hour, ...authArgs).run();
    }
    return json({ ok: true });
  } catch (error) {
    if (!error.status) console.error('Scheduler API failure:', error.message);
    return json({ error: error.status ? error.message : 'The schedule could not be saved. Please try again.' }, error.status || 500);
  }
}
export default { fetch: handleRequest };
