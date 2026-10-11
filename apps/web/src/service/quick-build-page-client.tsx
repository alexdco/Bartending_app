"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  computeParts,
  convertAmount,
  formatConvertedAmount,
  formatParts,
  formatQuickBuildInstructions,
  type ConvertibleUnit,
} from "@bartendingapp/shared";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { Spinner } from "@/components/spinner";
import { Text } from "@/components/text";
import { useQuickBuildRecipe, type QuickBuildKind } from "@/service/use-quick-build-recipe";
import {
  getStoredQuickBuildUnit,
  setStoredQuickBuildUnit,
  type QuickBuildUnit,
} from "@/service/quick-build-unit-storage";
import { recordBartenderRecentlyViewed } from "@/service/bartender-recently-viewed-storage";
import { usePinnedRecipes, usePinRecipe, useUnpinRecipe } from "@/service/use-pinned-recipes";

const UNITS: QuickBuildUnit[] = ["oz", "ml", "parts"];

function MethodLine({ method, straining }: { method: string | null; straining: string | null }) {
  // AC-7: omit the line entirely when both are null, never render it blank.
  if (!method && !straining) {
    return null;
  }

  const parts = [method, straining].filter((part): part is string => Boolean(part));

  return (
    <Text variant="heading" className="font-bold">
      {parts.join(" → ").toUpperCase()}
    </Text>
  );
}

function usePinForRecipe(kind: QuickBuildKind, id: string) {
  const pinned = usePinnedRecipes();
  const pinRecipe = usePinRecipe();
  const unpinRecipe = useUnpinRecipe();

  const existingPin = (pinned.data ?? []).find((pin) =>
    kind === "recipe" ? pin.recipeId === id : pin.barRecipeId === id,
  );

  const toggle = () => {
    if (existingPin) {
      unpinRecipe.mutate(existingPin.id);
    } else {
      pinRecipe.mutate(kind === "recipe" ? { recipeId: id } : { barRecipeId: id });
    }
  };

  return {
    isPinned: Boolean(existingPin),
    toggle,
    isPending: pinRecipe.isPending || unpinRecipe.isPending,
  };
}

// Web equivalent of expo-keep-awake using the browser Screen Wake Lock API,
// per this spec's Cross child contract: requested on the same user gesture
// that turns the toggle on, released on unmount/toggle-off/tab hidden, and
// re-acquired on visibilitychange while still "on" (the API auto-releases
// when the tab is hidden). Renders disabled with a note where unsupported.
function useWakeLock() {
  const [isOn, setIsOn] = useState(false);
  const sentinelRef = useRef<WakeLockSentinel | null>(null);
  const isSupported = typeof navigator !== "undefined" && "wakeLock" in navigator;

  const release = () => {
    sentinelRef.current?.release().catch(() => {});
    sentinelRef.current = null;
  };

  const acquire = async () => {
    try {
      sentinelRef.current = await navigator.wakeLock.request("screen");
    } catch {
      // Permission or transient failure; leave the toggle in its requested
      // state, the visibilitychange re-acquire will try again later.
    }
  };

  const toggle = () => {
    if (!isSupported) {
      return;
    }
    if (isOn) {
      release();
      setIsOn(false);
    } else {
      void acquire();
      setIsOn(true);
    }
  };

  useEffect(() => {
    if (!isSupported) {
      return;
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && isOn && !sentinelRef.current) {
        void acquire();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [isOn, isSupported]);

  // Deactivated unconditionally on unmount, including back navigation, so
  // keep-awake never leaks to another screen (spec's key invariant). Resets
  // to off each time this screen opens, per AC-3.
  useEffect(() => {
    return () => {
      release();
    };
  }, []);

  return { isOn, isSupported, toggle };
}

export interface QuickBuildPageClientProps {
  kind: QuickBuildKind;
  id: string;
}

export function QuickBuildPageClient({ kind, id }: QuickBuildPageClientProps) {
  const t = useTranslations("service");
  const tCommon = useTranslations("common");
  const [unit, setUnit] = useState<QuickBuildUnit | null>(null);
  const wakeLock = useWakeLock();
  const pin = usePinForRecipe(kind, id);

  const recipe = useQuickBuildRecipe(kind, id);

  useEffect(() => {
    getStoredQuickBuildUnit().then(setUnit);
  }, []);

  useEffect(() => {
    if (recipe.data) {
      void recordBartenderRecentlyViewed({ id: recipe.data.id, kind: recipe.data.kind });
    }
  }, [recipe.data]);

  const selectUnit = (nextUnit: QuickBuildUnit) => {
    setUnit(nextUnit);
    void setStoredQuickBuildUnit(nextUnit);
  };

  if (unit === null || recipe.isPending) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-four px-four py-six">
        <BackButton />
        <div className="flex flex-1 items-center justify-center py-six">
          <Spinner label={t("loadingRecipe")} />
        </div>
      </div>
    );
  }

  if (recipe.error) {
    const isOffline = !recipe.data;
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-four px-four py-six">
        <BackButton />
        <div className="flex flex-1 items-center justify-center py-six">
          <EmptyState
            title={isOffline ? t("notAvailableOffline") : tCommon("somethingWentWrong")}
            description={isOffline ? t("notAvailableOfflineDescription") : t("checkConnection")}
            action={<Button onClick={() => recipe.refetch()}>{tCommon("retry")}</Button>}
          />
        </div>
      </div>
    );
  }

  if (!recipe.data) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-four px-four py-six">
        <BackButton />
        <div className="flex flex-1 items-center justify-center py-six">
          <EmptyState title={t("recipeNotFound")} description={t("recipeNotFoundDescription")} />
        </div>
      </div>
    );
  }

  const data = recipe.data;
  const partsLines = unit === "parts" ? computeParts(data.ingredients) : null;

  const ingredientDisplays = data.ingredients.map((ingredient, index) => {
    if (unit === "parts") {
      const line = partsLines?.[index];
      return line?.state === "normal" && line.parts !== null
        ? t("partsAmount", { parts: formatParts(line.parts) })
        : (line?.measure ?? ingredient.measure ?? "");
    }

    const hasParsedAmount = ingredient.amountValue !== null && ingredient.amountUnit !== null;
    return hasParsedAmount
      ? `${formatConvertedAmount(
          convertAmount(
            ingredient.amountValue as number,
            ingredient.amountUnit as ConvertibleUnit,
            unit as ConvertibleUnit,
          ),
          unit as ConvertibleUnit,
        )} ${unit}`
      : (ingredient.measure ?? "");
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
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-six px-four py-six">
      <div className="flex items-center justify-between gap-three">
        <BackButton />
        <div className="flex gap-one" role="group" aria-label={t("unit")}>
          {UNITS.map((candidate) => (
            <Button
              key={candidate}
              variant={unit === candidate ? "primary" : "secondary"}
              onClick={() => selectUnit(candidate)}
            >
              {candidate === "parts" ? t("unitParts") : candidate}
            </Button>
          ))}
        </div>
      </div>

      <Text variant="display" className="font-bold">
        {data.name.toUpperCase()}
      </Text>

      <div className="flex flex-col gap-three">
        {data.ingredients.map((ingredient, index) => (
          <div key={ingredient.ingredientId} className="flex flex-col gap-one">
            <Text variant="display" className="font-bold">
              {ingredientDisplays[index]}
            </Text>
            <Text variant="heading" className="font-medium">
              {ingredient.name}
            </Text>
          </div>
        ))}
      </div>

      <MethodLine method={data.method} straining={data.straining} />

      {instructions && (
        <div className="flex flex-col gap-one">
          <Text variant="subheading" muted>
            {t("instructions")}
          </Text>
          <Text variant="body">{instructions}</Text>
        </div>
      )}

      <div className="flex flex-col gap-one">
        {data.glass && (
          <Text variant="subheading" muted>
            {t("glass", { value: data.glass })}
          </Text>
        )}
        {data.kind === "bar_recipe" && data.ice && (
          <Text variant="subheading" muted>
            {t("ice", { value: data.ice })}
          </Text>
        )}
        {data.kind === "bar_recipe" && data.garnish && (
          <Text variant="subheading" muted>
            {t("garnish", { value: data.garnish })}
          </Text>
        )}
      </div>

      <div className="flex flex-col gap-two">
        <Button
          variant={pin.isPinned ? "primary" : "secondary"}
          disabled={pin.isPending}
          onClick={pin.toggle}
        >
          {pin.isPinned ? t("pinned") : t("pinThis")}
        </Button>

        <Button
          variant={wakeLock.isOn ? "primary" : "secondary"}
          disabled={!wakeLock.isSupported}
          onClick={wakeLock.toggle}
        >
          {wakeLock.isOn ? t("keepAwakeOn") : t("keepAwakeOff")}
        </Button>
        {!wakeLock.isSupported && (
          <Text variant="bodySmall" muted>
            {t("keepAwakeUnsupported")}
          </Text>
        )}
      </div>
    </div>
  );
}
