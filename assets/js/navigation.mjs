const nav = document.querySelector('.site-navigation');
if (nav) {
  const row = nav.querySelector('#nav-menu');
  const overflow = row.querySelector('.nav-overflow');
  const disclosure = overflow.querySelector('details');
  const summary = disclosure.querySelector('summary');
  const label = summary.querySelector('span');
  const list = overflow.querySelector('ul');
  const items = [...row.children].filter(item => item !== overflow);
  let pending = 0;
  let lastWidth = -1;

  function fitLinks() {
    pending = 0;
    const focused = document.activeElement;
    items.forEach(item => row.insertBefore(item, overflow));
    overflow.hidden = false;
    label.textContent = 'More';
    // Measure once per resize/font change, never in the animation loop.
    const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
    const widths = items.map(item => item.getBoundingClientRect().width);
    const available = row.getBoundingClientRect().width;
    const total = widths.reduce((sum, width) => sum + width, 0) + gap * (items.length - 1);
    let count = items.length;
    if (total > available) {
      const reserve = overflow.getBoundingClientRect().width + gap;
      let used = 0;
      count = 0;
      for (const width of widths) {
        if (used + width + reserve > available) break;
        used += width + gap;
        count++;
      }
    }
    items.slice(count).forEach(item => list.appendChild(item));
    overflow.hidden = count === items.length;
    label.textContent = count === 0 ? 'Menu' : 'More';
    if (overflow.hidden) disclosure.open = false;
    if (focused && items.some(item => item.contains(focused))) {
      if (list.contains(focused)) disclosure.open = true;
      focused.focus({ preventScroll: true });
    }
    nav.classList.add('navigation-ready');
  }
  function scheduleFit() {
    if (!pending) pending = requestAnimationFrame(fitLinks);
  }
  new ResizeObserver(entries => {
    const width = entries[0].contentRect.width;
    if (width !== lastWidth) { lastWidth = width; scheduleFit(); }
  }).observe(nav);
  document.fonts?.ready.then(scheduleFit);
  scheduleFit();
  document.addEventListener('click', event => {
    if (!overflow.contains(event.target) || event.target.closest('a')) disclosure.open = false;
  });
  disclosure.addEventListener('keydown', event => {
    if (event.key === 'Escape') { disclosure.open = false; summary.focus(); }
  });
}
