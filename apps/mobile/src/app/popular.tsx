import { useState } from "react";
import { SafeAreaView, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Chip } from "@/components/chip";
import { EmptyState } from "@/components/empty-state";
import { Spinner } from "@/components/spinner";
import { Text } from "@/components/text";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { RecipeCard } from "@/recipes/recipe-card";
import { usePopularRegions, usePopularByRegion } from "@/popular/use-popular-by-region";
import { useQuizBySource } from "@/quizzes/use-quizzes";

export default function PopularScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ region?: string }>();

  const regionsQuery = usePopularRegions();
  const regions = regionsQuery.data ?? [];

  const [explicitRegion, setExplicitRegion] = useState<string | null>(params.region ?? null);
  const selectedRegion =
    explicitRegion && regions.includes(explicitRegion) ? explicitRegion : (regions[0] ?? null);

  const recipesQuery = usePopularByRegion(selectedRegion);
  const recipes = recipesQuery.data ?? [];
  const quizQuery = useQuizBySource("recipe_region", selectedRegion);
  const quiz = quizQuery.data ?? null;
  const { t } = useTranslation();
  const browseAll = () => router.push("/search");

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScrollView contentContainerStyle={styles.list}>
        <View style={styles.header}>
          <BackButton />
          <Text variant="display">Popular drinks by region</Text>
        </View>

        {regionsQuery.error ? (
          <EmptyState
            title="Something went wrong"
            description="We couldn't load the region list. Check your connection and try again."
            action={<Button onPress={() => regionsQuery.refetch()}>Retry</Button>}
          />
        ) : regionsQuery.isPending ? (
          <View style={styles.centered}>
            <Spinner label="Loading regions" />
          </View>
        ) : regions.length === 0 ? (
          <EmptyState
            title={t("popular.emptyTitle")}
            description={t("popular.emptyDescription")}
            action={<Button onPress={browseAll}>{t("popular.browseAll")}</Button>}
          />
        ) : (
          <>
            <View style={styles.chipRow}>
              {regions.map((region) => (
                <Chip
                  key={region}
                  accessibilityRole="button"
                  selected={region === selectedRegion}
                  onSelectedChange={() => setExplicitRegion(region)}
                >
                  {region}
                </Chip>
              ))}
            </View>

            {quiz && (
              <TouchableOpacity
                onPress={() => router.push(`/quizzes/${quiz.id}` as never)}
                accessibilityRole="button"
              >
                <Card>
                  <Text variant="label">Take the quiz: {quiz.title}</Text>
                </Card>
              </TouchableOpacity>
            )}

            {recipesQuery.error ? (
              <EmptyState
                title="Something went wrong"
                description="We couldn't load this region's popular drinks. Check your connection and try again."
                action={<Button onPress={() => recipesQuery.refetch()}>Retry</Button>}
              />
            ) : recipesQuery.isPending ? (
              <View style={styles.centered}>
                <Spinner label="Loading popular drinks" />
              </View>
            ) : recipes.length === 0 ? (
              <EmptyState
                title={t("popular.regionEmptyTitle")}
                description={t("popular.regionEmptyDescription")}
                action={<Button onPress={browseAll}>{t("popular.browseAll")}</Button>}
              />
            ) : (
              <View style={styles.grid}>
                {recipes.map((recipe) => (
                  <View key={recipe.id} style={styles.gridItem}>
                    <RecipeCard
                      recipe={{
                        id: recipe.id,
                        name: recipe.name,
                        imageUrl: recipe.imageUrl,
                        alcoholicStatus: recipe.alcoholicStatus,
                      }}
                    />
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    gap: Spacing.three,
    padding: Spacing.four,
  },
  list: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
    gap: Spacing.four,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.two,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.three,
  },
  gridItem: {
    width: "47%",
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.four,
  },
});
