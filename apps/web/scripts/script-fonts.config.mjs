// The self hosted script font stylesheets (spec 0050 AC-11), one entry per
// stylesheet. Side effect free: fetch-script-fonts.mjs and display-font.test.ts
// both import it, and the test must never trigger a download. Each entry is
// served at /fonts/<dir>/fonts.css; SCRIPT_FONT_STYLESHEET_BY_LOCALE links it.

export const SCRIPT_FONT_STYLESHEETS = [
  { dir: "ja", families: ["Noto+Sans+JP:wght@100..900", "Noto+Serif+JP:wght@600"] },
];
