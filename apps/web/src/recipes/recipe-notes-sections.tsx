import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { drinkStyleDisplay, type RecipeDetail } from "@bartendingapp/shared";
import { Text } from "@/components/text";

export interface RecipeNotesSectionsProps {
  recipe: Pick<RecipeDetail, "drinkStyle" | "drinkStyleNote" | "bartenderTip" | "presentationTip">;
}

function NoteSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-two">
      <Text variant="heading" as="h2">
        {heading}
      </Text>
      {children}
    </section>
  );
}

/**
 * Drink Style, Bartender tip, and Presentation tip, in that order (spec 0043,
 * AC-1 to AC-4). Each hides when it has nothing to show; the text is already
 * localized by fetch_recipe_detail, falling back to English (AC-5).
 */
export async function RecipeNotesSections({ recipe }: RecipeNotesSectionsProps) {
  const t = await getTranslations("recipe");
  const style = drinkStyleDisplay(recipe.drinkStyle, recipe.drinkStyleNote);

  return (
    <>
      {style ? (
        <NoteSection heading={t("drinkStyle")}>
          {style.label ? (
            <Text variant="subheading" as="p">
              {t(`drinkStyles.${style.label}`)}
            </Text>
          ) : null}
          {style.note ? <Text variant="body">{style.note}</Text> : null}
        </NoteSection>
      ) : null}

      {recipe.bartenderTip ? (
        <NoteSection heading={t("bartenderTip")}>
          <Text variant="body">{recipe.bartenderTip}</Text>
        </NoteSection>
      ) : null}

      {recipe.presentationTip ? (
        <NoteSection heading={t("presentationTip")}>
          <Text variant="body">{recipe.presentationTip}</Text>
        </NoteSection>
      ) : null}
    </>
  );
}
