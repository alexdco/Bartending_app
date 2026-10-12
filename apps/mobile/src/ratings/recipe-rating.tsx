import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";

import { Text } from "@/components/text";
import { useSession } from "@/auth/use-session";
import { useMyRating, useRatingSummary } from "./use-ratings";
import { useSubmitRating } from "./use-rating-mutations";
import { StarRating } from "./star-rating";
import { useTranslation } from "react-i18next";
import { RATING_AVERAGE_FORMAT, ratingDisplay, type RatingScore } from "@bartendingapp/shared";
import { useActiveLocale } from "@/i18n";

export interface RecipeRatingProps {
  recipeId: string;
}

export function RecipeRating({ recipeId }: RecipeRatingProps) {
  const { isLinked, isLoading } = useSession();
  const summary = useRatingSummary(recipeId);
  const myRating = useMyRating(recipeId, isLinked);
  const submitRating = useSubmitRating(recipeId);

  const { t } = useTranslation();
  const locale = useActiveLocale();
  const display = ratingDisplay(summary.data, (value) =>
    new Intl.NumberFormat(locale, RATING_AVERAGE_FORMAT).format(value),
  );

  return (
    <View style={styles.container}>
      {/* Spec 0038 AC-7: no display stars at zero; one announced summary otherwise. */}
      {display.kind === "rated" ? (
        <View
          style={styles.summaryRow}
          accessible
          accessibilityLabel={t("ratings.starsLabel", {
            average: display.average,
            count: display.count,
          })}
        >
          <StarRating value={summary.data?.average ?? 0} size="small" />
          <Text variant="bodySmall" muted>
            {t("ratings.summary", { average: display.average, count: display.count })}
          </Text>
        </View>
      ) : (
        <Text variant="bodySmall" muted>
          {t("ratings.none")}
        </Text>
      )}
      {!isLoading && isLinked ? (
        <StarRating
          value={myRating.data ?? 0}
          disabled={submitRating.isPending}
          onRate={(score: RatingScore) => submitRating.mutate({ score })}
        />
      ) : !isLoading ? (
        <Pressable onPress={() => router.push("/account")}>
          <Text variant="bodySmall" muted>
            Sign in to rate this recipe
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 4,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
});
