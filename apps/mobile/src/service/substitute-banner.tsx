import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";
import {
  formatSubstituteAmount,
  type Locale,
  type PartsLine,
  type QuickBuildIngredient,
  type SubstituteAmount,
  type SubstituteBannerBlock,
} from "@bartendingapp/shared";

import { Card } from "@/components/card";
import { Text } from "@/components/text";
import { Radii, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import type { QuickBuildUnit } from "@/service/quick-build-unit-storage";

export interface SubstituteBannerProps {
  blocks: readonly SubstituteBannerBlock[];
  ingredients: readonly QuickBuildIngredient[];
  /** Quick Build's computeParts lines in parts mode, else null. */
  partsLines: readonly PartsLine[] | null;
  unit: QuickBuildUnit;
  locale: Locale;
}

/**
 * The Quick Build 86'd banner (spec 0065 AC-1 to AC-8), matching web's
 * apps/web/src/service/substitute-banner.tsx: one block per 86'd ingredient
 * with up to three swaps, or a plain line when none can be suggested.
 */
export function SubstituteBanner({
  blocks,
  ingredients,
  partsLines,
  unit,
  locale,
}: SubstituteBannerProps) {
  const theme = useTheme();
  const { t } = useTranslation();

  if (blocks.length === 0) {
    return null;
  }

  const amountText = (amount: SubstituteAmount): string | null => {
    switch (amount.kind) {
      case "none":
        return null;
      case "ratio_phrase":
        return amount.approximate
          ? t(`substitutes.ratioApprox.${amount.key}`)
          : t(`substitutes.ratio.${amount.key}`);
      case "amount":
        // Parts read "pt", as Quick Build's own lines do on mobile.
        if (amount.unit === "part") {
          return `${amount.text} pt`;
        }
        if (amount.unit === "each") {
          return amount.text;
        }
        // Counted units reuse batch's plural word strings (spec 0054).
        if (amount.unit === "dash" || amount.unit === "splash" || amount.unit === "drop") {
          return t(`batch.${amount.unit}`, { count: amount.count, value: amount.text });
        }
        return `${amount.text} ${amount.unit}`;
    }
  };

  return (
    <View accessibilityLabel={t("substitutes.bannerLabel")} style={styles.banner}>
      {blocks.map((block) => {
        const original = ingredients[block.lineIndex];
        const partsLine = partsLines?.[block.lineIndex];
        const partsValue =
          partsLine?.state === "normal" && partsLine.parts !== null ? partsLine.parts : null;

        return (
          <Card key={block.ingredientId} style={[styles.block, { borderColor: theme.danger }]}>
            <Text variant="heading" accessibilityRole="header">
              {t("substitutes.heading", { ingredient: block.name })}
            </Text>

            {block.picked.outcome === "none_known" && (
              <Text variant="body">{t("substitutes.noneKnown")}</Text>
            )}
            {block.picked.outcome === "none_in_stock" && (
              <Text variant="body">{t("substitutes.noneInStock")}</Text>
            )}

            {block.picked.items.map((item) => {
              const amount = original
                ? amountText(
                    formatSubstituteAmount({
                      amountValue: original.amountValue,
                      amountMaxValue: original.amountMaxValue,
                      amountUnit: original.amountUnit,
                      partsValue: unit === "parts" ? partsValue : null,
                      ratio: item.ratio,
                      mode: unit,
                      locale,
                    }),
                  )
                : null;
              const tags = [
                item.alreadyInDrink ? t("substitutes.alreadyInDrink") : null,
                item.addedAllergens.length > 0
                  ? t("substitutes.addsAllergens", {
                      allergens: item.addedAllergens
                        .map((allergen) => t(`recipe.allergenLabels.${allergen}`))
                        .join(", "),
                    })
                  : null,
                item.allergensUnknown ? t("substitutes.checkAllergens") : null,
              ].filter((tag): tag is string => tag !== null);

              return (
                <View key={item.substituteIngredientId} style={styles.item}>
                  <Text variant="subheading" style={styles.itemName}>
                    {amount ? `${amount} · ${item.name}` : item.name}
                  </Text>
                  {item.note && <Text variant="body">{item.note}</Text>}
                  {tags.length > 0 && (
                    <View style={styles.tags}>
                      {tags.map((tag) => (
                        <Text
                          key={tag}
                          variant="label"
                          style={[styles.tag, { borderColor: theme.border, color: theme.text }]}
                        >
                          {tag}
                        </Text>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
          </Card>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    gap: Spacing.three,
  },
  block: {
    gap: Spacing.two,
  },
  item: {
    gap: Spacing.half,
  },
  itemName: {
    fontWeight: "700",
  },
  tags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.one,
  },
  tag: {
    borderWidth: 1,
    borderRadius: Radii.full,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
  },
});
