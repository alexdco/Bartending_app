import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import {
  buildRecipeSlugPath,
  extractIdFromRecipeSlug,
  fetchRecipeDetail,
  localizedPath,
  SUPPORTED_LOCALES,
  type Locale,
} from "@bartendingapp/shared";
import { Text } from "@/components/text";
import { supabase } from "@/lib/supabase";
import { siteAbsoluteUrl } from "@/lib/site-url";
import { permanentRedirect } from "@/i18n/navigation";
import { BatchPanel } from "@/recipes/batch-panel";
import { IngredientList } from "@/recipes/ingredient-list";
import { RecipeDetailHeader } from "@/recipes/recipe-detail-header";
import { buildRecipeJsonLd } from "@/recipes/recipe-json-ld";
import { RecommendationsSection } from "@/recipe-recommendations/recommendations-section";

interface RecipePageParams {
  slug: string;
}

async function resolveRecipe(slugParam: string, locale: Locale) {
  const id = extractIdFromRecipeSlug(slugParam);
  if (!id) {
    return null;
  }

  const recipe = await fetchRecipeDetail(supabase, id, locale);
  return recipe;
}

async function resolveSlugForLocale(id: string, locale: Locale): Promise<string | null> {
  const recipe = await fetchRecipeDetail(supabase, id, locale);
  return recipe ? buildRecipeSlugPath(recipe.id, recipe.name) : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RecipePageParams>;
}): Promise<Metadata> {
  const { slug } = await params;
  const locale = (await getLocale()) as Locale;
  const recipe = await resolveRecipe(slug, locale);

  if (!recipe) {
    return {};
  }

  const canonicalPath = `/recipes/${buildRecipeSlugPath(recipe.id, recipe.name)}`;
  const ingredientNames = recipe.ingredients.map((ingredient) => ingredient.name).join(", ");
  const description = `${recipe.name}: made with ${ingredientNames}.`;

  const otherLocales = SUPPORTED_LOCALES.filter((candidate) => candidate !== locale);
  const otherSlugs = await Promise.all(
    otherLocales.map((candidate) => resolveSlugForLocale(recipe.id, candidate)),
  );

  const languages: Record<string, string> = {
    [locale]: localizedPath(locale, canonicalPath),
  };
  otherLocales.forEach((candidate, index) => {
    const otherSlug = otherSlugs[index];
    if (otherSlug) {
      languages[candidate] = localizedPath(candidate, `/recipes/${otherSlug}`);
    }
  });

  return {
    title: recipe.name,
    description,
    alternates: {
      canonical: canonicalPath,
      languages,
    },
    openGraph: {
      title: recipe.name,
      description,
      url: canonicalPath,
      images: recipe.imageUrl ? [{ url: recipe.imageUrl }] : undefined,
    },
  };
}

export default async function RecipeDetailPage({ params }: { params: Promise<RecipePageParams> }) {
  const { slug } = await params;
  const id = extractIdFromRecipeSlug(slug);

  if (!id) {
    notFound();
  }

  const locale = (await getLocale()) as Locale;
  const recipe = await fetchRecipeDetail(supabase, id, locale);

  if (!recipe) {
    notFound();
  }

  const canonicalSlugPath = buildRecipeSlugPath(recipe.id, recipe.name);
  if (slug !== canonicalSlugPath) {
    permanentRedirect({ href: `/recipes/${canonicalSlugPath}`, locale });
  }

  const jsonLd = buildRecipeJsonLd(recipe, siteAbsoluteUrl(`/recipes/${canonicalSlugPath}`));

  return (
    <main className="flex flex-col gap-four p-six">
      {jsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      ) : null}

      <RecipeDetailHeader recipe={recipe} />

      <section className="flex flex-col gap-two">
        <Text variant="heading" as="h2">
          Ingredients
        </Text>
        <IngredientList ingredients={recipe.ingredients} />
      </section>

      <BatchPanel ingredients={recipe.ingredients} />

      <section className="flex flex-col gap-two">
        <Text variant="heading" as="h2">
          Instructions
        </Text>
        <Text variant="body" className="whitespace-pre-line">
          {recipe.instructions}
        </Text>
      </section>

      <RecommendationsSection recipeId={recipe.id} recipeName={recipe.name} />
    </main>
  );
}
