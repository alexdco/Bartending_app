import { getLocale } from "next-intl/server";
import { listPopularRegions, slugify, type Locale } from "@bartendingapp/shared";
import { BackButton } from "@/components/back-button";
import { permanentRedirect, redirect } from "@/i18n/navigation";
import { EmptyState } from "@/components/empty-state";
import { Text } from "@/components/text";
import { supabasePublic } from "@/lib/supabase-public";

export default async function PopularPage({
  searchParams,
}: {
  searchParams: Promise<{ region?: string }>;
}) {
  const { region } = await searchParams;
  const regions = await listPopularRegions(supabasePublic);
  const locale = (await getLocale()) as Locale;

  if (region) {
    const matched = regions.find((candidate) => candidate === region);
    if (matched) {
      permanentRedirect({ href: `/popular/${slugify(matched, "region")}`, locale });
    }
  }

  const firstRegion = regions[0];
  if (!firstRegion) {
    return (
      <div className="flex flex-col gap-four p-six">
        <BackButton />
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

  redirect({ href: `/popular/${slugify(firstRegion, "region")}`, locale });
}
