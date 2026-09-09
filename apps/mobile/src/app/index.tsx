import { useState } from "react";
import { SafeAreaView, ScrollView, StyleSheet, View } from "react-native";

import { Button } from "@/components/button";
import { Text } from "@/components/text";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { Hero } from "@/homepage/hero";
import { RegionShortcutRow } from "@/homepage/region-shortcut-row";
import { DrinkIdeasCarousel } from "@/homepage/drink-ideas-carousel";
import { RecentlyViewedCarousel } from "@/homepage/recently-viewed-carousel";
import { RecommendationsCarousel } from "@/homepage/recommendations-carousel";
import { PopularByRegionCarousel } from "@/homepage/popular-by-region-carousel";
import { useHomePopularRegions } from "@/homepage/use-homepage-data";

export default function HomeScreen() {
  const theme = useTheme();
  const [sessionErrorCount, setSessionErrorCount] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const regionsQuery = useHomePopularRegions();
  const regions = regionsQuery.data ?? [];
  const firstRegion = regions[0] ?? null;

  const onSessionError = () => setSessionErrorCount((count) => count + 1);
  const showBanner = sessionErrorCount > 0 && !dismissed;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScrollView contentContainerStyle={styles.list}>
        {showBanner && (
          <View
            style={[styles.banner, { backgroundColor: theme.surface, borderColor: theme.border }]}
          >
            <Text variant="body">Something went wrong loading your homepage.</Text>
            <View style={styles.bannerActions}>
              <Button variant="secondary" onPress={() => setDismissed(true)}>
                Dismiss
              </Button>
            </View>
          </View>
        )}

        <Hero />

        {regions.length > 0 && <RegionShortcutRow regions={regions} />}

        <DrinkIdeasCarousel onSessionError={onSessionError} />
        <RecommendationsCarousel onSessionError={onSessionError} />
        <RecentlyViewedCarousel />
        {firstRegion && <PopularByRegionCarousel region={firstRegion} />}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  list: {
    gap: Spacing.five,
    paddingBottom: Spacing.six,
  },
  banner: {
    marginHorizontal: Spacing.four,
    gap: Spacing.two,
    borderRadius: Spacing.three,
    borderWidth: 1,
    padding: Spacing.four,
  },
  bannerActions: {
    flexDirection: "row",
    gap: Spacing.two,
  },
});
