// The shape of one locale's store listing. Each locale module exports one of
// these; the listing test and `store:metadata` both check it against
// STORE_LIMITS. Spec: docs/specs/0057-store-listing-app-icon/index.md

export type ListingLocale = "en" | "es" | "pt" | "fr" | "ja" | "zh";

export type AppStoreLocale = "en-US" | "es-MX" | "pt-BR" | "fr-FR" | "ja" | "zh-Hans";

export type PlayLocale = "en-US" | "es-419" | "pt-BR" | "fr-FR" | "ja-JP" | "zh-CN";

/** One caption per store screenshot, in shot order (spec 0060 shot list). */
export type ScreenshotCaptions = readonly [string, string, string, string, string, string];

export interface StoreListing {
  /** Our app locale code, also the web URL path segment. */
  readonly locale: ListingLocale;
  /** The closing line both descriptions end with. */
  readonly ageLine: string;
  /** Shared by both stores (Play caps release notes at 500). */
  readonly releaseNotes: string;
  readonly appStore: {
    readonly locale: AppStoreLocale;
    /** `Cocktailist: <keyword phrase>`. */
    readonly name: string;
    /** Pantry first pitch. */
    readonly subtitle: string;
    /** Joined with "," (no spaces) when sent to App Store Connect. */
    readonly keywords: readonly string[];
    /** Editable without a new build. */
    readonly promotionalText: string;
    /** Ends with `ageLine`. */
    readonly description: string;
  };
  readonly play: {
    readonly locale: PlayLocale;
    readonly title: string;
    /** Pantry first pitch. */
    readonly shortDescription: string;
    /** Ends with `ageLine`. Key terms used naturally, Play has no keyword field. */
    readonly fullDescription: string;
  };
  /** Text drawn onto the store images. Spec 0060. */
  readonly screenshots: {
    /** Headline above each capture: make now, AI idea, recipe, search, batch, learn. */
    readonly captions: ScreenshotCaptions;
    /** The line under `Cocktailist` on the Play feature graphic. */
    readonly featureGraphicLine: string;
  };
}
