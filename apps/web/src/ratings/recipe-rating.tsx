"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Text } from "@/components/text";
import { useSession } from "@/auth/use-session";
import { useMyRating, useRatingSummary } from "./use-ratings";
import { useSubmitRating } from "./use-rating-mutations";
import { StarRating } from "./star-rating";
import type { RatingScore } from "@bartendingapp/shared";

export interface RecipeRatingProps {
  recipeId: string;
}

export function RecipeRating({ recipeId }: RecipeRatingProps) {
  const t = useTranslations("ratings");
  const { isLinked, isLoading } = useSession();
  const summary = useRatingSummary(recipeId);
  const myRating = useMyRating(recipeId, isLinked);
  const submitRating = useSubmitRating(recipeId);

  const average = summary.data?.average ?? null;
  const count = summary.data?.count ?? 0;

  return (
    <div className="flex flex-col gap-one">
      <div className="flex items-center gap-two">
        <StarRating value={average ?? 0} size="small" />
        {count > 0 ? (
          <Text variant="bodySmall" muted>
            {t("summary", { average: average!.toFixed(1), count })}
          </Text>
        ) : (
          <Text variant="bodySmall" muted>
            {t("none")}
          </Text>
        )}
      </div>
      {!isLoading && isLinked ? (
        <StarRating
          value={myRating.data ?? 0}
          disabled={submitRating.isPending}
          onRate={(score: RatingScore) => submitRating.mutate({ score })}
        />
      ) : !isLoading ? (
        <Text variant="bodySmall" muted>
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
