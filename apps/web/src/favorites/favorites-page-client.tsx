"use client";

import { useEffect, useMemo, useRef } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { BackButton } from "@/components/back-button";
import { EmptyState } from "@/components/empty-state";
import { Spinner } from "@/components/spinner";
import { Text } from "@/components/text";
import { RecipeCard } from "@/recipes/recipe-card";
import { Button } from "@/components/button";
import { useFavoriteRecipes } from "./use-favorites";

export function FavoritesPageClient() {
  const t = useTranslations("favorites");
  const tCommon = useTranslations("common");
  const { data, error, isPending, isFetchingNextPage, hasNextPage, fetchNextPage, refetch } =
    useFavoriteRecipes();

  const recipes = useMemo(() => data?.pages.flat() ?? [], [data]);

  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <div className="flex flex-col gap-four p-six">
      <BackButton />
      <Text variant="display" as="h1">
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
      ) : recipes.length === 0 ? (
        <EmptyState
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          action={
            <Link
              href="/"
              className="inline-flex items-center justify-center gap-two rounded-medium bg-accent px-four py-two text-label font-medium text-accent-text transition-colors hover:opacity-90"
            >
              {t("browseRecipes")}
            </Link>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-three sm:grid-cols-3 md:grid-cols-4">
            {recipes.map((recipe) => (
              <RecipeCard key={recipe.id} recipe={recipe} />
            ))}
          </div>
          <div ref={sentinelRef} className="flex justify-center py-four">
            {isFetchingNextPage && <Spinner label={t("loadingMore")} />}
          </div>
        </>
      )}
    </div>
  );
}
