import archiver from 'archiver';
import { createWriteStream, existsSync } from 'fs';
import { join } from 'path';

const ROOT = new URL('..', import.meta.url).pathname;
const DIST = join(ROOT, 'dist');
const OUTPUT = join(ROOT, 'linkedin-lead-capture.zip');

if (!existsSync(DIST)) {
  console.error('dist/ directory not found. Run `npm run build` first.');
  process.exit(1);
}

const output = createWriteStream(OUTPUT);
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
  const sizeKB = (archive.pointer() / 1024).toFixed(1);
  console.log(`Packaged: linkedin-lead-capture.zip (${sizeKB} KB)`);
});

archive.on('error', (err) => {
  throw err;
});

archive.pipe(output);
archive.directory(DIST, false);
archive.finalize();
