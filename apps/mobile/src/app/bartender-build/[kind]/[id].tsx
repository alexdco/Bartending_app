import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { SafeAreaView, ScrollView, StyleSheet, View } from "react-native";
import {
  computeParts,
  formatAmountInUnit,
  formatParts,
  formatQuickBuildInstructions,
} from "@bartendingapp/shared";

import { BackButton, goBackOrHome } from "@/components/back-button";
import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { Spinner } from "@/components/spinner";
import { Text } from "@/components/text";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useQuickBuildRecipe, type QuickBuildKind } from "@/service/use-quick-build-recipe";
import {
  getStoredQuickBuildUnit,
  setStoredQuickBuildUnit,
  type QuickBuildUnit,
} from "@/service/quick-build-unit-storage";
import { recordBartenderRecentlyViewed } from "@/service/bartender-recently-viewed-storage";
import { useBartenderModeGuard } from "@/service/use-bartender-mode-guard";

const KEEP_AWAKE_TAG = "quick-build-mode";
const UNITS: QuickBuildUnit[] = ["oz", "ml", "parts"];

function MethodLine({ method, straining }: { method: string | null; straining: string | null }) {
  // AC-7: omit the line entirely when both are null, never render it blank.
  if (!method && !straining) {
    return null;
  }

  const parts = [method, straining].filter((part): part is string => Boolean(part));

  return (
    <Text variant="heading" style={styles.methodLine}>
      {parts.join(" → ").toUpperCase()}
    </Text>
  );
}

export default function QuickBuildModeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ kind: QuickBuildKind; id: string }>();
  const { kind, id } = params;

  const [unit, setUnit] = useState<QuickBuildUnit | null>(null);
  const [keepAwakeOn, setKeepAwakeOn] = useState(false);
  const bartenderModeAllowed = useBartenderModeGuard();

  const recipe = useQuickBuildRecipe(kind, id);

  useEffect(() => {
    getStoredQuickBuildUnit().then(setUnit);
  }, []);

  useEffect(() => {
    if (recipe.data) {
      void recordBartenderRecentlyViewed({ id: recipe.data.id, kind: recipe.data.kind });
    }
  }, [recipe.data]);

  // Deactivated unconditionally on unmount, including back navigation and
  // backgrounding, so keep-awake never leaks to another screen (spec's key
  // invariant). Resets to off each time this screen opens, per AC-3.
  useEffect(() => {
    return () => {
      deactivateKeepAwake(KEEP_AWAKE_TAG);
    };
  }, []);

  if (!bartenderModeAllowed) {
    return null;
  }

  const toggleKeepAwake = () => {
    if (keepAwakeOn) {
      deactivateKeepAwake(KEEP_AWAKE_TAG);
      setKeepAwakeOn(false);
    } else {
      void activateKeepAwakeAsync(KEEP_AWAKE_TAG);
      setKeepAwakeOn(true);
    }
  };

  const selectUnit = (nextUnit: QuickBuildUnit) => {
    setUnit(nextUnit);
    void setStoredQuickBuildUnit(nextUnit);
  };

  if (unit === null || recipe.isPending) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
        <BackButton />
        <View style={styles.centered}>
          <Spinner label="Loading recipe" />
        </View>
      </SafeAreaView>
    );
  }

  if (recipe.error) {
    const isOffline = !recipe.data;
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
        <BackButton />
        <View style={styles.centered}>
          <EmptyState
            title={isOffline ? "Not available offline" : "Something went wrong"}
            description={
              isOffline
                ? "This recipe hasn't been opened on this device before, so it needs a connection the first time."
                : "Check your connection and try again."
            }
            action={<Button onPress={() => recipe.refetch()}>Retry</Button>}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (!recipe.data) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
        <BackButton />
        <View style={styles.centered}>
          <EmptyState title="Recipe not found" description="This recipe may have been removed." />
        </View>
      </SafeAreaView>
    );
  }

  const data = recipe.data;
  const partsLines = unit === "parts" ? computeParts(data.ingredients) : null;

  const ingredientDisplays = data.ingredients.map((ingredient, index) => {
    if (unit === "parts") {
      const line = partsLines?.[index];
      return line?.state === "normal" && line.parts !== null
        ? `${formatParts(line.parts)} pt`
        : (line?.measure ?? ingredient.measure ?? "");
    }

    // Unparsed and part lines show their measure text (spec 0035 AC-10).
    const amount = formatAmountInUnit(ingredient.amountValue, ingredient.amountUnit, unit);
    return amount !== null ? `${amount} ${unit}` : (ingredient.measure ?? "");
  });

  const instructions = formatQuickBuildInstructions({
    ingredients: data.ingredients.map((ingredient, index) => ({
      displayAmount: ingredientDisplays[index],
      name: ingredient.name,
    })),
    method: data.method,
    straining: data.straining,
    glass: data.glass,
    garnish: data.kind === "bar_recipe" ? data.garnish : null,
  });

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={styles.header}>
        <BackButton />
        <View style={styles.unitToggle}>
          {UNITS.map((candidate) => (
            <Button
              key={candidate}
              variant={unit === candidate ? "primary" : "secondary"}
              onPress={() => selectUnit(candidate)}
            >
              {candidate}
            </Button>
          ))}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="display" style={styles.name}>
          {data.name.toUpperCase()}
        </Text>

        <View style={styles.ingredients}>
          {data.ingredients.map((ingredient, index) => (
            <View key={ingredient.ingredientId} style={styles.ingredientRow}>
              <Text variant="display" style={styles.amount}>
                {ingredientDisplays[index]}
              </Text>
              <Text variant="heading" style={styles.ingredientName}>
                {ingredient.name}
              </Text>
            </View>
          ))}
        </View>

        <MethodLine method={data.method} straining={data.straining} />

        {instructions && (
          <View style={styles.instructions}>
            <Text variant="subheading" muted>
              Instructions
            </Text>
            <Text variant="body">{instructions}</Text>
          </View>
        )}

        <View style={styles.details}>
          {data.glass && (
            <Text variant="subheading" muted>
              {`Glass: ${data.glass}`}
            </Text>
          )}
          {data.kind === "bar_recipe" && data.ice && (
            <Text variant="subheading" muted>
              {`Ice: ${data.ice}`}
            </Text>
          )}
          {data.kind === "bar_recipe" && data.garnish && (
            <Text variant="subheading" muted>
              {`Garnish: ${data.garnish}`}
            </Text>
          )}
        </View>

        <Button variant={keepAwakeOn ? "primary" : "secondary"} onPress={toggleKeepAwake}>
          {keepAwakeOn ? "Keep awake: on" : "Keep awake: off"}
        </Button>

        <Button variant="secondary" onPress={() => goBackOrHome(router)}>
          Back to search
        </Button>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
  },
  unitToggle: {
    flexDirection: "row",
    gap: Spacing.one,
  },
  content: {
    gap: Spacing.four,
    padding: Spacing.four,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  name: {
    fontWeight: "700",
  },
  ingredients: {
    gap: Spacing.three,
  },
  ingredientRow: {
    gap: Spacing.one,
  },
  amount: {
    fontWeight: "700",
  },
  ingredientName: {
    fontWeight: "500",
  },
  methodLine: {
    fontWeight: "700",
  },
  instructions: {
    gap: Spacing.one,
  },
  details: {
    gap: Spacing.one,
  },
});
