import { useQuery } from "@tanstack/react-query";
import {
  fetchQuickBuildBarRecipeDetail,
  fetchQuickBuildRecipeDetail,
  type QuickBuildBarRecipeDetail,
  type QuickBuildRecipeDetail,
} from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";

export type QuickBuildKind = "recipe" | "bar_recipe";

export function quickBuildRecipeQueryKey(kind: QuickBuildKind, id: string) {
  return ["quick-build-recipe", kind, id] as const;
}

type QuickBuildDetail = QuickBuildRecipeDetail | QuickBuildBarRecipeDetail;

export function useQuickBuildRecipe(kind: QuickBuildKind, id: string) {
  return useQuery<QuickBuildDetail | null>({
    queryKey: quickBuildRecipeQueryKey(kind, id),
    queryFn: async (): Promise<QuickBuildDetail | null> =>
      kind === "recipe"
        ? await fetchQuickBuildRecipeDetail(supabase, id)
        : await fetchQuickBuildBarRecipeDetail(supabase, id),
  });
}
