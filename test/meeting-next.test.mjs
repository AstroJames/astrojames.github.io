import test from 'node:test';
import assert from 'node:assert/strict';
import {nextSession} from '../assets/js/meeting-next.mjs';

const first = {date:'2026-09-30',status:'confirmed',end:'14:00'};
const second = {date:'2026-10-14',status:'confirmed',end:'14:00'};
test('moves from the first session at its Eastern end time without a rebuild', () => {
  assert.equal(nextSession([second,first],new Date('2026-09-30T17:59:00Z')),first);
  assert.equal(nextSession([second,first],new Date('2026-09-30T18:00:00Z')),second);
});
test('skips cancelled, completed, undated, and past sessions', () => {
  assert.equal(nextSession([{date:'2026-09-25',status:'cancelled'}, {date:'2026-09-26',status:'completed'},
    {date:'',status:'planning'}, {date:'2026-09-01',status:'confirmed'}, second],new Date('2026-09-18T12:00:00Z')),second);
});
test('handles the winter Eastern offset and preserves planned status', () => {
  const planned={date:'2026-11-11',status:'planning',end:'14:00'};
  assert.equal(nextSession([planned],new Date('2026-11-11T18:59:00Z')),planned);
  assert.equal(nextSession([planned],new Date('2026-11-11T19:00:00Z')),null);
});
