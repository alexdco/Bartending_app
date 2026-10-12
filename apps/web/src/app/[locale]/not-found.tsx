import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { EmptyState } from "@/components/empty-state";

// Next reads metadata from a segment's not-found module when it renders that
// boundary, so the layout's title template applies here too.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common");
  return { title: t("notFoundTitle") };
}

export default function LocaleNotFound() {
  const t = useTranslations("common");

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-four py-six">
      <EmptyState
        title={t("notFoundTitle")}
        description={t("notFoundBody")}
        action={
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-two rounded-medium bg-accent px-four py-two text-label font-medium text-accent-text transition-colors hover:opacity-90"
          >
            {t("goHome")}
          </Link>
        }
      />
    </main>
  );
}
