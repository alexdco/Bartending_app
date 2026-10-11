"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/button";
import { Hero } from "./hero";
import { RegionShortcutRow } from "./region-shortcut-row";
import { DrinkIdeasCarousel } from "./drink-ideas-carousel";
import { RecentlyViewedCarousel } from "./recently-viewed-carousel";
import { RecommendationsCarousel } from "./recommendations-carousel";
import { PopularByRegionCarousel } from "./popular-by-region-carousel";
import { useHomePopularRegions } from "./use-homepage-data";

export function HomePageClient() {
  const t = useTranslations("home");
  const [sessionErrorCount, setSessionErrorCount] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const { data: regions } = useHomePopularRegions();
  const firstRegion = regions?.[0] ?? null;

  const onSessionError = () => setSessionErrorCount((count) => count + 1);
  const showBanner = sessionErrorCount > 0 && !dismissed;

  return (
    <div className="flex flex-col gap-six pb-six">
      {showBanner && (
        <div className="mx-six flex items-center justify-between gap-three rounded-large border border-border bg-surface p-four">
          <span className="text-body text-text">{t("loadError")}</span>
          <div className="flex items-center gap-two">
            <Button
              variant="secondary"
              onClick={() => {
                setDismissed(false);
                window.location.reload();
              }}
            >
              {t("retry")}
            </Button>
            <Button variant="secondary" onClick={() => setDismissed(true)}>
              {t("dismiss")}
            </Button>
          </div>
        </div>
      )}

      <Hero />

      {regions && regions.length > 0 && <RegionShortcutRow regions={regions} />}

      <DrinkIdeasCarousel onSessionError={onSessionError} />
      <RecommendationsCarousel onSessionError={onSessionError} />
      <RecentlyViewedCarousel />
      {firstRegion && <PopularByRegionCarousel region={firstRegion} />}
    </div>
  );
}
