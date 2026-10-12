"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { Spinner } from "@/components/spinner";
import { Text } from "@/components/text";
import { RecipeCard } from "@/recipes/recipe-card";
import { RECOMMENDATIONS_PAGE_SIZE, type RecommendedRecipe } from "@bartendingapp/shared";
import { useRecipeRecommendations } from "./use-recipe-recommendations";

export function MoreLikeThisClient({
  recipeId,
  recipeSlug,
}: {
  recipeId: string;
  recipeSlug: string;
}) {
  const t = useTranslations("recommendations");
  const tCommon = useTranslations("common");
  const [pages, setPages] = useState<RecommendedRecipe[][]>([]);
  const pageOffset = pages.length * RECOMMENDATIONS_PAGE_SIZE;
  const { data, error, isPending, isFetching, refetch } = useRecipeRecommendations(
    recipeId,
    pageOffset,
  );

  const allResults = useMemo(() => pages.flat().concat(data ?? []), [pages, data]);
  const hasMore = (data?.length ?? 0) === RECOMMENDATIONS_PAGE_SIZE;

  return (
    <main className="flex flex-col gap-four p-six">
      <BackButton fallbackHref={`/recipes/${recipeSlug}`} />
      <Text variant="display" as="h1">
        {t("title")}
      </Text>

      {error ? (
        <EmptyState
          title={tCommon("somethingWentWrong")}
          description={t("loadError")}
          action={<Button onClick={() => refetch()}>{tCommon("retry")}</Button>}
        />
      ) : isPending && pages.length === 0 ? (
        <div className="flex justify-center py-six">
          <Spinner label={t("loading")} />
        </div>
      ) : allResults.length === 0 ? (
        <EmptyState title={t("emptyTitle")} description={t("emptyDescription")} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-three sm:grid-cols-3 md:grid-cols-4">
            {allResults.map((recipe) => (
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

          {hasMore && (
            <div className="flex justify-center py-four">
              <Button
                variant="secondary"
                disabled={isFetching}
                onClick={() => setPages((prev) => [...prev, data ?? []])}
              >
                {isFetching ? t("loadingMore") : t("loadMore")}
              </Button>
            </div>
          )}
        </>
      )}
    </main>
  );
}
