import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { listPopularRegions, slugify, type Locale } from "@bartendingapp/shared";
import { BackButton } from "@/components/back-button";
import { permanentRedirect, redirect } from "@/i18n/navigation";
import { EmptyState } from "@/components/empty-state";
import { LinkButton } from "@/components/link-button";
import { Text } from "@/components/text";
import { supabasePublic } from "@/lib/supabase-public";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("popular");
  return { title: t("title"), description: t("indexMetaDescription") };
}

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
    const t = await getTranslations("popular");
    return (
      <div className="flex flex-col gap-four p-six">
        <BackButton />
        <Text variant="display" as="h1">
          {t("title")}
        </Text>
        <EmptyState
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          action={<LinkButton href="/search">{t("browseAll")}</LinkButton>}
        />
      </div>
    );
  }

  redirect({ href: `/popular/${slugify(firstRegion, "region")}`, locale });
}
