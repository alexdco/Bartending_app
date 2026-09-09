import { useState } from "react";
import { SafeAreaView, ScrollView, StyleSheet, View } from "react-native";
import { useLocalSearchParams } from "expo-router";

import { Button } from "@/components/button";
import { Chip } from "@/components/chip";
import { EmptyState } from "@/components/empty-state";
import { Spinner } from "@/components/spinner";
import { Text } from "@/components/text";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { RecipeCard } from "@/recipes/recipe-card";
import { usePopularRegions, usePopularByRegion } from "@/popular/use-popular-by-region";

export default function PopularScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ region?: string }>();

  const regionsQuery = usePopularRegions();
  const regions = regionsQuery.data ?? [];

  const [explicitRegion, setExplicitRegion] = useState<string | null>(params.region ?? null);
  const selectedRegion =
    explicitRegion && regions.includes(explicitRegion) ? explicitRegion : (regions[0] ?? null);

  const recipesQuery = usePopularByRegion(selectedRegion);
  const recipes = recipesQuery.data ?? [];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScrollView contentContainerStyle={styles.list}>
        <View style={styles.header}>
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
            title="No popular drinks yet"
            description="Regions haven't been tagged yet. Check back soon."
          />
        ) : (
          <>
            <View style={styles.chipRow}>
              {regions.map((region) => (
                <Chip
                  key={region}
                  selected={region === selectedRegion}
                  onSelectedChange={() => setExplicitRegion(region)}
                >
                  {region}
                </Chip>
              ))}
            </View>

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
                title="No popular drinks for this region yet"
                description="Check back once more drinks have been ranked."
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
