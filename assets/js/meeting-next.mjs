export function nextSession(sessions, now = new Date(), timezone = 'America/New_York') {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(now).map(part => [part.type, part.value]));
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  const time = `${parts.hour}:${parts.minute}`;
  return sessions.filter(session => session.date && !['completed', 'cancelled'].includes(session.status)
    && (session.date > today || (session.date === today && time < (session.end || '23:59'))))
    .sort((a, b) => a.date.localeCompare(b.date))[0] || null;
}

if (typeof document !== 'undefined') {
  const page = document.querySelector('[data-meeting-timezone]');
  const card = page?.querySelector('.meeting-next');
  if (card) {
    const rows = [...page.querySelectorAll('tr[data-meeting-date]')];
    const update = () => {
      rows.forEach(row => {
        row.classList.remove('meeting-is-next');
        row.querySelector('.meeting-next-badge').hidden = true;
      });
      const next = nextSession(rows.map(row => ({row, date: row.dataset.meetingDate,
        status: row.dataset.meetingStatus, end: row.dataset.meetingEnd})), new Date(), page.dataset.meetingTimezone);
      card.hidden = !next;
      if (!next) return;
      const {row, status} = next;
      const label = status === 'confirmed' ? 'Next session' : 'Next planned session';
      row.classList.add('meeting-is-next');
      const badge = row.querySelector('.meeting-next-badge');
      badge.textContent = label;
      badge.hidden = false;
      card.querySelector('.meeting-next-label').textContent = label;
      card.querySelector('.meeting-next-title').textContent = row.querySelector('.meeting-session-title').textContent;
      card.querySelector('.meeting-next-when').textContent = [row.querySelector('time').textContent,
        row.querySelector('.meeting-session-time')?.textContent].filter(Boolean).join(' · ');
      card.querySelector('.meeting-next-speaker').textContent = row.querySelector('.meeting-session-speaker').innerText.replace(/\n+/g, ' · ');
      card.querySelector('.meeting-next-link').href = `#${row.id}`;
    };
    card.querySelector('.meeting-next-link').addEventListener('click', event => {
      const row = document.getElementById(event.currentTarget.hash.slice(1));
      if (row) row.querySelector('details').open = true;
    });
    update();
    setInterval(update, 60000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) update(); });
  }
}
