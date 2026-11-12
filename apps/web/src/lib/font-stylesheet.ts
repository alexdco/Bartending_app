// Self hosted script font stylesheets (spec 0050 AC-11). A CJK face is about
// 124 unicode range slices; next/font would write every slice's @font-face
// rule into the shared [locale] layout's CSS, so every locale would carry
// them. Instead scripts/fetch-script-fonts.mjs downloads Google's stylesheet
// at build, rewrites it here, and the layout links it for one locale only.
//
// Pure: no I/O, and no imports from next or @/, so vitest and tsx (the fetch
// and postbuild scripts) both load it by relative path.

export interface FontFile {
  /** The fonts.gstatic.com URL Google's stylesheet names. */
  readonly url: string;
  /** Where the file is served, e.g. /fonts/ja/notosansjp/v54/abc.0.woff2. */
  readonly path: string;
}

export type RewriteResult =
  | { readonly ok: true; readonly css: string; readonly files: readonly FontFile[] }
  | { readonly ok: false; readonly error: string };

const FONT_FACE_RULE = /@font-face\s*\{[^}]*\}/g;
const SRC_URL = /url\(\s*['"]?([^'")\s]+)['"]?\s*\)(?:\s*format\(\s*['"]?([^'")\s]+)['"]?\s*\))?/g;
const GSTATIC_URL = /^https:\/\/fonts\.gstatic\.com\/s\/([^/]+)\/([^/]+)\/([^/]+\.woff2)$/;

function fontFamily(rule: string): string {
  const match = /font-family:\s*['"]?([^;'"]+)['"]?\s*;/.exec(rule);
  return match ? match[1].trim() : "";
}

/** Every url(...) in a stylesheet, in order. Also used to check served files exist. */
export function fontStylesheetUrls(css: string): readonly string[] {
  return [...css.matchAll(SRC_URL)].map((match) => match[1]);
}

/**
 * Rewrites Google's stylesheet to serve every slice from `/<publicDir>/`, and
 * lists the files to download. Fails when the CSS has no @font-face rule, a
 * family has fewer than `minFacesPerFamily` faces (Google changed its response
 * shape, such as one unsliced file), or a source is off fonts.gstatic.com or
 * not woff2.
 */
export function rewriteFontStylesheet(
  css: string,
  publicDir: string,
  minFacesPerFamily: number,
): RewriteResult {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = stripped.match(FONT_FACE_RULE) ?? [];
  if (rules.length === 0) return { ok: false, error: "no @font-face rule" };

  const sources = [...stripped.matchAll(SRC_URL)].map((match) => ({
    url: match[1],
    format: match[2],
  }));
  const foreign = sources.find(({ url }) => !GSTATIC_URL.test(url));
  if (foreign)
    return { ok: false, error: `source off fonts.gstatic.com or not woff2: ${foreign.url}` };
  const notWoff2 = sources.find(({ format }) => format !== "woff2");
  if (notWoff2) return { ok: false, error: `format other than woff2: ${notWoff2.url}` };

  const facesByFamily = rules
    .map(fontFamily)
    .reduce<Readonly<Record<string, number>>>(
      (counts, family) => ({ ...counts, [family]: (counts[family] ?? 0) + 1 }),
      {},
    );
  const thin = Object.entries(facesByFamily).find(([, count]) => count < minFacesPerFamily);
  if (thin) {
    return {
      ok: false,
      error: `${thin[0]} has ${thin[1]} faces, fewer than ${minFacesPerFamily}`,
    };
  }

  const localPath = (url: string): string =>
    url.replace(
      GSTATIC_URL,
      (_, family: string, version: string, file: string) =>
        `/${publicDir}/${family}/${version}/${file}`,
    );
  const files = [...new Set(sources.map(({ url }) => url))].map((url) => ({
    url,
    path: localPath(url),
  }));
  const rewritten = files.reduce((text, { url, path }) => text.split(url).join(path), stripped);

  return { ok: true, css: rewritten.trim() + "\n", files };
}

// Matches one minified @font-face rule naming a Noto JP family (next/font
// renames it __Noto_Sans_JP_<hash>), Google's font host, or the /ja font dir.
const SCRIPT_FONT_FACE =
  /@font-face\{[^}]*(Noto[ _]+(Sans|Serif)[ _]+JP|fonts\.gstatic\.com|\/fonts\/ja\/)/i;

export interface BuiltCssFile {
  readonly name: string;
  readonly css: string;
}

/**
 * The postbuild check (spec 0050 AC-11): the built CSS every locale loads
 * carries no Noto JP @font-face rule. An empty list fails, so a changed build
 * output layout can't make the check pass vacuously. Font family names in
 * variables (the :root:lang(ja) block) are not @font-face rules and pass.
 */
export function checkBuiltCss(
  files: readonly BuiltCssFile[],
): { readonly ok: true } | { readonly ok: false; readonly error: string } {
  if (files.length === 0) return { ok: false, error: "no built .css files found" };
  const offending = files
    .filter(({ css }) => SCRIPT_FONT_FACE.test(css.replace(/\s*([{}:;])\s*/g, "$1")))
    .map(({ name }) => name);
  return offending.length === 0
    ? { ok: true }
    : { ok: false, error: `Noto JP @font-face rules in shared CSS: ${offending.join(", ")}` };
}
