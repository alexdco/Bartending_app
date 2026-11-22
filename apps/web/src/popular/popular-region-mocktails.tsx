"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { fetchPopularByRegion, listPopularRegions, type Locale } from "@bartendingapp/shared";
import { useMocktailsOnly } from "@/age-gate/age-gate-store";
import { EmptyState } from "@/components/empty-state";
import { LinkButton } from "@/components/link-button";
import { Spinner } from "@/components/spinner";
import { supabase } from "@/lib/supabase";
import { RecipeCard } from "@/recipes/recipe-card";
import { PopularRegionPicker } from "./popular-region-picker";

export function popularRegionsMocktailsQueryKey() {
  return ["popular", "regions", { mocktailsOnly: true }] as const;
}

export function popularByRegionMocktailsQueryKey(region: string, locale: Locale) {
  return ["popular", "byRegion", region, locale, { mocktailsOnly: true }] as const;
}

// Spec 0063 AC-5, AC-14: the server renders the full region list and recipes
// marked data-mocktails="hide". In mocktails only mode this client list takes
// their place: only regions with a mocktail safe recipe, and only safe
// recipes, both filtered in SQL. Renders nothing for everyone else, and
// fetches nothing until the mode is known on (AC-19).
export function PopularRegionMocktails({ region }: { region: string }) {
  const mocktailsOnly = useMocktailsOnly();
  return mocktailsOnly ? <PopularRegionMocktailsList region={region} /> : null;
}

function PopularRegionMocktailsList({ region }: { region: string }) {
  const t = useTranslations("popular");
  const tSearch = useTranslations("search");
  const locale = useLocale() as Locale;

  const regions = useQuery({
    queryKey: popularRegionsMocktailsQueryKey(),
    queryFn: () => listPopularRegions(supabase, { mocktailsOnly: true }),
  });
  const recipes = useQuery({
    queryKey: popularByRegionMocktailsQueryKey(region, locale),
    queryFn: () => fetchPopularByRegion(supabase, region, locale, { mocktailsOnly: true }),
  });

  if (regions.error || recipes.error) {
    return (
      <EmptyState
        title={tSearch("errorTitle")}
        description={tSearch("errorDescription")}
        action={<LinkButton href="/search">{t("browseAll")}</LinkButton>}
      />
    );
  }

  if (regions.isPending || recipes.isPending) {
    return (
      <div className="flex justify-center py-six">
        <Spinner label={tSearch("loading")} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-four">
      {regions.data.length > 0 && (
        <PopularRegionPicker regions={regions.data} selectedRegion={region} />
      )}
      {recipes.data.length === 0 ? (
        <EmptyState
          title={t("regionEmptyTitle")}
          description={t("regionEmptyDescription")}
          action={<LinkButton href="/search">{t("browseAll")}</LinkButton>}
        />
      ) : (
        <div className="grid grid-cols-2 gap-three sm:grid-cols-3 md:grid-cols-4">
          {recipes.data.map((recipe) => (
            <RecipeCard
              key={recipe.id}
              recipe={{
                id: recipe.id,
                name: recipe.name,
                baseName: recipe.baseName,
                imageUrl: recipe.imageUrl,
                alcoholicStatus: recipe.alcoholicStatus,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
