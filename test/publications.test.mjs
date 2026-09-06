import assert from 'node:assert/strict';
import { test } from 'node:test';
import { comparePublications, matchesPublication, normalize } from '../assets/js/publications.mjs';

const records = [
  { year: '2026', date: '2026-04-00', authorship: 'second', topics: ['Cosmic rays', 'Turbulence'], search: normalize('Cosmic-Ray and Plasma Coupling Matt Sampson Benoît Commerçon Alfvénic streaming') },
  { year: '2026', date: '2026-06-00', authorship: 'first', topics: ['Turbulence'], search: normalize('Supernovae drive turbulence James Beattie') },
  { year: '2025', date: '2025-12-00', authorship: 'first', topics: ['Turbulence'], search: normalize('So long Kolmogorov') },
  { year: '2018', date: '2018-00-00', authorship: 'second', topics: ['Interdisciplinary research'], search: normalize('Mechanical weeding tools') },
];

const select = filters => records.filter(record => matchesPublication(record, filters));

test('search supports multiple terms, accents, punctuation, and mixed case', () => {
  for (const query of ['SAMPSON cosmic-ray', 'Benoit Commercon', 'alfvenic streaming']) {
    assert.deepEqual(select({ query }), [records[0]]);
  }
});

test('year, topic, authorship, and search combine with AND semantics', () => {
  assert.deepEqual(select({ query: 'plasma', year: '2026', topic: 'Cosmic rays', authorship: 'second' }), [records[0]]);
  assert.deepEqual(select({ year: '2026', topic: 'Cosmic rays', authorship: 'first' }), []);
  assert.deepEqual(select({ query: 'sampson', year: '2025' }), []);
});

test('cleared or whitespace-only filters restore every record', () => {
  assert.deepEqual(select({ query: '   ', year: '', topic: '', authorship: '' }), records);
});

test('an unmatched keyword produces no results', () => {
  assert.deepEqual(select({ query: 'no-such-paper-xyz' }), []);
});

test('sorting uses the publication month and tolerates unknown ADS days/months', () => {
  assert.deepEqual([...records].sort(comparePublications), [records[1], records[0], records[2], records[3]]);
  assert.deepEqual([...records].sort((a, b) => comparePublications(a, b, 'oldest')), [records[3], records[2], records[0], records[1]]);
});
