"use client";

import { useState } from "react";
import { useLocale } from "next-intl";
import {
  RECIPE_SEARCH_PAGE_SIZE,
  buildRecipeSlugPath,
  searchRecipes,
  type Locale,
} from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/button";
import { Link } from "@/i18n/navigation";
import { Text } from "@/components/text";

export function Hero() {
  const router = useRouter();
  const locale = useLocale() as Locale;
  const [isSurprising, setIsSurprising] = useState(false);

  const onSurpriseMe = async () => {
    setIsSurprising(true);
    try {
      const results = await searchRecipes(supabase, {
        query: "",
        pageLimit: RECIPE_SEARCH_PAGE_SIZE,
        pageOffset: 0,
        locale,
      });

      if (results.length === 0) {
        return;
      }

      const pick = results[Math.floor(Math.random() * results.length)];
      router.push(`/recipes/${buildRecipeSlugPath(pick.id, pick.name)}`);
    } finally {
      setIsSurprising(false);
    }
  };

  return (
    <section className="flex flex-col items-start gap-three p-six">
      <Text variant="display" as="h1">
        What are you drinking tonight?
      </Text>
      <Text variant="body" muted>
        Drink ideas from your pantry, recommendations, and popular drinks by region.
      </Text>
      <div className="flex items-center gap-three">
        <Link
          href="/search"
          className="inline-flex items-center justify-center gap-two rounded-medium bg-accent px-four py-two text-label font-medium text-accent-text transition-colors hover:opacity-90"
        >
          Search recipes
        </Link>
        <Button variant="secondary" onClick={onSurpriseMe} disabled={isSurprising}>
          Surprise me
        </Button>
      </div>
    </section>
  );
}
