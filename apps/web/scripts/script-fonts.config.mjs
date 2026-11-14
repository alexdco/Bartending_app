// The self hosted script font stylesheets (spec 0050 AC-11), one entry per
// stylesheet. Side effect free: fetch-script-fonts.mjs and display-font.test.ts
// both import it, and the test must never trigger a download. Each entry is
// served at /fonts/<dir>/fonts.css; SCRIPT_FONT_STYLESHEET_BY_LOCALE links it.
// An entry may set minFacesPerFamily to lower the fetch check for a family
// Google slices more coarsely (spec 0051).

export const SCRIPT_FONT_STYLESHEETS = [
  { dir: "ja", families: ["Noto+Sans+JP:wght@100..900", "Noto+Serif+JP:wght@600"] },
  // Spec 0051 AC-10. Both KR families measured 124 faces on 2026-11-12, above
  // the default minimum, so this entry sets no minFacesPerFamily of its own.
  { dir: "ko", families: ["Noto+Sans+KR:wght@100..900", "Noto+Serif+KR:wght@600"] },
  // Spec 0052 AC-10. Both SC families measured 101 faces on 2026-11-13,
  // above the default minimum, so no override is needed.
  { dir: "zh", families: ["Noto+Sans+SC:wght@100..900", "Noto+Serif+SC:wght@600"] },
];
