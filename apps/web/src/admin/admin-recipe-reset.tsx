"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/button";
import { Text } from "@/components/text";
import { useResetAdminRecipe } from "./use-admin-recipe-mutations";

interface AdminRecipeResetProps {
  recipeId: string;
  /** A deleted recipe shows only this panel (no form), with its own notice. */
  isDeleted: boolean;
}

/**
 * Spec 0056 AC-6: "Reset to TheCocktailDB version" for a locked catalog
 * recipe, behind a confirm step. On success it returns to the recipe list,
 * where the Locked badge is gone; the next import restores the content.
 */
export function AdminRecipeReset({ recipeId, isDeleted }: AdminRecipeResetProps) {
  const t = useTranslations("admin");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [isConfirming, setIsConfirming] = useState(false);
  const reset = useResetAdminRecipe();
  const failed = reset.isError || (reset.data !== undefined && reset.data.error !== null);

  const handleReset = () => {
    reset.mutate(recipeId, {
      onSuccess: (result) => {
        if (result.error === null) {
          router.push("/admin/recipes");
        }
      },
    });
  };

  return (
    <section
      aria-labelledby="reset-heading"
      className="flex flex-col gap-two rounded-medium border border-border p-four"
    >
      <Text variant="label" as="h2" id="reset-heading">
        {t("resetHeading")}
      </Text>
      <Text variant="bodySmall" muted>
        {isDeleted ? t("resetDeletedDescription") : t("resetDescription")}
      </Text>
      {isConfirming ? (
        <div className="flex flex-col gap-two">
          <Text variant="bodySmall">{t("resetConfirm")}</Text>
          <div className="flex gap-two">
            <Button variant="secondary" onClick={() => setIsConfirming(false)}>
              {tCommon("cancel")}
            </Button>
            <Button disabled={reset.isPending} onClick={handleReset}>
              {t("resetConfirmAction")}
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" className="self-start" onClick={() => setIsConfirming(true)}>
          {t("resetToSource")}
        </Button>
      )}
      {failed && (
        <span role="alert" className="text-body-small text-danger">
          {t("resetFailed")}
        </span>
      )}
    </section>
  );
}
