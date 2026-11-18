/// <reference types="node" />
// `pnpm --filter mobile store:metadata [--with-release-notes]`
// Writes store/.generated/store.config.json (EAS Metadata, App Store) and
// store/.generated/play.md (paste ready Play copy) from store/listing/.
// Exits 1 and writes nothing when NEXT_PUBLIC_SITE_URL fails the guard or any
// listing breaks a store rule. Spec: docs/specs/0057-store-listing-app-icon/index.md (AC-5)
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { STORE_LISTINGS, findListingProblems, formatProblem } from "../store/listing";
import { buildPlayMarkdown, buildStoreConfig, checkSiteUrl } from "../store/metadata";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "store", ".generated");

function fail(lines: readonly string[]): never {
  lines.forEach((line) => console.error(line));
  process.exit(1);
}

const site = checkSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);
if (!site.ok) fail([`store:metadata: ${site.reason}. Set it to the production web origin.`]);

const problems = STORE_LISTINGS.flatMap(findListingProblems);
if (problems.length > 0) {
  fail(["store:metadata: the listing breaks a store rule:", ...problems.map(formatProblem)]);
}

const { origin } = site;
const withReleaseNotes = process.argv.includes("--with-release-notes");
const config = buildStoreConfig(STORE_LISTINGS, origin, { withReleaseNotes });

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, "store.config.json"), `${JSON.stringify(config, null, 2)}\n`);
writeFileSync(join(OUT_DIR, "play.md"), buildPlayMarkdown(STORE_LISTINGS));

console.log(
  `store:metadata: wrote ${STORE_LISTINGS.length} App Store locale(s) for ${origin}` +
    `${withReleaseNotes ? " with release notes" : " without release notes"} to ${OUT_DIR}`,
);
