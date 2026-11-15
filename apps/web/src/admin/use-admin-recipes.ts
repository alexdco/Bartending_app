"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import {
  ADMIN_RECIPES_PAGE_SIZE,
  fetchAdminRecipes,
  type AdminRecipeStatus,
  type AdminRecipeSummary,
} from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";

export function adminRecipesQueryKey(query: string, status: AdminRecipeStatus) {
  return ["recipes", "admin-list", status, query] as const;
}

interface AdminRecipesPage {
  recipes: AdminRecipeSummary[];
  hasMore: boolean;
}

export function useAdminRecipes(query: string, status: AdminRecipeStatus) {
  return useInfiniteQuery({
    queryKey: adminRecipesQueryKey(query, status),
    queryFn: ({ pageParam }): Promise<AdminRecipesPage> =>
      fetchAdminRecipes(supabase, {
        query,
        status,
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
