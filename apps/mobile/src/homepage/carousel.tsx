import type { ReactElement } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";

import { Text } from "@/components/text";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

const CARD_WIDTH = 200;

export interface CarouselProps<T> {
  title: string;
  data: T[];
  keyExtractor: (item: T) => string;
  renderItem: (item: T) => ReactElement;
  onSeeMore?: () => void;
}

export function Carousel<T>({
  title,
  data,
  keyExtractor,
  renderItem,
  onSeeMore,
}: CarouselProps<T>) {
  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text variant="heading">{title}</Text>
        {onSeeMore && (
          <Pressable onPress={onSeeMore} accessibilityRole="button" hitSlop={8}>
            <Text variant="label">See more</Text>
          </Pressable>
        )}
      </View>
      <FlatList
        horizontal
        data={data}
        keyExtractor={keyExtractor}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => <View style={styles.item}>{renderItem(item)}</View>}
      />
    </View>
  );
}

export function CarouselSkeleton({ title }: { title: string }) {
  const theme = useTheme();

  return (
    <View style={styles.section} accessibilityElementsHidden>
      <Text variant="heading">{title}</Text>
      <View style={styles.list}>
        {[0, 1, 2].map((index) => (
          <View
            key={index}
            style={[styles.item, styles.skeletonCard, { backgroundColor: theme.surface }]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.two,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  list: {
    flexDirection: "row",
    gap: Spacing.three,
  },
  item: {
    width: CARD_WIDTH,
  },
  skeletonCard: {
    aspectRatio: 3 / 4,
    borderRadius: Spacing.three,
  },
});
