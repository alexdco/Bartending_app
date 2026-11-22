"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Text } from "@/components/text";
import { useSession } from "@/auth/use-session";
import { useMyRating, useRatingSummary } from "./use-ratings";
import { useSubmitRating } from "./use-rating-mutations";
import { StarRating } from "./star-rating";
import { RATING_AVERAGE_FORMAT, ratingDisplay, type RatingScore } from "@bartendingapp/shared";

export interface RecipeRatingProps {
  recipeId: string;
}

export function RecipeRating({ recipeId }: RecipeRatingProps) {
  const t = useTranslations("ratings");
  const format = useFormatter();
  const { isLinked, isLoading } = useSession();
  const summary = useRatingSummary(recipeId);
  const myRating = useMyRating(recipeId, isLinked);
  const submitRating = useSubmitRating(recipeId);

  const display = ratingDisplay(summary.data, (value) =>
    format.number(value, RATING_AVERAGE_FORMAT),
  );

  return (
    <div className="flex flex-col gap-one">
      {/* Spec 0038 AC-7: no display stars at zero; one announced summary otherwise. */}
      {display.kind === "rated" ? (
        <div className="flex items-center gap-two">
          <StarRating
            value={summary.data?.average ?? 0}
            size="small"
            label={t("starsLabel", { average: display.average, count: display.count })}
          />
          <Text variant="bodySmall" muted aria-hidden="true">
            {t("summary", { average: display.average, count: display.count })}
          </Text>
        </div>
      ) : (
        <Text variant="bodySmall" muted>
          {t("none")}
        </Text>
      )}
      {/* Spec 0063 AC-12: the summary above stays, but the rating control
          and its sign in prompt are hidden in mocktails only mode. */}
      {!isLoading && isLinked ? (
        <div data-mocktails="hide">
          <StarRating
            value={myRating.data ?? 0}
            disabled={submitRating.isPending}
            onRate={(score: RatingScore) => submitRating.mutate({ score })}
          />
        </div>
      ) : !isLoading ? (
        <Text variant="bodySmall" muted data-mocktails="hide">
          {t.rich("signInToRate", {
            link: (chunks) => (
              <Link href="/account" className="underline">
                {chunks}
              </Link>
            ),
          })}
        </Text>
      ) : null}
    </div>
  );
}
