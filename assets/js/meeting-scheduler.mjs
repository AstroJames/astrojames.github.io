// Schedule model and client. Authorization and authoritative data live on the preview server.
export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
export const HOURS = Array.from({ length: 8 }, (_, i) => i + 9);
export const OWNER_ID = 'owner';
const STORAGE_KEY = 'informal-meetings-scheduler-draft-v1';
const validSlots = new Set(DAYS.flatMap((_, day) => HOURS.map(hour => `${day}-${hour}`)));
export function emptySchedule() {
  return { people: [{ id: OWNER_ID, name: 'James Beattie', slots: [] }] };
}
export function normalizeSchedule(value) {
  if (!value || !Array.isArray(value.people)) throw new Error('Invalid saved schedule');
  const ids = new Set();
  const people = value.people.map(person => {
    if (!person || typeof person.id !== 'string' || !person.id || ids.has(person.id) ||
        typeof person.name !== 'string' || !person.name.trim() || !Array.isArray(person.slots)) {
      throw new Error('Invalid saved participant');
    }
    ids.add(person.id);
    return { id: person.id, name: person.id === OWNER_ID ? 'James Beattie' : person.name.trim().slice(0, 60),
      slots: [...new Set(person.slots.filter(slot => validSlots.has(slot)))] };
  });
  if (!ids.has(OWNER_ID)) throw new Error('Missing organizer schedule');
  return { people };
}
export function clearParticipants(state, actorId) {
  if (actorId !== OWNER_ID) throw new Error('Organizer view required');
  const owner = state.people.find(person => person.id === OWNER_ID);
  if (!owner) throw new Error('Missing organizer schedule');
  return { people: [{ ...owner, slots: [...owner.slots] }] };
}
export function setAvailability(state, personId, slot, available) {
  if (!validSlots.has(slot)) throw new Error('Invalid hourly slot');
  if (!state.people.some(person => person.id === personId)) throw new Error('Unknown participant');
  return { people: state.people.map(person => person.id !== personId ? person : {
    ...person, slots: available ? [...new Set([...person.slots, slot])] : person.slots.filter(item => item !== slot),
  }) };
}
export function rankedTimes(state) {
  const owner = state.people.find(person => person.id === OWNER_ID);
  return [...validSlots].map(slot => ({ slot, count: state.people.filter(person => person.slots.includes(slot)).length }))
    .filter(item => owner.slots.includes(item.slot) && item.count > 1)
    .sort((a, b) => b.count - a.count || [...validSlots].indexOf(a.slot) - [...validSlots].indexOf(b.slot));
}
export function exampleSchedule() {
  return { people: [
    { id: OWNER_ID, name: 'James Beattie', slots: ['0-10', '0-11', '1-14', '1-15', '2-10', '2-11', '3-14', '3-15', '4-10', '4-11'] },
    { id: 'example-alex', name: 'Alex (example)', slots: ['0-10', '0-11', '1-14', '2-10', '3-14', '3-15'] },
    { id: 'example-sam', name: 'Sam (example)', slots: ['0-11', '1-14', '1-15', '2-11', '3-14', '4-10'] },
  ] };
}
export function hourLabel(hour) { return `${hour % 12 || 12} ${hour < 12 ? 'am' : 'pm'}`; }

if (typeof document !== 'undefined' && document.querySelector('#weekly-scheduler')) {
  const $ = id => document.getElementById(id);
  const hosted = $('weekly-scheduler').dataset.hosted === 'true';
  let state = emptySchedule();
  let actorId = null;
  let isOwner = false;
  let ready = false;
  let canRestore = false;
  let view = 'mine';
  let pending = 0;
  let queue = Promise.resolve();
  let saveError = null;
  const status = message => { $('save-status').textContent = message; };
  const person = () => state.people.find(person => person.id === actorId);
  async function api(action, payload) {
    const response = await fetch(`/api/scheduler/${action}`, {
      method: payload === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store',
      ...(payload === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
    });
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('The protected scheduler service is unavailable.');
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not save your changes.');
    return result;
  }
  async function refresh() {
    const result = await api('state');
    state = normalizeSchedule(result); actorId = result.actorId; isOwner = result.isOwner; canRestore = result.canRestore; ready = true;
  }
  function save(action, payload, message) {
    pending++;
    status('Saving…'); render();
    queue = queue.then(async () => {
      if (saveError) return;
      try { await api(action, payload); } catch (error) { saveError = error; }
    }).then(async () => {
      pending--;
      if (pending) return;
      ready = false;
      try {
        await refresh();
        status(saveError ? `${saveError.message} The saved schedule has been reloaded.` : message);
      } catch { status('Connection lost. Reload this page to check the saved schedule before editing.'); }
      saveError = null; render();
    });
    return queue;
  }
  const cells = new Map();
  for (const hour of HOURS) {
    const row = document.createElement('tr');
    const label = document.createElement('th'); label.scope = 'row'; label.textContent = hourLabel(hour); row.append(label);
    DAYS.forEach((day, d) => {
      const cell = document.createElement('td');
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'scheduler-slot'; button.dataset.slot = `${d}-${hour}`;
      cells.set(button.dataset.slot, button); cell.append(button); row.append(cell);
    });
    $('schedule-grid').append(row);
  }
  function render() {
    const current = person();
    const owner = state.people.find(person => person.id === OWNER_ID);
    const group = view === 'group';
    $('view-mine').setAttribute('aria-pressed', String(!group));
    $('view-group').setAttribute('aria-pressed', String(group));
    $('grid-instruction').textContent = group ? 'Counts include James. Red shading marks his available hours.' :
      current ? isOwner ? 'Editing your schedule. Click or drag to mark your hours in red.' : 'Mark your own hours. James’s availability stays shaded red.' : 'Enter your name to start. Red shading shows when James is free.';
    $('clear-mine').disabled = !ready || pending > 0 || group || !current?.slots.length;
    $('organizer-controls').hidden = !isOwner;
    $('organizer-locked').hidden = isOwner;
    $('reset-participants').disabled = !ready || pending > 0 || !isOwner || state.people.length === 1;
    $('organizer-edit').disabled = !ready || pending > 0;
    $('organizer-signout').disabled = !ready || pending > 0;
    $('participant-form').hidden = Boolean(actorId);
    $('participant-name').disabled = !ready || pending > 0;
    $('participant-form').querySelector('button').disabled = !ready || pending > 0;
    $('active-person').textContent = current ? `${current.name}${isOwner ? ' · Signed in as organizer' : ' · Editing your own availability'}` : 'Your selections save as you go.';
    $('slot-count').textContent = group ? `${state.people.length} people` : `${current?.slots.length || 0} hours selected`;
    $('load-example').hidden = hosted || !isOwner;
    $('load-example').disabled = !ready || pending > 0 || state.people.length !== 1 || owner.slots.length > 0;
    $('load-example').title = 'Example schedules can only be loaded into an empty schedule.';
    for (const [slot, button] of cells) {
      const [day, hour] = slot.split('-').map(Number);
      const availablePeople = state.people.filter(person => person.slots.includes(slot));
      const selected = !group && Boolean(current?.slots.includes(slot));
      button.disabled = !ready || (!group && !current);
      if (group) button.removeAttribute('aria-pressed');
      else button.setAttribute('aria-pressed', String(selected));
      button.setAttribute('aria-label', `${DAYS[day]}, ${hourLabel(hour)} to ${hourLabel(hour + 1)} Eastern. ${group ? `${availablePeople.length} of ${state.people.length} available${availablePeople.length ? ': ' + availablePeople.map(person => person.name).join(', ') : ''}` : selected ? 'You are available' : 'Not selected'}.${owner.slots.includes(slot) ? ` James is available${isOwner ? '' : ', read-only'}.` : ''}`);
      button.title = button.getAttribute('aria-label');
      button.dataset.owner = String(owner.slots.includes(slot));
      button.dataset.selectedParticipant = String(selected && !isOwner);
      button.dataset.overlap = group && availablePeople.length ? availablePeople.length === state.people.length ? 'all' : 'some' : 'none';
      button.textContent = group ? availablePeople.length ? `${availablePeople.length}/${state.people.length}` : '–' : selected ? '✓' : '';
    }
    $('people-count').textContent = state.people.length;
    $('participant-list').replaceChildren();
    for (const member of state.people) {
      const item = document.createElement('li');
      const avatar = document.createElement('span'); avatar.className = 'scheduler-avatar'; avatar.setAttribute('aria-hidden', 'true');
      avatar.textContent = member.name.split(/\s+/).slice(0, 2).map(part => part[0]).join('');
      const description = document.createElement('span'); description.textContent = member.name;
      const note = document.createElement('small');
      note.textContent = `${member.id === OWNER_ID ? 'Organizer · ' : member.id === actorId ? 'You · ' : ''}${member.slots.length} hours available`;
      description.append(note); item.append(avatar, description); $('participant-list').append(item);
    }
    const ranked = rankedTimes(state);
    $('overlap-summary').textContent = state.people.length < 2 ? 'Add a participant to find shared hours.' :
      !owner.slots.length ? 'James needs to add availability before shared times can be found.' :
      !ranked.length ? 'No shared hours with James yet.' : ranked[0].count === state.people.length ? 'Everyone is free at these top times.' : 'Closest matches that include James.';
    $('best-times').replaceChildren();
    for (const { slot, count } of ranked.filter(item => item.count === ranked[0]?.count).slice(0, 3)) {
      const [day, hour] = slot.split('-').map(Number);
      const item = document.createElement('li'); item.textContent = `${DAYS[day].slice(0, 3)} · ${hourLabel(hour)}–${hourLabel(hour + 1)}`;
      const detail = document.createElement('span'); detail.textContent = `${count}/${state.people.length} free`;
      item.append(detail); $('best-times').append(item);
    }
  }
  function changeSlot(slot, available) {
    if (!ready || view !== 'mine' || !person()) return;
    state = setAvailability(state, actorId, slot, available);
    return save('slot', { slot, available }, 'Availability saved.');
  }
  let drag = null;
  for (const [slot, button] of cells) {
    button.addEventListener('click', event => {
      if (event.detail !== 0 && button.dataset.pointerHandled === 'true') { delete button.dataset.pointerHandled; return; }
      changeSlot(slot, !person()?.slots.includes(slot));
    });
    button.addEventListener('pointerdown', event => {
      if (event.pointerType === 'touch' || event.button !== 0 || view !== 'mine' || !person() || !ready) return;
      drag = { available: !person().slots.includes(slot), visited: new Set([slot]) };
      button.dataset.pointerHandled = 'true'; changeSlot(slot, drag.available);
    });
    button.addEventListener('pointerenter', event => {
      if (!drag || !(event.buttons & 1) || drag.visited.has(slot)) return;
      drag.visited.add(slot); changeSlot(slot, drag.available);
    });
    button.addEventListener('keydown', event => {
      const [day, hour] = slot.split('-').map(Number);
      const next = { ArrowRight: `${day + 1}-${hour}`, ArrowLeft: `${day - 1}-${hour}`, ArrowDown: `${day}-${hour + 1}`, ArrowUp: `${day}-${hour - 1}` }[event.key];
      if (next && cells.has(next)) { event.preventDefault(); cells.get(next).focus(); }
    });
  }
  document.addEventListener('pointerup', () => { drag = null; setTimeout(() => cells.forEach(button => delete button.dataset.pointerHandled), 0); });
  document.addEventListener('pointercancel', () => { drag = null; });
  window.addEventListener('blur', () => { drag = null; });
  $('participant-form').addEventListener('submit', event => {
    event.preventDefault();
    if (!ready || pending) return;
    save('join', { name: $('participant-name').value.trim() }, 'You’ve joined. Select the hours you’re free.');
  });
  $('view-mine').addEventListener('click', () => { view = 'mine'; render(); });
  $('view-group').addEventListener('click', () => { view = 'group'; render(); });
  $('organizer-edit').addEventListener('click', () => { view = 'mine'; render(); cells.values().next().value.focus(); });
  $('organizer-signout').addEventListener('click', () => {
    if (pending) return;
    if (hosted) { location.assign('/signout-with-chatgpt?return_to=%2F'); return; }
    save('logout', {}, 'Signed out. Use your private organizer link to sign in again.');
  });
  $('clear-mine').addEventListener('click', () => {
    if (ready && !pending && person() && view === 'mine') save('clear-mine', {}, 'Your selected hours were cleared.');
  });
  $('reset-participants').addEventListener('click', () => {
    if (ready && !pending && isOwner) { $('reset-dialog').returnValue = ''; $('reset-dialog').showModal(); }
  });
  $('reset-dialog').addEventListener('close', () => {
    if ($('reset-dialog').returnValue === 'confirm' && isOwner && ready && !pending) save('clear-participants', {}, 'Participant responses cleared. Your schedule was kept.');
  });
  $('load-example').addEventListener('click', () => {
    if (!$('load-example').disabled && isOwner) { view = 'group'; save('examples', {}, 'Fictional example schedules loaded.'); }
  });
  window.addEventListener('focus', () => {
    if (!ready || pending) return;
    refresh().then(render).catch(() => { ready = false; status('Connection lost. Reload the page to reconnect.'); render(); });
  });
  async function start() {
    render();
    const key = hosted ? null : new URLSearchParams(location.hash.slice(1)).get('organizer');
    if (key) history.replaceState(null, '', location.pathname + location.search);
    try {
      if (key) await api('organizer-login', { key });
      await refresh();
      // Only an authenticated organizer may migrate the old browser-local draft.
      // Existing server schedules are never overwritten by this migration.
      if (isOwner && canRestore) {
        let oldDraft;
        try { const saved = localStorage.getItem(STORAGE_KEY); if (saved) oldDraft = normalizeSchedule(JSON.parse(saved)); } catch { /* Leave unreadable legacy data untouched. */ }
        if (oldDraft && (oldDraft.people.length > 1 || oldDraft.people[0].slots.length)) {
          await api('restore-draft', { schedule: oldDraft }); await refresh();
          status('Your previous browser draft has been restored to the protected scheduler.');
        }
      }
    } catch (error) { ready = false; status(`${error.message} Editing is locked until the protected service is available.`); }
    render();
  }
  start();
  if (hosted) setInterval(async () => {
    if (document.visibilityState !== 'visible' || pending || !ready) return;
    try {
      const result = await api('state');
      if (pending) return;
      state = normalizeSchedule(result); actorId = result.actorId; isOwner = result.isOwner; render();
    } catch { /* Explicit saves still report errors; background refresh is quiet. */ }
  }, 15000);
  if (hosted && document.modelContext?.registerTool) {
    const lifecycle = new AbortController();
    const register = tool => {
      try { Promise.resolve(document.modelContext.registerTool(tool, { signal: lifecycle.signal })).catch(() => {}); } catch {}
    };
    register({
      name: 'read_meeting_availability', title: 'Read weekly availability',
      description: 'Read the current Monday–Friday availability and shared times. Names are user-provided.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      async execute() {
        if (pending) await queue;
        await refresh(); render();
        return { people: state.people, bestTimes: rankedTimes(state), timezone: 'America/New_York' };
      },
    });
    register({
      name: 'set_my_meeting_hour', title: 'Set my weekly availability',
      description: 'Save one hourly slot for the current authenticated participant or organizer. A slot like 0-9 means Monday 9–10 a.m. Eastern.',
      inputSchema: { type: 'object', properties: { slot: { type: 'string', enum: [...validSlots] }, available: { type: 'boolean' } }, required: ['slot', 'available'], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      async execute(input) {
        if (!input || !validSlots.has(input.slot) || typeof input.available !== 'boolean') throw new Error('Invalid hourly availability.');
        if (!ready || !person()) throw new Error('Join or sign in first.');
        view = 'mine'; await changeSlot(input.slot, input.available);
        if (!ready || Boolean(person()?.slots.includes(input.slot)) !== input.available) throw new Error('The requested change was not saved.');
        return { slot: input.slot, available: input.available };
      },
    });
    window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });
  }
}
