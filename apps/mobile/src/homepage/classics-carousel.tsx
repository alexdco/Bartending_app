import { useTranslation } from "react-i18next";
import { RecipeCard } from "@/recipes/recipe-card";
import { Carousel } from "./carousel";
import { useHomeClassics } from "./use-homepage-data";

// "Classics to start with": shown in place of recommendations once they
// succeeded empty (spec 0038 AC-4). Optional row, so pending, failed, or
// empty renders nothing.
export function ClassicsCarousel() {
  const { t } = useTranslation();
  const { data, isSuccess } = useHomeClassics();

  if (!isSuccess || data.length === 0) {
    return null;
  }

  return (
    <Carousel
      title={t("home.classicsTitle")}
      data={data}
      keyExtractor={(recipe) => recipe.id}
      renderItem={(recipe) => <RecipeCard recipe={recipe} />}
    />
  );
}
