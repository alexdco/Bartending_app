"use client";

import { useTranslations } from "next-intl";
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
import type { QuickBuildUnit } from "@/service/quick-build-unit-storage";

// Counted units read with batch's plural word strings (spec 0054); other
// units show their token, as Quick Build already does for oz and ml.
const COUNT_KEYS = {
  dash: "countDash",
  splash: "countSplash",
  drop: "countDrop",
} as const;

export interface SubstituteBannerProps {
  blocks: readonly SubstituteBannerBlock[];
  ingredients: readonly QuickBuildIngredient[];
  /** Quick Build's computeParts lines in parts mode, else null. */
  partsLines: readonly PartsLine[] | null;
  unit: QuickBuildUnit;
  locale: Locale;
}

/**
 * The Quick Build 86'd banner (spec 0065 AC-1 to AC-8): one block per 86'd
 * ingredient with up to three swaps, or a plain line when none can be
 * suggested. Renders nothing when no block exists.
 */
export function SubstituteBanner({
  blocks,
  ingredients,
  partsLines,
  unit,
  locale,
}: SubstituteBannerProps) {
  const t = useTranslations("substitutes");
  const tService = useTranslations("service");
  const tBatch = useTranslations("batch");
  const tRecipe = useTranslations("recipe");

  if (blocks.length === 0) {
    return null;
  }

  const amountText = (amount: SubstituteAmount): string | null => {
    switch (amount.kind) {
      case "none":
        return null;
      case "ratio_phrase":
        return amount.approximate ? t(`ratioApprox.${amount.key}`) : t(`ratio.${amount.key}`);
      case "amount":
        if (amount.unit === "part") {
          return tService("partsAmount", { parts: amount.text });
        }
        if (amount.unit === "each") {
          return amount.text;
        }
        if (amount.unit === "dash" || amount.unit === "splash" || amount.unit === "drop") {
          return tBatch(COUNT_KEYS[amount.unit], { count: amount.count, value: amount.text });
        }
        return `${amount.text} ${amount.unit}`;
    }
  };

  return (
    <section aria-label={t("bannerLabel")} className="flex flex-col gap-three">
      {blocks.map((block) => {
        const original = ingredients[block.lineIndex];
        const partsLine = partsLines?.[block.lineIndex];
        const partsValue =
          partsLine?.state === "normal" && partsLine.parts !== null ? partsLine.parts : null;

        return (
          <Card key={block.ingredientId} className="flex flex-col gap-two border-danger">
            <Text variant="heading" as="h2">
              {t("heading", { ingredient: block.name })}
            </Text>

            {block.picked.outcome === "none_known" && <Text variant="body">{t("noneKnown")}</Text>}
            {block.picked.outcome === "none_in_stock" && (
              <Text variant="body">{t("noneInStock")}</Text>
            )}

            {block.picked.items.length > 0 && (
              <ul className="flex flex-col gap-two">
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
                    item.alreadyInDrink ? t("alreadyInDrink") : null,
                    item.addedAllergens.length > 0
                      ? t("addsAllergens", {
                          allergens: item.addedAllergens
                            .map((allergen) => tRecipe(`allergenLabels.${allergen}`))
                            .join(", "),
                        })
                      : null,
                    item.allergensUnknown ? t("checkAllergens") : null,
                  ].filter((tag): tag is string => tag !== null);

                  return (
                    <li key={item.substituteIngredientId} className="flex flex-col gap-half">
                      <Text variant="subheading" as="p" className="font-bold">
                        {amount ? `${amount} · ${item.name}` : item.name}
                      </Text>
                      {item.note && <Text variant="body">{item.note}</Text>}
                      {tags.length > 0 && (
                        <div className="flex flex-wrap gap-one">
                          {tags.map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full border border-border px-two py-half text-label text-text"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        );
      })}
    </section>
  );
}
