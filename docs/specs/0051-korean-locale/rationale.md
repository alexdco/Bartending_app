# 0051. Rationale: Korean locale

## Context

> ⚠️ Premise note: Korean launches with no human review. Every other non English locale so far had a reviewer sign off (Japanese by you). A second AI pass catches register drift, wrong terms, broken placeholders, and untranslated strings, but it shares blind spots with the model that drafted the text, and the age gate and privacy strings carry legal meaning. You chose this knowingly; the spec makes the AI pass a recorded, checklist driven gate rather than a formality, and keeps a follow up to have a native speaker read the legal strings first if one becomes available.

Spec 0045 made the locale system language agnostic, spec 0048 (Hindi) added English name slugs for scripts with no letter table and per locale body fonts, and spec 0050 (Japanese) added a CJK contains search step gated by script, plus self hosted CJK font stylesheets linked per locale. Spec 0050 built that search step with Hangul in its character ranges so Korean and Chinese could reuse it; the scope row for Korean (feature 73) assumes no SQL change.

Korean differs from Japanese in ways that matter here. It writes spaces between words (eojeol), so the `simple` text search config already splits most names into words, but spacing in loanword drink names varies (진토닉 and 진 토닉 are both common). Korean uses Western punctuation, so it needs far less clean up than Japanese, but AI models sometimes write a middle dot between words of a foreign name (진·토닉), and that dot (U+00B7) is not one `search_fold` removes. Korean wraps badly with default CSS and on iOS, which break inside words; Korean sites use `word-break: keep-all`. Hangul has no Han unification problem, so the system font on mobile is safe. Korean has one plural form and a dot decimal.

A live probe on 2026-11-12 against the BartendingAppWeb database showed:

| Check | Result |
|---|---|
| `supported_locales` | 7 rows: `en`, `es`, `fr`, `hi`, `ja` (`simple`), `pt`, `ru` |
| `to_tsvector('simple', '진 토닉')` | `'진':1 '토닉':2` (splits at the space) |
| `to_tsvector('simple', '진토닉')` | `'진토닉':1` (one token) |
| `search_fold('진 토닉')`, `search_fold('진토닉')` | both `진토닉` |
| `search_fold('진·토닉')` | `진·토닉` (middle dot kept, so 진토닉 misses it) |
| `has_cjk('진')`, `has_cjk('ㅈ')` | both true |
| `search_fold('ㅈ')` | `ᄌ` (NFKC turns the compatibility jamo into a conjoining one) |
| `strpos(search_fold('진토닉'), search_fold('토닉'))` | 2 (found) |
| `strpos(search_fold('진토닉'), search_fold('진ㅌ'))` | 0 (a half typed syllable misses) |

The work runs through the SQL editor as before, translation uses Haiku through `ANTHROPIC_API_KEY`, and the catalog has about 430 recipes. Korean is offered as a language, not a push into the Korean market.

## Options considered

### Option 1: The Japanese path, a small Korean typography pass, and an AI second pass

Korean gets a `('ko', 'simple')` row and reuses the CJK search step unchanged. Fonts ship as a second entry in the self hosted stylesheet pipeline. A small `normalizeKoreanTypography` fixes NFC, full width characters, punctuation spacing, quotes, and middle dots. An Opus session runs a written checklist in place of a native review.

**Pros**:
- No SQL function change and no new infrastructure.
- Search matches with or without spaces, and the middle dot gap is closed at write time, where it is cheap.
- Launch does not wait on finding a reviewer.

**Cons**:
- No human reads the text before launch.
- No initial consonant search.

### Option 2: Fold the middle dot in SQL instead

Widen `search_fold` to drop U+00B7 too, so search tolerates it however it is stored.

**Pros**:
- Search would also tolerate a middle dot typed by a user.

**Cons**:
- Changes a live helper used by every locale's search, which needs the full before and after snapshot again, for a character Korean users rarely type.
- Leaves inconsistent drink names in the catalog.

### Option 3: Wait for a native Korean reviewer

Build unlaunched and hold launch until a human signs off, as for every earlier locale.

**Pros**:
- The highest text quality and a human check on the legal strings.

**Cons**:
- Launch date depends on finding someone; you chose not to wait.

## Rationale

Option 1 follows from the forces above. Spec 0050 already paid for CJK search, and the probe shows it works for Korean once the catalog never stores a middle dot, so the right place to close that gap is the typography pass that every Korean AI write already goes through, not a change to a search function every locale shares (Option 2). The dot rule runs on name fields only (`normalizeKoreanName` through `localeNameTypography`), because Korean prose uses `·` to separate list items (`얼음·라임`) and turning it into a space there would change the meaning; names are the only fields search matches. It fires when Hangul is on either side, so a mixed name like `진·Tonic` cannot pass the normalizer and then fail the catalog check. The cross check on 2026-11-12 also caught Japanese punctuation that a model may carry over after the Japanese work (`。` `、` `「」`), now mapped back to Western forms. Keeping words whole when wrapping is the norm for Korean text and costs one CSS rule on web and one prop on the shared mobile `Text`.

The fonts follow spec 0050's measured lesson: CJK fonts through `next/font` in the shared layout put hundreds of `@font-face` rules into every locale's CSS, so Korean is a second config entry in the self hosted pipeline. Noto Sans KR and Noto Serif KR are on Google Fonts with the same slicing, keeping the fetch script's Google only checks; Pretendard, the popular Korean UI font, would have needed a second download source. The postbuild matcher widens to the KR names so the guarantee still holds.

You chose to launch without a human reviewer (Option 3 rejected). The spec makes the substitute concrete: a stronger model than the drafter, a written checklist (register, Hanja, terms, placeholders with Korean particles, legal meaning, note accuracy), SQL checks for Hanja, middle dots, lime, and lemon, and a record in `verify.md` that the launch commit waits on.

Initial consonant search is a real Korean habit but needs a decomposed name column and a new SQL step; it is a separate feature, not a reason to hold Korean.
