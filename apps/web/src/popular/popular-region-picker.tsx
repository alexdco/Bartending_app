"use client";

import Link from "next/link";
import { slugify } from "@bartendingapp/shared";
import { Chip } from "@/components/chip";

export function PopularRegionPicker({
  regions,
  selectedRegion,
}: {
  regions: string[];
  selectedRegion: string;
}) {
  return (
    <div className="flex flex-wrap gap-two" role="group" aria-label="Region">
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
