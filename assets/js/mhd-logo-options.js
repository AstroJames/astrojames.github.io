(() => {
  const filters = document.querySelector('.logo-filters');
  if (!filters) return;
  const cards = [...document.querySelectorAll('.logo-card')];
  const state = {family: 'all', format: 'all'};
  filters.hidden = false;
  filters.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    const key = button.hasAttribute('data-family') ? 'family' : 'format';
    state[key] = button.dataset[key];
    filters.querySelectorAll(`[data-${key}]`).forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    let count = 0;
    cards.forEach(card => {
      card.hidden = !Object.entries(state).every(([field, value]) => value === 'all' || card.dataset[field] === value);
      if (!card.hidden) count++;
    });
    document.querySelector('.logo-count').textContent = `${count} ${count === 1 ? 'design' : 'designs'}`;
  });
  const dialog = document.querySelector('.logo-dialog');
  if (!dialog || typeof dialog.showModal !== 'function') return;
  document.querySelectorAll('[data-preview]').forEach(link => link.addEventListener('click', event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    dialog.querySelector('img').src = link.href;
    dialog.querySelector('img').alt = link.querySelector('img').alt;
    dialog.querySelector('h2').textContent = link.dataset.title;
    dialog.querySelector('a').href = link.href;
    dialog.classList.toggle("logo-dialog-dark", !!link.closest(".logo-card-selected"));
    dialog.showModal();
  }));
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog && (event.clientX < dialog.getBoundingClientRect().left || event.clientX > dialog.getBoundingClientRect().right || event.clientY < dialog.getBoundingClientRect().top || event.clientY > dialog.getBoundingClientRect().bottom)) dialog.close(); });
})();
