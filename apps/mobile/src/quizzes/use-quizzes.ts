import { useQuery } from "@tanstack/react-query";
import {
  fetchQuizAttempt,
  fetchQuizBySource,
  fetchQuizDetail,
  fetchQuizzes,
  type QuizSourceType,
} from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";

export function useQuizzes() {
  return useQuery({
    queryKey: ["quizzes"] as const,
    queryFn: () => fetchQuizzes(supabase),
  });
}

export function useQuizDetail(id: string) {
  return useQuery({
    queryKey: ["quiz", id] as const,
    queryFn: () => fetchQuizDetail(supabase, id),
  });
}

export function useQuizAttempt(quizId: string) {
  return useQuery({
    queryKey: ["quiz-attempt", quizId] as const,
    queryFn: () => fetchQuizAttempt(supabase, quizId),
  });
}

export function useQuizBySource(sourceType: QuizSourceType, sourceRef: string | null) {
  return useQuery({
    queryKey: ["quiz-by-source", sourceType, sourceRef] as const,
    queryFn: () => fetchQuizBySource(supabase, sourceType, sourceRef!),
    enabled: sourceRef !== null,
  });
}
