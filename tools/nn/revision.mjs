import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
export function simRevision() {
  const dir = new URL('../../src/sim/', import.meta.url);
  const files = readdirSync(dir).filter(n => n.endsWith('.js')).sort().map(name => ({ name,
    sha256: createHash('sha256').update(readFileSync(new URL(name, dir))).digest('hex'),
    mtime: statSync(new URL(name, dir)).mtime.toISOString() }));
  return { sha256: createHash('sha256').update(files.map(f => `${f.name}:${f.sha256}\n`).join('')).digest('hex'), files };
}
