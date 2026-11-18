/// <reference types="node" />
// `pnpm --filter mobile store:screenshots`
// Frames the Maestro captures in store/.captures/<platform>/<locale>/ under
// each listing's captions and writes store/.generated/screenshots/:
//   app-store/<appStore.locale>/NN.png  1320 x 2868, from iOS captures
//   play/<play.locale>/NN.png           1080 x 1920, from Android captures
// Every file is an opaque sRGB PNG. All frames render in memory first, so a
// failure writes nothing. Spec: docs/specs/0060-store-screenshots/index.md (AC-8)
//
// Slice 1 renders whichever shots exist. Slice 2 adds the full input
// validation (six per locale and platform, sizes, ratios) and the feature
// graphic comes with slice 3.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ReactNode } from "react";

import { Resvg } from "@resvg/resvg-js";
import satori from "satori";
import sharp from "sharp";

import { STORE_LISTINGS, type StoreListing } from "../store/listing";
import {
  CANVAS_BY_PLATFORM,
  CANVASES,
  FRAME_COLORS,
  type CapturePlatform,
  frameElement,
  outputPath,
  parseCaptureName,
} from "../store/screenshots";

const STORE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "store");
const CAPTURES_DIR = join(STORE_DIR, ".captures");
const OUT_DIR = join(STORE_DIR, ".generated", "screenshots");
const PLATFORMS: readonly CapturePlatform[] = ["ios", "android"];

// Pinned font files from node_modules, never system fonts (AC-10).
const resolvePackageFile = createRequire(import.meta.url).resolve;
const LATIN_FONT = {
  name: "Fraunces",
  data: readFileSync(
    resolvePackageFile("@fontsource/fraunces/files/fraunces-latin-600-normal.woff"),
  ),
  weight: 600 as const,
  style: "normal" as const,
};

interface RenderJob {
  readonly listing: StoreListing;
  readonly platform: CapturePlatform;
  readonly shot: number;
  readonly capturePath: string;
}

function fail(lines: readonly string[]): never {
  lines.forEach((line) => console.error(line));
  process.exit(1);
}

const jobsFor = (listing: StoreListing, platform: CapturePlatform) => {
  const dir = join(CAPTURES_DIR, platform, listing.locale);
  if (!existsSync(dir)) return { jobs: [], problems: [] };
  const files = readdirSync(dir).filter((name) => name.endsWith(".png"));
  return {
    jobs: files.flatMap((name): readonly RenderJob[] => {
      const parsed = parseCaptureName(name);
      return parsed ? [{ listing, platform, shot: parsed.shot, capturePath: join(dir, name) }] : [];
    }),
    problems: files
      .filter((name) => parseCaptureName(name) === null)
      .map((name) => `${platform}/${listing.locale}/${name} is not a known NN-<slug>.png shot`),
  };
};

const planned = STORE_LISTINGS.flatMap((listing) =>
  PLATFORMS.map((platform) => jobsFor(listing, platform)),
);
const jobs = planned.flatMap((entry) => entry.jobs);
const problems = planned.flatMap((entry) => entry.problems);

if (problems.length > 0) fail(["store:screenshots: bad captures:", ...problems]);
if (jobs.length === 0) {
  fail([
    `store:screenshots: no captures found in ${CAPTURES_DIR}.`,
    "Run the capture flow first (store:capture:android, or the EAS store-screenshots workflow).",
  ]);
}

const renderFrame = async (job: RenderJob): Promise<Buffer> => {
  const captureFile = readFileSync(job.capturePath);
  const { width, height } = await sharp(captureFile).metadata();
  if (!width || !height) throw new Error(`cannot read the size of ${job.capturePath}`);

  const canvas = CANVAS_BY_PLATFORM[job.platform];
  const caption = job.listing.screenshots.captions[job.shot - 1] ?? "";
  const node = frameElement({
    caption,
    canvas,
    fontFamily: LATIN_FONT.name,
    capture: { src: `data:image/png;base64,${captureFile.toString("base64")}`, width, height },
  });
  const size = CANVASES[canvas];

  const svg = await satori(node as unknown as ReactNode, {
    width: size.width,
    height: size.height,
    fonts: [LATIN_FONT],
    // Satori asks for more fonts only when a character is missing from the
    // loaded ones: refuse instead of rendering tofu (AC-10).
    loadAdditionalAsset: async (_code, segment) => {
      throw new Error(
        `${job.listing.locale} caption ${job.shot} has characters no loaded font covers: "${segment}"`,
      );
    },
  });

  const png = new Resvg(svg, { fitTo: { mode: "width", value: size.width } }).render().asPng();
  return sharp(png)
    .flatten({ background: FRAME_COLORS.gradientBottom })
    .removeAlpha()
    .toColourspace("srgb")
    .png()
    .toBuffer();
};

async function main(): Promise<void> {
  const rendered = await Promise.all(
    jobs.map(async (job) => ({
      path: outputPath(job.listing, job.platform, job.shot),
      png: await renderFrame(job),
    })),
  );

  rmSync(OUT_DIR, { recursive: true, force: true });
  rendered.forEach(({ path, png }) => {
    const target = join(OUT_DIR, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, png);
  });

  console.log(`store:screenshots: wrote ${rendered.length} image(s) to ${OUT_DIR}`);
}

main().catch((error: unknown) =>
  fail([`store:screenshots: ${error instanceof Error ? error.message : String(error)}`]),
);
