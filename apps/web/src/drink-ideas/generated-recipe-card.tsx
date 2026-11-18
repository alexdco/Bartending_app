import { useLocale, useTranslations } from "next-intl";
import { Card } from "@/components/card";
import { Chip } from "@/components/chip";
import { Text } from "@/components/text";
import { localizeDecimalText, type GeneratedDrinkIdea, type Locale } from "@bartendingapp/shared";

export interface GeneratedRecipeCardProps {
  idea: GeneratedDrinkIdea;
}

export function GeneratedRecipeCard({ idea }: GeneratedRecipeCardProps) {
  const t = useTranslations("drinkIdeas");
  const locale = useLocale() as Locale;

  return (
    <Card className="flex flex-col gap-three">
      <div className="flex items-center justify-between gap-two">
        <Text variant="subheading" as="h3">
          {idea.name}
        </Text>
        <Chip selected>{t("aiGenerated")}</Chip>
      </div>

      <div className="flex flex-col gap-one">
        <Text variant="label" muted>
          {t("ingredients")}
        </Text>
        <ul className="flex flex-col gap-half">
          {idea.ingredients.map((ingredient) => (
            <li key={ingredient.name}>
              <Text variant="bodySmall">
                {/* The model's amount text, decimal separator localized; steps stay as written (spec 0055 AC-5). */}
                {localizeDecimalText(ingredient.amount, locale)} {ingredient.name}
              </Text>
            </li>
          ))}
        </ul>
        {idea.garnish !== null && (
          // The server decides in_pantry; a garnish you don't own reads as optional (spec 0059 AC-2).
          <Text variant="bodySmall">
            {idea.garnish.in_pantry
              ? t("garnish", { name: idea.garnish.name })
              : t("optionalGarnish", { name: idea.garnish.name })}
          </Text>
        )}
      </div>

      <div className="flex flex-col gap-one">
        <Text variant="label" muted>
          {t("steps")}
        </Text>
        <ol className="flex flex-col gap-one list-decimal pl-four">
          {idea.steps.map((step, index) => (
            <li key={index}>
              <Text variant="bodySmall">{step}</Text>
            </li>
          ))}
        </ol>
      </div>
    </Card>
  );
}
