import test from 'node:test';
import assert from 'node:assert/strict';
import { emptySchedule, exampleSchedule, clearParticipants, setAvailability, normalizeSchedule, rankedTimes, HOURS } from '../assets/js/meeting-scheduler.mjs';

test('participant reset preserves the organizer exactly, including after repeated resets', () => {
  const original = exampleSchedule();
  const snapshot = structuredClone(original);
  const cleared = clearParticipants(original, 'owner');
  assert.deepEqual(cleared.people, [snapshot.people[0]]);
  assert.deepEqual(clearParticipants(cleared, 'owner'), cleared);
  assert.deepEqual(original, snapshot);
  cleared.people[0].slots.push('4-16');
  assert.deepEqual(original, snapshot);
});

test('participant view cannot invoke the organizer reset', () => {
  assert.throws(() => clearParticipants(exampleSchedule(), 'example-alex'), /Organizer/);
  assert.throws(() => clearParticipants(exampleSchedule(), null), /Organizer/);
});

test('selection edits only the chosen person and rejects out-of-hours slots', () => {
  const state = exampleSchedule();
  const updated = setAvailability(state, 'example-alex', '4-16', true);
  assert.deepEqual(updated.people[0], state.people[0]);
  assert.deepEqual(updated.people[2], state.people[2]);
  assert.ok(updated.people[1].slots.includes('4-16'));
  assert.deepEqual(setAvailability(updated, 'example-alex', '4-16', false), state);
  assert.throws(() => setAvailability(state, 'example-alex', '4-17', true), /Invalid/);
  assert.throws(() => setAvailability(state, 'unknown', '0-9', true), /Unknown/);
  assert.deepEqual(HOURS, [9, 10, 11, 12, 13, 14, 15, 16]);
});

test('best times require James and rank full group availability first', () => {
  const state = exampleSchedule();
  const best = rankedTimes(state);
  assert.deepEqual(best.filter(item => item.count === 3).map(item => item.slot), ['0-11', '1-14', '3-14']);
  assert.ok(best.every(item => state.people[0].slots.includes(item.slot)));
  assert.deepEqual(rankedTimes(clearParticipants(state, 'owner')), []);
  assert.deepEqual(rankedTimes(emptySchedule()), []);
});

test('saved draft round-trips and malformed data cannot erase the owner', () => {
  const state = exampleSchedule();
  assert.deepEqual(normalizeSchedule(JSON.parse(JSON.stringify(state))), state);
  assert.throws(() => normalizeSchedule({ people: state.people.slice(1) }), /Missing organizer/);
  assert.throws(() => normalizeSchedule({ people: [state.people[0], state.people[0]] }), /Invalid/);
  assert.throws(() => normalizeSchedule({ people: [null] }), /Invalid/);
  const invalidSlots = emptySchedule();
  invalidSlots.people[0].slots = ['0-9', '0-9', '8-24', null];
  assert.deepEqual(normalizeSchedule(invalidSlots).people[0].slots, ['0-9']);
});
