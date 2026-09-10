// Local authenticated preview. Not a deployment server for GitHub Pages.
import http from 'node:http';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, realpathSync, statSync } from 'node:fs';
import { resolve, sep, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { emptySchedule, normalizeSchedule, setAvailability, clearParticipants, exampleSchedule, OWNER_ID } from '../assets/js/meeting-scheduler.mjs';

const cookieName = 'scheduler_session';
const apiPath = '/api/scheduler/';
const hash = value => createHash('sha256').update(value).digest('hex');
const randomToken = () => randomBytes(32).toString('hex');
const sessionDuration = 12 * 60 * 60 * 1000;
function fail(status, message) { throw Object.assign(new Error(message), { status }); }

export function createSchedulerServer({ publicDir, privateDir }) {
  mkdirSync(privateDir, { recursive: true, mode: 0o700 });
  const keyFile = resolve(privateDir, 'organizer-key');
  if (!existsSync(keyFile)) writeFileSync(keyFile, randomToken(), { mode: 0o600, flag: 'wx' });
  const ownerKey = readFileSync(keyFile, 'utf8').trim();
  const dbFile = resolve(privateDir, 'schedule.json');
  let db = existsSync(dbFile) ? JSON.parse(readFileSync(dbFile, 'utf8')) : { schedule: emptySchedule(), sessions: [], initialized: false };
  db.schedule = normalizeSchedule(db.schedule); // Refuse to overwrite a damaged store.
  if (!Array.isArray(db.sessions)) throw new Error('Invalid saved sessions');
  const root = realpathSync(publicDir);
  function commit(next) {
    const tempFile = `${dbFile}.tmp`;
    writeFileSync(tempFile, JSON.stringify(next), { mode: 0o600 });
    renameSync(tempFile, dbFile);
    db = next;
  }
  function getSession(req) {
    const token = req.headers.cookie?.split(';').map(value => value.trim()).find(value => value.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
    if (!token) return null;
    return db.sessions.find(session => session.hash === hash(token) && session.expires > Date.now() && db.schedule.people.some(person => person.id === session.id)) || null;
  }
  function sessionCookie(res, token, age = sessionDuration / 1000) {
    res.setHeader('Set-Cookie', `${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=${apiPath}; Max-Age=${age}`);
  }
  function issueSession(res, id, schedule = db.schedule) {
    const token = randomToken();
    const sessions = db.sessions.filter(session => session.expires > Date.now());
    sessions.push({ hash: hash(token), id, expires: Date.now() + sessionDuration });
    commit({ schedule, sessions, initialized: db.initialized || id !== OWNER_ID }); sessionCookie(res, token);
  }
  function snapshot(req) {
    const actor = getSession(req);
    return { ...db.schedule, actorId: actor?.id || null, isOwner: actor?.id === OWNER_ID, canRestore: actor?.id === OWNER_ID && db.initialized === false };
  }
  async function body(req) {
    if (!req.headers['content-type']?.startsWith('application/json')) fail(415, 'Expected JSON');
    let value = '';
    for await (const chunk of req) {
      value += chunk;
      if (Buffer.byteLength(value) > 65536) fail(413, 'Request too large');
    }
    try { return JSON.parse(value || '{}'); } catch { fail(400, 'Invalid JSON'); }
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Cache-Control', 'no-store');
    try {
      const port = server.address().port;
      if (![ `localhost:${port}`, `127.0.0.1:${port}` ].includes(req.headers.host)) fail(403, 'Invalid host');
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (!url.pathname.startsWith(apiPath)) {
        if (req.method !== 'GET' && req.method !== 'HEAD') fail(405, 'Method not allowed');
        const candidate = resolve(root, '.' + decodeURIComponent(url.pathname), url.pathname.endsWith('/') ? 'index.html' : '');
        if (!candidate.startsWith(root + sep) || !existsSync(candidate)) fail(404, 'Page not found');
        const file = realpathSync(candidate);
        if (!file.startsWith(root + sep) || !statSync(file).isFile()) fail(404, 'Page not found');
        const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.pdf': 'application/pdf' };
        res.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream');
        res.end(req.method === 'HEAD' ? undefined : readFileSync(file)); return;
      }
      res.setHeader('Content-Type', 'application/json');
      if (req.method === 'GET' && url.pathname === `${apiPath}state`) { res.end(JSON.stringify(snapshot(req))); return; }
      if (req.method !== 'POST') fail(405, 'Method not allowed');
      if (req.headers.origin !== `http://${req.headers.host}`) fail(403, 'Cross-origin request rejected');
      const payload = await body(req);
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) fail(400, 'Expected an object');
      const actor = getSession(req);
      const ownerOnly = () => { if (actor?.id !== OWNER_ID) fail(403, 'Only James can do that.'); };
      switch (url.pathname.slice(apiPath.length)) {
        case 'organizer-login': {
          const supplied = hash(typeof payload.key === 'string' ? payload.key : '');
          if (!timingSafeEqual(Buffer.from(supplied), Buffer.from(hash(ownerKey)))) fail(403, 'Invalid organizer access key.');
          issueSession(res, OWNER_ID); break;
        }
        case 'logout': {
          commit({ ...db, sessions: db.sessions.filter(session => session !== actor) });
          sessionCookie(res, '', 0); break;
        }
        case 'join': {
          if (actor) fail(409, 'You already have a schedule.');
          const name = typeof payload.name === 'string' ? payload.name.trim() : '';
          if (!name || name.length > 60) fail(400, 'Enter a name of at most 60 characters.');
          if (db.schedule.people.some(person => person.name.toLowerCase() === name.toLowerCase())) fail(409, 'That name is already listed. Add an initial to distinguish your response.');
          const id = randomToken(); // Client-provided ids and roles are never used.
          issueSession(res, id, { people: [...db.schedule.people, { id, name, slots: [] }] }); break;
        }
        case 'slot': {
          if (!actor) fail(401, 'Join or sign in before editing.');
          if (typeof payload.available !== 'boolean') fail(400, 'Invalid availability.');
          if (payload.personId !== undefined && payload.personId !== actor.id) fail(403, 'You can only edit your own schedule.');
          let schedule;
          try { schedule = setAvailability(db.schedule, actor.id, payload.slot, payload.available); } catch { fail(400, 'Invalid hourly slot.'); }
          commit({ ...db, schedule, initialized: true }); break;
        }
        case 'clear-mine': {
          if (!actor) fail(401, 'Join or sign in before editing.');
          if (payload.personId !== undefined && payload.personId !== actor.id) fail(403, 'You can only edit your own schedule.');
          commit({ ...db, initialized: true, schedule: { people: db.schedule.people.map(person => person.id === actor.id ? { ...person, slots: [] } : person) } }); break;
        }
        case 'clear-participants': {
          ownerOnly();
          commit({ initialized: true, schedule: clearParticipants(db.schedule, OWNER_ID), sessions: db.sessions.filter(session => session.id === OWNER_ID) }); break;
        }
        case 'examples': {
          ownerOnly();
          if (db.schedule.people.length !== 1 || db.schedule.people[0].slots.length) fail(409, 'Examples require an empty schedule.');
          commit({ ...db, initialized: true, schedule: exampleSchedule() }); break;
        }
        case 'restore-draft': {
          ownerOnly();
          if (db.initialized !== false || db.schedule.people.length !== 1 || db.schedule.people[0].slots.length) fail(409, 'A schedule is already saved.');
          let schedule;
          try { schedule = normalizeSchedule(payload.schedule); } catch { fail(400, 'The previous draft could not be read.'); }
          commit({ ...db, schedule, initialized: true }); break;
        }
        default: fail(404, 'Unknown action');
      }
      // A newly issued cookie is not on the incoming request yet; the client refreshes state.
      res.end(JSON.stringify({ ok: true }));
    } catch (error) {
      res.statusCode = error.status || 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: error.status ? error.message : 'The schedule could not be saved. Please try again.' }));
    }
  });
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const publicDir = resolve(process.argv[2] || '/tmp/astrojames-scheduler-preview');
  const privateDir = resolve(process.argv[3] || '.local/meeting-scheduler');
  const port = Number(process.argv[4] || 1313);
  const server = createSchedulerServer({ publicDir, privateDir });
  server.listen(port, '127.0.0.1', () => {
    const link = `http://localhost:${port}/meeting-scheduler/#organizer=${readFileSync(resolve(privateDir, 'organizer-key'), 'utf8').trim()}`;
    writeFileSync(resolve(privateDir, 'organizer-link.txt'), link + '\n', { mode: 0o600 });
    console.log(`Scheduling preview: http://localhost:${port}/meeting-scheduler/`);
    console.log(`Private organizer link saved in ${resolve(privateDir, 'organizer-link.txt')}`);
  });
}
