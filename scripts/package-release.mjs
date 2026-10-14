import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const name = `uptime-v${version}.tar.gz`;
const dist = path.join(root, 'dist');
const output = path.join(root, 'releases');
await stat(path.join(dist, 'index.html'));
await mkdir(output, { recursive: true });
const archive = path.join(output, name);
// tar is available on the supported local macOS and GitHub's Ubuntu runner.
execFileSync('tar', ['-czf', archive, '-C', dist, '.'], { stdio: 'inherit' });
const hash = createHash('sha256').update(await readFile(archive)).digest('hex');
await writeFile(`${archive}.sha256`, `${hash}  ${name}\n`);
const { size } = await stat(archive);
console.log(`Release: releases/${name} (${(size / 1024).toFixed(0)} KB)`);
console.log(`Checksum: releases/${name}.sha256`);
