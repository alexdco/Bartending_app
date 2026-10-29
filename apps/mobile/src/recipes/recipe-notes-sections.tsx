import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { drinkStyleDisplay, type RecipeDetail } from "@bartendingapp/shared";

import { Text } from "@/components/text";
import { Spacing } from "@/constants/theme";

export interface RecipeNotesSectionsProps {
  recipe: Pick<RecipeDetail, "drinkStyle" | "drinkStyleNote" | "bartenderTip" | "presentationTip">;
}

function NoteSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="heading" accessibilityRole="header">
        {heading}
      </Text>
      {children}
    </View>
  );
}

/**
 * Drink Style, Bartender tip, and Presentation tip, in that order (spec 0043,
 * AC-1 to AC-4). Each hides when it has nothing to show; the text is already
 * localized by fetch_recipe_detail, falling back to English (AC-5).
 */
export function RecipeNotesSections({ recipe }: RecipeNotesSectionsProps) {
  const { t } = useTranslation();
  const style = drinkStyleDisplay(recipe.drinkStyle, recipe.drinkStyleNote);

  return (
    <>
      {style ? (
        <NoteSection heading={t("recipe.drinkStyle")}>
          {style.label ? (
            <Text variant="subheading">{t(`recipe.drinkStyles.${style.label}`)}</Text>
          ) : null}
          {style.note ? <Text variant="body">{style.note}</Text> : null}
        </NoteSection>
      ) : null}

      {recipe.bartenderTip ? (
        <NoteSection heading={t("recipe.bartenderTip")}>
          <Text variant="body">{recipe.bartenderTip}</Text>
        </NoteSection>
      ) : null}

      {recipe.presentationTip ? (
        <NoteSection heading={t("recipe.presentationTip")}>
          <Text variant="body">{recipe.presentationTip}</Text>
        </NoteSection>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.two,
  },
});
