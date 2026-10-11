import { useTranslations } from "next-intl";
import { Card } from "@/components/card";
import { Chip } from "@/components/chip";
import { Text } from "@/components/text";
import type { GeneratedDrinkIdea } from "@bartendingapp/shared";

export interface GeneratedRecipeCardProps {
  idea: GeneratedDrinkIdea;
}

export function GeneratedRecipeCard({ idea }: GeneratedRecipeCardProps) {
  const t = useTranslations("drinkIdeas");

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
                {ingredient.amount} {ingredient.name}
              </Text>
            </li>
          ))}
        </ul>
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
