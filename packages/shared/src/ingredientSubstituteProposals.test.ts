import { describe, expect, it } from "vitest";
import {
  buildSubstituteNoteTranslationsSql,
  buildSubstitutesApplySql,
  sanitizeProposedSubstitutes,
  validateSubstituteReviewFile,
  type SubstituteReviewEntry,
} from "./ingredientSubstituteProposals";

const LIME = "00000000-0000-4000-8000-000000000001";
const LEMON = "00000000-0000-4000-8000-000000000002";
const AGAVE = "00000000-0000-4000-8000-000000000003";
const UNKNOWN = "00000000-0000-4000-8000-000000000009";
const known = new Set([LIME, LEMON, AGAVE]);

function entry(overrides: Partial<SubstituteReviewEntry> = {}): SubstituteReviewEntry {
  return {
    id: LIME,
    name: "Lime Juice",
    category: "citrus",
    reviewed: true,
    substitutes: [{ id: LEMON, name: "Lemon Juice", ratio: 1, note: "  Less sharp  " }],
    ...overrides,
  };
}

describe("validateSubstituteReviewFile (AC-13)", () => {
  it("keeps reviewed entries with rank from order and trimmed notes, listing the rest", () => {
    const result = validateSubstituteReviewFile(
      [entry(), entry({ id: LEMON, name: "Lemon Juice", reviewed: false })],
      known,
    );
    expect(result).toEqual({
      ok: true,
      entries: [
        {
          ingredientId: LIME,
          name: "Lime Juice",
          substitutes: [{ substituteIngredientId: LEMON, rank: 1, ratio: 1, note: "Less sharp" }],
        },
      ],
      unreviewed: ["Lemon Juice"],
    });
  });

  it("turns a blank note into no note and rounds the ratio", () => {
    const result = validateSubstituteReviewFile(
      [entry({ substitutes: [{ id: LEMON, name: "Lemon Juice", ratio: 0.666, note: "   " }] })],
      known,
    );
    expect(result.ok && result.entries[0]?.substitutes[0]).toMatchObject({
      ratio: 0.67,
      note: null,
    });
  });

  it("rejects the whole file when a reviewed entry breaks a DB rule (AC-15)", () => {
    const sub = (id: string, ratio = 1, note: string | null = null) => ({
      id,
      name: id,
      ratio,
      note,
    });
    const result = validateSubstituteReviewFile(
      [
        entry({
          substitutes: [
            sub(LIME),
            sub(LEMON, 4.5),
            sub(LEMON),
            sub(UNKNOWN),
            sub(AGAVE, 1, "x".repeat(121)),
            sub(AGAVE),
          ],
        }),
      ],
      known,
    );
    expect(result.ok).toBe(false);
    const errors = result.ok ? [] : result.errors.join("\n");
    expect(errors).toContain("at most 5 allowed");
    expect(errors).toContain("for itself");
    expect(errors).toContain("outside 0.25 to 4");
    expect(errors).toContain("listed twice");
    expect(errors).toContain("not an ingredient in the catalog");
    expect(errors).toContain("at most 120 allowed");
  });

  it("does not check entries you have not reviewed yet", () => {
    const result = validateSubstituteReviewFile(
      [entry({ reviewed: false, substitutes: [{ id: LIME, name: "x", ratio: 9, note: null }] })],
      known,
    );
    expect(result).toMatchObject({ ok: true, entries: [], unreviewed: ["Lime Juice"] });
  });

  it("rejects a repeated ingredient and a malformed file", () => {
    expect(validateSubstituteReviewFile([entry(), entry()], known).ok).toBe(false);
    expect(validateSubstituteReviewFile([{ id: "nope" }], known).ok).toBe(false);
  });
});

describe("sanitizeProposedSubstitutes", () => {
  const catalog = new Map(
    [
      { id: LIME, name: "Lime Juice" },
      { id: LEMON, name: "Lemon Juice" },
      { id: AGAVE, name: "Agave Syrup" },
    ].map((ingredient) => [ingredient.id, ingredient]),
  );

  it("drops self, unknown, repeated, and out of range picks, and fills names", () => {
    expect(
      sanitizeProposedSubstitutes(
        LIME,
        [
          { id: LIME, ratio: 1, note: null },
          { id: UNKNOWN, ratio: 1, note: null },
          { id: LEMON, ratio: 1.004, note: " Fine " },
          { id: LEMON, ratio: 2, note: null },
          { id: AGAVE, ratio: 5, note: null },
        ],
        catalog,
      ),
    ).toEqual([{ id: LEMON, name: "Lemon Juice", ratio: 1, note: "Fine" }]);
  });

  it("clears an over long note so you write your own", () => {
    expect(
      sanitizeProposedSubstitutes(
        LIME,
        [{ id: LEMON, ratio: 1, note: "y".repeat(130) }],
        catalog,
      )[0]?.note,
    ).toBeNull();
  });
});

describe("buildSubstitutesApplySql (AC-13)", () => {
  it("deletes, inserts, and stamps each ingredient in one transaction", () => {
    const sql = buildSubstitutesApplySql([
      {
        ingredientId: LIME,
        name: "Lime Juice",
        substitutes: [
          { substituteIngredientId: LEMON, rank: 1, ratio: 1, note: "Bartender's pick" },
          { substituteIngredientId: AGAVE, rank: 2, ratio: 0.5, note: null },
        ],
      },
      { ingredientId: AGAVE, name: "Agave Syrup", substitutes: [] },
    ]);
    expect(sql.startsWith("-- Generated")).toBe(true);
    expect(sql).toContain("begin;");
    expect(sql.trimEnd().endsWith("commit;")).toBe(true);
    expect(sql).toContain(
      `delete from public.ingredient_substitutes where ingredient_id = '${LIME}';`,
    );
    expect(sql).toContain(`('${LIME}', '${LEMON}', 1, 1.00, 'Bartender''s pick')`);
    expect(sql).toContain(`('${LIME}', '${AGAVE}', 2, 0.50, null)`);
    // Zero swaps: no insert, but the ingredient is still stamped as reviewed.
    const agaveBlock = sql.slice(sql.indexOf("-- Agave Syrup"));
    expect(agaveBlock).not.toContain("insert into");
    expect(agaveBlock).toContain(
      `update public.ingredients set substitutes_reviewed_at = now() where id = '${AGAVE}';`,
    );
  });
});

describe("buildSubstituteNoteTranslationsSql (AC-14)", () => {
  it("upserts each note only while its swap keeps the same note hash", () => {
    const sql = buildSubstituteNoteTranslationsSql([
      {
        ingredientId: LIME,
        substituteIngredientId: LEMON,
        locale: "fr",
        note: "Un peu moins vif, c'est bien",
        sourceNoteHash: "abc",
      },
    ]);
    expect(sql).toContain(
      `('${LIME}'::uuid, '${LEMON}'::uuid, 'fr', 'Un peu moins vif, c''est bien', 'abc')`,
    );
    expect(sql).toContain("and s.note_hash = v.source_note_hash");
    expect(sql).toContain(
      "on conflict (ingredient_id, substitute_ingredient_id, locale) do update",
    );
    expect(sql.trimEnd().endsWith("commit;")).toBe(true);
  });
});
