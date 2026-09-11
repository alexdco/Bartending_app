"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { Input } from "@/components/input";
import { Spinner } from "@/components/spinner";
import { Text } from "@/components/text";
import { useIngredientSearch } from "./use-ingredient-search";
import { usePantry } from "./use-pantry";
import { useAddPantryItem, useRemovePantryItem } from "./use-pantry-mutations";

const DEBOUNCE_MS = 300;

export function PantryPageClient() {
  const [inputValue, setInputValue] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQuery(inputValue.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [inputValue]);

  const pantry = usePantry();
  const ingredientSearch = useIngredientSearch(debouncedQuery);
  const addPantryItem = useAddPantryItem();
  const removePantryItem = useRemovePantryItem();

  const pantryIds = useMemo(
    () => new Set((pantry.data ?? []).map((item) => item.ingredientId)),
    [pantry.data],
  );

  return (
    <div className="flex flex-col gap-four p-six">
      <Text variant="display" as="h1">
        Your pantry
      </Text>

      <div className="flex flex-col gap-two">
        <Input
          label="Add an ingredient"
          placeholder="Lime, gin, simple syrup..."
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
        />
        {debouncedQuery !== "" && (
          <div className="flex flex-col gap-one rounded-medium border border-border bg-surface p-two">
            {ingredientSearch.isPending ? (
              <div className="flex justify-center py-two">
                <Spinner label="Searching ingredients" />
              </div>
            ) : (ingredientSearch.data ?? []).length === 0 ? (
              <Text variant="bodySmall" muted>
                No matching ingredients.
              </Text>
            ) : (
              (ingredientSearch.data ?? []).map((ingredient) => {
                const alreadyAdded = pantryIds.has(ingredient.id);
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
                        addPantryItem.mutate(
                          { ingredientId: ingredient.id, name: ingredient.name },
                          { onSuccess: () => setInputValue("") },
                        )
                      }
                    >
                      {alreadyAdded ? "Added" : "Add"}
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {addPantryItem.isError && (
        <Text variant="bodySmall" className="text-danger" role="alert">
          Couldn&apos;t add that ingredient. Check your connection and try again.
        </Text>
      )}
      {removePantryItem.isError && (
        <Text variant="bodySmall" className="text-danger" role="alert">
          Couldn&apos;t remove that ingredient. Check your connection and try again.
        </Text>
      )}

      <section className="flex flex-col gap-two">
        <Text variant="heading" as="h2">
          In your pantry
        </Text>

        {pantry.error ? (
          <EmptyState
            title="Something went wrong"
            description="We couldn't load your pantry. Check your connection and try again."
            action={<Button onClick={() => pantry.refetch()}>Retry</Button>}
          />
        ) : pantry.isPending ? (
          <div className="flex justify-center py-six">
            <Spinner label="Loading pantry" />
          </div>
        ) : (pantry.data ?? []).length === 0 ? (
          <EmptyState
            title="Your pantry is empty"
            description="Search for an ingredient above to add it to your pantry."
          />
        ) : (
          <ul className="flex flex-col gap-one">
            {(pantry.data ?? []).map((item) => (
              <li
                key={item.ingredientId}
                className="flex items-center justify-between gap-two rounded-medium border border-border bg-surface px-three py-two"
              >
                <Text variant="body">{item.name}</Text>
                <Button
                  variant="secondary"
                  onClick={() => removePantryItem.mutate({ ingredientId: item.ingredientId })}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
