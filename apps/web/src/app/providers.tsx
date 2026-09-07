"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ensureAnonymousSession } from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  useEffect(() => {
    ensureAnonymousSession(supabase).catch((error) => {
      console.error("Failed to establish a guest session", error);
    });
  }, []);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
