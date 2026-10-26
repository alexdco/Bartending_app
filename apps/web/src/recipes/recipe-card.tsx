import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Card } from "@/components/card";
import { Chip } from "@/components/chip";
import { Text } from "@/components/text";
import { FavoriteToggle } from "@/favorites/favorite-toggle";
import { useFavoriteRecipeIds } from "@/favorites/use-favorites";
import { useToggleFavorite } from "@/favorites/use-favorite-mutations";
import { alcoholicStatusKey } from "./format";
import {
  buildRecipeSlugPath,
  splitMissingIngredients,
  type RecipeSearchResult,
} from "@bartendingapp/shared";

export interface RecipeCardProps {
  recipe: RecipeSearchResult;
  missingIngredientNames?: string[];
}

export function RecipeCard({ recipe, missingIngredientNames }: RecipeCardProps) {
  const t = useTranslations("recipe");
  const tStatus = useTranslations("alcoholicStatus");
  const { data: favoriteIds } = useFavoriteRecipeIds();
  const { toggle, isPending } = useToggleFavorite();
  const isFavorited = favoriteIds?.includes(recipe.id) ?? false;

  const missingText = (names: readonly string[]) => {
    const { shown, remaining } = splitMissingIngredients(names);
    return t("missingIngredients", { names: shown.join(", "), remaining });
  };

  // Spec 0038 AC-10, stretched link: the title link's ::after covers the whole
  // card so all of it stays clickable, and draws the card's focus ring. The
  // favorite toggle is a sibling of the link (never inside it) and sits above
  // the overlay with z-10; any other interactive child added later must too.
  // Hover grow: scales up and lifts above its neighbours (z-20). Tailwind's
  // hover variant only fires on hover capable pointers, and motion-safe skips
  // it under prefers-reduced-motion. Keyboard focus gets the same lift.
  return (
    <Card className="relative flex flex-col gap-two transition-[transform,box-shadow] duration-200 ease-out motion-safe:hover:z-20 motion-safe:hover:scale-105 motion-safe:hover:shadow-xl motion-safe:focus-within:z-20 motion-safe:focus-within:scale-105 motion-safe:focus-within:shadow-xl">
      <div className="relative aspect-square w-full overflow-hidden rounded-small">
        <Image
          src={recipe.imageUrl ?? "/recipe-placeholder.svg"}
          alt=""
          fill
          sizes="(min-width: 768px) 240px, 45vw"
          className="object-cover"
        />
      </div>
      <FavoriteToggle
        recipeName={recipe.name}
        isFavorited={isFavorited}
        disabled={isPending}
        onToggle={() => toggle(recipe.id, isFavorited)}
        className="absolute right-five top-five z-10"
      />
      <Text variant="subheading" as="h3">
        <Link
          href={`/recipes/${buildRecipeSlugPath(recipe.id, recipe.name)}`}
          className="after:absolute after:inset-0 after:rounded-large after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-focus"
        >
          {recipe.name}
        </Link>
      </Text>
      <Chip>{tStatus(alcoholicStatusKey(recipe.alcoholicStatus))}</Chip>
      {missingIngredientNames && missingIngredientNames.length > 0 && (
        <Text variant="bodySmall" muted>
          {missingText(missingIngredientNames)}
        </Text>
      )}
    </Card>
  );
}
