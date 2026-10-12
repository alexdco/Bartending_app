"use client";

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { LinkButton } from "@/components/link-button";
import { Spinner } from "@/components/spinner";
import { Text } from "@/components/text";
import { RecipeCard } from "@/recipes/recipe-card";
import { usePantry } from "@/pantry/use-pantry";
import {
  buildDrinkIdeaGeneratedEvent,
  drinkIdeaLimitMessage,
  GenerateDrinkIdeaError,
  type Locale,
} from "@bartendingapp/shared";
import { track } from "@/analytics/posthog-client";
import { useDrinkIdeas } from "./use-drink-ideas";
import { useGenerateDrinkIdea } from "./use-generate-drink-idea";
import { GeneratedRecipeCard } from "./generated-recipe-card";

const MIN_PANTRY_INGREDIENTS_FOR_GENERATION = 2;

type DrinkIdeasTranslator = ReturnType<typeof useTranslations<"drinkIdeas">>;

function generateErrorMessage(
  t: DrinkIdeasTranslator,
  locale: Locale,
  reason: GenerateDrinkIdeaError["reason"],
  resetsAt?: string,
): string {
  switch (reason) {
    case "no_session":
      return t("errorNoSession");
    case "quota_exceeded":
      return resetsAt
        ? t("quotaExceededUntil", { time: new Date(resetsAt).toLocaleString(locale) })
        : t("quotaExceeded");
    case "pantry_too_small":
      return t("pantryTooSmall");
    default:
      return t("generateFailed");
  }
}

function generateErrorDescription(
  t: DrinkIdeasTranslator,
  error: unknown,
  locale: Locale,
): ReactNode {
  if (!(error instanceof GenerateDrinkIdeaError)) {
    return generateErrorMessage(t, locale, "generation_failed");
  }

  const limitMessage =
    error.reason === "quota_exceeded"
      ? drinkIdeaLimitMessage(error, { copyLocale: locale, formatLocale: locale })
      : null;

  if (!limitMessage) {
    return generateErrorMessage(t, locale, error.reason, error.resetsAt);
  }

  return (
    <>
      {limitMessage.before}
      {limitMessage.signInText && (
        <Link href="/account" className="underline">
          {limitMessage.signInText}
        </Link>
      )}
      {limitMessage.after}
    </>
  );
}

export function DrinkIdeasPageClient() {
  const pantry = usePantry();
  const pantryItems = pantry.data;
  const pantryIsEmpty = pantry.isSuccess && pantry.data.length === 0;
  const { data, error, isPending, isFetchingNextPage, hasNextPage, fetchNextPage, refetch } =
    useDrinkIdeas({ enabled: pantry.isSuccess && pantry.data.length > 0 });
  const generateDrinkIdea = useGenerateDrinkIdea();
  const locale = useLocale() as Locale;
  const t = useTranslations("drinkIdeas");
  const tCommon = useTranslations("common");

  const matches = useMemo(() => data?.pages.flat() ?? [], [data]);
  const canMakeNow = useMemo(() => matches.filter((match) => match.missingRatio === 0), [matches]);
  const almostThere = useMemo(() => matches.filter((match) => match.missingRatio > 0), [matches]);
  const canGenerate = (pantryItems?.length ?? 0) >= MIN_PANTRY_INGREDIENTS_FOR_GENERATION;

  const firstPage = data?.pages[0];
  const firedMatchedRef = useRef(false);

  useEffect(() => {
    if (!firstPage || firstPage.length === 0 || firedMatchedRef.current) {
      return;
    }

    firedMatchedRef.current = true;
    const event = buildDrinkIdeaGeneratedEvent({
      source: "matched",
      pantry_size: pantryItems?.length ?? 0,
      match_count: firstPage.length,
    });
    track(event.name, event.properties);
  }, [firstPage, pantryItems]);

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

  const generateSection = canGenerate && (
    <section className="flex flex-col gap-three">
      <Text variant="heading" as="h2">
        {t("somethingNew")}
      </Text>
      {generateDrinkIdea.data ? (
        <GeneratedRecipeCard idea={generateDrinkIdea.data} />
      ) : generateDrinkIdea.error ? (
        <EmptyState
          title={t("generateErrorTitle")}
          description={generateErrorDescription(t, generateDrinkIdea.error, locale)}
          action={<Button onClick={() => generateDrinkIdea.mutate()}>{tCommon("retry")}</Button>}
        />
      ) : (
        <Button
          variant="secondary"
          onClick={() => generateDrinkIdea.mutate()}
          disabled={generateDrinkIdea.isPending}
        >
          {generateDrinkIdea.isPending ? t("generating") : t("generate")}
        </Button>
      )}
    </section>
  );

  return (
    <div className="flex flex-col gap-four p-six">
      <BackButton />
      <Text variant="display" as="h1">
        {t("title")}
      </Text>

      {pantry.isError || error ? (
        <EmptyState
          title={tCommon("somethingWentWrong")}
          description={t("loadError")}
          action={
            <Button onClick={() => (pantry.isError ? pantry.refetch() : refetch())}>
              {tCommon("retry")}
            </Button>
          }
        />
      ) : pantryIsEmpty ? (
        // Spec 0038 AC-5: no match query for an empty pantry, just the next step.
        <EmptyState
          title={t("emptyPantryTitle")}
          description={t("emptyPantryDescription")}
          action={<LinkButton href="/pantry">{t("addIngredients")}</LinkButton>}
        />
      ) : pantry.isPending || isPending ? (
        <div className="flex justify-center py-six">
          <Spinner label={t("loading")} />
        </div>
      ) : matches.length === 0 ? (
        <>
          <EmptyState
            title={t("emptyTitle")}
            description={t("emptyDescription")}
            action={<LinkButton href="/pantry">{t("goToPantry")}</LinkButton>}
          />
          {generateSection}
        </>
      ) : (
        <>
          {canMakeNow.length > 0 && (
            <section className="flex flex-col gap-three">
              <Text variant="heading" as="h2">
                {t("canMakeNow")}
              </Text>
              <div className="grid grid-cols-2 gap-three sm:grid-cols-3 md:grid-cols-4">
                {canMakeNow.map((match) => (
                  <RecipeCard
                    key={match.id}
                    recipe={{
                      id: match.id,
                      name: match.name,
                      imageUrl: match.imageUrl,
                      alcoholicStatus: match.alcoholicStatus,
                    }}
                  />
                ))}
              </div>
            </section>
          )}

          {almostThere.length > 0 && (
            <section className="flex flex-col gap-three">
              <Text variant="heading" as="h2">
                {t("almostThere")}
              </Text>
              <div className="grid grid-cols-2 gap-three sm:grid-cols-3 md:grid-cols-4">
                {almostThere.map((match) => (
                  <RecipeCard
                    key={match.id}
                    recipe={{
                      id: match.id,
                      name: match.name,
                      imageUrl: match.imageUrl,
                      alcoholicStatus: match.alcoholicStatus,
                    }}
                    missingIngredientNames={match.missingIngredients.map(
                      (ingredient) => ingredient.name,
                    )}
                  />
                ))}
              </div>
            </section>
          )}

          {generateSection}

          <div ref={sentinelRef} className="flex justify-center py-four">
            {isFetchingNextPage && <Spinner label={t("loadingMore")} />}
          </div>
        </>
      )}
    </div>
  );
}
