// Store screenshot framing, the pure core of `store:screenshots`.
// Captures come from the Maestro flow in .maestro/screenshots/; this module
// decides what to render and how each frame is laid out. All file reading,
// Satori, resvg, and sharp calls live in scripts/store-screenshots.tsx.
// Spec: docs/specs/0060-store-screenshots/index.md (AC-8, AC-11)
import { colors } from "@bartendingapp/shared/tokens";

import type { StoreListing } from "./listing";

export type CapturePlatform = "ios" | "android";

export interface Canvas {
  readonly width: number;
  readonly height: number;
}

/** Output sizes: App Store 6.9 inch, Play phone, Play feature graphic. */
export const CANVASES = {
  appStore: { width: 1320, height: 2868 },
  play: { width: 1080, height: 1920 },
  featureGraphic: { width: 1024, height: 500 },
} as const satisfies Record<string, Canvas>;

export type FrameCanvas = "appStore" | "play";

/** iOS captures go only into App Store frames, Android only into Play frames. */
export const CANVAS_BY_PLATFORM: Readonly<Record<CapturePlatform, FrameCanvas>> = {
  ios: "appStore",
  android: "play",
};

/** Store order (spec 0060 shot list). File names are `NN-<slug>.png`. */
export const SHOT_SLUGS = ["make-now", "ai-idea", "recipe", "search", "batch", "learn"] as const;

export type ShotSlug = (typeof SHOT_SLUGS)[number];

export interface FrameLayout {
  readonly sideMargin: number;
  readonly captionTop: number;
  readonly captionBoxHeight: number;
  readonly captionFontSize: number;
  readonly captionLineHeight: number;
  readonly captionGap: number;
  readonly phoneRadius: number;
  readonly phoneBorder: number;
}

/** Frame geometry per canvas. Tuned at the first render review. */
export const FRAME_LAYOUT: Readonly<Record<FrameCanvas, FrameLayout>> = {
  appStore: {
    sideMargin: 110,
    captionTop: 170,
    captionBoxHeight: 260,
    captionFontSize: 100,
    captionLineHeight: 1.15,
    captionGap: 90,
    phoneRadius: 120,
    phoneBorder: 14,
  },
  play: {
    sideMargin: 96,
    captionTop: 96,
    captionBoxHeight: 190,
    captionFontSize: 72,
    captionLineHeight: 1.15,
    captionGap: 60,
    phoneRadius: 90,
    phoneBorder: 10,
  },
};

/** The icon tile's charcoal gradient (spec 0057) and the dark text token. */
export const FRAME_COLORS = {
  gradientTop: colors.dark.surfaceSelected,
  gradientBottom: colors.dark.bg,
  text: colors.dark.text,
  phoneOutline: colors.dark.border,
} as const;

export interface ParsedCaptureName {
  /** 1 based shot number. */
  readonly shot: number;
  readonly slug: ShotSlug;
}

/** `03-recipe.png` → shot 3; null for any other name or a slug out of order. */
export const parseCaptureName = (fileName: string): ParsedCaptureName | null => {
  const match = /^(\d{2})-([a-z-]+)\.png$/.exec(fileName);
  if (!match) return null;
  const shot = Number(match[1]);
  const slug = SHOT_SLUGS[shot - 1];
  return slug !== undefined && slug === match[2] ? { shot, slug } : null;
};

const pad = (shot: number): string => String(shot).padStart(2, "0");

/** Output path relative to store/.generated/screenshots/. */
export const outputPath = (
  listing: StoreListing,
  platform: CapturePlatform,
  shot: number,
): string =>
  platform === "ios"
    ? `app-store/${listing.appStore.locale}/${pad(shot)}.png`
    : `play/${listing.play.locale}/${pad(shot)}.png`;

/** A Satori element tree as plain objects (no React runtime needed). */
export interface SatoriNode {
  readonly type: string;
  readonly props: {
    readonly style?: Readonly<Record<string, string | number>>;
    readonly src?: string;
    readonly width?: number;
    readonly height?: number;
    readonly children?: string | SatoriNode | readonly SatoriNode[];
  };
}

export interface CaptureImage {
  /** A data URI, so Satori never touches the file system or network. */
  readonly src: string;
  readonly width: number;
  readonly height: number;
}

export interface FrameInput {
  readonly caption: string;
  readonly capture: CaptureImage;
  readonly canvas: FrameCanvas;
  readonly fontFamily: string;
}

/**
 * One store frame: the caption at the top in the display font, then the
 * capture inside a generic rounded phone outline (no hardware art). The phone
 * keeps the capture's aspect ratio and may run off the bottom edge.
 */
export const frameElement = ({ caption, capture, canvas, fontFamily }: FrameInput): SatoriNode => {
  const size = CANVASES[canvas];
  const layout = FRAME_LAYOUT[canvas];
  const phoneWidth = size.width - layout.sideMargin * 2;
  const innerWidth = phoneWidth - layout.phoneBorder * 2;
  const innerHeight = Math.round((innerWidth * capture.height) / capture.width);

  return {
    type: "div",
    props: {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        width: size.width,
        height: size.height,
        paddingTop: layout.captionTop,
        backgroundImage: `linear-gradient(180deg, ${FRAME_COLORS.gradientTop}, ${FRAME_COLORS.gradientBottom})`,
        overflow: "hidden",
      },
      children: [
        {
          type: "div",
          props: {
            style: {
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              width: phoneWidth,
              height: layout.captionBoxHeight,
              fontFamily,
              fontSize: layout.captionFontSize,
              lineHeight: layout.captionLineHeight,
              fontWeight: 600,
              color: FRAME_COLORS.text,
            },
            children: caption,
          },
        },
        {
          type: "div",
          props: {
            style: {
              display: "flex",
              flexShrink: 0,
              marginTop: layout.captionGap,
              width: phoneWidth,
              height: innerHeight + layout.phoneBorder * 2,
              borderRadius: layout.phoneRadius,
              borderWidth: layout.phoneBorder,
              borderStyle: "solid",
              borderColor: FRAME_COLORS.phoneOutline,
              backgroundColor: FRAME_COLORS.gradientBottom,
              overflow: "hidden",
            },
            children: {
              type: "img",
              props: {
                src: capture.src,
                width: innerWidth,
                height: innerHeight,
                style: {
                  width: innerWidth,
                  height: innerHeight,
                  borderRadius: layout.phoneRadius - layout.phoneBorder,
                },
              },
            },
          },
        },
      ],
    },
  };
};
