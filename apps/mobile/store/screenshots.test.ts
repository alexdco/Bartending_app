import { describe, expect, it } from "vitest";

import { en } from "./listing/en";
import {
  CANVASES,
  FRAME_LAYOUT,
  type SatoriNode,
  frameElement,
  outputPath,
  parseCaptureName,
} from "./screenshots";

describe("parseCaptureName", () => {
  it("reads the shot number and slug", () => {
    expect(parseCaptureName("01-make-now.png")).toEqual({ shot: 1, slug: "make-now" });
    expect(parseCaptureName("06-learn.png")).toEqual({ shot: 6, slug: "learn" });
  });

  it.each(["01-recipe.png", "07-extra.png", "1-make-now.png", "01-make-now.jpg", "notes.png"])(
    "rejects %s",
    (name) => {
      expect(parseCaptureName(name)).toBeNull();
    },
  );
});

describe("outputPath (spec 0060, AC-8)", () => {
  it("uses each store's own locale code", () => {
    expect(outputPath(en, "ios", 1)).toBe("app-store/en-US/01.png");
    expect(outputPath(en, "android", 6)).toBe("play/en-US/06.png");
  });
});

describe("frameElement (spec 0060, AC-11)", () => {
  const capture = { src: "data:image/png;base64,AA==", width: 1080, height: 2400 };
  const children = (node: SatoriNode): readonly SatoriNode[] =>
    Array.isArray(node.props.children) ? node.props.children : [];

  it("fills the canvas and puts the caption above the phone", () => {
    const node = frameElement({
      caption: "Hello",
      capture,
      canvas: "play",
      fontFamily: "Fraunces",
    });
    expect(node.props.style).toMatchObject(CANVASES.play);
    const [caption, phone] = children(node);
    expect(caption?.props.children).toBe("Hello");
    expect(phone?.props.style?.borderRadius).toBe(FRAME_LAYOUT.play.phoneRadius);
  });

  it("scales the capture to the phone's inner width and keeps its ratio", () => {
    const node = frameElement({
      caption: "Hi",
      capture,
      canvas: "appStore",
      fontFamily: "Fraunces",
    });
    const layout = FRAME_LAYOUT.appStore;
    const innerWidth = CANVASES.appStore.width - layout.sideMargin * 2 - layout.phoneBorder * 2;
    const image = children(node)[1]?.props.children as SatoriNode;
    expect(image.props.width).toBe(innerWidth);
    expect(image.props.height).toBe(Math.round((innerWidth * 2400) / 1080));
  });
});
