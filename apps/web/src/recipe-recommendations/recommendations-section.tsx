"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { Spinner } from "@/components/spinner";
import { Text } from "@/components/text";
import { buildRecipeSlugPath } from "@bartendingapp/shared";
import { RecipeCard } from "@/recipes/recipe-card";
import {
  useRecipeRecommendations,
  useRecordRecentlyViewedRecipe,
} from "./use-recipe-recommendations";

const MAX_VISIBLE_RECOMMENDATIONS = 8;

export function RecommendationsSection({
  recipeId,
  recipeName,
}: {
  recipeId: string;
  recipeName: string;
}) {
  const t = useTranslations("recommendations");
  const tCommon = useTranslations("common");
  useRecordRecentlyViewedRecipe(recipeId);
  const { data, error, isPending, refetch } = useRecipeRecommendations(recipeId);

  return (
    <section className="flex flex-col gap-three">
      <Text variant="heading" as="h2">
        {t("title")}
      </Text>

      {error ? (
        <EmptyState
          title={tCommon("somethingWentWrong")}
          description={t("loadError")}
          action={<Button onClick={() => refetch()}>{tCommon("retry")}</Button>}
        />
      ) : isPending ? (
        <div className="flex justify-center py-six">
          <Spinner label={t("loading")} />
        </div>
      ) : data.length === 0 ? (
        <Text variant="body" muted>
          {t("emptyInline")}
        </Text>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-three sm:grid-cols-3 md:grid-cols-4">
            {data.slice(0, MAX_VISIBLE_RECOMMENDATIONS).map((recipe) => (
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
          <Link
            href={`/recipes/${buildRecipeSlugPath(recipeId, recipeName)}/more-like-this`}
            className="text-label font-medium text-accent hover:underline"
          >
            {t("seeMore")}
          </Link>
        </>
      )}
    </section>
  );
}
