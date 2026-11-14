# 0052. Rationale: Simplified Chinese locale

## Context

> ⚠️ Premise note: Like Korean, Chinese launches with no human review. A second AI pass catches register drift, wrong terms, broken placeholders, and untranslated strings, but it shares blind spots with the model that drafted the text, and the age gate and privacy strings carry legal meaning. Chinese adds one risk Korean did not have: a model can mix Traditional characters or Taiwan wording into Simplified text, and a reader notices that at once. You chose the AI gate knowingly; the spec backs it with an automated script check and keeps a follow up to have a native speaker read the legal strings first if one becomes available.

Spec 0045 made the locale system language agnostic, spec 0050 (Japanese) added a CJK contains search step gated by script plus self hosted CJK font stylesheets linked per locale, and spec 0051 (Korean) added name only typography and replaced the native review with a recorded AI second pass. Spec 0050 built the search step with Han characters in its ranges so Chinese could reuse it; the scope row for feature 74 assumes a `('zh', 'simple')` row and no SQL change, and left two questions open: the URL code, and whether search folds Traditional characters to Simplified.

Chinese differs from Japanese and Korean in ways that matter here:

- **Two scripts, one language code.** Browsers and phones send `zh-CN`, `zh-TW`, `zh-HK`, `zh-Hans`, `zh-Hant`, and bare `zh`. Today's detection looks only at the primary subtag, so every one of them would land on Simplified pages. Taiwan Chrome's default header is `zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7`, which also carries a bare `zh`.
- **No spaces and no settled names.** Chinese writes no spaces between words, so the `simple` config sees a name as one token and the contains step does the real matching. Only the classic cocktails have an established mainland name (玛格丽特, 莫吉托, 金汤力); most of the roughly 475 catalog drinks have none, and mainland menus print those in English.
- **Its own punctuation.** Mainland text uses full width punctuation (，。？！：；) and `“ ”` quotes, and modern mainland sites put a space between Chinese and Latin letters or digits. Models drift on all three, and may carry Japanese `「」` over.
- **Script leaks.** A model asked for Simplified Chinese sometimes writes a Traditional character, a Taiwan term (莱姆 for lime, 琴酒 for gin), or a kana. Unicode gives no property that separates the two scripts, so a check needs a list.
- **Han unification on phones.** An English set phone may draw shared characters in their Japanese shapes, or mix two fonts in one line when a Simplified only character falls back to a different face.
- **A large font.** Simplified Chinese needs far more glyphs than Korean, so the sliced font set is bigger.

`search_fold` removes only the Japanese middle dot `・` (U+30FB), so a `·` stored inside a transliterated name (汤姆·柯林斯) would hide it from a query typed without the dot, as spec 0051 found for Korean.

The work runs through the SQL editor as before, translation uses Haiku through `ANTHROPIC_API_KEY`, and Chinese is offered as a language, not a push into the mainland market (no hosting there, no ICP filing).

## Options considered

### Option 1: The Korean path, with Traditional aware detection, a Chinese typography pass, and a curated script check

Chinese gets a `('zh', 'simple')` row and reuses the CJK search step unchanged. One shared TypeScript helper keeps Traditional tags from picking Simplified. Fonts ship as a third entry in the self hosted pipeline. `normalizeChineseTypography` and `normalizeChineseName` fix punctuation, spacing, and dots at write time; a curated list of Traditional only characters backs a strings scan and a SQL check. An Opus session runs a written checklist in place of a native review.

**Pros**:
- No SQL function change and no new dependency or infrastructure.
- Traditional readers are not switched to Simplified by surprise, and a later Traditional locale has a clean slot.
- Launch does not wait on finding a reviewer.

**Cons**:
- A Traditional query on `/zh` finds little.
- The curated list cannot be complete.
- Detection gains its first rule that names a language.

### Option 2: Fold Traditional to Simplified in search, and serve Simplified to every Chinese tag

Add a character map of a few thousand pairs to `search_fold`, and keep the primary subtag rule so every `zh` tag lands on `/zh`.

**Pros**:
- A Traditional reader who lands on `/zh` can search in their own script.
- No detection change.

**Cons**:
- Changes a live helper used by every locale's search, which needs the full before and after snapshot across nine locales, for users this spec does not otherwise serve well.
- Hands Simplified pages to Taiwan and Hong Kong visitors without asking, which some find off putting.
- One to many character pairs (髮 and 發 both fold to 发) need care a quick map does not give.

### Option 3: A conversion library (`opencc-js`) for checking or converting

Use a Traditional to Simplified conversion library in tests and scripts, or run it over every AI output so nothing Traditional can be stored.

**Pros**:
- Near complete coverage, with no hand curated list.
- Auto conversion would remove the rerun step.

**Cons**:
- A new dependency of about 1 MB of dictionaries; the catalog check becomes a script, not plain SQL you can paste into the editor.
- The edge function carries self contained hand copies of each normalizer, checked by a drift test; it cannot carry a dictionary, so drink ideas would need the library bundled into the function or go unchecked anyway.
- Conversion fixes characters but not Taiwan wording (莱姆, 琴酒), which only the prompt and the AI pass address.

### Option 4: A hyphenated code now (`zh-cn` or `zh-hans`) and a human review

Make the URL code explicit about the script or region from day one, and hold launch for a native reader as Japanese did.

**Pros**:
- Symmetric with a later `zh-hant`; the highest text quality.

**Cons**:
- The first hyphenated code touches detection's primary subtag rule, the parity test regex, file names, and the 0045 structure query, all for a distinction `LOCALE_HREFLANG` already carries.
- Launch date depends on finding someone; you chose not to wait.

## Rationale

Option 1 follows from the forces above, and each of your answers maps to one of them.

**Code and hreflang.** `zh` keeps the bare code every part of the system assumes (the database key, i18next, the parity regex), and `LOCALE_HREFLANG` already exists to announce something more precise, as `pt` does with `pt-BR`. `zh-Hans` names the script, which is what this locale actually is; `zh-CN` would tell search engines the pages are for mainland China only, when Simplified readers also live in Singapore and Malaysia and the app does not target the mainland at all. It also makes `<html lang>` and the switcher option pick Simplified system fonts.

**Detection.** The primary subtag rule is right for every other language and wrong for this one, because the script lives in the other subtags. The fix is small and pure: one predicate for "this tag is Traditional", one helper both apps call. The bare `zh` after Traditional rule exists because the most common Taiwan header would otherwise defeat the whole point. Stored preferences are untouched, so anyone can still choose Simplified. The rule lives in TypeScript; spec 0045's ban on locale names is about SQL function bodies and still holds.

**No folding.** The scope row promised no SQL change, and folding (Option 2) is the one item that would break it, for visitors detection now sends elsewhere. It is enrolled as its own feature, where the one to many pairs can get proper thought.

**Names.** Search matches names, so names must be what people type. An invented sound based spelling is typed by nobody and differs between runs; the English name is typed by many and already found through the base name tiers. Keeping English when no established name exists also matches mainland menus. Removing middle dots from names follows spec 0051's reasoning exactly: close the gap at write time, in name fields only, not in a search function every locale shares. For Chinese the dot is removed outright (汤姆柯林斯) since Chinese has no spaces to put in its place.

**Typography.** Full width punctuation and Han to Latin spacing are what mainland readers expect, and recipes are dense with numbers and Latin unit symbols, where the spacing helps most. The sentence dot rule is borrowed from `normalizeJapaneseTypography`, which already solved "which `.` is a full stop". Number to unit spacing is pinned in the prompt, not enforced in code, because a rule that splits `30ml` would also have to know every unit and would touch names like `B-52`.

**Script check.** A curated list (over Option 3) keeps the check in plain SQL and plain vitest, with no dependency and nothing the edge function cannot mirror in spirit. Its gap, rare characters, is exactly where the AI pass is strong, and the common characters, where a leak would be seen by every reader, are exactly what the list holds. The list excludes characters valid in both scripts so it cannot raise false alarms on correct Simplified text.

**Fonts and mobile.** Fonts follow spec 0050's measured lesson (self hosted, linked per locale, guarded by the postbuild matcher), and the CSS selector is `zh-Hans` so a future Traditional locale does not inherit SC faces. Mobile follows spec 0050 too: no bundled font until a real device shows a problem, since a Chinese font costs every install several MB.

**Review.** You chose the AI gate (Option 4's human review rejected), as for Korean. The spec makes it concrete: a stronger model than the drafter, a written checklist with the Chinese specific items (script, regional wording, kept names, measure words), SQL checks, and a record in `verify.md` that the launch commit waits on.
