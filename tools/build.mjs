// Bundles the game into one self-contained dist/index.html that opens from disk.
//   node tools/build.mjs            production build
//   node tools/build.mjs --serve    build and serve on http://localhost:5178
//   --brain=<module>                swap src/ai/index.js for another module (test harnesses only)
//   --out=<dir>                     write somewhere other than dist/

import { build } from 'esbuild';
import { createServer } from 'node:http';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const outDir = resolve(root, arg('out') ?? 'dist');
const brainOverride = arg('brain');

const brainPlugin = {
  name: 'brain-override',
  setup(b) {
    if (!brainOverride) return;
    b.onResolve({ filter: /\/ai\/index\.js$/ }, () => ({ path: resolve(brainOverride) }));
  },
};

const result = await build({
  absWorkingDir: root,
  entryPoints: ['src/main.js'],
  bundle: true,
  minify: !brainOverride,
  format: 'iife',
  target: 'es2022',
  write: false,
  outdir: 'out',
  loader: { '.woff2': 'dataurl', '.woff': 'empty' },
  logLevel: 'warning',
  plugins: [brainPlugin],
});

let js = '', css = '';
for (const f of result.outputFiles) {
  if (f.path.endsWith('.js')) js = f.text;
  if (f.path.endsWith('.css')) css = f.text;
}

let html = await readFile(join(root, 'index.html'), 'utf8');
html = html.replace('<link rel="stylesheet" href="bundle.css">', () => `<style>${css}</style>`);
html = html.replace('<script src="bundle.js"></script>', () => `<script>${js.replace(/<\/script/g, '<\\/script')}</script>`);

await mkdir(outDir, { recursive: true });
const outFile = join(outDir, 'index.html');
await writeFile(outFile, html);
// The music is too big to inline, and it streams, so it sits beside the page.
const musicFile = join(outDir, 'music.mp3');
await copyFile(join(root, 'assets', 'derby-destruction.mp3'), musicFile);
console.log(`Built ${outFile} (${(html.length / 1048576).toFixed(1)} MB)`);

if (process.argv.includes('--serve')) {
  const port = 5178;
  createServer(async (req, res) => {
    const music = req.url.startsWith('/music.mp3');
    res.writeHead(200, { 'content-type': music ? 'audio/mpeg' : 'text/html; charset=utf-8' });
    res.end(await readFile(music ? musicFile : outFile));
  }).listen(port, () => console.log(`Grudge Bowl: http://localhost:${port}`));
}
