import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { colors } from "../packages/shared/src/tokens";
import {
  BACKGROUND_OUTPUT,
  CHARCOAL,
  FAVICON_OUTPUT,
  OUTPUTS,
  SVG_OUTPUT,
  packIco,
} from "./generate-icons.mjs";

// The cross machine check for `pnpm icons` (spec 0037, AC-7): bytes may
// differ across libvips builds, so this checks sizes and framing instead.

const ROOT = join(__dirname, "..");
const read = (path: string) => readFileSync(join(ROOT, path));

async function cornerAlpha(path: string): Promise<number> {
  const { data } = await sharp(read(path))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return data[3];
}

type Output = { path: string; size: number; opaque: boolean };

describe("generated icons", () => {
  it("uses the dark token background", () => {
    expect(CHARCOAL.toLowerCase()).toBe(colors.dark.bg.toLowerCase());
  });

  it.each(OUTPUTS as Output[])("$path is $size px square", async ({ path, size, opaque }) => {
    const meta = await sharp(read(path)).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["png", size, size]);
    expect(await cornerAlpha(path)).toBe(opaque ? 255 : 0);
  });

  it("writes a solid charcoal Android background", async () => {
    const stats = await sharp(read(BACKGROUND_OUTPUT.path)).stats();
    expect(stats.isOpaque).toBe(true);
    expect(stats.channels.slice(0, 3).map((channel) => channel.max)).toEqual([0x12, 0x12, 0x12]);
    const meta = await sharp(read(BACKGROUND_OUTPUT.path)).metadata();
    expect([meta.width, meta.height]).toEqual([BACKGROUND_OUTPUT.size, BACKGROUND_OUTPUT.size]);
  });

  it("packs 16, 32, and 48 px PNGs into favicon.ico", async () => {
    const ico = read(FAVICON_OUTPUT.path);
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBe(FAVICON_OUTPUT.sizes.length);

    const sizes = await Promise.all(
      FAVICON_OUTPUT.sizes.map(async (size: number, index: number) => {
        const entry = 6 + index * 16;
        const length = ico.readUInt32LE(entry + 8);
        const offset = ico.readUInt32LE(entry + 12);
        const meta = await sharp(ico.subarray(offset, offset + length)).metadata();
        return [ico.readUInt8(entry), meta.width, meta.height];
      }),
    );
    expect(sizes).toEqual(FAVICON_OUTPUT.sizes.map((size: number) => [size, size, size]));
  });

  it("copies the source mark to icon.svg unchanged", () => {
    expect(read(SVG_OUTPUT).toString()).toBe(read("assets/brand/mark.svg").toString());
  });
});

describe("packIco", () => {
  it("writes the header, one entry per image, and 0 for a 256 px size", () => {
    const ico = packIco([
      { size: 16, data: Buffer.from([1, 2]) },
      { size: 256, data: Buffer.from([3]) },
    ]);
    expect([ico.readUInt16LE(0), ico.readUInt16LE(2), ico.readUInt16LE(4)]).toEqual([0, 1, 2]);
    expect([ico.readUInt8(6), ico.readUInt32LE(6 + 8), ico.readUInt32LE(6 + 12)]).toEqual([
      16, 2, 38,
    ]);
    expect([ico.readUInt8(22), ico.readUInt32LE(22 + 8), ico.readUInt32LE(22 + 12)]).toEqual([
      0, 1, 40,
    ]);
    expect([...ico.subarray(38)]).toEqual([1, 2, 3]);
  });
});
