"use client";

import { useState } from "react";
import Image from "next/image";
import { Chip } from "@/components/chip";
import { Text } from "@/components/text";
import { FavoriteToggle } from "@/favorites/favorite-toggle";
import { useAddFavorite, useRemoveFavorite } from "@/favorites/use-favorite-mutations";
import { alcoholicStatusLabel } from "./format";
import type { RecipeDetail } from "@bartendingapp/shared";

export interface RecipeDetailHeaderProps {
  recipe: RecipeDetail;
}

export function RecipeDetailHeader({ recipe }: RecipeDetailHeaderProps) {
  const addFavorite = useAddFavorite();
  const removeFavorite = useRemoveFavorite();
  const [isFavorited, setIsFavorited] = useState(recipe.isFavorited);

  const handleToggle = () => {
    const nextIsFavorited = !isFavorited;
    setIsFavorited(nextIsFavorited);

    const mutation = nextIsFavorited ? addFavorite : removeFavorite;
    mutation.mutate({ recipeId: recipe.id }, { onError: () => setIsFavorited(!nextIsFavorited) });
  };

  return (
    <header className="flex flex-col gap-three">
      <div className="relative aspect-video w-full overflow-hidden rounded-medium">
        <Image
          src={recipe.imageUrl ?? "/recipe-placeholder.svg"}
          alt=""
          fill
          sizes="100vw"
          className="object-cover"
          priority
        />
        <FavoriteToggle
          isFavorited={isFavorited}
          disabled={addFavorite.isPending || removeFavorite.isPending}
          onToggle={handleToggle}
          className="absolute right-three top-three"
        />
      </div>
      <Text variant="display" as="h1">
        {recipe.name}
      </Text>
      <div className="flex flex-wrap gap-two">
        <Chip>{alcoholicStatusLabel(recipe.alcoholicStatus)}</Chip>
        {recipe.glass && <Chip>{recipe.glass}</Chip>}
      </div>
    </header>
  );
}
