// Downloads the self hosted script font stylesheets (spec 0050 AC-11) into
// public/fonts/<dir>/, which is gitignored and a turbo build output. Runs
// before dev and build (see package.json). The layout links
// /fonts/<dir>/fonts.css for its locale only, so no other locale's CSS
// carries these @font-face rules.
//
// Skips an entry when fonts.css exists, every file it names is on disk, and
// stamp.json matches the entry; otherwise refetches it from scratch. --force
// always refetches. Any failure exits non zero and fails the build; with
// --dev it warns and exits 0, so offline dev still starts (the :lang(ja) and
// :lang(ko) fallback stacks in globals.css cover it).

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SCRIPT_FONT_STYLESHEETS } from "./script-fonts.config.mjs";
import { fontStylesheetUrls, rewriteFontStylesheet } from "../src/lib/font-stylesheet.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicRoot = resolve(__dirname, "../public");

// Google returns woff2 with unicode-range slices only to a modern browser.
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const MIN_FACES_PER_FAMILY = 100;
const CONCURRENCY = 6;
const RETRY_DELAYS_MS = [1000, 2000, 4000];

const dev = process.argv.includes("--dev");
const force = process.argv.includes("--force");

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function fetchWithRetry(url, read) {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await read(response);
    } catch (error) {
      if (attempt >= RETRY_DELAYS_MS.length) throw new Error(`${url}: ${error.message}`);
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
}

async function inBatches(items, size, task) {
  for (let start = 0; start < items.length; start += size) {
    await Promise.all(items.slice(start, start + size).map(task));
  }
}

const stampOf = (entry) =>
  createHash("sha256")
    .update(JSON.stringify({ entry, userAgent: USER_AGENT }))
    .digest("hex");

function isCurrent(entryDir, stamp) {
  const cssPath = join(entryDir, "fonts.css");
  const stampPath = join(entryDir, "stamp.json");
  if (!existsSync(cssPath) || !existsSync(stampPath)) return false;
  try {
    if (JSON.parse(readFileSync(stampPath, "utf8")).hash !== stamp) return false;
  } catch {
    return false;
  }
  return fontStylesheetUrls(readFileSync(cssPath, "utf8")).every((url) =>
    existsSync(join(publicRoot, url)),
  );
}

async function fetchEntry(entry) {
  const entryDir = join(publicRoot, "fonts", entry.dir);
  const stamp = stampOf(entry);
  if (!force && isCurrent(entryDir, stamp)) {
    console.log(`Script fonts /fonts/${entry.dir}/ are current`);
    return;
  }

  rmSync(entryDir, { recursive: true, force: true });
  const query = entry.families.map((family) => `family=${family}`).join("&");
  const css = await fetchWithRetry(
    `https://fonts.googleapis.com/css2?${query}&display=swap`,
    (response) => response.text(),
  );
  const result = rewriteFontStylesheet(
    css,
    `fonts/${entry.dir}`,
    entry.minFacesPerFamily ?? MIN_FACES_PER_FAMILY,
  );
  if (!result.ok) throw new Error(`/fonts/${entry.dir}/: ${result.error}`);

  await inBatches(result.files, CONCURRENCY, async ({ url, path }) => {
    const bytes = await fetchWithRetry(url, (response) => response.arrayBuffer());
    const target = join(publicRoot, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, Buffer.from(bytes));
  });

  // The stamp goes last, so a partial run never looks current.
  writeFileSync(join(entryDir, "fonts.css"), result.css, "utf8");
  writeFileSync(join(entryDir, "stamp.json"), JSON.stringify({ hash: stamp }) + "\n", "utf8");
  console.log(`Wrote /fonts/${entry.dir}/fonts.css and ${result.files.length} font files`);
}

try {
  for (const entry of SCRIPT_FONT_STYLESHEETS) await fetchEntry(entry);
} catch (error) {
  if (dev) {
    console.warn(
      `Warning: script fonts not fetched, script font locales fall back to system fonts. ${error.message}`,
    );
  } else {
    console.error(`Script font fetch failed: ${error.message}`);
    process.exit(1);
  }
}
