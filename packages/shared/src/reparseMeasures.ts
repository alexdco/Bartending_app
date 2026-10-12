// Pure planning for the one time reparse of recipe_ingredients (spec 0035
// AC-9): runs the shared parser over every row's measure and returns only
// the rows whose stored amount_value/amount_unit differ from the result,
// plus before/after counts. The I/O (paging reads, updates) lives in
// scripts/reparse-measures.ts. Kept out of the index barrel: only that
// script uses it.
// Spec: docs/specs/0035-batch-calculator-correctness/index.md

import { parseMeasure } from "./units";

export interface StoredMeasureRow {
  recipe_id: string;
  ingredient_id: string;
  measure: string | null;
  amount_value: number | null;
  amount_unit: string | null;
}

export interface MeasureUpdate {
  recipe_id: string;
  ingredient_id: string;
  amount_value: number | null;
  amount_unit: string | null;
}

export interface MeasureCounts {
  parsedLines: number;
  linesPerUnit: Readonly<Record<string, number>>;
}

export interface ReparsePlan {
  updates: MeasureUpdate[];
  before: MeasureCounts;
  after: MeasureCounts;
}

// Stored numerics round trip through JSON; a tiny tolerance keeps a rerun
// from flagging a value that only differs in its last binary digit.
const VALUE_TOLERANCE = 1e-9;

function sameValue(a: number | null, b: number | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  return Math.abs(Number(a) - b) < VALUE_TOLERANCE;
}

function countMeasures(
  rows: readonly Pick<MeasureUpdate, "amount_value" | "amount_unit">[],
): MeasureCounts {
  const parsed = rows.filter((row) => row.amount_value !== null && row.amount_unit !== null);
  const linesPerUnit = parsed.reduce<Record<string, number>>(
    (counts, row) => ({ ...counts, [row.amount_unit!]: (counts[row.amount_unit!] ?? 0) + 1 }),
    {},
  );
  return { parsedLines: parsed.length, linesPerUnit };
}

/** Plans the reparse: a null or empty measure gives null for both columns; unchanged rows are skipped. */
export function planReparse(rows: readonly StoredMeasureRow[]): ReparsePlan {
  const reparsed: MeasureUpdate[] = rows.map((row) => {
    const parsed = parseMeasure(row.measure);
    return {
      recipe_id: row.recipe_id,
      ingredient_id: row.ingredient_id,
      amount_value: parsed?.value ?? null,
      amount_unit: parsed?.unit ?? null,
    };
  });

  const updates = reparsed.filter(
    (next, index) =>
      !sameValue(rows[index].amount_value, next.amount_value) ||
      rows[index].amount_unit !== next.amount_unit,
  );

  return { updates, before: countMeasures(rows), after: countMeasures(reparsed) };
}
