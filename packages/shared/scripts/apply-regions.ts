// Apply step for spec 0010 (popular drinks by region).
// Reads the engineer reviewed proposal file and commits it to the live
// database in one transaction, under an advisory lock (matching spec 0002's
// import job pattern). Run only after tag-regions.ts and a manual review of
// its output (AC-7); this script never runs on its own.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... pnpm apply-regions
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import type { Database } from "../src/database.types";

const REVIEW_FILE_PATH = new URL(
  "./tagging/popular-by-region-proposals.json",
  import.meta.url,
).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const FIXED_REGIONS = new Set([
  "Mexican",
  "Cuban",
  "Caribbean",
  "American",
  "British",
  "Italian",
  "French",
  "Asian",
  "International/Global",
]);

interface Proposal {
  id: string;
  name: string;
  region: string | null;
  fame_score: number | null;
  reasoning: string;
}

function validate(proposals: Proposal[]): string[] {
  const errors: string[] = [];
  for (const p of proposals) {
    if (p.region !== null && !FIXED_REGIONS.has(p.region)) {
      errors.push(`${p.id} (${p.name}): region "${p.region}" is not in the fixed list`);
    }
    if (p.fame_score !== null && (p.fame_score < 0 || p.fame_score > 100)) {
      errors.push(`${p.id} (${p.name}): fame_score ${p.fame_score} is out of range 0 to 100`);
    }
    if (p.region === null && p.fame_score !== null) {
      errors.push(`${p.id} (${p.name}): fame_score is set but region is null`);
    }
  }
  return errors;
}

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const raw = readFileSync(REVIEW_FILE_PATH, "utf-8");
  const proposals = JSON.parse(raw) as Proposal[];

  const errors = validate(proposals);
  if (errors.length > 0) {
    console.error("Validation failed, no writes made:");
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey);

  const { error } = await supabase.rpc("apply_region_proposals", {
    proposals: proposals.map((p) => ({
      id: p.id,
      region: p.region,
      fame_score: p.fame_score,
    })),
  });

  if (error) {
    console.error("Apply failed:", error);
    process.exit(1);
  }

  console.log(`Applied ${proposals.length} proposals. Region and popularity_rank are now live.`);
}

main();
