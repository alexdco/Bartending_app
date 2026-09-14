import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import {
  fetchPopularByRegion,
  listPopularRegions,
  matchRegionSlug,
  type Locale,
} from "@bartendingapp/shared";
import { EmptyState } from "@/components/empty-state";
import { Text } from "@/components/text";
import { supabase } from "@/lib/supabase";
import { PopularRegionPicker } from "@/popular/popular-region-picker";
import { RecipeCard } from "@/recipes/recipe-card";

interface PopularRegionParams {
  region: string;
}

async function resolveRegion(regionSlug: string) {
  const regions = await listPopularRegions(supabase);
  const region = matchRegionSlug(regionSlug, regions);
  return { regions, region };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<PopularRegionParams>;
}): Promise<Metadata> {
  const { region: regionSlug } = await params;
  const { region } = await resolveRegion(regionSlug);

  if (!region) {
    return {};
  }

  const title = `Popular drinks in ${region}`;
  const description = `Browse the most popular cocktail and mocktail recipes in ${region}.`;

  return {
    title,
    description,
    alternates: {
      canonical: `/popular/${regionSlug}`,
    },
    openGraph: {
      title,
      description,
      url: `/popular/${regionSlug}`,
    },
  };
}

export default async function PopularRegionPage({
  params,
}: {
  params: Promise<PopularRegionParams>;
}) {
  const { region: regionSlug } = await params;
  const { regions, region } = await resolveRegion(regionSlug);

  if (!region) {
    notFound();
  }

  const locale = (await getLocale()) as Locale;
  const recipes = await fetchPopularByRegion(supabase, region, locale);

  return (
    <div className="flex flex-col gap-four p-six">
      <Text variant="display" as="h1">
        Popular drinks by region
      </Text>

      <PopularRegionPicker regions={regions} selectedRegion={region} />

      {recipes.length === 0 ? (
        <EmptyState
          title="No popular drinks for this region yet"
          description="Check back once more drinks have been ranked."
        />
      ) : (
        <div className="grid grid-cols-2 gap-three sm:grid-cols-3 md:grid-cols-4">
          {recipes.map((recipe) => (
            <RecipeCard
              key={recipe.id}
              recipe={{
                id: recipe.id,
                name: recipe.name,
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
