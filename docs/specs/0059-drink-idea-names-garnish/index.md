# 0059. Honest names and a checked garnish for AI drink ideas

**Date**: 2026-11-15
**Status**: In Progress

_Decision history (context, options, rationale): [rationale.md](rationale.md). Verify steps: [verify.md](verify.md)._

## Summary

AI drink ideas sometimes get a name that promises something the recipe lacks ("Lime Vodka Soda" with no soda, "Lime Vodka Margarita"), and their steps add a garnish you don't have. This spec moves the garnish out of the steps into its own field. The server, not the model, decides whether the garnish is in your pantry, and the card labels it "Optional" when it isn't. The model also has to list which ingredients its name mentions, and the server rejects the idea when one of them isn't in the recipe. Every language gets these rules from the one shared prompt.

## Requirements

**User stories**:
- As a home bartender, I want an AI idea's name to describe what is actually in the glass, so I am not promised a mixer I don't have.
- As a home bartender, I want to know right away whether the suggested garnish is something I own, so I can skip it without guessing whether the drink still works.
- As a home bartender in any of the nine languages, I want the same honesty, not an English only fix.

**Acceptance criteria**:
- **AC-1**: Every successful response carries `garnish`, which is either `null` or `{ name, source_name, in_pantry }`. `garnish.source_name` is the exact list name when the garnish comes from the pantry or staple lists, and otherwise the plain English ingredient (`Lime`, not `Lime Wheel`). `in_pantry` is computed by the server and is `true` only when that `source_name`, normalized the same way as ingredient names and with a trailing plural `s` or `es` folded on both sides, matches a pantry ingredient or a staple. The model never supplies `in_pantry`. The shared client parser `parseGeneratedDrinkIdea` turns a missing or malformed `garnish` into `null`.
- **AC-2**: The generated idea card on web and mobile shows one garnish line below the ingredients, in the same small body text as the ingredient list, showing the localized `garnish.name`. It reads "Garnish: {name}" when `in_pantry` is true and "Optional garnish: {name} (not in your pantry)" when it is false. There is no line when `garnish` is null. The two strings exist in all nine locales in both apps, with `{name}` interpolation on web (next-intl) and `{{name}}` on mobile (i18next).
- **AC-3**: The model returns `name_source_names`, the exact English names (from the pantry and staple lists) of every ingredient its name mentions, which may be an empty list. The server rejects the idea when any entry, normalized, is not one of the recipe's ingredient `source_name`s. Checking against the recipe is intentional, since the recipe's ingredients already passed the pantry check. Blank entries are ignored and duplicates are allowed. `name_source_names` is never returned to the client.
- **AC-4**: A rejection under AC-3 is handled like today's pantry mismatch: one automatic retry, then a 502 `generation failed` with every claimed quota slot released. After a `name_mismatch`, the retry's prompt adds one sentence naming the offending entry ("Your last name mentioned Soda Water, which the recipe does not use."), so the retry does not repeat the same name.
- **AC-5**: The shared prompt, which every locale receives, says all of the following. The name may use mood or flavor words freely, but every ingredient, mixer, or spirit it names must be one the recipe uses and must be listed in `name_source_names`. The name is never an established cocktail name. The garnish is a small decoration only (a peel, twist, wheel, wedge, sprig, leaf, cherry, olive, or grated spice, never a liquid). It is `null` when none suits the drink, and it is not listed in `ingredients` unless it is also part of the drink itself. The steps never mention the garnish at all, since the card shows it, and never name any ingredient outside the pantry and staples. The language sentence for other locales covers the garnish name too ("Write the name, ingredient names, garnish name, and steps natively in …"), and states that `source_name`, `name_source_names`, and `garnish.source_name` stay in English.
- **AC-6**: `CHINESE_INSTRUCTION` no longer repeats the mixer and borrowed name rule, which now lives in the shared prompt. It keeps its Chinese specific sentence about writing generic ingredient names in Chinese. The Chinese hand copy tests in `packages/shared/src/locale.test.ts` still pass.
- **AC-7**: `generateWithClaude` returns an explicit result, `{ ok: true, idea }` or `{ ok: false, reason: "no_output" | "pantry_mismatch" | "name_mismatch" }`. An SDK parse error that throws instead of returning no output maps to `no_output`. When generation fails after the retry, the error reported to Sentry carries the last attempt's reason as its message and as `extra.reason`, plus both attempts' reasons in `extra.reasons`. When one attempt fails both checks, `pantry_mismatch` wins.
- **AC-8**: A blank garnish (empty or whitespace `name` or `source_name`) is treated as `null`, not as a failure.
- **AC-9**: Live proof. 27 live ideas are generated from the test account: in each of the 9 locales, one idea from each of 3 different small pantries that tempt mixer, garnish, and borrowed names (A: vodka, lime juice, simple syrup; B: gin, lemon juice, sugar; C: white rum, mint, lime juice; none holding soda, tonic, or whole citrus). Three pantries are used because the same pantry gives the same name every time. The quota is reset between batches by running a reset of the test account's daily quota row in the Supabase SQL editor (run by you, not through MCP). Reviewed in each language, they show zero names that mention an ingredient, mixer, or spirit the recipe lacks, zero established cocktail names, and zero steps that add an ingredient or garnish outside the pantry and staples. Every garnish outside the pantry shows the "Optional garnish" line. Any miss gets a prompt fix, and that locale's 3 ideas run again.
- **AC-10**: The pure checks (`usesOnlyAvailableIngredients`, the name check, garnish normalization and `in_pantry`) live in `idea-checks.ts`, which has no `npm:` or `jsr:` imports and declares its own structural input type, so the root vitest can run it. Tests beside it cover a pass, a mixer in the name that is not in the recipe, an empty and a blank `name_source_names`, case, spacing, and plural differences, a staple garnish, a pantry garnish, an outside garnish, a blank garnish, and an attempt that fails both checks.

## Decision

**Chosen option**: Option 2: Structured garnish and a declared name basis, checked by the server.

The idea gets a nullable `garnish` field whose pantry status the server computes and the card shows. The name is backed by a declared `name_source_names` list the server checks against the recipe. The shared prompt forbids absent ingredients in names, borrowed cocktail names, and garnish or outside ingredients in the steps.

## Feature design

**Data model sketch**: no database change. Ideas are not saved. The change is to the model's output schema and the function's response.

Model output schema (`DrinkIdeaSchema`, zod v4, used for structured output). The field order is deliberate: structured output is written in schema order, so the model picks the ingredients, then declares what the name will mention, then writes the name.
| Order | Field | Type | Notes |
|---|---|---|---|
| 1 | `ingredients` | array 1..8 of `{ name, source_name, amount }` | unchanged, moved first |
| 2 | `name_source_names` | string[], max 4 | new; English names from the lists; may be empty |
| 3 | `name` | string, max 60 | unchanged |
| 4 | `garnish` | `{ name: string, source_name: string }`, nullable | new |
| 5 | `steps` | string[] 1..10 | unchanged |

`max_tokens` rises from 1024 to 1536, because the new fields plus Hindi, Japanese, and Chinese text raise the risk of a truncated output that wastes the retry.

Function response (`GeneratedDrinkIdea` in `packages/shared/src/generateDrinkIdea.ts`):
| Field | Type | Notes |
|---|---|---|
| `name` | string | typeset by the locale name typography |
| `ingredients` | `GeneratedDrinkIdeaIngredient[]` | unchanged |
| `garnish` | `GeneratedDrinkIdeaGarnish \| null` | new: `{ name, source_name, in_pantry: boolean }`, all `readonly` |
| `steps` | string[] | unchanged |
| `pantry_size` | number | unchanged |

`name_source_names` is dropped before the response is built.

**API surface**:
| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `generate-drink-idea` (Edge Function) | POST | `locale` (optional, body) | `name`, `ingredients`, `garnish`, `steps`, `pantry_size` | caller's JWT (guest or signed in) | 401, 422 pantry too small, 429 limits, 502 generation failed (now also after two name check failures) |

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| generate | `name` | model output, then `LOCALE_NAME_TYPOGRAPHY` or `LOCALE_TYPOGRAPHY` for the locale (unchanged) |
| generate | `name_source_names` | model output; used only by the name check, never returned |
| generate | recipe ingredient set for the name check | the parsed idea's `ingredients[].source_name`, normalized with `normalizeIngredientName` |
| generate | `garnish.name` | model output, typeset with the locale name typography, like ingredient names |
| generate | `garnish.source_name` | model output, returned unchanged (like ingredient `source_name`) |
| generate | `garnish.in_pantry` | derived before typesetting: normalized and plural folded `garnish.source_name` is in the pantry names (from `pantry_items` via the caller's JWT) or the staple names after `stapleNamesOutsidePantry`, the same sets `usesOnlyAvailableIngredients` uses |
| generate | which check failed (Sentry) | the `reason` of `generateWithClaude`'s result (`no_output`, `pantry_mismatch`, `name_mismatch`), last attempt in the message and `extra.reason`, both in `extra.reasons` |
| generate (retry) | the offending name entry in the retry hint | the first entry of `name_source_names` that failed the check on the previous attempt |
| card render | garnish line label | `garnish.in_pantry`: true picks key `drinkIdeas.garnish`, false picks key `drinkIdeas.optionalGarnish`; web `apps/web/messages/<locale>.json` with `{name}`, mobile `apps/mobile/src/i18n/locales/<locale>.json` with `{{name}}` |
| card render | garnish when the response has none or a malformed one | the new `parseGeneratedDrinkIdea` in `packages/shared/src/generateDrinkIdea.ts`, used by `generateDrinkIdea` in place of today's bare `"name" in data` check, returns `null` for it |

**Key invariants**:
- Only the server sets `in_pantry`. It is never read from model output.
- Every entry of `name_source_names` is one of the recipe's ingredient `source_name`s, or the idea is rejected. The garnish does not count as a recipe ingredient for the name, unless it is also listed in `ingredients`.
- The existing pantry rule is unchanged. Every ingredient comes from the pantry or the staples, and at least one comes from the pantry. The garnish is exempt from this rule (that is the point of the Optional label).
- The pure checks return explicit results (`{ ok: true, idea }` or `{ ok: false, reason }`) and never throw, per the AGENTS.md error rule. Only the caller turns a failure into the retry.
- `typesetIdea` carries the garnish through (it rebuilds the idea field by field today and would drop it), typesetting `garnish.name` with the locale name typography. `in_pantry` is computed before typesetting, and `name_source_names` is stripped after the check, so neither the typesetter nor the client sees it.
- `garnish` is a required field of `GeneratedDrinkIdea` (value or `null`). Fixtures and tests that build one are updated.

**Security model**: unchanged. The function still resolves the pantry from the caller's own JWT and never accepts an ingredient list from the client. The garnish name is model text shown as text (React escapes it), the same exposure as today's steps. No new PII, no new secrets.

**Configuration required**: none.

**Critical test scenarios**:
- Happy path: pantry vodka, lime juice, simple syrup. The idea is named "Lime Vodka Sour" with `name_source_names` `["Vodka", "Lime Juice"]` and garnish lime wheel with source "Lime", which is not in the pantry. It passes, and the card shows "Optional garnish: lime wheel (not in your pantry)". Verifies **AC-1**, **AC-2**, **AC-3**
- Name failure: `name_source_names` includes "Soda Water", which is not in the recipe. The first attempt is rejected and the retry passes; if both fail, 502 and the slots are released. Verifies **AC-3**, **AC-4**
- Mood name: an empty `name_source_names` with "Midnight Smash" passes. Verifies **AC-3**, **AC-5**
- Staple and pantry garnish: garnish source "Ice", or an item in the pantry, gives `in_pantry: true` and "Garnish: …". Verifies **AC-1**, **AC-2**
- Blank garnish: `{ name: " ", source_name: "" }` becomes `null`, and no line shows. Verifies **AC-8**
- Failure reporting: two name failures in a row report `name_mismatch` to Sentry with both reasons; an attempt failing both checks reports `pantry_mismatch`. Verifies **AC-7**
- Retry hint: after a `name_mismatch`, the second prompt names the offending entry. Verifies **AC-4**
- Plural garnish: garnish source "Limes" with pantry "Lime" gives `in_pantry: true`. Verifies **AC-1**
- Old or malformed response: `parseGeneratedDrinkIdea` returns `garnish: null` for a response without it or with a garnish missing `name`. Verifies **AC-1**, **AC-2**
- Locale: a Chinese idea's garnish name goes through `normalizeChineseName`, and `CHINESE_INSTRUCTION` hand copy tests pass. Verifies **AC-6**
- Live: the 27 idea review. Verifies **AC-9**

## Build plan

Tracer Bullet: first a thin thread that carries a real garnish from the model to the web card in English, then thicken it with the name check, the full prompt, mobile, the locales, and the live proof.

1. Extract the pure checks into `supabase/functions/generate-drink-idea/idea-checks.ts` (no `npm:`/`jsr:` imports, its own structural input type): move `normalizeIngredientName`, `stapleNamesOutsidePantry`, and `usesOnlyAvailableIngredients` (keeping the "at least one pantry ingredient" rule), and add `checkIdea(idea, pantryNames, stapleNames)`. It returns `{ ok: true, idea }` with the garnish normalized (blank becomes null), `in_pantry` set with plural folding, and `name_source_names` stripped, or `{ ok: false, reason: "pantry_mismatch" | "name_mismatch", offending? }` (pantry wins when both fail). Add `idea-checks.test.ts` beside it, picked up by the existing `supabase/functions/**/*.test.ts` vitest glob. Satisfies **AC-1**, **AC-3**, **AC-8**, **AC-10**
2. Thin thread: reorder `DrinkIdeaSchema` and add `name_source_names` and a nullable `garnish`, raise `max_tokens` to 1536, and add a first garnish sentence to the shared prompt. Wire `checkIdea` into `generateWithClaude`, and extend `typesetIdea` to carry and typeset the garnish. In `packages/shared/src/generateDrinkIdea.ts`, add `GeneratedDrinkIdeaGarnish`, the required `garnish` field, and `parseGeneratedDrinkIdea`, used by `generateDrinkIdea`. Add the web card garnish line and the two `drinkIdeas` keys in `apps/web/messages/en.json`. Deploy the function with the Supabase CLI and see one real English idea with a garnish line on web; this first live call also confirms `zodOutputFormat` accepts the nullable object. Satisfies **AC-1**, **AC-2** (web, en)
3. Name check through the retry loop: `generateWithClaude` returns the explicit result (an SDK parse throw maps to `no_output`). A `name_mismatch` counts as a failed attempt like `pantry_mismatch`, and the retry adds the one sentence naming the offending entry. The final report carries `extra.reason` and `extra.reasons`. Satisfies **AC-3**, **AC-4**, **AC-7**
4. Full shared prompt: the name rule (mood words allowed, named ingredients must be in the recipe and declared), no established cocktail names, garnish as decoration only or null and not in `ingredients` unless part of the drink, steps that never mention the garnish or an outside ingredient, and the language sentence extended to the garnish name with source names kept in English. Remove the now duplicated mixer and borrowed name sentence from `CHINESE_INSTRUCTION`, keeping its generic ingredient name sentence. Check first whether `LOCALE_AI_TERMS.zh` in `packages/shared/src/locale.ts` or `locale.test.ts` pins that sentence, edit both copies together if so, and run the hand copy tests. Satisfies **AC-5**, **AC-6**
5. Mobile card garnish line in `apps/mobile/src/drink-ideas/generated-recipe-card.tsx`, plus the two keys in `apps/mobile/src/i18n/locales/en.json`. Satisfies **AC-2** (mobile)
6. The two strings in the other eight locales on both apps (es, pt, fr, ru, hi, ja, ko, zh), following each locale's existing conventions (French spacing, Russian «», Hindi «आप», Korean 해요체, Chinese «你»). Satisfies **AC-2**
7. Deploy the function, then run the 27 idea live proof (3 pantries × 9 locales) on the test account, with you resetting its daily quota row in the SQL editor between batches. Review each language, fix the prompt for any miss, and run that locale again. Record the results in this feature's verify notes. Satisfies **AC-9**

## Consequences

**Positive**:
- A garnish you don't own is always labeled, in every language, without trusting the model.
- Names that claim a missing mixer are caught by the server most of the time, using the matching that already exists.
- The checks become pure and unit tested. Today `usesOnlyAvailableIngredients` has no test of its own.
- One rule in one shared place replaces a Chinese only rule that didn't hold.

**Negative / tradeoffs**:
- The name check trusts the model's own declaration. A name that mentions soda without declaring it still slips through, and only the live review (AC-9) and future reviews catch that.
- A borrowed cocktail name and a step that sneaks in an outside ingredient are still enforced by the prompt alone.
- More rejections mean a few more Anthropic calls (retries) and a small rise in 502s on hard pantries. The refund path keeps users from losing quota.
- Two new strings in nine locales on two apps, and a response field both clients must keep in step with the function.

**Neutral**:
- No database migration. The response change is additive: deploy the function first, then the apps. Clients tolerate a missing `garnish`, and rollback is redeploying the previous function version.
- The live proof spends 27 generations, past the signed in limit of 10 a day, so it needs manual quota resets in the SQL editor between batches.
- The output tokens per idea go up a little (new fields, `max_tokens` 1536), a small rise in Haiku cost per idea.
- Older function responses don't exist in shipped mobile builds yet (the app is not in the stores), so there is no long tail of old clients.

## Follow-up

- [ ] Same pantry gives the same name on every request (spec 0052 verify notes). This is a variety question (temperature, or a style hint per request) that changes every idea, so it needs its own decision. It is out of scope here.
- [ ] If the AC-9 review shows names that mention an undeclared ingredient, consider a narrow server check for the few mixers that cause most of it (soda, tonic) in the request locale, before reaching for full word lists.
