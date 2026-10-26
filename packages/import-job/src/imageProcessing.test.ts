import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { mapWithConcurrency, processImageBuffer } from "./imageProcessing";

async function jpeg(width: number, height: number): Promise<Uint8Array> {
  const buffer = await sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 80, b: 40 } },
  })
    .jpeg()
    .withMetadata({ exif: { IFD0: { Copyright: "secret" } } })
    .toBuffer();
  return new Uint8Array(buffer);
}

describe("processImageBuffer", () => {
  it("crops square, caps the hero at 1000px, and makes a 400px card", async () => {
    const result = await processImageBuffer(await jpeg(1600, 1200));
    expect(result.error).toBeNull();

    const hero = await sharp(result.data!.hero as Uint8Array).metadata();
    const card = await sharp(result.data!.card as Uint8Array).metadata();
    expect([hero.format, hero.width, hero.height]).toEqual(["webp", 1000, 1000]);
    expect([card.format, card.width, card.height]).toEqual(["webp", 400, 400]);
    expect(hero.exif).toBeUndefined();
    expect(result.data!.hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("never upscales a 700px thumb", async () => {
    const result = await processImageBuffer(await jpeg(700, 700));
    const hero = await sharp(result.data!.hero as Uint8Array).metadata();
    expect(hero.width).toBe(700);
  });

  it("gives the same hash for the same image", async () => {
    const bytes = await jpeg(800, 800);
    const [a, b] = await Promise.all([processImageBuffer(bytes), processImageBuffer(bytes)]);
    expect(a.data!.hash).toBe(b.data!.hash);
  });

  it("applies the 600px minimum only when asked", async () => {
    const small = await jpeg(500, 900);
    await expect(processImageBuffer(small, { requireMinSide: true })).resolves.toEqual({
      data: null,
      error: "too_small",
    });
    expect((await processImageBuffer(small)).error).toBeNull();
  });

  it("reports bytes that are not an image", async () => {
    await expect(processImageBuffer(new Uint8Array([1, 2, 3]))).resolves.toEqual({
      data: null,
      error: "decode_failed",
    });
  });
});

describe("mapWithConcurrency", () => {
  it("keeps order and never exceeds the limit", async () => {
    let inFlight = 0;
    let peak = 0;
    const result = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return n * 10;
    });
    expect(result).toEqual([10, 20, 30, 40, 50]);
    expect(peak).toBe(2);
  });
});
