import Link from "next/link";
import { slugify } from "@bartendingapp/shared";

export function RegionShortcutRow({ regions }: { regions: string[] }) {
  if (regions.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-two px-six" role="group" aria-label="Popular by region">
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
