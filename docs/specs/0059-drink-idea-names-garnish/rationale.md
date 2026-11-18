# 0059. Honest names and a checked garnish for AI drink ideas: rationale

_The decision record behind [index.md](index.md)._

## Context

The `generate-drink-idea` Edge Function (spec 0007) asks Claude Haiku for one original drink from the caller's pantry and staples (Ice, Water, spec 0036). The shared English prompt asks only for "a short, appealing name" and says nothing about garnish. The server's one real guard is `usesOnlyAvailableIngredients`, which checks each ingredient's English `source_name` against the pantry and staples. Names and steps are free text in nine languages, so nothing checks them.

The Opus review of live Chinese ideas (spec 0052 verify notes, 2026-11-13) found three problems, and judged none of them specific to Chinese. Names claim a mixer the recipe lacks (青柠伏特加苏打, "tonic" names). Names borrow an established cocktail (青柠伏特加玛格丽塔). And garnish steps add fresh lime when the pantry holds none. A rule added to `CHINESE_INSTRUCTION` alone did not stop them, because the cause is the shared prompt plus a small pantry with one main flavor. That pushes the model to dress the idea up.

The constraints are these. The function is the only place the prompt lives (clients never call Anthropic). It runs one automatic retry and refunds the quota slot when generation still fails (spec 0034 AC-4b). Ideas are not saved anywhere; they exist only in the response. The mobile app is not in the stores yet (spec 0057, feature 82), so no installed build depends on the current response shape. Any fix must hold in all nine launched locales, because the prompt is shared.

If nothing changes, a user with vodka and lime sees a "soda" drink they can't make, or a step asking for a garnish they don't own. That breaks the one promise of the feature: an idea you can make with what you have.

## Options considered

### Option 1: Prompt rules only

Move the Chinese name rule into the shared English prompt, add a garnish rule ("only from the pantry"), and change nothing else.

**Pros**:
- Smallest change: one string in one file, no type or UI change.
- Every locale gets it at once.

**Cons**:
- Nothing checks it. The Chinese only version of this exact rule already failed in live runs, so prompt wording alone has a track record of not holding with Haiku on small pantries.
- A garnish slip stays invisible to the user: they still read "garnish with a lime wheel" with no hint that it's optional.

### Option 2: Structured garnish and a declared name basis, checked by the server

Give the garnish its own optional field with an English `source_name`, and have the server label it. Have the model declare which ingredients its name mentions, and reject the idea when the declaration names something outside the recipe. Strengthen the shared prompt as in Option 1.

**Pros**:
- Turns the garnish problem into a structural one. Whatever the model suggests, the user sees the truth about whether they own it, because the server decides the label.
- The name check reuses the existing `source_name` matching and the existing retry and refund path, so there are no new failure modes.
- Works the same in all nine languages, because both checks run on English source names, not on localized text.

**Cons**:
- The model can still mislabel its own name (naming soda but leaving it out of `name_source_names`). The check catches honest slips, not a model that ignores the instruction.
- Touches the shared type, both cards, and two strings in nine locales on each app.
- A stricter check means a few more retries, and the odd 502 on a hard pantry.

### Option 3: Server word lists per locale

Scan names for mixer words (soda, tonic, 苏打, refresco, …) and scan names against catalog cocktail names in the request locale. Scan steps for garnish words.

**Pros**:
- A real check that doesn't depend on the model being honest about itself.

**Cons**:
- Word lists in nine languages, with inflection (Russian, Hindi) and no word spaces (Chinese, Japanese), are brittle and grow forever.
- Catalog name matching gives false positives on short or generic names, and adds a database read to every request.
- Still says nothing to the user about a garnish they lack.

## Rationale

The force that decides this is the spec 0052 evidence. A prompt rule for exactly this problem was already tried in Chinese and still failed in the third live run. More words in the prompt (Option 1) repeats an experiment that has already failed. Option 2 changes what the model is asked to produce, which Haiku follows far more reliably than prose rules, because structured output forces the field to exist. Where the model's honesty still matters (the name), the server can at least check the claim.

The garnish half matters most to the user, and Option 2 solves it without trusting the model at all. The server decides `in_pantry` from the English source name, so a garnish the user lacks is always labeled. That meets the scope's "unless it is clearly marked optional" literally, and it holds even when the model suggests something odd. Option 3 would need nine word lists and would still leave the user unaware.

Forbidding established cocktail names outright, rather than allowing one when the recipe "truly is" that cocktail, keeps the rule checkable by a reviewer and fits the feature's job. The matched recipes section on the same page (spec 0006) already shows real cocktails the pantry can make, so the AI idea's role is the original one. Treating a name failure like a pantry mismatch reuses the retry and refund path that spec 0034 already hardened, so no new failure handling is needed.

