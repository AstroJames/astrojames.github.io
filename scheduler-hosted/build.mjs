import { readFileSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';
const assets = {};
for (const [name, type] of [['index.html', 'text/html; charset=utf-8'], ['styles.css', 'text/css'], ['scheduler.mjs', 'text/javascript']]) {
  assets[name === 'index.html' ? '/' : '/' + name] = { type, body: readFileSync('web/' + name, 'utf8') };
}
mkdirSync('dist/server', { recursive: true });
writeFileSync('dist/server/index.js', 'const STATIC = ' + JSON.stringify(assets) + ';\n' + readFileSync('src/worker.mjs', 'utf8'));
mkdirSync('dist/.openai', { recursive: true });
cpSync('.openai/hosting.json', 'dist/.openai/hosting.json');
cpSync('drizzle', 'dist/.openai/drizzle', { recursive: true });
console.log('Built standalone scheduler Worker with public assets and D1 migrations.');
