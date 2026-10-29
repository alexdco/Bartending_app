import { getTranslations } from "next-intl/server";
import { summarizeRecipeAllergens, type AllergenIngredient } from "@bartendingapp/shared";
import { Text } from "@/components/text";

export interface AllergenSectionProps {
  /** In recipe order, names already localized by the RPC. */
  ingredients: readonly AllergenIngredient[];
}

/**
 * Allergen Information (spec 0043, AC-6). Always shown: each allergen with
 * the ingredients it comes from, a "none" line only when every ingredient is
 * reviewed, an incomplete line otherwise, and the disclaimer.
 */
export async function AllergenSection({ ingredients }: AllergenSectionProps) {
  const t = await getTranslations("recipe");
  const summary = summarizeRecipeAllergens(ingredients);

  return (
    <section className="flex flex-col gap-two">
      <Text variant="heading" as="h2">
        {t("allergens")}
      </Text>

      {summary.entries.length > 0 ? (
        <ul className="flex flex-col gap-one">
          {summary.entries.map((entry) => (
            <li key={entry.allergen}>
              <Text variant="body" as="span">
                <span className="font-medium">{t(`allergenLabels.${entry.allergen}`)}</span> (
                {entry.ingredientNames.join(", ")})
              </Text>
            </li>
          ))}
        </ul>
      ) : summary.isComplete ? (
        <Text variant="body">{t("allergensNone")}</Text>
      ) : null}

      {summary.isComplete ? null : <Text variant="body">{t("allergensIncomplete")}</Text>}

      <Text variant="bodySmall" muted>
        {t("allergensDisclaimer")}
      </Text>
    </section>
  );
}
