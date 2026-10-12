// Renders every web and Expo icon from one source SVG (spec 0037, AC-7).
// Run with `pnpm icons` after changing assets/brand/mark.svg; never edit the
// outputs by hand. Output is deterministic on one machine (fixed sizes, no
// metadata); bytes may differ across libvips builds, so the cross machine
// check is the pixel size test in generate-icons.test.ts, not a byte diff.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(ROOT, "assets/brand/mark.svg");

// Mirrors colors.dark.bg in packages/shared/src/tokens.ts.
export const CHARCOAL = "#121212";

// The glass spans 4..20 of the 24 unit viewBox, centered on 12.
const MARK_CENTER = 12;
const MARK_SIZE = 16;

// How much of the canvas the glass fills, per use.
const FILL = {
  tight: 0.8, // favicons: small sizes need every pixel
  comfortable: 0.6, // app icons on a charcoal square
  maskable: 0.5, // stays inside the 80% maskable safe zone
  adaptive: 0.4, // stays inside Android's 66dp of 108dp safe zone
  full: 0.95, // splash and the animated splash image
};

/**
 * Every generated file: path from the repo root, square size in pixels,
 * framing, and whether it sits on a charcoal square.
 */
export const OUTPUTS = [
  { path: "apps/web/src/app/apple-icon.png", size: 180, fill: "comfortable", opaque: true },
  { path: "apps/web/public/icons/icon-192.png", size: 192, fill: "comfortable", opaque: true },
  { path: "apps/web/public/icons/icon-512.png", size: 512, fill: "comfortable", opaque: true },
  {
    path: "apps/web/public/icons/icon-maskable-512.png",
    size: 512,
    fill: "maskable",
    opaque: true,
  },
  { path: "apps/mobile/assets/images/icon.png", size: 1024, fill: "comfortable", opaque: true },
  { path: "apps/mobile/assets/images/favicon.png", size: 48, fill: "tight", opaque: true },
  {
    path: "apps/mobile/assets/images/android-icon-foreground.png",
    size: 512,
    fill: "adaptive",
    opaque: false,
  },
  {
    path: "apps/mobile/assets/images/android-icon-monochrome.png",
    size: 432,
    fill: "adaptive",
    opaque: false,
    monochrome: true,
  },
  { path: "apps/mobile/assets/images/splash-icon.png", size: 228, fill: "full", opaque: false },
  { path: "apps/mobile/assets/images/brand-mark.png", size: 228, fill: "full", opaque: false },
];

export const BACKGROUND_OUTPUT = {
  path: "apps/mobile/assets/images/android-icon-background.png",
  size: 512,
};

export const FAVICON_OUTPUT = { path: "apps/web/src/app/favicon.ico", sizes: [16, 32, 48] };

export const SVG_OUTPUT = "apps/web/src/app/icon.svg";

function frame(svg, size, fill) {
  const box = MARK_SIZE / FILL[fill];
  const origin = MARK_CENTER - box / 2;
  return svg
    .replace(/width="[^"]*"/, `width="${size}"`)
    .replace(/height="[^"]*"/, `height="${size}"`)
    .replace(/viewBox="[^"]*"/, `viewBox="${origin} ${origin} ${box} ${box}"`);
}

const png = (image) => image.png({ compressionLevel: 9, adaptiveFiltering: false }).toBuffer();

function charcoalSquare(size) {
  return sharp({
    create: { width: size, height: size, channels: 4, background: CHARCOAL },
  });
}

async function renderMark(svg, size, fill) {
  return sharp(Buffer.from(frame(svg, size, fill)))
    .ensureAlpha()
    .png()
    .toBuffer();
}

// White silhouette for Android themed icons: the green glass becomes white,
// the charcoal rim line becomes a transparent gap.
async function toMonochrome(markPng) {
  const { data, info } = await sharp(markPng).raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const green = data[i + 1];
    const glassShare = Math.min(1, Math.max(0, (green - 0x12) / (0x76 - 0x12)));
    out[i] = 255;
    out[i + 1] = 255;
    out[i + 2] = 255;
    out[i + 3] = Math.round(data[i + 3] * glassShare);
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } });
}

async function renderOutput(svg, { size, fill, opaque, monochrome }) {
  const mark = await renderMark(svg, size, fill);
  if (monochrome) return png(await toMonochrome(mark));
  if (opaque) return png(charcoalSquare(size).composite([{ input: mark }]));
  return png(sharp(mark));
}

// ICO container holding PNG images: a 6 byte header, then one 16 byte
// directory entry per image (all little endian; a size byte of 0 means 256).
export function packIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  const offsets = images.reduce(
    (acc, { data }) => [...acc, acc.at(-1) + data.length],
    [6 + 16 * images.length],
  );

  const entries = images.map(({ size, data }, index) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offsets[index], 12);
    return entry;
  });

  return Buffer.concat([header, ...entries, ...images.map(({ data }) => data)]);
}

async function write(path, data) {
  const target = join(ROOT, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, data);
  console.log(`wrote ${path}`);
}

async function main() {
  const svg = await readFile(SOURCE, "utf8");

  await write(SVG_OUTPUT, svg);

  for (const output of OUTPUTS) {
    await write(output.path, await renderOutput(svg, output));
  }

  await write(BACKGROUND_OUTPUT.path, await png(charcoalSquare(BACKGROUND_OUTPUT.size)));

  const favicons = await Promise.all(
    FAVICON_OUTPUT.sizes.map(async (size) => ({
      size,
      data: await renderOutput(svg, { size, fill: "tight", opaque: true }),
    })),
  );
  await write(FAVICON_OUTPUT.path, packIco(favicons));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
