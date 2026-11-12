// Read the website presentation colors for canvas charts as well as HTML controls.
const style = getComputedStyle(document.documentElement);
const color = (name) => style.getPropertyValue(`--${name}`).trim();
export const COL = {
  ink: color('ink'), muted: color('muted'), rule: color('rule'),
  accent: color('accent'), a: color('a'), b: color('b'), mag: color('b'),
  hi: 'rgba(140,204,244,0.13)',
};
