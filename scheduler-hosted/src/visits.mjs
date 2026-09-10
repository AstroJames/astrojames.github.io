// Shared website totals; no IP addresses, names, or browsing history are stored.
const ORIGINS = new Set(['https://astro-beattie.com', 'https://www.astro-beattie.com']);
const IDLE_MS = 30 * 60 * 1000;
const RETENTION_MS = 2 * 24 * 60 * 60 * 1000;
const KNOWN_BOT = /bot\b|crawler|spider|slurp|facebookexternalhit|preview|headless/i;
export async function handleVisits(request, env) {
  const origin = request.headers.get('origin');
  const headers = { 'Cache-Control': 'no-store, max-age=0', 'Vary': 'Origin', 'X-Content-Type-Options': 'nosniff' };
  if (ORIGINS.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
  const reply = (data, status = 200) => Response.json(data, { status, headers });
  if (origin && !ORIGINS.has(origin)) return reply({ error: 'Origin not allowed.' }, 403);
  if (request.method === 'OPTIONS') {
    if (!ORIGINS.has(origin)) return reply({ error: 'Origin required.' }, 403);
    return new Response(null, { status: 204, headers: { ...headers,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '3600' } });
  }
  if (!['GET', 'POST'].includes(request.method)) return reply({ error: 'Method not allowed.' }, 405);
  try {
    if (!env.DB) return reply({ error: 'Counter temporarily unavailable.' }, 503);
    const db = env.DB.withSession('first-primary');
    if (request.method === 'POST') {
      if (!ORIGINS.has(origin)) return reply({ error: 'Origin required.' }, 403);
      if (!request.headers.get('content-type')?.startsWith('application/json')) return reply({ error: 'Expected JSON.' }, 415);
      const reader = request.body?.getReader();
      let text = '';
      if (reader) {
        const decoder = new TextDecoder();
        let size = 0;
        for (;;) {
          const { value, done } = await reader.read(); if (done) break;
          size += value.byteLength;
          if (size > 256) { await reader.cancel(); return reply({ error: 'Request too large.' }, 413); }
          text += decoder.decode(value, { stream: true });
        }
        text += decoder.decode();
      }
      let payload;
      try { payload = JSON.parse(text); } catch { return reply({ error: 'Invalid JSON.' }, 400); }
      if (!payload || typeof payload.session !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(payload.session)) return reply({ error: 'Invalid session.' }, 400);
      if (!KNOWN_BOT.test(request.headers.get('user-agent') || '') && !request.cf?.botManagement?.verifiedBot) {
        const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload.session));
        const key = [...new Uint8Array(bytes)].map(v => v.toString(16).padStart(2, '0')).join('');
        const now = Date.now(); const day = new Date(now).toISOString().slice(0, 10);
        const fresh = 'NOT EXISTS (SELECT 1 FROM website_visit_sessions WHERE session_hash = ? AND expires_at > ?)';
        // All statements commit together: simultaneous requests and retries can
        // count the same session only once. Schedule tables are never touched.
        await db.batch([
          db.prepare('INSERT OR IGNORE INTO website_visit_total(id, visits, started_on) VALUES (1, 0, ?)').bind(day),
          db.prepare(`UPDATE website_visit_total SET visits = visits + 1 WHERE id = 1 AND ${fresh}`).bind(key, now),
          db.prepare(`INSERT INTO website_visit_daily(day, visits) SELECT ?, 1 WHERE ${fresh} ON CONFLICT(day) DO UPDATE SET visits = visits + 1`).bind(day, key, now),
          db.prepare('INSERT INTO website_visit_sessions(session_hash, expires_at) VALUES (?, ?) ON CONFLICT(session_hash) DO UPDATE SET expires_at = excluded.expires_at').bind(key, now + IDLE_MS),
          db.prepare('DELETE FROM website_visit_sessions WHERE expires_at < ?').bind(now - RETENTION_MS),
        ]);
      }
    }
    const total = await db.prepare('SELECT visits, started_on AS since FROM website_visit_total WHERE id = 1').first();
    return reply(total || { visits: 0, since: null });
  } catch (error) {
    console.error('Website counter unavailable:', error.message);
    return reply({ error: 'Counter temporarily unavailable.' }, 503);
  }
}
