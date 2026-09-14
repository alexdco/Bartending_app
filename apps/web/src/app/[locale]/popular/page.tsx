import { permanentRedirect, redirect } from "next/navigation";
import { listPopularRegions, slugify } from "@bartendingapp/shared";
import { EmptyState } from "@/components/empty-state";
import { Text } from "@/components/text";
import { supabase } from "@/lib/supabase";

export default async function PopularPage({
  searchParams,
}: {
  searchParams: Promise<{ region?: string }>;
}) {
  const { region } = await searchParams;
  const regions = await listPopularRegions(supabase);

  if (region) {
    const matched = regions.find((candidate) => candidate === region);
    if (matched) {
      permanentRedirect(`/popular/${slugify(matched, "region")}`);
    }
  }

  const firstRegion = regions[0];
  if (!firstRegion) {
    return (
      <div className="flex flex-col gap-four p-six">
        <Text variant="display" as="h1">
          Popular drinks by region
        </Text>
        <EmptyState
          title="No popular drinks yet"
          description="Regions haven't been tagged yet. Check back soon."
        />
      </div>
    );
  }

  redirect(`/popular/${slugify(firstRegion, "region")}`);
}
