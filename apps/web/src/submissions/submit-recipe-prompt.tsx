"use client";

import { useTranslations } from "next-intl";
import { useSession } from "@/auth/use-session";
import { Link } from "@/i18n/navigation";
import { Text } from "@/components/text";

/**
 * "Can't find it? Submit your recipe" at the end of search results and on the
 * empty state (spec 0064 AC-21). Guests get the same prompt, linking to sign
 * in. The caller hides it in mocktails only mode (AC-20).
 */
export function SubmitRecipePrompt() {
  const t = useTranslations("submissions");
  const { isLinked } = useSession();

  return (
    <Text variant="bodySmall" muted className="text-center" data-mocktails="hide">
      {t("searchPrompt")}{" "}
      <Link
        href={isLinked ? "/my-recipes/new" : "/account"}
        className="font-medium text-text underline underline-offset-4"
      >
        {t("searchPromptAction")}
      </Link>
    </Text>
  );
}
