// Pure validation for the reviewed region and fame proposals file that
// scripts/apply-regions.ts commits (spec 0010, amended by spec 0038 AC-1):
// every recipe carries a fame score from 0 to 100, region stays optional.
// The I/O lives in the script. Kept out of the index barrel: only that
// script uses it.
// Spec: docs/specs/0038-empty-states-ux-accessibility/index.md

export const FIXED_REGIONS = [
  "Mexican",
  "Cuban",
  "Caribbean",
  "American",
  "British",
  "Italian",
  "French",
  "Asian",
  "International/Global",
] as const;

export type FixedRegion = (typeof FIXED_REGIONS)[number];

export interface RegionProposal {
  readonly id: string;
  readonly name: string;
  readonly region: string | null;
  readonly fame_score: number | null;
  readonly reasoning: string;
}

const FIXED_REGION_SET: ReadonlySet<string> = new Set(FIXED_REGIONS);

function proposalErrors(p: RegionProposal): readonly string[] {
  const label = `${p.id} (${p.name})`;
  const regionError =
    p.region !== null && !FIXED_REGION_SET.has(p.region)
      ? [`${label}: region "${p.region}" is not in the fixed list`]
      : [];
  const fameError =
    typeof p.fame_score !== "number" || !Number.isInteger(p.fame_score)
      ? [`${label}: fame_score is missing`]
      : p.fame_score < 0 || p.fame_score > 100
        ? [`${label}: fame_score ${p.fame_score} is out of range 0 to 100`]
        : [];
  return [...regionError, ...fameError];
}

export function validateRegionProposals(proposals: readonly RegionProposal[]): readonly string[] {
  return proposals.flatMap(proposalErrors);
}
