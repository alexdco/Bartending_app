import { describe, expect, it } from "vitest";
import { planReparse, type StoredMeasureRow } from "./reparseMeasures";

function row(
  measure: string | null,
  amount_value: number | null,
  amount_unit: string | null,
): StoredMeasureRow {
  return { recipe_id: "r", ingredient_id: measure ?? "none", measure, amount_value, amount_unit };
}

describe("planReparse (spec 0035 AC-9)", () => {
  it("updates only rows whose parsed amount changed", () => {
    const plan = planReparse([
      row("1 shot", null, null),
      row("1 1/2 oz", 1.5, "oz"),
      row("2 dashes", null, null),
    ]);

    expect(plan.updates).toEqual([
      { recipe_id: "r", ingredient_id: "1 shot", amount_value: 1, amount_unit: "shot" },
    ]);
  });

  it("nulls both columns for a null or empty measure", () => {
    const plan = planReparse([row(null, 1, "oz"), row("", 2, "oz")]);

    expect(plan.updates.map((u) => [u.amount_value, u.amount_unit])).toEqual([
      [null, null],
      [null, null],
    ]);
  });

  it("reports counts before and after, per unit", () => {
    const plan = planReparse([row("3 parts", null, null), row("1 oz", 1, "oz")]);

    expect(plan.before).toEqual({ parsedLines: 1, linesPerUnit: { oz: 1 } });
    expect(plan.after).toEqual({ parsedLines: 2, linesPerUnit: { part: 1, oz: 1 } });
  });

  it("changes nothing on a second run", () => {
    const first = planReparse([row("1/3 part", null, null), row("1 ½ oz", null, null)]);
    const applied = first.updates.map((u) => ({
      ...u,
      measure: u.ingredient_id,
    }));

    expect(planReparse(applied).updates).toEqual([]);
  });
});
