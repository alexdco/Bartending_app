"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import {
  ADMIN_RECIPES_PAGE_SIZE,
  fetchAdminRecipes,
  type AdminRecipeSummary,
} from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";

export function adminRecipesQueryKey(query: string) {
  return ["recipes", "admin-list", query] as const;
}

interface AdminRecipesPage {
  recipes: AdminRecipeSummary[];
  hasMore: boolean;
}

export function useAdminRecipes(query: string) {
  return useInfiniteQuery({
    queryKey: adminRecipesQueryKey(query),
    queryFn: ({ pageParam }): Promise<AdminRecipesPage> =>
      fetchAdminRecipes(supabase, {
        query,
        pageLimit: ADMIN_RECIPES_PAGE_SIZE,
        beforeCreatedAt: pageParam?.beforeCreatedAt,
        beforeId: pageParam?.beforeId,
      }),
    initialPageParam: undefined as { beforeCreatedAt: string; beforeId: string } | undefined,
    getNextPageParam: (lastPage) => {
      if (!lastPage.hasMore) return undefined;
      const last = lastPage.recipes[lastPage.recipes.length - 1];
      return last ? { beforeCreatedAt: last.createdAt, beforeId: last.id } : undefined;
    },
  });
}
