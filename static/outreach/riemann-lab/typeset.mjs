import katex from './vendor/katex/katex.mjs';

const cache = new Map();
export function math(tex, displayMode = false) {
  const key = `${displayMode}:${tex}`;
  if (cache.has(key)) return cache.get(key);
  const html = katex.renderToString(tex, { displayMode, throwOnError: true, strict: 'error', trust: false, output: 'htmlAndMathml' });
  if (cache.size >= 192) cache.delete(cache.keys().next().value);
  cache.set(key, html);
  return html;
}
export const equation = tex => `<div class="math-line">${math(tex, true)}</div>`;
export function setMath(element, tex, displayMode = false) {
  if (element.dataset.tex === tex) return;
  element.innerHTML = math(tex, displayMode);
  element.dataset.tex = tex;
}
export const texNumber = value => {
  const valueString = Number(value.toPrecision(6)).toString();
  return valueString.includes('e') ? valueString.replace(/e([+-]?\d+)/, '\\times 10^{$1}') : valueString;
};
