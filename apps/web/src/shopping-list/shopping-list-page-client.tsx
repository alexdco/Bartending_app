"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { Input } from "@/components/input";
import { Spinner } from "@/components/spinner";
import { Text } from "@/components/text";
import { useIngredientSearch } from "@/pantry/use-ingredient-search";
import { PantryShoppingSwitcher } from "@/pantry/pantry-shopping-switcher";
import { useShoppingList } from "./use-shopping-list";
import {
  useAddShoppingListItem,
  useBuyShoppingListItem,
  useRemoveShoppingListItem,
} from "./use-shopping-list-mutations";

const DEBOUNCE_MS = 300;

export function ShoppingListPageClient() {
  const t = useTranslations("shoppingList");
  const tCommon = useTranslations("common");
  const [inputValue, setInputValue] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQuery(inputValue.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [inputValue]);

  const shoppingList = useShoppingList();
  const ingredientSearch = useIngredientSearch(debouncedQuery);
  const addShoppingListItem = useAddShoppingListItem();
  const removeShoppingListItem = useRemoveShoppingListItem();
  const buyShoppingListItem = useBuyShoppingListItem();

  const shoppingListIds = useMemo(
    () => new Set((shoppingList.data ?? []).map((item) => item.ingredientId)),
    [shoppingList.data],
  );

  return (
    <div className="flex flex-col gap-four p-six">
      <BackButton />
      <div className="flex items-center gap-two">
        <Text variant="display" as="h1">
          {t("title")}
        </Text>
        <PantryShoppingSwitcher />
      </div>

      <div className="flex flex-col gap-two">
        <Input
          label={t("addIngredient")}
          placeholder={t("addIngredientPlaceholder")}
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
        />
        {debouncedQuery !== "" && (
          <div className="flex flex-col gap-one rounded-medium border border-border bg-surface p-two">
            {ingredientSearch.isPending ? (
              <div className="flex justify-center py-two">
                <Spinner label={t("searchingIngredients")} />
              </div>
            ) : (ingredientSearch.data ?? []).length === 0 ? (
              <Text variant="bodySmall" muted>
                {t("noMatchingIngredients")}
              </Text>
            ) : (
              (ingredientSearch.data ?? []).map((ingredient) => {
                const alreadyAdded = shoppingListIds.has(ingredient.id);
                return (
                  <div
                    key={ingredient.id}
                    className="flex items-center justify-between gap-two px-two py-one"
                  >
                    <Text variant="body">{ingredient.name}</Text>
                    <Button
                      variant="secondary"
                      disabled={alreadyAdded}
                      onClick={() =>
                        addShoppingListItem.mutate(
                          { ingredientId: ingredient.id, name: ingredient.name },
                          { onSuccess: () => setInputValue("") },
                        )
                      }
                    >
                      {alreadyAdded ? tCommon("added") : tCommon("add")}
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {addShoppingListItem.isError && (
        <Text variant="bodySmall" className="text-danger" role="alert">
          {t("addFailed")}
        </Text>
      )}
      {removeShoppingListItem.isError && (
        <Text variant="bodySmall" className="text-danger" role="alert">
          {t("removeFailed")}
        </Text>
      )}
      {buyShoppingListItem.isError && (
        <Text variant="bodySmall" className="text-danger" role="alert">
          {t("buyFailed")}
        </Text>
      )}

      <section className="flex flex-col gap-two">
        {shoppingList.error ? (
          <EmptyState
            title={tCommon("somethingWentWrong")}
            description={t("loadError")}
            action={<Button onClick={() => shoppingList.refetch()}>{tCommon("retry")}</Button>}
          />
        ) : shoppingList.isPending ? (
          <div className="flex justify-center py-six">
            <Spinner label={t("loading")} />
          </div>
        ) : (shoppingList.data ?? []).length === 0 ? (
          <EmptyState title={t("emptyTitle")} description={t("emptyDescription")} />
        ) : (
          <ul className="flex flex-col gap-one">
            {(shoppingList.data ?? []).map((item) => (
              <li
                key={item.ingredientId}
                className="flex items-center justify-between gap-two rounded-medium border border-border bg-surface px-three py-two"
              >
                <Text variant="body">{item.name}</Text>
                <div className="flex items-center gap-two">
                  <Button
                    variant="primary"
                    onClick={() => buyShoppingListItem.mutate({ ingredientId: item.ingredientId })}
                  >
                    {t("bought")}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      removeShoppingListItem.mutate({ ingredientId: item.ingredientId })
                    }
                  >
                    {tCommon("remove")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
