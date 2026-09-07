import Image from "next/image";
import Link from "next/link";
import { Card } from "@/components/card";
import { Chip } from "@/components/chip";
import { Text } from "@/components/text";
import { alcoholicStatusLabel } from "./format";
import { formatMissingIngredients, type RecipeSearchResult } from "@bartendingapp/shared";

export interface RecipeCardProps {
  recipe: RecipeSearchResult;
  missingIngredientNames?: string[];
}

export function RecipeCard({ recipe, missingIngredientNames }: RecipeCardProps) {
  return (
    <Link href={`/recipes/${recipe.id}`} className="block">
      <Card className="flex flex-col gap-two">
        <div className="relative aspect-square w-full overflow-hidden rounded-small">
          <Image
            src={recipe.imageUrl ?? "/recipe-placeholder.svg"}
            alt=""
            fill
            sizes="(min-width: 768px) 240px, 45vw"
            className="object-cover"
          />
        </div>
        <Text variant="subheading" as="h3">
          {recipe.name}
        </Text>
        <Chip>{alcoholicStatusLabel(recipe.alcoholicStatus)}</Chip>
        {missingIngredientNames && missingIngredientNames.length > 0 && (
          <Text variant="bodySmall" muted>
            Missing: {formatMissingIngredients(missingIngredientNames)}
          </Text>
        )}
      </Card>
    </Link>
  );
}
