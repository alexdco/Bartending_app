import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { slugify } from "@bartendingapp/shared";

export function RegionShortcutRow({ regions }: { regions: string[] }) {
  const t = useTranslations("home");

  if (regions.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-two px-six" role="group" aria-label={t("popularByRegion")}>
      {regions.map((region) => (
        <Link
          key={region}
          href={`/popular/${slugify(region, "region")}`}
          className="inline-flex items-center rounded-full border border-border bg-surface px-three py-one text-label text-text transition-colors hover:bg-surface-selected"
        >
          {region}
        </Link>
      ))}
    </div>
  );
}
