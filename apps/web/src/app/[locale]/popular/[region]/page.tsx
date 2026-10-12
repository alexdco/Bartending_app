import type { Metadata } from "next";
import { buildOpenGraph } from "@/lib/open-graph";
import { Link } from "@/i18n/navigation";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
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
import { LinkButton } from "@/components/link-button";
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

  const t = await getTranslations("popular");
  const title = t("metaTitle", { region });
  const description = t("metaDescription", { region });
  const regionPath = `/popular/${regionSlug}`;
  const locale = (await getLocale()) as Locale;
  const canonicalPath = localizedPath(locale, regionPath);

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
    openGraph: await buildOpenGraph(locale, {
      title,
      description,
      url: canonicalPath,
    }),
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
  const t = await getTranslations("popular");
  const recipes = await fetchPopularByRegion(supabasePublic, region, locale);
  const quiz = await fetchQuizBySource(supabasePublic, "recipe_region", region);

  return (
    <div className="flex flex-col gap-four p-six">
      <BackButton />
      <Text variant="display" as="h1">
        {t("title")}
      </Text>

      <PopularRegionPicker regions={regions} selectedRegion={region} />

      {quiz && (
        <Link href={`/quizzes/${buildQuizSlugPath(quiz.id, quiz.title)}`}>
          <Card className="border-accent">
            <Text variant="label">{t("takeTheQuiz", { title: quiz.title })}</Text>
          </Card>
        </Link>
      )}

      {recipes.length === 0 ? (
        <EmptyState
          title={t("regionEmptyTitle")}
          description={t("regionEmptyDescription")}
          action={<LinkButton href="/search">{t("browseAll")}</LinkButton>}
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
