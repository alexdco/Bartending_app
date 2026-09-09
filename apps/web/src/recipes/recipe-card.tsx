import Image from "next/image";
import Link from "next/link";
import { Card } from "@/components/card";
import { Chip } from "@/components/chip";
import { Text } from "@/components/text";
import { FavoriteToggle } from "@/favorites/favorite-toggle";
import { useFavoriteRecipeIds } from "@/favorites/use-favorites";
import { useToggleFavorite } from "@/favorites/use-favorite-mutations";
import { alcoholicStatusLabel } from "./format";
import {
  buildRecipeSlugPath,
  formatMissingIngredients,
  type RecipeSearchResult,
} from "@bartendingapp/shared";

export interface RecipeCardProps {
  recipe: RecipeSearchResult;
  missingIngredientNames?: string[];
}

export function RecipeCard({ recipe, missingIngredientNames }: RecipeCardProps) {
  const { data: favoriteIds } = useFavoriteRecipeIds();
  const { toggle, isPending } = useToggleFavorite();
  const isFavorited = favoriteIds?.includes(recipe.id) ?? false;

  return (
    <Link href={`/recipes/${buildRecipeSlugPath(recipe.id, recipe.name)}`} className="block">
      <Card className="flex flex-col gap-two">
        <div className="relative aspect-square w-full overflow-hidden rounded-small">
          <Image
            src={recipe.imageUrl ?? "/recipe-placeholder.svg"}
            alt=""
            fill
            sizes="(min-width: 768px) 240px, 45vw"
            className="object-cover"
          />
          <FavoriteToggle
            isFavorited={isFavorited}
            disabled={isPending}
            onToggle={() => toggle(recipe.id, isFavorited)}
            className="absolute right-two top-two"
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
