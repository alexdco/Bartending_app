import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import {
  buildRecipeSlugPath,
  extractIdFromRecipeSlug,
  fetchRecipeDetail,
} from "@bartendingapp/shared";
import { Text } from "@/components/text";
import { supabase } from "@/lib/supabase";
import { siteAbsoluteUrl } from "@/lib/site-url";
import { IngredientList } from "@/recipes/ingredient-list";
import { RecipeDetailHeader } from "@/recipes/recipe-detail-header";
import { buildRecipeJsonLd } from "@/recipes/recipe-json-ld";
import { RecommendationsSection } from "@/recipe-recommendations/recommendations-section";

interface RecipePageParams {
  slug: string;
}

async function resolveRecipe(slugParam: string) {
  const id = extractIdFromRecipeSlug(slugParam);
  if (!id) {
    return null;
  }

  const recipe = await fetchRecipeDetail(supabase, id);
  return recipe;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RecipePageParams>;
}): Promise<Metadata> {
  const { slug } = await params;
  const recipe = await resolveRecipe(slug);

  if (!recipe) {
    return {};
  }

  const canonicalPath = `/recipes/${buildRecipeSlugPath(recipe.id, recipe.name)}`;
  const ingredientNames = recipe.ingredients.map((ingredient) => ingredient.name).join(", ");
  const description = `${recipe.name}: made with ${ingredientNames}.`;

  return {
    title: recipe.name,
    description,
    alternates: {
      canonical: canonicalPath,
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

  const recipe = await fetchRecipeDetail(supabase, id);

  if (!recipe) {
    notFound();
  }

  const canonicalSlugPath = buildRecipeSlugPath(recipe.id, recipe.name);
  if (slug !== canonicalSlugPath) {
    permanentRedirect(`/recipes/${canonicalSlugPath}`);
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
