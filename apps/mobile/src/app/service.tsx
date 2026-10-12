import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, SafeAreaView, ScrollView, StyleSheet, View } from "react-native";

import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { Input } from "@/components/input";
import { Spinner } from "@/components/spinner";
import { Text } from "@/components/text";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useSession } from "@/auth/use-session";
import { useCurrentBar } from "@/service/use-current-bar";
import { useBarServiceData } from "@/service/use-bar-service-data";
import { useCreateBar, useToggleStock } from "@/service/use-bar-mutations";
import { usePinnedRecipes } from "@/service/use-pinned-recipes";
import { useBartenderModeGuardState } from "@/service/use-bartender-mode-guard";

function BarSwitcher({
  bars,
  currentBarId,
  onSelect,
}: {
  bars: { id: string; name: string }[];
  currentBarId: string | null;
  onSelect: (barId: string) => void;
}) {
  const theme = useTheme();
  const [visible, setVisible] = useState(false);
  const currentName = bars.find((bar) => bar.id === currentBarId)?.name ?? "Select a bar";

  return (
    <View>
      <Button variant="secondary" onPress={() => setVisible(true)}>
        {`${currentName} ▾`}
      </Button>
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <View style={styles.switcherOverlay}>
          <View
            style={[
              styles.switcherMenu,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            {bars.map((bar) => (
              <Button
                key={bar.id}
                variant={bar.id === currentBarId ? "primary" : "secondary"}
                onPress={() => {
                  onSelect(bar.id);
                  setVisible(false);
                }}
              >
                {bar.name}
              </Button>
            ))}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function CreateBarForm() {
  const theme = useTheme();
  const [name, setName] = useState("");
  const createBar = useCreateBar();

  return (
    <View style={styles.createBarForm}>
      <Input label="Bar name" placeholder="Riverside Bar" value={name} onChangeText={setName} />
      <Button
        disabled={name.trim() === "" || createBar.isPending}
        onPress={() => createBar.mutate(name.trim(), { onSuccess: () => setName("") })}
      >
        {createBar.isPending ? "Creating..." : "Create bar"}
      </Button>
      {createBar.isError && (
        <Text variant="bodySmall" style={{ color: theme.danger }}>
          Couldn&apos;t create the bar. Check your connection and try again.
        </Text>
      )}
    </View>
  );
}

function WorkingSoloPanel({ isLinked }: { isLinked: boolean }) {
  const router = useRouter();

  return (
    <View style={styles.section}>
      <Text variant="subheading">Working solo</Text>
      <Text variant="bodySmall" muted>
        Search and pinned cocktails work fully on their own. Create or join a bar anytime to add a
        shared menu and 86 list with a team.
      </Text>
      {isLinked ? (
        <View style={styles.noBarActions}>
          <CreateBarForm />
          <Button variant="secondary" onPress={() => router.push("/bar-invite-accept")}>
            I have an invite
          </Button>
        </View>
      ) : (
        <Button variant="secondary" onPress={() => router.push("/account")}>
          Sign in to create or join a bar
        </Button>
      )}
    </View>
  );
}

function CurrentMenuSection({ barId }: { barId: string }) {
  const router = useRouter();
  const serviceData = useBarServiceData(barId);
  const toggleStock = useToggleStock(barId);

  if (serviceData.isPending) {
    return (
      <View style={styles.centered}>
        <Spinner label="Loading bar data" />
      </View>
    );
  }

  if (serviceData.error) {
    return (
      <EmptyState
        title="Couldn't load this bar"
        description="Check your connection and try again."
        action={<Button onPress={() => serviceData.refetch()}>Retry</Button>}
      />
    );
  }

  const data = serviceData.data;
  if (!data) {
    return null;
  }

  const stock86Ids = new Set(
    data.stock86.filter((entry) => entry.is86d).map((entry) => entry.ingredientId),
  );

  return (
    <View style={styles.section}>
      <Text variant="subheading">Current menu</Text>
      <View style={styles.menuActions}>
        <Button variant="secondary" onPress={() => router.push("/bar-recipe-form")}>
          Add house recipe
        </Button>
        <Button variant="secondary" onPress={() => router.push("/bar-invite")}>
          Invite staff
        </Button>
      </View>

      {data.menu.length === 0 ? (
        <Text variant="bodySmall" muted>
          Nothing on the menu yet.
        </Text>
      ) : (
        data.menu
          .filter((item) => item.active)
          .map((item) => {
            const recipe = data.houseRecipes.find((r) => r.id === item.barRecipeId);
            const eightySixedNames = (recipe?.ingredients ?? [])
              .filter((ingredient) => stock86Ids.has(ingredient.ingredientId))
              .map((ingredient) => ingredient.name);

            return (
              <Button
                key={item.id}
                variant="secondary"
                onPress={() =>
                  router.push(`/bartender-build/bar_recipe/${item.barRecipeId}` as never)
                }
              >
                {`${item.name}${eightySixedNames.length > 0 ? "  ⚠" : ""}`}
              </Button>
            );
          })
      )}

      <Text variant="subheading">86 list</Text>
      {data.houseRecipes.length === 0 ? (
        <Text variant="bodySmall" muted>
          No house ingredients tracked yet.
        </Text>
      ) : (
        Array.from(
          new Map(
            data.houseRecipes.flatMap((recipe) =>
              recipe.ingredients.map((ingredient) => [ingredient.ingredientId, ingredient.name]),
            ),
          ),
        ).map(([ingredientId, name]) => {
          const is86d = stock86Ids.has(ingredientId);
          return (
            <View key={ingredientId} style={styles.stockRow}>
              <Text variant="body">{name}</Text>
              <Button
                variant={is86d ? "primary" : "secondary"}
                onPress={() => toggleStock.mutate({ ingredientId, is86d: !is86d })}
              >
                {is86d ? "86'd" : "In stock"}
              </Button>
            </View>
          );
        })
      )}
    </View>
  );
}

export default function ServiceScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { isLinked } = useSession();
  const { t } = useTranslation();
  // Spec 0038 AC-6: never blank; `retry: 1` so a failure shows within a second.
  const currentBar = useCurrentBar({ retry: 1 });
  const pinned = usePinnedRecipes();
  const guard = useBartenderModeGuardState({ retry: 1 });

  if (guard.isError) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
        <EmptyState
          title={t("common.somethingWentWrong")}
          description={t("service.loadFailed")}
          action={<Button onPress={guard.refetch}>{t("common.retry")}</Button>}
        />
      </SafeAreaView>
    );
  }

  // Loading, or about to redirect a user with bartender mode turned off.
  if (!guard.allowed) {
    return (
      <SafeAreaView style={[styles.container, styles.centered, { backgroundColor: theme.bg }]}>
        <Spinner label={t("service.loading")} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="display">Service</Text>

        <Input
          label="Search"
          placeholder="old f, marg, esp mart..."
          onFocus={() => router.push("/bartender-search" as never)}
        />

        {currentBar.showSwitcher && (
          <BarSwitcher
            bars={currentBar.bars}
            currentBarId={currentBar.currentBar?.id ?? null}
            onSelect={currentBar.selectBar}
          />
        )}

        <View style={styles.section}>
          <Text variant="subheading">Pinned cocktails</Text>
          {pinned.isPending ? (
            <Spinner label="Loading pinned cocktails" />
          ) : (pinned.data ?? []).length === 0 ? (
            <Text variant="bodySmall" muted>
              Pin a cocktail to see it here.
            </Text>
          ) : (
            (pinned.data ?? []).map((pin) => (
              <Button
                key={pin.id}
                variant="secondary"
                onPress={() =>
                  router.push(
                    (pin.recipeId
                      ? `/bartender-build/recipe/${pin.recipeId}`
                      : `/bartender-build/bar_recipe/${pin.barRecipeId}`) as never,
                  )
                }
              >
                {pin.recipeId ? "Catalog cocktail" : "House cocktail"}
              </Button>
            ))
          )}
        </View>

        {!isLinked ? (
          <WorkingSoloPanel isLinked={false} />
        ) : currentBar.isError ? (
          <EmptyState
            title={t("service.loadBarFailed")}
            description={t("service.checkConnection")}
            action={<Button onPress={currentBar.refetch}>{t("common.retry")}</Button>}
          />
        ) : currentBar.isLoading ? (
          <View style={styles.centered}>
            <Spinner label={t("service.loadingBar")} />
          </View>
        ) : currentBar.currentBar ? (
          <CurrentMenuSection barId={currentBar.currentBar.id} />
        ) : (
          <WorkingSoloPanel isLinked />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    gap: Spacing.four,
    padding: Spacing.four,
  },
  section: {
    gap: Spacing.two,
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.six,
  },
  createBarForm: {
    gap: Spacing.two,
    width: "100%",
  },
  noBarActions: {
    gap: Spacing.two,
    width: "100%",
  },
  menuActions: {
    flexDirection: "row",
    gap: Spacing.two,
  },
  switcherOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  switcherMenu: {
    gap: Spacing.two,
    padding: Spacing.four,
    borderRadius: Spacing.two,
    borderWidth: 1,
    minWidth: 240,
  },
  stockRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.one,
  },
});
