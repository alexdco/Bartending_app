# Simplified Chinese verification

Date: 2026-11-13
Status: launched in code (9f18bee, 2026-11-13), not yet deployed. The catalog review, the notes review, and the notes apply are complete (2026-11-13, see "Catalog and notes review, second run" below). The no pronoun step rule is deployed (Edge Function version 24, 2026-11-13). AC-16 passed (2026-11-13). The 360 px layout findings are fixed or accepted (805d382, see AC-10, AC-11 below). Still owed, gating the merge rather than the launch commit, as with Korean: one live Chinese idea to confirm the no pronoun rule (the daily limits reset at 2026-11-15 00:00 UTC), the physical phone checks (AC-21), a mobile build, the production check after deploy, and the store listings.

Branch: `feat/multilingual-integration`. The Chinese work is committed (f279800 unlaunched, 805d382 layout fix, 9f18bee launch).

## Recorded evidence

The shared locale, typography, script checks, catalog normalizers, and Edge Function hand copy checks were already present as uncommitted work when this run began. This run completed the web and mobile wiring, message catalogs, font configuration, migration and rollback files, and interpolation checks.

- Web has 648 Chinese strings. Mobile has 124 strings, using only the `other` plural form.
- The final repository test suite passed: 70 files, 1,111 tests, including the expanded Chinese interpolation and script scans.
- All four workspace typechecks passed.
- All four workspace lint tasks passed. Mobile reported two existing i18next default import member warnings.
- The web production build passed, including the postbuild font isolation check.
- Noto Sans SC and Noto Serif SC each have 101 faces. The fetched stylesheet has 202 local font files. The existing minimum of 100 faces per family remains unchanged.
- Local production HTTP checks: `/zh/account` returned 200, Chinese text, `lang="zh-Hans"`, its Chinese stylesheet, and `noindex`. `/en/account`, `/ja/account`, and `/ko/account` returned 200 and did not link the Chinese stylesheet.
- Both `zh-CN` and `zh-TW,zh;q=0.9,en;q=0.8` on the bare `/account` path redirected to `/en/account`, as required before launch.
- The generated sitemap had no `zh-Hans` entry. The Chinese and English share image responses were byte identical (40,965 bytes each).
- The live `zh/simple` configuration row was inserted through the service role Data API and read back on 2026-11-13. All eight existing locale rows and nine English, Japanese, and Korean search results were byte identical before and after. The SQL seed file was made idempotent for later migration replay; it was not executed through a SQL editor or CLI. No schema structure changed.

## Pending external steps

- The locale seed is live. Run the structure query below and the Supabase security advisor when a SQL or management connection is available. The idempotent SQL file may be replayed or recorded through the normal migration workflow; this session applied the equivalent single seed row through the Data API, without a migration ledger write.
- Deployment and SQL checks were explicitly left pending by the user after API credit was restored. The prepared Edge Function is not deployed. Its CLI status is `Pending approval (run claude to approve)`. This session did not change that trust setting. Target project `ctuzjhhpnkkhooneporu`. SQL inspection, the advisor, and ten live Chinese drink ideas remain pending.
- The approved Opus source comparison passed on 2026-11-13 with no new findings. It checked every Chinese UI string against the two English source JSON catalogs, including legal copy, conditional disclosures, error states, permission boundaries, quantities, accessibility labels, rich text, and representative placeholder values. Opus also passed shared unit, batch, and limit copy review; two minor wording suggestions were accepted unchanged. All ingredient and tag name pairs were reviewed and resolved below. Full recipe-name and sample review could not run because the API credit balance was too low.
- The full catalog backfill and zero-item rerun are complete. Correct the three known recipe name failures with explicit ids after credit is restored, then complete the all-name and 30-recipe Opus review.
- Eighty of 473 eligible note proposals are preserved and unapplied. They pass schema and script checks but still require Opus review. Two recipes lack an English source note and were excluded. Preserve the proposal file.
- Check an English set physical iPhone and Android device. No device result is claimed here.
- Record all review and deployment evidence before adding Chinese to both launch lists in one commit and shipping the mobile build.

## Chinese AI review

Required reviewer: an independent Claude Code Opus session, as specified by AC-20. This Codex implementation pass is not that review.

Model: `claude-opus-5`, through Claude Code 2.1.258 with tools disabled. Date: 2026-11-13. The CLI also reported a small Haiku helper request; the substantive review was performed by Opus.

Outcome: Chinese draft review completed with three findings fixed and one accepted tradeoff. This is a partial AC-20 record, not a launch sign off. A subsequent approved `claude-opus-5` source comparison passed with no findings. It read all four English and Chinese JSON catalogs and checked representative substitutions for numbers, times, ingredient lists, retained English names, language names, and errors. It preserved the privacy, age confirmation, and deletion meanings. The separate shared-copy review passed, and ingredient/tag findings were resolved below. Recipe-name/sample review, notes review, and live drink ideas remain incomplete.

| Finding | Resolution |
| --- | --- |
| CN-01: the shot measure 一口杯 names a vessel and embeds the numeral one | Fixed to 小杯 in `LOCALE_AI_TERMS.zh`, so numeric amounts read naturally. |
| CN-02: the time placeholder touched Chinese characters | Fixed to `请在 {time} 后重试。` in `drinkIdeas.quotaExceededUntil`. The strings scan now checks number placeholder spacing. |
| CN-03: missing sentence boundary after an image error | Added `。` between `{message}` and the retry sentence in `admin.imageSaveFailed`. |
| CN-04: replace 抖 with 抖振 for dash | Accepted tradeoff: retain the spec's pinned 抖 for a counted bottle shake, distinct from 滴 for a drop. The reviewer's claim that 抖振 is the established mainland preference was not established by the verification search. A primary [Mixology Studio recipe](https://mixology.com.tw/ProductDetail.aspx?pid=LS-001) documents 抖振 in Taiwan; that alone does not establish mainland preference. |

Opus accepted the curated Traditional character list, retained English brand and shorthand examples, the no middle dot name rule, and the existing mainland terms. It found no banned term or script problem in either Chinese catalog. Automated scans, rather than the reviewer alone, establish NFC and exact key and placeholder coverage.

Read the shared Chinese terms, `CHINESE_INSTRUCTION`, and the curated Traditional character list before translating the catalog. The initial Opus pass changed the proposed shot measure 一口杯 to 小杯. The dash measure remains 抖 as an accepted tradeoff. Then review all of the following:

- [x] Both complete Chinese UI catalogs, reviewed for Chinese language quality.
- [x] Both Chinese catalogs compared with their English sources by the independent reviewer.
- [x] All interpolated web and mobile catalog messages reviewed with representative values, including the message families listed in `placeholderMessages.ts`.
- [x] Chinese unit, batch, and rendered limit copy reviewed by Opus. Two minor style suggestions were accepted unchanged.
- [x] All 398 ingredient and 395 tag name pairs read by Opus, with resolutions below.
- [x] All 475 recipe name pairs reviewed by Opus, twice (2026-11-13). Findings fixed through pinned glossary pairs and `--ids` reruns; see below.
- [x] A sample of at least 30 recipes, covering recipe steps, glass names, measures, and tags. Two samples of 30 (the second drawn from the rerun set), plus a full catalog scan for the patterns the first sample exposed.
- [x] Ten live Chinese drink ideas, including pantry verification against English source names. Three batches of ten (2026-11-13); Chinese conventions met, the shared name and garnish issue accepted and tracked separately. See "Live drink ideas, third run and outcome".
- [x] Every note in `recipe-notes-proposals.zh.json` before applying notes. All 1,419 lines in two files (80 and 393 recipes), 611 findings fixed before the apply.

For each input, check:

- [ ] Natural mainland Simplified Chinese, using 你 and never 您, with short button labels and short recipe commands without pronouns. (Met in the UI catalogs, catalog, and notes by the reviews and the banned term scans. The no pronoun step rule for drink ideas is deployed in version 24 but not yet seen in a live idea; this box closes on that check.)
- [x] Exact pinned terms, especially 青柠 versus 柠檬, 柠檬青柠汽水, 金酒, 朗姆酒, tools, glasses, and measures. (Catalog scans, the lime and lemon checks, the notes review, and the third idea run.)
- [x] Chinese draft catalogs and terms have no unintended Traditional characters, regional Taiwan or Hong Kong terms, kana, or Hangul. Opus accepted the curated Traditional list. Live content still requires the same checks.
- [x] Full width Chinese punctuation, NFC, half width digits and Latin letters, Chinese quotes, and spaces between Chinese and Latin letters or digits. (The `zh` strings scans, the catalog typography scans, and the notes checks all return zero.)
- [x] Number placeholders have the required adjacent space; text placeholders have none. Placeholders and rich text tags remain intact. (The interpolation scan, and finding CN-02.)
- [x] No untranslated English beyond brands, retained cocktail names, and units. Shorthand input examples may demonstrate the supported English abbreviations. (Both source comparisons and both name reviews; the three notes fields left in English were fixed.)
- [x] Age gate and privacy text preserve the English meaning. Recipe notes match the ingredients and method. (The source comparison kept the privacy, age, and deletion meanings; 611 notes findings fixed before the apply.)
- [x] Every finding is fixed or explicitly recorded as accepted, with the reviewer model, date, and outcome. (Recorded in each run below: `claude-opus-5`, 2026-11-13.)

## Public catalog backfill evidence

Before sending live catalog content to Anthropic, anonymous and service role API responses were compared for the full exact payload. They matched all 475 active recipes, 398 ingredients, and 395 tags. The data is public without user authentication. The thin run was pinned to public Jamaica Kiss (catalog source 14095), Coffee Liquer, and Sweetened Iced Tea ids; it wrote one Chinese row per kind and Chinese recipe measures, with no skipped items. Jamaica Kiss retained its exact English name, its steps and glass translated, and anonymous Chinese search found it. The full backfill is complete: 475 recipe rows, 398 ingredient rows, 395 tag rows, and 1,829 measures. All source rows have Chinese rows. Script, NFC, banned term, middle dot, exact retained English name, glass/tag Han, and displayed citrus checks return zero issues. A normal rerun translates zero items. These structural checks do not establish correct cocktail names.

## Ingredient and tag name review resolutions

Model: Claude Opus 5, 2026-11-13. All 398 ingredient and 395 tag pairs were read. Every returned id was checked against the actual English source. The incorrect returned id for Clear was resolved by its unique English source name before any rerun. Sixty-eight rows were regenerated through the normal translation pipeline and exactly match the recorded targets. Three further glass rows were regenerated. No translated database row was edited by hand.

The IBA expansion was checked against the [official association site](https://iba-world.com/).

Recommendations were narrowed where needed to avoid inventing facts or dropping source details: proof stays proof, Falernum does not assert a syrup form, Sarsaparilla adds no product form, Cointreau's preparation is translated, and the Chartreuse brand remains English. These are recorded implementation resolutions, not claims of a subsequent Opus pass.

| Kind | English source | Final target | Resolution | Id |
| --- | --- | --- | --- | --- |
| ingredient | Peach Schnapps | 桃味利口酒 | Regenerated and verified | `69eef998-f7be-482f-bcaf-95e6764b401e` |
| tag | Triple Sec | 橙皮利口酒 | Regenerated and verified | `0959a83c-0c0d-48b2-810e-03ad37ecb5e4` |
| ingredient | Wormwood | 苦艾 | Regenerated and verified | `2806bf4c-f034-4da7-aced-a139219c7420` |
| ingredient | Rosso Vermouth | 红味美思 | Regenerated and verified | `90a22f7f-5075-41a3-be16-33d2a145aebb` |
| ingredient | Lemonade | 柠檬水 | Regenerated and verified | `55c1a04e-ae18-4cd1-a307-c7e2df96a6a4` |
| ingredient | Pink lemonade | 粉红柠檬水 | Regenerated and verified | `786da2c2-9253-4237-8154-fcbb93138150` |
| ingredient | Prepared Horseradish | 辣根酱 | Regenerated and verified | `90fc88dc-32bf-4ff7-ba4a-9261e0ef9cfc` |
| ingredient | Skim Milk | 脱脂牛奶 | Regenerated and verified | `be6a05ea-aee2-4bb7-8764-65f9084d22e7` |
| ingredient | Ginger Beer | 姜汁啤酒 | Regenerated and verified | `724bb31c-5aad-4597-ac3b-b777d92bab22` |
| ingredient | Orange Spiral | 橙皮卷 | Regenerated and verified | `272931ce-d72b-4cff-bfa9-6d4c0ad5d831` |
| ingredient | Orange Whee | 橙轮片 | Regenerated and verified | `2a09f4e8-3c7e-49f5-b6f4-6149cc63b686` |
| ingredient | Vodk | 伏特加 | Regenerated and verified | `4ff8d943-96ea-4822-a920-1cde067fad99` |
| ingredient | Root Beer Vodka | 根汁汽水伏特加 | Regenerated and verified | `f605f51a-ad0d-472c-b4ff-ea45db3fd278` |
| tag | Root Beer | 根汁汽水 | Regenerated and verified | `e943f544-0b5f-4c7e-bb8f-671dc0e5850e` |
| tag | Root Beer Float | 根汁汽水冰淇淋 | Regenerated and verified | `d1cdf3cf-7ce0-4ef4-be72-7e568be421d6` |
| tag | Pitcher Cocktail | 壶装鸡尾酒 | Regenerated and verified | `22c1d6b8-4ce3-4c55-915a-e76fc98134bc` |
| tag | Nostalgic | 怀旧 | Regenerated and verified | `26afd03a-25d8-4555-ac2d-ab328c427474` |
| tag | Comfort Drink | 舒心饮品 | Regenerated and verified | `2bcd0a8b-79b1-4bb9-9304-49277030d9e7` |
| tag | Mixed Drink | 混合饮品 | Regenerated and verified | `4696042d-32ea-42c8-b3d4-c0eb0f6201ed` |
| tag | Three-Ingredient Cocktail | 三种材料鸡尾酒 | Regenerated and verified | `b4c2da3a-1632-4f79-855c-c1a937af249d` |
| tag | Poison Apple | 毒苹果 | Regenerated and verified | `85f176e7-cfd0-4e41-96b5-07020f823606` |
| tag | Apple Pie | 苹果派 | Regenerated and verified | `db08f02e-f3eb-4e6b-a871-c0b1236a36e9` |
| tag | Mother's Day | 母亲节 | Regenerated and verified | `9b3a3659-664b-4670-8ef8-d10fae8cff98` |
| tag | Jolly Rancher | Jolly Rancher 品牌 | Regenerated and verified | `984d1113-8553-4a60-8088-7af91e683f8e` |
| tag | Creamsicle | Creamsicle 品牌 | Regenerated and verified | `5ed3f839-187a-4eed-8b40-9abfc5a1fd1a` |
| tag | Orange Creamsicle | Orange Creamsicle 品牌 | Regenerated and verified | `935cb0dd-6c1e-48d9-a648-faf093c4aa70` |
| tag | IBA | IBA 国际调酒师协会 | Regenerated and verified | `dc524b78-b968-4b85-b914-1258b27fd87b` |
| tag | Dragon Bleu | Dragon Bleu 品牌 | Regenerated and verified | `05c58d85-eb39-48f4-83e7-08ea5a1ae7b5` |
| tag | Luxardo | Luxardo 品牌 | Regenerated and verified | `46acf22e-aa0a-4548-b919-60378dd905a1` |
| tag | Tuaca | Tuaca 品牌 | Regenerated and verified | `caa9f813-5b4e-4308-8e7d-cd17336cb0fd` |
| tag | Jungle Punch | 丛林潘趣 | Regenerated and verified | `161faa11-51c3-45e3-a3d3-4d086f92d555` |
| tag | White Balsamic Reduction | 白香醋浓缩液 | Regenerated and verified | `7b5662e8-a969-451a-9c13-76b2f0572370` |
| tag | Diet Cranberry | 低热量蔓越莓 | Regenerated and verified | `bafa98a7-0577-47f3-ab5e-9eb0ebede9a0` |
| ingredient | Orange Twist | 橙皮卷 | Regenerated and verified | `58d2d3ba-dcc3-4c5d-bc7f-dcecac3b2049` |
| ingredient | Heavy Cream | 淡奶油 | Accepted: 淡奶油 is established mainland usage for unsweetened cream, including heavy whipping cream; 浓奶油 is not required for source fidelity. | `c9f8b1b7-ca67-4dfe-abda-89fb5d893951` |
| ingredient | Whipped Cream | 打发奶油 | Regenerated and verified | `a5c3e0d0-563d-40a6-bc32-a66d452657c0` |
| ingredient | Brown Sugar | 红糖 | Regenerated and verified | `90099cf5-6191-4c33-8f1b-cf859aef6e1f` |
| ingredient | Celery Salt | 芹菜盐 | Regenerated and verified | `8508ff03-a9f3-4c17-b36c-1b7e122ac216` |
| ingredient | Peach Nectar | 桃汁饮料 | Regenerated and verified | `e119a29b-ffdd-4721-b81a-80181f00fabd` |
| ingredient | Yellow Chartreuse | 黄色 Chartreuse | Regenerated and verified | `eb778039-cc62-49e9-82ea-c0c0be1714c0` |
| ingredient | Advocaat | 蛋黄利口酒 | Regenerated and verified | `825bab59-63f3-4b2f-8c55-5b989a675ce7` |
| ingredient | Falernum | 法勒南姆 | Regenerated and verified | `fd2d59be-d69a-4217-ae41-5602af2698f3` |
| ingredient | Angostura Bitters | Angostura 苦精 | Regenerated and verified | `72b3b675-9a06-4b3a-97c1-dea32317f236` |
| ingredient | The Bitter End Memphis BBQ Bitters | The Bitter End Memphis BBQ 苦精 | Regenerated and verified | `32894962-94ad-4b7b-89ee-3208fa371cfd` |
| ingredient | Midori Melon Liqueur | Midori 蜜瓜利口酒 | Regenerated and verified | `40946ae1-0601-4bf2-8a33-5050f45c3b8e` |
| ingredient | Chambord Raspberry Liqueur | Chambord 树莓利口酒 | Regenerated and verified | `c5a4b26b-bc5f-4551-b64c-72d95cbc07d8` |
| ingredient | Peter Heering Cherry Liqueur | Peter Heering 樱桃利口酒 | Regenerated and verified | `77477b12-3109-4e86-a4ae-4fba5456990d` |
| ingredient | Domaine De Canton Ginger Liqueur | Domaine De Canton 生姜利口酒 | Regenerated and verified | `576e7a68-bafd-404b-adc9-cc85976bd230` |
| ingredient | Godiva Liqueur | Godiva 利口酒 | Regenerated and verified | `5feca483-6b92-4ace-97a4-95ab52098920` |
| ingredient | Skinnygirl White Cherry Vodka | Skinnygirl 白樱桃伏特加 | Regenerated and verified | `432b9ea4-3e6e-4d33-9a06-225bd7b50b0c` |
| ingredient | Skinnygirl Coconut Vodka | Skinnygirl 椰子伏特加 | Regenerated and verified | `f6fb2a55-20b1-44db-81b4-63959382f3c3` |
| ingredient | Tabasco Sauce | Tabasco 辣酱 | Regenerated and verified | `68540650-a342-4d5a-9f5a-7f9e80ad3606` |
| ingredient | Tabasco Chipotle Sauce | Tabasco Chipotle 辣酱 | Regenerated and verified | `7df81901-8497-4c3d-8151-d5e7f949876e` |
| ingredient | Diet 7UP, Chilled | Diet 7UP（冰镇） | Regenerated and verified | `5a2cc612-8d51-4528-8fe2-b132f27e25b7` |
| ingredient | Cointreau (a Splash) | Cointreau（少许） | Regenerated and verified | `b2f1737b-8146-4e64-ace5-00a679b03800` |
| ingredient | Giffard Crème De Pamplemousse Rose (pink Grapefruit Liqueur) | Giffard Crème De Pamplemousse Rose（粉红葡萄柚利口酒） | Regenerated and verified | `30704cc5-f2d7-4be1-ae6a-79350aa8e36d` |
| ingredient | Dragon Bleu Rose Vodka (or Preferred Rose-Flavored Vodka) | Dragon Bleu Rose Vodka（或任选玫瑰味伏特加） | Regenerated and verified | `d84c1a2c-14a2-4801-973f-3001e4ae25c1` |
| ingredient | 151 Proof Rum | 151 proof 朗姆酒 | Regenerated and verified | `0f667dfb-acd5-4727-9c8c-48730722cbec` |
| ingredient | Crystal Light Lemonade | Crystal Light 柠檬水 | Regenerated and verified | `4c931f28-f483-46be-a96c-1490ae8702df` |
| ingredient | Maraschino Cherry | 马拉斯基诺樱桃 | Regenerated and verified | `8247103c-b111-4e46-93eb-723c02711faf` |
| ingredient | Pepper | 胡椒 | Regenerated and verified | `cfd87578-086b-44e5-86b6-d4a3cefc52a0` |
| ingredient | Sarsaparilla | 沙示 | Regenerated and verified | `afe70190-9447-45f1-915a-0f7a541a526a` |
| ingredient | Demerara Sugar | 德梅拉拉糖 | Regenerated and verified | `9dce237e-3cf7-4391-9c09-1bc11e91e7cb` |
| tag | Absolut Vodka | Absolut 伏特加 | Regenerated and verified | `ad3a4b7e-5075-4367-9140-b8c537c62e7a` |
| tag | Old Bay Seasoning | Old Bay 调味料 | Regenerated and verified | `c541c86c-b602-4eda-b4f0-31c22cdbd993` |
| tag | Clear | 清澈 | Regenerated and verified | `432a1120-3871-41a2-bf7f-34efd8eb0ad6` |
| tag | Hangover | 宿醉 | Regenerated and verified | `6db8e37a-a270-43b1-9d9c-3e5f65bcd7cc` |
| tag | Cocktail Part | 鸡尾酒会 | Regenerated and verified | `b027ec12-a832-4e71-90a0-d91d71a28290` |
| tag | Punch Bowl | 潘趣酒钵 | Regenerated and verified | `0ff92758-8a24-4cb6-be18-f73be9dca164` |

## Known recipe name failures and resume

Live checks found three semantic failures after the structural checks passed. The full recipe-name and sample review returned `Credit balance is too low`, with no review result. After credit was restored, the three ids were regenerated using the explicit English to Chinese pairs in `LOCALE_AI_TERMS.zh`. Stored values and live Chinese searches now match the required names.

| English source | Current stored name | Required name | Id |
| --- | --- | --- | --- |
| Cosmopolitan | 玛格丽特 | 大都会 | `2317f8d5-6bb2-42d3-9e84-7910f7ede2e9` |
| Gin Tonic | Gin Tonic | 金汤力 | `c5d3b04d-aaef-4cf8-ba59-4891cdb5675b` |
| Martini | 玛格丽特 | 马天尼 | `c648453b-0277-4e43-8aff-878c22650c3c` |

After credit is restored, rerun these ids. A normal run skips them because their English source is unchanged.

```powershell
pnpm --filter @bartendingapp/shared translate-catalog --locale zh --ids '2317f8d5-6bb2-42d3-9e84-7910f7ede2e9,c5d3b04d-aaef-4cf8-ba59-4891cdb5675b,c648453b-0277-4e43-8aff-878c22650c3c'
pnpm --filter @bartendingapp/shared translate-catalog --locale zh
```

Done: the all-name and 30-recipe reviews ran, and the searches were repeated. 金汤力 now finds Gin Tonic. English Margarita and Jamaica Kiss queries work. Traditional 瑪格麗特 returns no rows, as expected without script folding.

Ingredient prefix order and staple filtering passed: including staples adds Ice for 冰 and Water for 水. All nine English, Japanese, and Korean regression searches remain unchanged, as do the 3,345 other-locale notes rows.

The local production server returned 200 without a redirect for Chinese Margarita and Jamaica Kiss recipe URLs, retained English canonical slugs, linked Chinese fonts, and rendered `noindex`. This is an HTTP check, not a visual or physical device sign off.

## Catalog and notes review, second run

Model: `claude-opus-5` through Claude Code with tools disabled, 2026-11-13. Drafts by Haiku through the normal pipeline. No translated database row was edited by hand.

**First recipe review** (475 names, a 30 recipe sample): 53 findings. Name errors (Gin Sling 金酒林, Lemon Drop 柠檬水, Screwdriver 螺丝钉, Frosé 冻玫瑰, Royal and other Fizz names as 苏打, shots as 射), plus three that pointed past the sample. A scan of all 475 recipes then found:

- Seven instructions cut off at a source quote (Whiskey Sour at `'On the rocks'`, Vampiro, Mulled Wine, Sol Y Sombra, Winter Paloma, Homemade Kahlua, Empellón Cocina). Cause: the model wrote a straight `"` inside its structured reply, which ended the JSON string.
- 38 measures with a changed unit or a split decimal: cl stored as ml (Kiss me Quick, Vampiro, a tenfold error), oz converted to ml, `0. 5 盎司`.
- 105 recipes with strain as 倒入 (pour), 57 with 上菜 or 上桌 for serve, 14 with blend as stir, and 冷冻 (frozen) for chilled.

Fixes, all in code and terms:

- `LOCALE_AI_TERMS.zh` gained method words (滤入, 享用 or 奉上, 冰镇, 用搅拌机打, 皮卷, proof) and a reviewed recipe name glossary: 71 pinned names, including 32 that keep their exact English name (Royal Flush, The Slammer, Aviation, Penicillin). Swizzle is pinned apart from Sling.
- `catalogTranslation.ts`, Chinese only: `unquotedSource` removes quote marks from the source steps before the prompt; `chineseMeasureUnits` labels oz as 盎司 and fl oz as 液量盎司; `chineseRecipeReplyProblems` rejects a reply with a changed unit, a split decimal, or steps cut short, so the retry catches it before any upsert. Tests beside the source.
- 191 recipes rerun with `--ids`, then the skipped ones until none remained.

**Second recipe review** (all 475 names again, each with its name before the rerun, plus a new 30 recipe sample from the rerun set): 55 findings. 32 were names, mostly literal inventions from the rerun (Royal Flush 皇家冲洗, The Slammer 锤子, Tuxedo 白领鸡尾酒), now pinned to English. 11 were measures that kept `cup`, `qt`, `gal` in English; units other than metric and oz are now translated (杯, 夸脱, 加仑). 41 ids rerun, then glossary misses rerun until all 71 pinned names matched.

Accepted tradeoffs, recorded rather than changed: the glass label 潘趣酒钵 for punch bowl (Opus suggested 潘趣酒碗; 潘趣酒钵 matches the reviewed tag). Mixed 马天尼 and 马提尼 in Martini variants, and mixed suffixes for Sour, both acceptable mainland forms. Source defects mirrored, not fixed (Moscow Mule ginger ale versus ginger beer, the Thai Iced Coffee pods measure, the Bloody Mary label). Rewordings that differ from Opus's suggested text but carry its fix (no serve word, complete steps).

**Final catalog state:** 475 recipes and 1,829 measures. Every scan returns zero: Traditional, banned terms, kana, Hangul, full width Latin, non NFC, typography drift, steps cut short, strain without 滤, serve words, unit changes, split decimals. The only 冷冻 left translates a source that says frozen. Live searches: 金汤力, 大都会, 马天尼, 椰林飘香, 长岛冰茶, 螺丝起子, 金酒司令, and English Royal Flush each find their recipe; 瑪格麗特 finds none, as expected. English notes and all 3,345 other locale translation rows hash the same before and after every run (`f12d3e47d5`, English `7d1e6ecabd`).

**Notes.** Batch 1 (80 recipes, 240 lines): 91 findings, all fixed in the file, plus seven unflagged 冷冻的 lines made 冰镇的, then applied. The remaining 393 recipes were proposed again with the new terms, then reviewed in ten batches: 520 findings (9 critical: three fields left untranslated, six 射手酒 or 射击杯 for a shot), all fixed in the file. Remaining 冷冻 lines were checked by hand: each translates frozen or freezer. Shared script, banned term, and typography checks pass on every line. Applied: 473 `zh` rows hold notes. Boyarsky and Early Riser have no English notes, so no locale has notes for them. A fresh `propose-recipe-notes --locale zh` finds nothing to propose. Files kept (gitignored): `recipe-notes-proposals.zh.applied-2026-11-13-batch1.json`, `…-batch2.json`, and both `before-notes-pass` copies.

`pnpm test`: 70 files, 1,126 tests pass. All 8 typecheck and lint tasks pass (the two mobile warnings were already there).

## Live drink ideas, first run

Ten ideas from `generate-drink-idea` version 21 with `locale: "zh"`, signed in as the test account (pantry: Simple Syrup, Vodka, Lime Vodka, Lime Juice), 2026-11-13. All ten returned 200, and every `source_name` is an exact English pantry name (AC-17 pantry check passes).

Review: `claude-opus-5`, tools disabled, same day. Outcome: reject. Passed: 青柠 for every lime item and no 柠檬; no 您; no Traditional, kana, or Hangul; a space after numbers. Findings:

- Critical: every idea is named 青柠伏特加苏打, which names soda that no recipe uses.
- Critical: `oz` (idea 1) and 毫升 (ideas 2, 5) instead of 盎司 and ml.
- Major: simple syrup as 简单糖浆 or 简易糖浆, not 糖浆; 摇酒器, 漏勺 (a slotted spoon), and 调酒棒 for shaker, strainer, and bar spoon; strain as 倒入; most steps end with no 。.
- Minor: 冰冷 and 冷却 for chilled; 青柠果汁 for 青柠汁.

Fix: `CHINESE_INSTRUCTION` gained a name rule (only ingredients the recipe uses, no added mixer), the step words (糖浆, 青柠汁, 摇酒壶, 滤冰器, 吧勺, 滤入, 冰镇) phrased as step wording so no tool becomes an ingredient, the units (ml, cl, L, 盎司, never oz or 毫升), and a closing 。 on every step. `LOCALE_AI_TERMS.zh` already pins these words for the catalog. The hand copy tests pass.

Accepted, not Chinese specific: the same pantry gives the same name across separate requests; the optional lime garnish outside the pantry, and 新鲜 for lime juice, are how ideas behave in every locale.

## Live drink ideas, second run

Ten ideas from version 22 (the fixed instruction, deployed by you), 2026-11-13, through two anonymous guest sessions with the same four item pantry, five ideas each (the test account's daily limit was used). All ten returned 200; every `source_name` is an exact pantry name.

Review: `claude-opus-5`, tools disabled. Outcome: changes requested, down from reject. Every first run rule now holds: units ml, cl, or 盎司; 糖浆; 摇酒壶, 滤冰器, 滤入, 冰镇; 。 on every step; 青柠; no 您, Traditional, kana, or Hangul. Findings:

- High: idea 8 still named 青柠伏特加苏打 (soda); idea 9 named 青柠伏特加莫吉托 (Mojito, implying mint, rum, and soda).
- Medium: ideas 6 and 9 left Lime Vodka in English; idea 10 wrote `15ml` with no space.
- Low: idea 2 used 饮用 for serve.

Accepted by the reviewer: five ideas share the name 青柠伏特加 (accurate, and each request is separate); 马天尼 for a shaken vodka and lime serve (modern bar usage); mixed unit systems across ideas, each recipe consistent; 玻璃杯 in idea 10.

Fix: `CHINESE_INSTRUCTION` now forbids 苏打 or another mixer the recipe lacks and any borrowed cocktail name (莫吉托, 马天尼) unless the recipe is that cocktail, writes generic ingredient names in Chinese (only brands stay English), puts a space between number and unit (30 ml), and pins serve as 享用 or 奉上. The shared typography rule still leaves `30ml` alone (spec rule 8), so the space comes from the instruction. Hand copy tests pass.

## Live drink ideas, third run and outcome

Ten ideas from version 23, deployed by you, 2026-11-13, through two more anonymous guests with the same pantry. All ten returned 200; every `source_name` is an exact pantry name.

Review: `claude-opus-5`, tools disabled. Outcome: changes requested. Every Chinese convention is clean across all ten: ml with a space, full width punctuation with 。 on every step, no Traditional, kana, or Hangul, 你 and never 您, 青柠 and never 柠檬, the pinned words, and generic ingredients in Chinese. Findings:

- Major, not Chinese specific: names still claim an absent mixer or borrow a cocktail (青柠伏特加苏打 twice, 青柠伏特加玛格丽塔, 青柠伏特加托尼 for tonic); garnish steps add fresh lime the pantry lacks; 挤入 (squeeze) for bottled juice.
- Minor, Chinese specific: 享用你的… (enjoy your…), a pronoun calque in the last step; and names ending in a bare adjective (青柠伏特加爽, 青柠伏特加梦).

Asked directly, Opus judged the name and garnish problems not Chinese specific. They come from the shared prompt every language uses (spec 0007's "short, appealing name", no rule against garnish outside the pantry) together with a one note four item pantry.

**Decision (you, 2026-11-13): accepted and tracked separately.** AC-17 and AC-20 are met for Chinese conventions. The name and garnish issue across all languages is a follow-up that needs its own decision. It is not fixed here, because changing the shared prompt touches every launched language. The one Chinese specific finding is fixed: `CHINESE_INSTRUCTION` now asks for short commands with no pronoun, never 享用你的…. This last change is verified by the hand copy tests and deployed as Edge Function version 24 (2026-11-13, Supabase CLI, project `ctuzjhhpnkkhooneporu`). Before the deploy, the live version 23 differed from the repo only by this one sentence. It is not yet seen in a live idea. Check it on the next idea run.

Guest sessions used: four anonymous users with four pantry rows each, removed by the anonymous cleanup job on its schedule. The guest limit for this IP (20 a day) and the test account's limit (10) are both used until 2026-11-15 00:00 UTC.

## Preserved notes proposal

Superseded by the second run above: these 80 proposals were reviewed, fixed, and applied.

File: `packages/shared/scripts/tagging/recipe-notes-proposals.zh.json`. Eighty proposals are present, schema valid, NFC, and clear of script and banned term checks. They remain unreviewed by Opus and unapplied. The generator was stopped after the API rejected requests for insufficient credit. Boyarsky and Early Riser lack an English source note and were excluded. Changing English source content is outside this Chinese backfill.

After the required reviews, apply reviewed proposals in Chinese only, archive the consumed file, and rerun the proposal job for the remaining empty Chinese fields. Preserve the current file until it is reviewed. It must not be applied as if it already passed review.

## Translation batch validation

The backfill exposed duplicate model ids, causing Postgres error 21000 and rejecting the whole upsert. Recipe and name responses now require every requested id exactly once inside the retry boundary, before upsert. Regression cases cover a valid reordered reply, duplicates, missing ids, unexpected ids, and extra ids. The resumed backfill retried malformed replies and completed. A final normal run translated zero items.

## Database structure and locale config

Run after applying the migration. The first query must return exactly one row with config `simple`; the second must return no rows.

Result (2026-11-13, read only through the Supabase MCP, project `ctuzjhhpnkkhooneporu`): the first query returns one row, `zh` / `simple`; the second returns no rows. Security advisor the same day: no finding names `supported_locales` or a translation table. Every finding predates Chinese (quota tables with RLS and no policy, security definer functions callable by `anon` or `authenticated`, anonymous access policies, leaked password protection off).

```sql
select code, text_search_config
from public.supported_locales
where code = 'zh';

select p.oid::regprocedure
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosrc ~ '''(es|pt|fr|ru|hi|ja|ko|zh|spanish|portuguese|french_unaccent|russian|hindi|simple)''';
```

## Catalog checks

Run after the backfill and again after notes are applied. Each check must return no rows. The Traditional class below is generated from `TRADITIONAL_ONLY_CHARACTERS` in `chineseScript.ts`, not maintained separately. Regenerate it when that constant changes. The kana class excludes U+30FB and U+30FC as specified.

```sql
with texts as (
  select 'recipe' as kind, recipe_id::text as id,
    concat_ws(' ', name, instructions, glass, drink_style_note, bartender_tip, presentation_tip) as body
  from public.recipe_translations where locale = 'zh'
  union all
  select 'ingredient', ingredient_id::text, name
  from public.ingredient_translations where locale = 'zh'
  union all
  select 'tag', tag_id::text, name
  from public.tag_translations where locale = 'zh'
  union all
  select 'measure', recipe_id::text || '/' || ingredient_id::text, coalesce(measure, '')
  from public.recipe_ingredient_translations where locale = 'zh'
)
select kind, id, issue
from texts
cross join lateral (values
  ('Traditional', body ~ '[麗瑪龍蘭檸萊薑鹽醬蘋櫻藍綠紅黃熱涼凍搖攪濾壓擠滿飲雞調類級蘇釀葉塊顆個們這為與來時會後裡麼開關譜單選儲櫃購買賣評論語設錄帳戶驗證隱載歡應無鐘點頁請讓說給過還進適並兒內兩冊別劃勝動務勞勢區協卻參員問嗎嚴團圖國圍圓園場壞報墊夠夢奪奮婦媽學孫寧實寫寬寶審對導將專尋層屬島嶺幣師帶幫庫廣廠廳廚張強彈彎徑從復複幾幹愛態慣慶憶懷戀戰戲擁據擇擔擊掃掛採換揮損搶撥擴攝擺數斷晝暫曉書條東極樂業構槍樣標樓樹橋機檢權歐歲歷曆歸殘殺殼毀氣決沒況洩淚淨淺測湯溝溫準滅漢漲漸潔濃濕濟濱灣瀏灑災煙燈燒營爐爛爭爺爾牆狀獎獨獲獻獸現環產畫異當畢療瘋癢發盜監盤盡眾礙確碼礦禮禍種稱積穩窩窮競竄筆節範築簡簽籃籤糧糾紀約紙納純細終組結絕絲統經維網緊線練編緣縣縮總績織繼續纖罰羅習聖聞聯聰聲職聽腦臉腳膽臟舉舊興艱藝藥處號虧蟲術衛裝補製裏見規視親覺覽觀觸計訂討訓記許訴訪詞試詩話該詳認誌誤誰課談諸謝講謂識議護譯讀變貝負貨責貴貿賀資賓賞賠賴賺賽贈贏贊趕跡踐躍車軍軟較輕輛輝輪輸轉輯轟辦辭農連週遊運達違遠遞遲遷遺邊郵鄉鄰醫釋醜釣針鈴銀銅銷鋼錯錶鍋鍵鎖鎮鏡鐵鑰長門閉間閃閒閱闆闊闖隊階際陣陳陸陰陽險隨隻雖雙雜離難電雲霧靈靜韓響頂項順須預頑頓領頭頻題額顏願顧顯風飛飯飽飾養餅餓餘館馬駐駕騎驚驟體髮髒鬆鬧鬥鬱魚鮮鯊鳥鳴鴨鵝鷹鹹麥麵黨齊齒齡龜臺檯颱傑]'),
  ('kana', body ~ '[ぁ-ゟ゠-ヺヽ-ヿ]'),
  ('Hangul', body ~ '[가-힣ᄀ-ᇿ㄰-㆏]'),
  ('banned wording', body like '%您%' or body like '%莱姆%' or body like '%琴酒%'
    or body like '%兰姆酒%' or body like '%青柠檬%'),
  ('full width Latin or digits, space, or Japanese quotes', body ~ '[０-９Ａ-Ｚａ-ｚ　「」『』]'),
  ('not NFC', body <> normalize(body, NFC))
) as checks(issue, failed)
where failed;

with names as (
  select 'recipe' as kind, recipe_id::text as id, name
  from public.recipe_translations where locale = 'zh'
  union all
  select 'glass', recipe_id::text, glass
  from public.recipe_translations where locale = 'zh' and glass is not null
  union all
  select 'ingredient', ingredient_id::text, name
  from public.ingredient_translations where locale = 'zh'
  union all
  select 'tag', tag_id::text, name
  from public.tag_translations where locale = 'zh'
)
select * from names
where name ~ '[㐀-䶿一-鿿豈-﫿][[:blank:]]*[·・･•‧∙]|[·・･•‧∙][[:blank:]]*[㐀-䶿一-鿿豈-﫿]';

select 'recipe' as kind, t.recipe_id::text as id, t.name, r.name as source_name
from public.recipe_translations t
join public.recipes r on r.id = t.recipe_id
where t.locale = 'zh' and t.name !~ '[㐀-䶿一-鿿豈-﫿]' and t.name is distinct from r.name
union all
select 'ingredient', t.ingredient_id::text, t.name, i.name
from public.ingredient_translations t
join public.ingredients i on i.id = t.ingredient_id
where t.locale = 'zh' and t.name !~ '[㐀-䶿一-鿿豈-﫿]' and t.name is distinct from i.name;

select 'glass' as kind, recipe_id::text as id, glass as name
from public.recipe_translations
where locale = 'zh' and glass is not null and glass !~ '[㐀-䶿一-鿿豈-﫿]'
union all
select 'tag', tag_id::text, name
from public.tag_translations
where locale = 'zh' and name !~ '[㐀-䶿一-鿿豈-﫿]';

select distinct t.recipe_id, r.name, i.name as source_ingredient
from public.recipe_translations t
join public.recipes r on r.id = t.recipe_id
join public.recipe_ingredients ri on ri.recipe_id = r.id
join public.ingredients i on i.id = ri.ingredient_id
left join public.ingredient_translations it on it.ingredient_id = i.id and it.locale = 'zh'
where t.locale = 'zh' and (
  (i.name ilike '%lime%' and concat_ws(' ', t.name, t.instructions, it.name) not like '%青柠%')
  or (i.name ilike '%lemon%' and concat_ws(' ', t.name, t.instructions, it.name) not like '%柠檬%')
);
```

The citrus check includes displayed ingredient translations, because recipe steps may say only “shake all ingredients”.

Rerun failing catalog ids with `translate-catalog --locale zh --ids <ids>`, never by manually editing a translated row. Keep a snapshot of other locales' notes before the Chinese notes apply, and confirm that snapshot is unchanged afterwards.

## Remaining behavior checks

- [ ] AC-2, AC-9: a translated recipe uses Chinese fields and the English slug with no redirect. A recipe without a Chinese row falls back to English. A retained English name equals its exact source.
- [ ] AC-3: use real translated catalog names for full and partial Chinese recipe and ingredient queries; check prefix ordering and staples filtering. Latin queries still find English names. Record regression search snapshots for English, Japanese, and Korean before and after the row insert.
- [x] AC-10, AC-11: inspect rendered fonts and requests on Chinese recipe, pantry, and account pages at 360 px and 1280 px. Every shipped character uses Inter or Noto SC; closing punctuation never starts a line, and long retained English names do not overflow. Other locales request no SC font assets.
  - 2026-11-13, guest, local production build, headless Chromium 1.63 (no login, so the pantry was empty). Pages: Jamaica Kiss, The Incredible Apicius Bloody Mary (longest retained English name), Empellón Cocina 的油脂浸泡梅斯卡尔 (longest mixed name), pantry, and account, each at 360 px and 1280 px.
  - Pass, fonts (AC-10): Chromium's own per node font report lists only Noto Sans SC, Noto Serif SC, and Inter on every page. No Google Fonts request. `/en`, `/ja`, and `/ko` request no `/fonts/zh/` file. All pages return 200 with `lang="zh-Hans"`; correct English slugs load with no redirect.
  - Pass: no page scrolls sideways at either width, and no closing Chinese punctuation starts a line (a per character line position scan).
  - **Fail at 360 px (AC-11), four findings, none at 1280 px:** (1) the ingredient row buttons 加入原料柜 and 加入购物清单 wrap one character per line, so each row is about 135 px tall (Japanese has the same layout and is worse, about 194 px, so this predates Chinese); (2) the 含酒精 chip on related recipe cards wraps one character per line; (3) retained English names on related recipe cards overflow the card border (Godmother; Kool-Aid Slammer touches it); (4) Chinese names break inside words (你的原料 / 柜 heading and the 原料柜 menu label on the pantry page, 牙买加 / 之吻 and 白俄罗 / 斯 on cards). Open until fixed or accepted.
  - Signed in as the test account (same day): account and the filled pantry rows are clean at 360 px with no sideways scroll. The pantry's recipe cards repeat findings 2 to 4 (Kamikaze overflows its card, the vertical 含酒精 chip, 还缺：橙 / 皮利口酒).
  - Resolved (805d382, 2026-11-13, /develop). Findings 1 and 2 fixed, scoped to `:root:lang(zh-Hans)` so no other locale changes: `globals.css` sets `word-break: keep-all` on every `button` (ingredient row buttons and every chip), and the ingredient row `<li>` wraps its buttons under the name (`flex-wrap`, buttons pushed right). Rechecked on a local production build, headless Chromium at 360 px: each Chinese row is 74 px (was 135), 加入原料柜 and 加入购物清单 sit on one line each, 含酒精 sits on one line; the Japanese, Korean, and English rows measure exactly as before (194, 77 to 112, and 69 to 72 px). Pantry and account still scroll 0 px sideways. Finding 3 is accepted here as not Chinese: the related card text column at 360 px is narrower than a retained English name in every locale (English Gin Lemon and the Alcoholic chip overflow it too, recorded in the Korean verify), a shared card grid issue. Finding 4 is accepted: AC-11 asks Chinese to wrap between characters, which is how Chinese is set, and Chrome's `auto-phrase` covers Japanese only. Open follow ups outside this feature: the narrow card grid in every locale, and the Japanese ingredient row buttons (still one character per line).
- [x] AC-15, AC-16: Chinese notes proposals affect empty Chinese fields only. Saving admin Chinese notes changes only the Chinese row. Applying reviewed notes leaves all other locales unchanged. (AC-15 done 2026-11-13: both applies changed only `zh` rows, by hash. AC-16 done 2026-11-13: signed in as the test admin on a local production build, headless Chromium, `/zh/admin/recipes/<Jamaica Kiss id>/edit`. The form showed the stored Chinese tip. Saving the 简体中文 section with a marker appended changed only the `zh` row, only its `bartender_tip`; the es, fr, hi, ja, ko, pt, and ru rows and the English recipe row were unchanged by hash, ignoring timestamps. Restoring the original text through the same form returned every row to its starting hash.)
- [x] AC-17: Chinese drink ideas use Chinese typography, names, and terms and still verify against English pantry source names. (2026-11-13, third run: conventions clean; invented names and garnish are a shared prompt issue, accepted by you and tracked separately.)
- [ ] AC-18: an unlaunched stored Chinese preference remains stored but is ignored; after launch it wins even with a Traditional device or browser language.
- [ ] AC-21: English set physical iOS and Android phones show Chinese recipe, pantry, and account screens without clipped lines. Check mainland forms of 直、骨、角 next to 门、饮、调, one consistent typeface, and rating counts 1 and 2 using `other`.
- [ ] AC-8, AC-23: only after the review, backfill, and notes evidence is complete, add Chinese to both launch lists together. Ship a mobile build. Confirm production discovery, `zh-Hans` sitemap and alternates, Simplified detection, Traditional fallback, and stored preference precedence.
  - Launch commit 9f18bee (2026-11-13): `"zh"` added to `LAUNCHED_LOCALES` and `CATALOG_TRANSLATION_LOCALES` together, the `hreflangAlternates` launched map gains `"zh-Hans": "/zh"`, and a "launched Simplified Chinese" describe block covers `zh`, `zh-CN`, `zh-SG`, `zh-Hans` detection, Traditional headers landing on English, and a stored `zh` winning over `zh-TW`. The `notesByLocale` fixture already had its `zh` block. `pnpm test`: 70 files, 1,130 tests pass.
  - Local production build, same day: `/account` with `zh-CN`, `zh`, and `zh-Hans` → 307 to `/zh/account`; `zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7`, `zh-HK`, and `en-US` → `/en/account`; a `NEXT_LOCALE=zh` cookie with `zh-TW` → `/zh/account`. The sitemap names a `/zh/` URL 4,570 times (entries plus alternates) and has 4,122 `hreflang="zh-Hans"` alternates, the same counts as `ko` and `ja`. The `/en` Jamaica Kiss page lists a `zh-Hans` alternate with the English slug; the `/zh` page has `<html lang="zh-Hans">`, a self canonical, and no `noindex`. The switcher renders `LAUNCHED_LOCALES` with `lang={LOCALE_HREFLANG[value]}`, so 简体中文 now shows with `lang="zh-Hans"` (read from `site-nav.tsx`; the rendered menu was not opened). Still owed: the mobile build and the production check after deploy.
- [x] AC-24: feature 60 now includes Simplified Chinese store listing copy.
