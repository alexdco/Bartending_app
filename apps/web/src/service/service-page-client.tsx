"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { Input } from "@/components/input";
import { Spinner } from "@/components/spinner";
import { Text } from "@/components/text";
import { useSession } from "@/auth/use-session";
import { useCurrentBar } from "@/service/use-current-bar";
import { useBarServiceData } from "@/service/use-bar-service-data";
import { useCreateBar, useToggleStock } from "@/service/use-bar-mutations";
import { usePinnedRecipes } from "@/service/use-pinned-recipes";

function BarSwitcher({
  bars,
  currentBarId,
  onSelect,
}: {
  bars: { id: string; name: string }[];
  currentBarId: string | null;
  onSelect: (barId: string) => void;
}) {
  const t = useTranslations("service");

  return (
    <div className="flex flex-wrap gap-two" role="group" aria-label={t("selectBar")}>
      {bars.map((bar) => (
        <Button
          key={bar.id}
          variant={bar.id === currentBarId ? "primary" : "secondary"}
          onClick={() => onSelect(bar.id)}
        >
          {bar.name}
        </Button>
      ))}
    </div>
  );
}

function CreateBarForm() {
  const t = useTranslations("service");
  const [name, setName] = useState("");
  const createBar = useCreateBar();

  return (
    <div className="flex w-full flex-col gap-two">
      <Input
        label={t("barName")}
        placeholder={t("barNamePlaceholder")}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <Button
        disabled={name.trim() === "" || createBar.isPending}
        onClick={() => createBar.mutate(name.trim(), { onSuccess: () => setName("") })}
      >
        {createBar.isPending ? t("creating") : t("createBar")}
      </Button>
      {createBar.isError && (
        <Text variant="bodySmall" className="text-danger">
          {t("createBarFailed")}
        </Text>
      )}
    </div>
  );
}

function WorkingSoloPanel({ isLinked }: { isLinked: boolean }) {
  const t = useTranslations("service");

  return (
    <div className="flex flex-col gap-two">
      <Text variant="subheading">{t("workingSolo")}</Text>
      <Text variant="bodySmall" muted>
        {t("workingSoloDescription")}
      </Text>
      {isLinked ? (
        <div className="flex w-full flex-col gap-two">
          <CreateBarForm />
          <Link href="/service/invites">
            <Button variant="secondary" className="w-full">
              {t("haveInvite")}
            </Button>
          </Link>
        </div>
      ) : (
        <Link href="/account">
          <Button variant="secondary" className="w-full">
            {t("signInToCreateOrJoin")}
          </Button>
        </Link>
      )}
    </div>
  );
}

function CurrentMenuSection({ barId }: { barId: string }) {
  const t = useTranslations("service");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const serviceData = useBarServiceData(barId);
  const toggleStock = useToggleStock(barId);

  if (serviceData.isPending) {
    return (
      <div className="flex items-center justify-center py-six">
        <Spinner label={t("loadingBar")} />
      </div>
    );
  }

  if (serviceData.error) {
    return (
      <EmptyState
        title={t("loadBarFailed")}
        description={t("checkConnection")}
        action={<Button onClick={() => serviceData.refetch()}>{tCommon("retry")}</Button>}
      />
    );
  }

  const data = serviceData.data;
  if (!data) {
    return null;
  }

  const stock86Ids = new Set(
    data.stock86.filter((entry) => entry.is86d).map((entry) => entry.ingredientId),
  );

  return (
    <div className="flex flex-col gap-two">
      <Text variant="subheading">{t("currentMenu")}</Text>
      <div className="flex flex-wrap gap-two">
        <Link href="/service/recipes/new">
          <Button variant="secondary">{t("addHouseRecipe")}</Button>
        </Link>
        <Link href="/service/invite">
          <Button variant="secondary">{t("inviteStaff")}</Button>
        </Link>
      </div>

      {data.menu.length === 0 ? (
        <Text variant="bodySmall" muted>
          {t("menuEmpty")}
        </Text>
      ) : (
        <div className="flex flex-col gap-one">
          {data.menu
            .filter((item) => item.active)
            .map((item) => {
              const recipe = data.houseRecipes.find((r) => r.id === item.barRecipeId);
              const eightySixedNames = (recipe?.ingredients ?? [])
                .filter((ingredient) => stock86Ids.has(ingredient.ingredientId))
                .map((ingredient) => ingredient.name);

              return (
                <Button
                  key={item.id}
                  variant="secondary"
                  className="w-full justify-start"
                  onClick={() => router.push(`/service/build/bar_recipe/${item.barRecipeId}`)}
                >
                  {`${item.name}${eightySixedNames.length > 0 ? "  ⚠" : ""}`}
                </Button>
              );
            })}
        </div>
      )}

      <Text variant="subheading">{t("list86")}</Text>
      {data.houseRecipes.length === 0 ? (
        <Text variant="bodySmall" muted>
          {t("noHouseIngredients")}
        </Text>
      ) : (
        <div className="flex flex-col gap-one">
          {Array.from(
            new Map(
              data.houseRecipes.flatMap((recipe) =>
                recipe.ingredients.map((ingredient) => [ingredient.ingredientId, ingredient.name]),
              ),
            ),
          ).map(([ingredientId, name]) => {
            const is86d = stock86Ids.has(ingredientId);
            return (
              <div key={ingredientId} className="flex items-center justify-between gap-two py-one">
                <Text variant="body">{name}</Text>
                <Button
                  variant={is86d ? "primary" : "secondary"}
                  onClick={() => toggleStock.mutate({ ingredientId, is86d: !is86d })}
                >
                  {is86d ? t("is86d") : t("inStock")}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ServicePageClient() {
  const router = useRouter();
  const t = useTranslations("service");
  const tNav = useTranslations("nav");
  const tCommon = useTranslations("common");
  const { isLinked } = useSession();
  // Spec 0038 AC-6: fail fast so the bar error and Retry show within a second.
  const currentBar = useCurrentBar({ retry: 1 });
  const pinned = usePinnedRecipes();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-four px-four py-six">
      <Text variant="display">{tNav("service")}</Text>

      <Input
        label={t("search")}
        placeholder={t("searchPlaceholder")}
        onFocus={() => router.push("/service/search")}
        readOnly
      />

      {currentBar.showSwitcher && (
        <BarSwitcher
          bars={currentBar.bars}
          currentBarId={currentBar.currentBar?.id ?? null}
          onSelect={currentBar.selectBar}
        />
      )}

      <Card className="flex flex-col gap-two">
        <Text variant="subheading">{t("pinnedCocktails")}</Text>
        {pinned.isPending ? (
          <Spinner label={t("loadingPinned")} />
        ) : (pinned.data ?? []).length === 0 ? (
          <Text variant="bodySmall" muted>
            {t("pinnedEmpty")}
          </Text>
        ) : (
          <div className="flex flex-col gap-one">
            {(pinned.data ?? []).map((pin) => (
              <Button
                key={pin.id}
                variant="secondary"
                className="w-full justify-start"
                onClick={() =>
                  router.push(
                    pin.recipeId
                      ? `/service/build/recipe/${pin.recipeId}`
                      : `/service/build/bar_recipe/${pin.barRecipeId}`,
                  )
                }
              >
                {pin.recipeId ? t("catalogCocktail") : t("houseCocktail")}
              </Button>
            ))}
          </div>
        )}
      </Card>

      {!isLinked ? (
        <Card>
          <WorkingSoloPanel isLinked={false} />
        </Card>
      ) : currentBar.isError ? (
        <Card>
          <EmptyState
            title={t("loadBarFailed")}
            description={t("checkConnection")}
            action={<Button onClick={currentBar.refetch}>{tCommon("retry")}</Button>}
          />
        </Card>
      ) : currentBar.isLoading ? (
        <div className="flex justify-center py-six">
          <Spinner label={t("loadingBar")} />
        </div>
      ) : currentBar.currentBar ? (
        <Card>
          <CurrentMenuSection barId={currentBar.currentBar.id} />
        </Card>
      ) : (
        <Card>
          <WorkingSoloPanel isLinked />
        </Card>
      )}
    </div>
  );
}
