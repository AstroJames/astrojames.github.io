// Export the shared Hugo scheduler UI into its standalone hosted source tree.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const destination = resolve(process.argv[2] || 'scheduler-hosted');
mkdirSync(destination + '/web', { recursive: true });
const template = readFileSync('layouts/_default/meeting-scheduler.html', 'utf8');
let content = template.slice(template.indexOf('<div class="meetings-page scheduler"'), template.indexOf('{{ $script'));
content = content.replace('id="weekly-scheduler"', 'id="weekly-scheduler" data-hosted="true"');
content = content.replace('{{ "/informal-meetings/" | relURL }}', 'https://astro-beattie.com/informal-meetings/');
content = content.replace('<strong>Local draft</strong>', '<strong>Weekly availability</strong>');
content = content.replace('from this draft.', 'from this schedule.');
content = content.replace('Organizer access uses a private sign-in link.', '<a href="/signin-with-chatgpt?return_to=%2F" target="_top">Sign in as organizer</a>.');
writeFileSync(destination + '/web/index.html', `<!doctype html>
<html lang="en" class="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Weekly meeting availability · James Beattie</title><meta name="description" content="Find a weekly meeting time with James Beattie. Monday–Friday, 9 a.m.–5 p.m. Eastern."><link rel="stylesheet" href="/styles.css"></head><body>
${content}<script type="module" src="/scheduler.mjs"></script></body></html>`);
const base = `*{box-sizing:border-box}body{margin:0;background:var(--site-bg);color:var(--site-text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}button,input{font:inherit}button{background:transparent;border:0;color:inherit}button,a,input,summary{outline-offset:4px}a{color:var(--site-accent);text-underline-offset:.2em}a:hover{color:var(--site-link-hover)}button:focus-visible,a:focus-visible,input:focus-visible,summary:focus-visible{outline:2px solid var(--site-accent)}h1,h2,p{margin-top:0}dialog:not([open]),[hidden]{display:none!important}::selection{background:var(--site-accent);color:var(--site-on-accent)}\n`;
writeFileSync(destination + '/web/styles.css', ['assets/css/themes/slate-blue.css','assets/css/meetings.css','assets/css/meeting-scheduler.css'].map(p => readFileSync(p,'utf8')).join('\n') + '\n' + base);
writeFileSync(destination + '/web/scheduler.mjs', readFileSync('assets/js/meeting-scheduler.mjs'));
console.log('Exported shared scheduler UI.');
