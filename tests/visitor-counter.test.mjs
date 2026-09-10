import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../assets/js/visitor-counter.mjs', import.meta.url), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
async function page({ storage = new Map(), unavailable = false, blocked = false } = {}) {
  const nodes = {
    'visitor-counter': { dataset: { endpoint: 'https://schedule.astro-beattie.com/api/visits' }, removeAttribute() {} },
    'visit-count': {}, 'counter-label': {},
  };
  const calls = []; let tick; let total = 12; let fail = unavailable;
  vm.runInNewContext(source, {
    document: { hidden: false, getElementById: id => nodes[id], addEventListener() {} },
    location: { hostname: 'astro-beattie.com' }, navigator: {}, crypto,
    localStorage: { getItem: key => { if(blocked) throw Error(); return storage.get(key) || null; }, setItem: (key, value) => { if(blocked) throw Error(); storage.set(key, value); } },
    setInterval: fn => { tick = fn; }, AbortSignal,
    fetch: async (_, init) => { calls.push(init); if(fail) throw Error('Offline'); return { ok: true, json: async () => ({ visits: total, since: '2026-09-10' }) }; },
  });
  await flush();
  return { nodes, calls, tick: async () => { tick(); await flush(); }, online: () => { fail = false; }, setTotal: n => { total = n; } };
}

test('reloads reuse a session; polling never registers visits and lower responses do not regress the display', async () => {
  const storage = new Map(); const a = await page({ storage }); const b = await page({ storage });
  assert.equal(JSON.parse(a.calls[0].body).session, JSON.parse(b.calls[0].body).session);
  await a.tick(); assert.equal(a.calls[1].method, 'GET');
  a.setTotal(10); await a.tick(); assert.equal(a.nodes['visit-count'].textContent, '12');
});
test('storage-disabled failures show unavailable and retry with the same session', async () => {
  const a = await page({ blocked: true, unavailable: true });
  assert.equal(a.nodes['visit-count'].textContent, '—');
  assert.match(a.nodes['counter-label'].textContent, /unavailable/);
  a.online(); await a.tick();
  assert.equal(a.calls[0].body, a.calls[1].body);
  assert.equal(a.nodes['visit-count'].textContent, '12');
});
test('idle sessions are renewed rather than retained forever', async () => {
  const storage = new Map([['astro-beattie-visit-session-v1', JSON.stringify({ id: crypto.randomUUID(), seen: Date.now() - 31 * 60000 })]]);
  const previous = JSON.parse(storage.values().next().value).id;
  const a = await page({ storage });
  assert.notEqual(JSON.parse(a.calls[0].body).session, previous);
});
