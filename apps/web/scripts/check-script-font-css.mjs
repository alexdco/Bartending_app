// Postbuild check (spec 0050 AC-11): the built CSS every locale loads carries
// no Noto CJK @font-face rule, and each script font stylesheet and every file it names
// exist. Fails the build with the offending file names otherwise. The rule
// matching lives in checkBuiltCss (src/lib/font-stylesheet.ts), tested there.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SCRIPT_FONT_STYLESHEETS } from "./script-fonts.config.mjs";
import { checkBuiltCss, fontStylesheetUrls } from "../src/lib/font-stylesheet.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(__dirname, "..");
const staticDir = join(webRoot, ".next/static");
const publicRoot = join(webRoot, "public");

// A hand rolled walk: fs.glob needs Node 22 and the repo allows Node 20.
function cssFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return cssFiles(path);
    return entry.name.endsWith(".css") ? [path] : [];
  });
}

const builtCss = cssFiles(staticDir).map((path) => ({
  name: relative(webRoot, path),
  css: readFileSync(path, "utf8"),
}));

const stylesheetErrors = SCRIPT_FONT_STYLESHEETS.flatMap(({ dir }) => {
  const cssPath = join(publicRoot, "fonts", dir, "fonts.css");
  if (!existsSync(cssPath)) return [`public/fonts/${dir}/fonts.css is missing`];
  const missing = fontStylesheetUrls(readFileSync(cssPath, "utf8")).filter(
    (url) => !existsSync(join(publicRoot, url)),
  );
  return missing.length === 0
    ? []
    : [`public/fonts/${dir}/fonts.css names ${missing.length} missing files, e.g. ${missing[0]}`];
});

const built = checkBuiltCss(builtCss);
const errors = [...(built.ok ? [] : [built.error]), ...stylesheetErrors];

if (errors.length > 0) {
  errors.forEach((error) => console.error(`Script font check failed: ${error}`));
  process.exit(1);
}
console.log(`Script font check passed (${builtCss.length} built CSS files)`);
