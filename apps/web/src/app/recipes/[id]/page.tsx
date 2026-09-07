import { notFound } from "next/navigation";
import { fetchRecipeDetail } from "@bartendingapp/shared";
import { Text } from "@/components/text";
import { supabase } from "@/lib/supabase";
import { IngredientList } from "@/recipes/ingredient-list";
import { RecipeDetailHeader } from "@/recipes/recipe-detail-header";

export default async function RecipeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const recipe = await fetchRecipeDetail(supabase, id);

  if (!recipe) {
    notFound();
  }

  return (
    <main className="flex flex-col gap-four p-six">
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
    </main>
  );
}
