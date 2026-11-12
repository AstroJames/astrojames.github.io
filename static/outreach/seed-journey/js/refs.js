// Citation helper: numbers come from the order of the reference list at the bottom of the page (<ol id="refs-list">).
export function citeNum(key) {
  const li = document.getElementById(`ref-${key}`);
  if (!li) { console.error(`missing reference: ${key}`); return '?'; }
  return [...li.parentElement.children].indexOf(li) + 1;
}
export const cite = (...keys) =>
  `<sup class="cite">${keys.map((k) => `<a href="#ref-${k}" aria-label="reference ${citeNum(k)}">${citeNum(k)}</a>`).join(',')}</sup>`;
// replaces [[KeyA,KeyB]] in a string with superscript citation links
export const withCites = (s) => s.replace(/\[\[([^\]]+)\]\]/g, (m, ks) => cite(...ks.split(',').map((x) => x.trim())));
