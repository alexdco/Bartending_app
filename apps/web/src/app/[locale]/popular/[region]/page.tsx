import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import {
  buildQuizSlugPath,
  fetchPopularByRegion,
  fetchQuizBySource,
  listPopularRegions,
  localizedPath,
  matchRegionSlug,
  SUPPORTED_LOCALES,
  type Locale,
} from "@bartendingapp/shared";
import { BackButton } from "@/components/back-button";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { Text } from "@/components/text";
import { supabasePublic } from "@/lib/supabase-public";
import { PopularRegionPicker } from "@/popular/popular-region-picker";
import { RecipeCard } from "@/recipes/recipe-card";

interface PopularRegionParams {
  region: string;
}

async function resolveRegion(regionSlug: string) {
  const regions = await listPopularRegions(supabasePublic);
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
  const regionPath = `/popular/${regionSlug}`;
  const canonicalPath = localizedPath((await getLocale()) as Locale, regionPath);

  const languages = Object.fromEntries(
    SUPPORTED_LOCALES.map((locale) => [locale, localizedPath(locale, regionPath)]),
  );

  return {
    title,
    description,
    alternates: {
      canonical: canonicalPath,
      languages,
    },
    openGraph: {
      title,
      description,
      url: canonicalPath,
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
  const recipes = await fetchPopularByRegion(supabasePublic, region, locale);
  const quiz = await fetchQuizBySource(supabasePublic, "recipe_region", region);

  return (
    <div className="flex flex-col gap-four p-six">
      <BackButton />
      <Text variant="display" as="h1">
        Popular drinks by region
      </Text>

      <PopularRegionPicker regions={regions} selectedRegion={region} />

      {quiz && (
        <Link href={`/quizzes/${buildQuizSlugPath(quiz.id, quiz.title)}`}>
          <Card className="border-accent">
            <Text variant="label">Take the quiz: {quiz.title}</Text>
          </Card>
        </Link>
      )}

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
