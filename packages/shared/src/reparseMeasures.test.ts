import { describe, expect, it } from "vitest";
import { planReparse, type StoredMeasureRow } from "./reparseMeasures";

function row(
  measure: string | null,
  amount_value: number | null,
  amount_unit: string | null,
  amount_max_value: number | null = null,
): StoredMeasureRow {
  return {
    recipe_id: "r",
    ingredient_id: measure ?? "none",
    measure,
    amount_value,
    amount_max_value,
    amount_unit,
  };
}

describe("planReparse (spec 0035 AC-9)", () => {
  it("updates only rows whose parsed amount changed", () => {
    const plan = planReparse([
      row("1 shot", null, null),
      row("1 1/2 oz", 1.5, "oz"),
      row("2 dashes", 2, "dash"),
      row("2 Wheels", null, null),
    ]);

    expect(plan.updates).toEqual([
      {
        recipe_id: "r",
        ingredient_id: "1 shot",
        amount_value: 1,
        amount_max_value: null,
        amount_unit: "shot",
      },
    ]);
  });

  it("writes counted units and lists every new each row (spec 0054 AC-3)", () => {
    const plan = planReparse([
      row("2 dashes", null, null),
      row("3 drops", null, null),
      row("1", null, null),
      row("1/2", 0.5, "each"),
    ]);

    expect(plan.updates.map((u) => [u.ingredient_id, u.amount_value, u.amount_unit])).toEqual([
      ["2 dashes", 2, "dash"],
      ["3 drops", 3, "drop"],
      ["1", 1, "each"],
    ]);
    expect(plan.eachUpdates.map((u) => u.ingredient_id)).toEqual(["1"]);
    expect(plan.after.linesPerUnit).toEqual({ dash: 1, drop: 1, each: 2 });
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

    expect(plan.before).toEqual({ parsedLines: 1, rangeLines: 0, linesPerUnit: { oz: 1 } });
    expect(plan.after).toEqual({ parsedLines: 2, rangeLines: 0, linesPerUnit: { part: 1, oz: 1 } });
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

describe("planReparse ranges (spec 0054 AC-3)", () => {
  it("writes amount_max_value and counts ranges", () => {
    const plan = planReparse([row("2-3 oz", null, null)]);

    expect(plan.updates).toEqual([
      {
        recipe_id: "r",
        ingredient_id: "2-3 oz",
        amount_value: 2,
        amount_max_value: 3,
        amount_unit: "oz",
      },
    ]);
    expect(plan.after.rangeLines).toBe(1);
  });

  it("changes nothing on a rerun, comparing all three columns by value", () => {
    expect(planReparse([row("2-3 oz", 2.0, "oz", 3.0)]).updates).toEqual([]);
  });

  it("clears a stale max when the measure is a single amount", () => {
    expect(planReparse([row("2 oz", 2, "oz", 3)]).updates).toEqual([
      {
        recipe_id: "r",
        ingredient_id: "2 oz",
        amount_value: 2,
        amount_max_value: null,
        amount_unit: "oz",
      },
    ]);
  });
});
