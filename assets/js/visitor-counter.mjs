const badge = document.getElementById('visitor-counter');
const number = document.getElementById('visit-count');
const label = document.getElementById('counter-label');
const endpoint = badge?.dataset.endpoint;
const isProduction = ['astro-beattie.com', 'www.astro-beattie.com'].includes(location.hostname);
const KEY = 'astro-beattie-visit-session-v1';
const IDLE_MS = 30 * 60 * 1000;
let memorySession;
let busy = false;
let lastTotal = -1;
let needsRegistration = isProduction;
let pendingSession;

function sessionId() {
  const now = Date.now();
  let session = memorySession;
  try { session = JSON.parse(localStorage.getItem(KEY)) || session; } catch { /* Storage may be blocked. */ }
  if (!session || typeof session.id !== 'string' || !Number.isFinite(session.seen) || now - session.seen >= IDLE_MS || session.seen > now) {
    session = { id: crypto.randomUUID(), seen: now };
  }
  session.seen = now;
  memorySession = session;
  try { localStorage.setItem(KEY, JSON.stringify(session)); } catch { /* Reuse the in-memory session for retries. */ }
  return session.id;
}

async function update() {
  if (busy || document.hidden || !endpoint) return;
  busy = true;
  try {
    if (needsRegistration && !pendingSession) {
      // Coordinate first loads in multiple tabs where Web Locks is supported.
      pendingSession = navigator.locks ? await navigator.locks.request(KEY, sessionId) : sessionId();
    }
    const response = await fetch(endpoint, {
      method: needsRegistration ? 'POST' : 'GET',
      cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(8000),
      ...(needsRegistration ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session: pendingSession }) } : {}),
    });
    if (!response.ok) throw new Error('Counter unavailable');
    const data = await response.json();
    if (!Number.isSafeInteger(data.visits) || data.visits < 0) throw new Error('Invalid total');
    needsRegistration = false;
    // An older concurrent response must never move the visible total backwards.
    lastTotal = Math.max(lastTotal, data.visits);
    number.textContent = lastTotal.toLocaleString();
    label.textContent = ' visits';
    const since = document.getElementById('counter-since');
    if (since) since.textContent = data.since ? `Since ${data.since}` : '';
    badge.title = `Visits${data.since ? ' since ' + data.since : ''}. One browser session; a new visit after 30 minutes of inactivity. Updated every minute.`;
    badge.removeAttribute('data-unavailable');
  } catch {
    // Never manufacture a number or present a browser-local total as global.
    number.textContent = '—';
    label.textContent = ' visits unavailable';
    badge.title = 'The shared visit total is temporarily unavailable. Retrying shortly.';
    badge.dataset.unavailable = 'true';
  } finally { busy = false; }
}

if (badge && number && label) {
  update();
  setInterval(update, 60000); // Reading the total never adds a visit.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) update(); });
}
