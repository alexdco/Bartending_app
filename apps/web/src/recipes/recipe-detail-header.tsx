import Image from "next/image";
import { Chip } from "@/components/chip";
import { Text } from "@/components/text";
import { alcoholicStatusLabel } from "./format";
import type { RecipeDetail } from "@bartendingapp/shared";

export interface RecipeDetailHeaderProps {
  recipe: RecipeDetail;
}

export function RecipeDetailHeader({ recipe }: RecipeDetailHeaderProps) {
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
