"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { slugify } from "@bartendingapp/shared";
import { Chip } from "@/components/chip";

export function PopularRegionPicker({
  regions,
  selectedRegion,
}: {
  regions: string[];
  selectedRegion: string;
}) {
  const t = useTranslations("popular");

  return (
    <div className="flex flex-wrap gap-two" role="group" aria-label={t("region")}>
      {regions.map((region) => (
        <Link key={region} href={`/popular/${slugify(region, "region")}`}>
          <Chip selected={region === selectedRegion} onSelectedChange={() => {}}>
            {region}
          </Chip>
        </Link>
      ))}
    </div>
  );
}
