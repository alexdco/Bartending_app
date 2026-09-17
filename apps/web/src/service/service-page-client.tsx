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
  return (
    <div className="flex flex-wrap gap-two" role="group" aria-label="Select a bar">
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
  const [name, setName] = useState("");
  const createBar = useCreateBar();

  return (
    <div className="flex w-full flex-col gap-two">
      <Input
        label="Bar name"
        placeholder="Riverside Bar"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <Button
        disabled={name.trim() === "" || createBar.isPending}
        onClick={() => createBar.mutate(name.trim(), { onSuccess: () => setName("") })}
      >
        {createBar.isPending ? "Creating..." : "Create bar"}
      </Button>
      {createBar.isError && (
        <Text variant="bodySmall" className="text-danger">
          Couldn&apos;t create the bar. Check your connection and try again.
        </Text>
      )}
    </div>
  );
}

function NoBarJoined() {
  return (
    <EmptyState
      title="No bar joined yet"
      description="Create a bar, or accept an invite if an owner already sent you one. Search and your pinned cocktails still work without one."
      action={
        <div className="flex w-full flex-col gap-two">
          <CreateBarForm />
          <Link href="/service/invites">
            <Button variant="secondary" className="w-full">
              I have an invite
            </Button>
          </Link>
        </div>
      }
    />
  );
}

function CurrentMenuSection({ barId }: { barId: string }) {
  const router = useRouter();
  const serviceData = useBarServiceData(barId);
  const toggleStock = useToggleStock(barId);

  if (serviceData.isPending) {
    return (
      <div className="flex items-center justify-center py-six">
        <Spinner label="Loading bar data" />
      </div>
    );
  }

  if (serviceData.error) {
    return (
      <EmptyState
        title="Couldn't load this bar"
        description="Check your connection and try again."
        action={<Button onClick={() => serviceData.refetch()}>Retry</Button>}
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
      <Text variant="subheading">Current menu</Text>
      <div className="flex flex-wrap gap-two">
        <Link href="/service/recipes/new">
          <Button variant="secondary">Add house recipe</Button>
        </Link>
        <Link href="/service/invite">
          <Button variant="secondary">Invite staff</Button>
        </Link>
      </div>

      {data.menu.length === 0 ? (
        <Text variant="bodySmall" muted>
          Nothing on the menu yet.
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

      <Text variant="subheading">86 list</Text>
      {data.houseRecipes.length === 0 ? (
        <Text variant="bodySmall" muted>
          No house ingredients tracked yet.
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
                  {is86d ? "86'd" : "In stock"}
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
  const t = useTranslations("nav");
  const { isLinked } = useSession();
  const currentBar = useCurrentBar();
  const pinned = usePinnedRecipes();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-four px-four py-six">
      <Text variant="display">{t("service")}</Text>

      <Input
        label="Search"
        placeholder="old f, marg, esp mart..."
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
        <Text variant="subheading">Pinned cocktails</Text>
        {pinned.isPending ? (
          <Spinner label="Loading pinned cocktails" />
        ) : (pinned.data ?? []).length === 0 ? (
          <Text variant="bodySmall" muted>
            Pin a cocktail to see it here.
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
                {pin.recipeId ? "Catalog cocktail" : "House cocktail"}
              </Button>
            ))}
          </div>
        )}
      </Card>

      {!isLinked ? (
        <Card>
          <EmptyState
            title="No bar joined yet"
            description="Sign in with a real account to create or join a bar. Search and your pinned cocktails still work as a guest."
            action={
              <Link href="/account">
                <Button>Sign in</Button>
              </Link>
            }
          />
        </Card>
      ) : currentBar.isLoading ? null : currentBar.currentBar ? (
        <Card>
          <CurrentMenuSection barId={currentBar.currentBar.id} />
        </Card>
      ) : (
        <Card>
          <NoBarJoined />
        </Card>
      )}
    </div>
  );
}
