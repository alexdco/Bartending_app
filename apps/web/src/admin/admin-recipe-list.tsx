"use client";

import { useMemo, useState } from "react";
import type { AdminRecipeSummary } from "@bartendingapp/shared";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { Input } from "@/components/input";
import { Spinner } from "@/components/spinner";
import { Text } from "@/components/text";
import { useAdminRecipes } from "./use-admin-recipes";
import { useDeleteAdminRecipe } from "./use-admin-recipe-mutations";

export function AdminRecipeList() {
  const [query, setQuery] = useState("");
  const { data, error, isPending, isFetchingNextPage, hasNextPage, fetchNextPage } =
    useAdminRecipes(query);

  const recipes = useMemo(() => data?.pages.flatMap((page) => page.recipes) ?? [], [data]);

  return (
    <div className="flex flex-col gap-four">
      <div className="flex items-center justify-between gap-three">
        <Input
          label="Search recipes"
          placeholder="Search by name"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="max-w-sm"
        />
        <Link
          href="/admin/recipes/new"
          className="inline-flex items-center justify-center gap-two rounded-medium bg-accent px-four py-two text-label font-medium text-accent-text transition-colors hover:opacity-90"
        >
          Add recipe
        </Link>
      </div>

      {error ? (
        <Text variant="bodySmall" muted>
          Couldn&apos;t load recipes. Try again later.
        </Text>
      ) : isPending ? (
        <div className="flex justify-center py-four">
          <Spinner label="Loading recipes" />
        </div>
      ) : recipes.length === 0 ? (
        <EmptyState title="No recipes found" description="Try a different search." />
      ) : (
        <div className="flex flex-col gap-three">
          <ul className="flex flex-col gap-three">
            {recipes.map((recipe) => (
              <li key={recipe.id}>
                <AdminRecipeRow recipe={recipe} />
              </li>
            ))}
          </ul>
          {hasNextPage && (
            <Button
              variant="secondary"
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className="self-center"
            >
              {isFetchingNextPage ? "Loading..." : "Load more"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function AdminRecipeRow({ recipe }: { recipe: AdminRecipeSummary }) {
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const deleteRecipe = useDeleteAdminRecipe();

  return (
    <div className="flex items-center justify-between gap-three rounded-medium border border-border p-three">
      <div className="flex flex-col gap-one">
        <div className="flex items-center gap-two">
          <Text variant="label">{recipe.name}</Text>
          <span className="rounded-small bg-surface-selected px-two py-0.5 text-body-small text-text-muted">
            {recipe.source}
          </span>
        </div>
        <Text variant="bodySmall" muted>
          {recipe.glass ?? "No glass"} &middot; {recipe.alcoholicStatus}
        </Text>
      </div>
      <div className="flex gap-two">
        <Link
          href={`/admin/recipes/${recipe.id}/edit`}
          className="inline-flex items-center justify-center gap-two rounded-medium border border-border bg-surface px-four py-two text-label font-medium text-text transition-colors hover:bg-surface-selected"
        >
          Edit
        </Link>
        {isConfirmingDelete ? (
          <>
            <Button variant="secondary" onClick={() => setIsConfirmingDelete(false)}>
              Cancel
            </Button>
            <Button
              disabled={deleteRecipe.isPending}
              onClick={() => deleteRecipe.mutate(recipe.id)}
            >
              Delete
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={() => setIsConfirmingDelete(true)}>
            Delete
          </Button>
        )}
      </div>
    </div>
  );
}
