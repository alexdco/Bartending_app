# 0010. Popular drinks by region: rationale

## Context

> ⚠️ Premise note: the scope row and the initial design direction both assumed TheCocktailDB (this project's recipe source, spec 0001) has real region and popularity data to reuse. It does not. Its public API offers filters only by ingredient, category, and alcoholic status, with no area or region concept at all, and no filter response carries any ordering or popularity signal (confirmed live against the real API during this spec's design). The right framing is that region and popularity are both new, first party data this project must produce itself, not import.

Spec 0002 (the core data model) already added `recipes.region` and a `tags`/`recipe_tags` pair specifically so a later feature could add region and tag browsing without a breaking migration, but deliberately left "how region data gets produced" as an open follow up item for whichever feature needed it first. That feature is this one (scope row 11).

The consequence of not deciding this now is that `recipes.region` stays permanently empty (as it is today) and the scope row cannot ship: there is no plausible way to browse "popular drinks by region" without first deciding where region and popularity come from, since neither exists anywhere in this project's current data.

This project already has an AI capability in its stack (Anthropic Claude, Haiku tier, spec 0001) used for on demand drink idea generation (spec 0007), called only from a quota checked Supabase Edge Function for that live feature. This decision is different in kind: it is a one time, offline tagging job run by the engineer against the existing catalog, not a per user, per request live call, so it does not need the quota or Edge Function machinery spec 0007 built for its own use case.

## Options considered

### Option 1: Hand curated region and popularity tagging

The engineer manually assigns a region and a rank to a subset of recipes, by reading the imported catalog and picking values themselves (a spreadsheet or a short manual script run).

**Pros**:
- No AI involved, no risk of a wrong or implausible region/rank assignment slipping through unnoticed.
- Full engineer control over what counts as regional and what counts as popular.

**Cons**:
- Real manual effort across roughly 425 recipes (per spec 0002's import counts) to get a usable spread of regions, redone by hand for any future catalog growth.
- Does not reuse anything already in the stack; this project already pays for and calls Claude (spec 0001, spec 0007), so paying pure human time here (not just the Claude cost) instead is more expensive.

### Option 2: LLM assisted tagging with a reviewable staging step

A one time script calls Claude twice per recipe set: once to classify each recipe into a fixed region list (or none), once per region to rank its recipes by real world fame. The proposed assignments are written to a JSON output first; a second, explicit step applies them to the database.

**Pros**:
- Reuses the AI capability already in this stack (spec 0001's Claude/Haiku tier) instead of introducing new manual tagging work.
- The review step catches an implausible region or a rank the engineer disagrees with before it is live and constrained by the unique `(region, popularity_rank)` index.
- One time cost: this is a script run once, not a permanent addition to the recurring import job (spec 0002), so it adds no per import latency or cost later.

**Cons**:
- Region classification for an ambiguous cocktail (a Margarita is globally common despite a Mexican-ish origin) is a judgment call the model can get wrong or inconsistent between runs; the review step is what catches this, not a guarantee of correctness.
- A second, separate concept (LLM classification) that a purely relational stack does not otherwise need, adding one more moving part (a script that calls an external API and produces a file, not just a migration).

### Option 3: Skip region entirely, use TheCocktailDB's existing category data instead

Since TheCocktailDB has no area/region filter at all (confirmed against its real API), reuse its actual category data (`strCategory`, e.g. "Cocktail", "Ordinary Drink", "Shot") for a "popular by category" browse instead of region.

**Pros**:
- Real third party data already available with no new tagging step or AI cost at all.
- Zero ambiguity: a recipe's category is a stated fact from the source, not inferred.

**Cons**:
- Does not satisfy the actual scope intent ("popular drinks by region," scope row 11) or the engineer's confirmed requirement; a category is not a region and doesn't answer the same user question ("what's popular where I'm from / traveling to").
- Still leaves "popular" unanswered even if category solves "region"; popularity ranking is a separate gap this option doesn't close.

**This option was raised during design (as a possible descope) and explicitly rejected by the engineer**, who chose to proceed with LLM assisted tagging instead once the API limitation was confirmed.

### Option 4 (a refinement of Option 2, adopted after cross check): one LLM call per recipe, rank computed in SQL

Rather than Option 2's original two pass design (one call per recipe for region, then a second call per region to rank its recipes by fame), ask Claude for both a region and a 0 to 100 fame score in the same per recipe call, and compute `popularity_rank` deterministically in SQL (`row_number() over (partition by region order by fame_score desc, name asc)`, capped at 10) during the apply step.

**Pros**:
- Removes a whole class of LLM call (the second, per region ranking pass), lowering cost and the number of things that can fail.
- Removes a real correctness risk the two pass design had: the ranking call worked from "every recipe already tagged to this region" as its own input, so a recipe could in principle be ranked into a region context inconsistent with what the first call assigned it, if the two passes ran with any drift between them (a different prompt version, a partial rerun). A single call assigning both values at once cannot disagree with itself.
- Makes ties and gaps deterministic and re-computable without another LLM call: `fame_score` is stored, so a later fix (a recipe added to a region, a corrected score) just re-runs the same SQL, not a new Claude call.

**Cons**:
- Asking one model call to do two judgments at once (classification and a numeric fame estimate) is a slightly harder prompt to get reliably formatted than two focused calls, though this is a prompt engineering concern, not a structural one.

**This is the adopted refinement**, folded into this spec's actual Decision and Feature design; Option 2 above describes the original two pass shape considered before this refinement, kept for the historical record of what was compared.

## Rationale

The deciding force is that region and popularity are both first party data gaps, not integration problems: no amount of clever querying against TheCocktailDB produces them, because the source does not have them. Given that, the choice is really between spending human time (Option 1) or reusing an already provisioned AI capability (Option 2) to produce first party data once. Since this project already operates Claude in production for a harder, live use case (spec 0007's on demand generation, which needs quota checks and retry handling this tagging job does not), reusing the same model for a one time, offline, human reviewed batch job is materially lower risk than that live feature, not higher: there is no user facing failure mode, no quota to protect, and a human reviews every output before it reaches the database (AC-7).

The review-before-apply step is what makes Option 2's main con (a wrong or inconsistent LLM judgment call) tolerable: it converts "the model might be wrong" into "the model proposes, the engineer disposes," which is a materially different risk profile than trusting LLM output directly into a live, user facing table. Option 3 was rejected because it solves a different (easier) problem than the one requested; category data being real and available does not make it what the scope row or the engineer actually wants.

### TheCocktailDB API verification (used to reject the original tagging assumption)

Before finalizing this decision, TheCocktailDB's real public API was checked directly. Findings:

- **No area/region filter exists.** The only filter endpoints are `filter.php?i=<ingredient>`, `filter.php?c=<category>`, and `filter.php?a=<alcoholic>` (alcoholic status, not area, despite the `a` parameter name overlap). There is no `filter.php?a=<region>` for geographic area.
- **Filter responses are lightweight** (`strDrink`, `strDrinkThumb`, `idDrink` only); a full detail read still requires a separate `lookup.php?i=<idDrink>` call, consistent with how this project's own import job already works (spec 0002).
- **No ordering or popularity signal exists in any filter response.** Returned `idDrink` values are not sequential and TheCocktailDB's documentation does not claim or guarantee any particular order. Treating API response order as a popularity proxy, the original assumption behind this feature's first draft, is not a safe inference; there is no evidence the signal exists at all.
- **List endpoints available**: `list.php?a=list` (alcoholic statuses), `list.php?c=list` (categories), `list.php?i=list` (ingredients), `list.php?g=list` (glass types); none list areas/regions as a first class value set.

This is why Option 2 (LLM assisted tagging, generating first party region and rank data from scratch) replaced the original plan (reusing TheCocktailDB's area list and its list order as a popularity proxy), which this verification showed was not buildable.

## References

None (references level: none, per the engineer's choice during design).
