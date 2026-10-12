import type { Metadata } from "next";
import { buildOpenGraph } from "@/lib/open-graph";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import {
  buildRecipeSlugPath,
  extractIdFromRecipeSlug,
  fetchRecipeDetail,
  fetchRecipeRedirect,
  localizedPath,
  SUPPORTED_LOCALES,
  type Locale,
} from "@bartendingapp/shared";
import { BackButton } from "@/components/back-button";
import { Text } from "@/components/text";
import { supabasePublic } from "@/lib/supabase-public";
import { siteAbsoluteUrl } from "@/lib/site-url";
import { permanentRedirect } from "@/i18n/navigation";
import { CommentSection } from "@/comments/comment-section";
import { RecipeDetailHeader } from "@/recipes/recipe-detail-header";
import { RecipeMeasures } from "@/recipes/recipe-measures";
import { buildRecipeJsonLd } from "@/recipes/recipe-json-ld";
import { RecommendationsSection } from "@/recipe-recommendations/recommendations-section";

interface RecipePageParams {
  slug: string;
}

/**
 * The live recipe for this slug. A hidden duplicate permanently redirects
 * (308) to its kept recipe in the same locale, one hop only; anything else
 * missing is a 404 (spec 0036, AC-2, AC-3).
 */
async function resolveRecipe(slugParam: string, locale: Locale) {
  const id = extractIdFromRecipeSlug(slugParam);
  if (!id) {
    notFound();
  }

  const recipe = await fetchRecipeDetail(supabasePublic, id, locale);
  if (recipe) {
    return recipe;
  }

  const redirectLookup = await fetchRecipeRedirect(supabasePublic, id);
  if (redirectLookup.error) {
    throw new Error(`Recipe redirect lookup failed: ${redirectLookup.error.message}`);
  }

  const target = redirectLookup.data
    ? await fetchRecipeDetail(supabasePublic, redirectLookup.data, locale)
    : null;
  if (!target) {
    notFound();
  }

  // Throws like Next's own permanentRedirect, but next-intl doesn't type it as never.
  return permanentRedirect({
    href: `/recipes/${buildRecipeSlugPath(target.id, target.name)}`,
    locale,
  }) as never;
}

async function resolveSlugForLocale(id: string, locale: Locale): Promise<string | null> {
  const recipe = await fetchRecipeDetail(supabasePublic, id, locale);
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

  const canonicalPath = localizedPath(
    locale,
    `/recipes/${buildRecipeSlugPath(recipe.id, recipe.name)}`,
  );
  const ingredientNames = recipe.ingredients.map((ingredient) => ingredient.name).join(", ");
  const t = await getTranslations("recipe");
  const description = t("metaDescription", { name: recipe.name, ingredients: ingredientNames });

  const otherLocales = SUPPORTED_LOCALES.filter((candidate) => candidate !== locale);
  const otherSlugs = await Promise.all(
    otherLocales.map((candidate) => resolveSlugForLocale(recipe.id, candidate)),
  );

  const languages: Record<string, string> = {
    [locale]: canonicalPath,
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
    openGraph: await buildOpenGraph(locale, {
      title: recipe.name,
      description,
      url: canonicalPath,
      ...(recipe.imageUrl ? { images: [{ url: recipe.imageUrl }] } : {}),
    }),
  };
}

export default async function RecipeDetailPage({ params }: { params: Promise<RecipePageParams> }) {
  const { slug } = await params;
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("recipe");
  const recipe = await resolveRecipe(slug, locale);

  const canonicalSlugPath = buildRecipeSlugPath(recipe.id, recipe.name);
  if (slug !== canonicalSlugPath) {
    permanentRedirect({ href: `/recipes/${canonicalSlugPath}`, locale });
  }

  const jsonLd = buildRecipeJsonLd(
    recipe,
    siteAbsoluteUrl(localizedPath(locale, `/recipes/${canonicalSlugPath}`)),
  );

  return (
    <main className="flex flex-col gap-four p-six">
      {jsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      ) : null}

      <BackButton />
      <RecipeDetailHeader recipe={recipe} />

      <RecipeMeasures
        key={recipe.id}
        ingredients={recipe.ingredients}
        ingredientsHeading={t("ingredients")}
        instructions={
          <section className="flex flex-col gap-two">
            <Text variant="heading" as="h2">
              {t("instructions")}
            </Text>
            <Text variant="body" className="whitespace-pre-line">
              {recipe.instructions}
            </Text>
          </section>
        }
      />

      <RecommendationsSection recipeId={recipe.id} recipeName={recipe.name} />

      <CommentSection recipeId={recipe.id} />
    </main>
  );
}
