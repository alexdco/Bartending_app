import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";

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
  const { isLinked, isLoading } = useSession();
  const summary = useRatingSummary(recipeId);
  const myRating = useMyRating(recipeId, isLinked);
  const submitRating = useSubmitRating(recipeId);

  const average = summary.data?.average ?? null;
  const count = summary.data?.count ?? 0;

  return (
    <View style={styles.container}>
      <View style={styles.summaryRow}>
        <StarRating value={average ?? 0} size="small" />
        <Text variant="bodySmall" muted>
          {count > 0
            ? `${average!.toFixed(1)} (${count} rating${count === 1 ? "" : "s"})`
            : "No ratings yet"}
        </Text>
      </View>
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
