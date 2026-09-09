import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";

import { Button } from "@/components/button";
import { Text } from "@/components/text";
import { Spacing } from "@/constants/theme";

export function Hero() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Text variant="display">What are you drinking tonight?</Text>
      <Text variant="body" muted>
        Drink ideas from your pantry, recommendations, and popular drinks by region.
      </Text>
      <Button onPress={() => router.push("/search")}>Search recipes</Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.three,
    padding: Spacing.four,
    alignItems: "flex-start",
  },
});
