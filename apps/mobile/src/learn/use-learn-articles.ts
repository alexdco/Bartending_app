import { useQuery } from "@tanstack/react-query";
import {
  fetchArticleDetail,
  fetchArticlesByCategory,
  type LearnCategory,
} from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";

export function useLearnArticles(category: LearnCategory) {
  return useQuery({
    queryKey: ["learn-articles", category] as const,
    queryFn: () => fetchArticlesByCategory(supabase, category),
  });
}

export function useLearnArticleDetail(category: LearnCategory, id: string) {
  return useQuery({
    queryKey: ["learn-article", category, id] as const,
    queryFn: () => fetchArticleDetail(supabase, id, category),
  });
}
