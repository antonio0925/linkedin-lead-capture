import * as esbuild from 'esbuild';
import { copyFileSync, mkdirSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { deflateSync } from 'zlib';

const ROOT = new URL('..', import.meta.url).pathname;
const DIST = join(ROOT, 'dist');
const SRC = join(ROOT, 'src');
const isWatch = process.argv.includes('--watch');

// Ensure dist directories exist
for (const dir of ['dist', 'dist/popup', 'dist/icons']) {
  const full = join(ROOT, dir);
  if (!existsSync(full)) mkdirSync(full, { recursive: true });
}

// Generate placeholder icon PNGs (1x1 colored pixel as minimal valid PNG)
// These are placeholders — replace with real icons before publishing
function generatePlaceholderIcon(size: number): Buffer {
  // Minimal valid PNG: 8-byte signature + IHDR + IDAT + IEND
  // For a real extension, replace these with actual designed icons
  const canvas = createMinimalPNG(size);
  return canvas;
}

function createMinimalPNG(size: number): Buffer {
  // Generate a simple PNG with a colored background
  // This creates a valid PNG file that Chrome will accept
  // deflateSync imported at top level

  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);  // width
  ihdrData.writeUInt32BE(size, 4);  // height
  ihdrData.writeUInt8(8, 8);        // bit depth
  ihdrData.writeUInt8(2, 9);        // color type (RGB)
  ihdrData.writeUInt8(0, 10);       // compression
  ihdrData.writeUInt8(0, 11);       // filter
  ihdrData.writeUInt8(0, 12);       // interlace
  const ihdr = createChunk('IHDR', ihdrData);

  // IDAT chunk - raw image data
  // Each row: filter byte (0) + RGB pixels
  const rowSize = 1 + size * 3;
  const rawData = Buffer.alloc(rowSize * size);
  for (let y = 0; y < size; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // no filter
    for (let x = 0; x < size; x++) {
      const pixelOffset = rowOffset + 1 + x * 3;
      // LinkedIn blue: #0A66C2
      rawData[pixelOffset] = 0x0A;     // R
      rawData[pixelOffset + 1] = 0x66; // G
      rawData[pixelOffset + 2] = 0xC2; // B
    }
  }
  const compressed = deflateSync(rawData);
  const idat = createChunk('IDAT', compressed);

  // IEND chunk
  const iend = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function createChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeBuffer = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBuffer, data]);
  const crc = crc32(crcInput);

  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc, 0);

  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

function crc32(buf: Buffer): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// Generate placeholder icons
for (const size of [16, 48, 128]) {
  const iconPath = join(DIST, 'icons', `icon-${size}.png`);
  if (!existsSync(iconPath)) {
    const png = createMinimalPNG(size);
    writeFileSync(iconPath, png);
    console.log(`Generated placeholder icon: icon-${size}.png`);
  }
}

// Copy static files
copyFileSync(join(ROOT, 'manifest.json'), join(DIST, 'manifest.json'));
console.log('Copied manifest.json -> dist/');

// Copy popup HTML and CSS if they exist
const popupHtml = join(SRC, 'popup', 'popup.html');
const popupCss = join(SRC, 'popup', 'popup.css');
if (existsSync(popupHtml)) {
  copyFileSync(popupHtml, join(DIST, 'popup', 'popup.html'));
  console.log('Copied popup.html -> dist/popup/');
}
if (existsSync(popupCss)) {
  copyFileSync(popupCss, join(DIST, 'popup', 'popup.css'));
  console.log('Copied popup.css -> dist/popup/');
}

// Shared esbuild options
const commonOptions: esbuild.BuildOptions = {
  bundle: true,
  minify: false,
  sourcemap: true,
  target: 'es2022',
  logLevel: 'info',
};

// Entry points with their specific configs
const builds: esbuild.BuildOptions[] = [
  {
    ...commonOptions,
    entryPoints: [join(SRC, 'content', 'index.ts')],
    outfile: join(DIST, 'content.js'),
    format: 'iife',
  },
  {
    ...commonOptions,
    entryPoints: [join(SRC, 'background', 'service-worker.ts')],
    outfile: join(DIST, 'service-worker.js'),
    format: 'esm',
  },
  {
    ...commonOptions,
    entryPoints: [join(SRC, 'popup', 'popup.ts')],
    outfile: join(DIST, 'popup', 'popup.js'),
    format: 'iife',
  },
];

async function build() {
  if (isWatch) {
    console.log('Watching for changes...');
    const contexts = await Promise.all(
      builds.map((opts) => esbuild.context(opts))
    );
    await Promise.all(contexts.map((ctx) => ctx.watch()));
    console.log('Watching all entry points. Press Ctrl+C to stop.');
  } else {
    await Promise.all(builds.map((opts) => esbuild.build(opts)));
    console.log('Build complete.');
  }
}

build().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
