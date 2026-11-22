import { isMocktailsHiddenLearnCategory } from "@bartendingapp/shared";
import { MocktailsHiddenArea } from "@/mocktails/mocktails-hidden-area";

// Spec 0063 AC-9: spirits, wine, and beer (their category page and every
// article under it) show the notice in mocktails only mode. Reads only the
// route param, so the Learn pages stay static (spec 0053).
export default async function LearnCategoryLayout({
  children,
  params,
}: LayoutProps<"/[locale]/learn/[category]">) {
  const { category } = await params;
  return isMocktailsHiddenLearnCategory(category) ? (
    <MocktailsHiddenArea>{children}</MocktailsHiddenArea>
  ) : (
    children
  );
}
