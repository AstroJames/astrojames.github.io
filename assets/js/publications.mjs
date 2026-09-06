export function normalize(value = '') {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function matchesPublication(record, filters) {
  const terms = normalize(filters.query).split(/\s+/).filter(Boolean);
  return (!filters.year || record.year === filters.year)
    && (!filters.topic || record.topics.includes(filters.topic))
    && (!filters.authorship || record.authorship === filters.authorship)
    && terms.every(term => record.search.includes(term));
}

export function comparePublications(a, b, order = 'newest') {
  const dates = a.date.localeCompare(b.date);
  return (order === 'oldest' ? dates : -dates) || a.search.localeCompare(b.search);
}

export function initPublications(root) {
  const form = root.querySelector('form');
  const results = root.querySelector('#publication-results');
  const count = root.querySelector('.publication-count');
  const empty = root.querySelector('.publication-empty');
  const records = [...results.querySelectorAll('.publication-item')].map(element => ({
    element,
    year: element.dataset.year,
    date: element.dataset.date,
    authorship: element.dataset.authorship,
    topics: element.dataset.topics.split('|'),
    search: normalize(element.textContent),
  }));

  function update() {
    const filters = Object.fromEntries(new FormData(form));
    let visible = 0;
    const fragment = document.createDocumentFragment();
    for (const record of [...records].sort((a, b) => comparePublications(a, b, filters.sort))) {
      record.element.hidden = !matchesPublication(record, filters);
      if (!record.element.hidden) visible++;
      fragment.append(record.element);
    }
    results.append(fragment);
    count.textContent = 'Showing ' + visible + ' of ' + records.length + ' publications';
    empty.hidden = visible !== 0;
  }

  form.addEventListener('submit', event => event.preventDefault());
  form.addEventListener('input', update);
  form.addEventListener('change', update);
  form.addEventListener('reset', () => queueMicrotask(update));
  form.hidden = false;
  count.hidden = false;
  update();
}

if (typeof document !== 'undefined') {
  document.querySelectorAll('[data-publication-browser]').forEach(initPublications);
}
