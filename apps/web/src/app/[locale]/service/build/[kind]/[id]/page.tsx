import { notFound } from "next/navigation";
import { QuickBuildPageClient } from "@/service/quick-build-page-client";
import type { QuickBuildKind } from "@/service/use-quick-build-recipe";

function isQuickBuildKind(value: string): value is QuickBuildKind {
  return value === "recipe" || value === "bar_recipe";
}

export default async function QuickBuildPage({
  params,
}: {
  params: Promise<{ kind: string; id: string }>;
}) {
  const { kind, id } = await params;

  if (!isQuickBuildKind(kind)) {
    notFound();
  }

  return (
    <main className="flex flex-1 flex-col">
      <QuickBuildPageClient kind={kind} id={id} />
    </main>
  );
}
