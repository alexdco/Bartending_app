"use client";

import { useEffect } from "react";
import { useMocktailsOnly } from "@/age-gate/age-gate-store";
import { useRouter } from "@/i18n/navigation";
import { MocktailsHiddenArea } from "@/mocktails/mocktails-hidden-area";

// Spec 0064 AC-20: My recipes and the submit routes are hidden in mocktails
// only mode. The hidden area keeps them out of view before hydration, then
// the redirect sends the visitor home.
export default function MyRecipesLayout({ children }: { children: React.ReactNode }) {
  const mocktailsOnly = useMocktailsOnly();
  const router = useRouter();

  useEffect(() => {
    if (mocktailsOnly) {
      router.replace("/");
    }
  }, [mocktailsOnly, router]);

  return <MocktailsHiddenArea>{children}</MocktailsHiddenArea>;
}
