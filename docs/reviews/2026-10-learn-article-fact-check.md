# Learn article fact check · spec 0033 · started 2026-10-10

_The record for scope feature 39. Each published article gets one entry: the claims changed and the named source behind each change, or "no changes needed" with what was checked. An entry is approved by the owner before its correction is applied. Unsourced claims are removed or softened, never kept as is._

## Where the known findings live (step 0, read 2026-10-10)

Searched live `body_markdown` on `BartendingAppWeb` (18 `published` rows, 1 `archived`). No body contains `$learn$`.

| Finding (scope feature 39) | Article | id |
|---|---|---|
| Syrup keeps indefinitely, no refrigeration | Simple Syrup and Other Bar Syrups, Explained | `73be1b10-c078-414f-a12f-1c18da1e8346` |
| Grenadine ratio | Simple Syrup and Other Bar Syrups, Explained | `73be1b10-c078-414f-a12f-1c18da1e8346` |
| "suggests complexity" (live text: "Despite its name suggesting complexity") | Simple Syrup and Other Bar Syrups, Explained | `73be1b10-c078-414f-a12f-1c18da1e8346` |
| Bitters with the 1 oz side, pouring in sequence | What Is a Jigger? (published) | `d7389446-31f0-48fd-bc9d-e2c7501bed50` |
| US label rules, the water explanation, Negroni advice | What Does Proof Mean? | `4f0e6dd4-c5b9-4908-bd1f-b8c71b9affca` |
| "concentrated grain alcohol", char times | Why Spirits Age in Oak Barrels | `703483d8-332f-4028-a5cb-1c7bbf31949f` |

All three syrup findings share one article, so slice 1 fixes them together.

## Entries

### Simple Syrup and Other Bar Syrups, Explained

- **id**: `73be1b10-c078-414f-a12f-1c18da1e8346`
- **Migration**: `supabase/migrations/20261010130000_learn_fix_simple_syrup.sql`
- **md5**: before `69e9472f8ded24aaca392905c0e1bbac`, expected after `b562ed3205d4f7f2c1e01ae9855cb0f6`
- **Approved**: owner, 2026-10-10
- **Applied**: _pending (owner runs the migration in the SQL editor)_

| # | Claim before | Claim after | Source or reason |
|---|---|---|---|
| 1 | Syrup "keeps indefinitely" in an airtight bottle away from sunlight; no refrigeration | Refrigerate in a clean, sealed bottle. 1:1 is best used within about a month; 2:1 keeps up to about six months in the fridge | Clair McLafferty, "How to Extend the Shelf Life of 4 Common Ingredients", Tales of the Cocktail Foundation, 2016-03-09 (1:1 "about a month", 2:1 "about six months"). Simon Difford, "How to make sugar syrup", Difford's Guide (2:1 refrigerated "will keep for six months") |
| 2 | Recipe step 4: "Store in a clean bottle" | "Pour into a clean bottle, seal it, and refrigerate" | Same as 1 |
| 3 | Grenadine: about 1 part sugar to 4 parts juice, reduced and simmered until syrupy | Warm juice and sugar just until dissolved, no simmer; recipes run 1:1 to 2:1 sugar to juice by volume; refrigerate, use within about a week | "Pomegranate (grenadine) syrup", Difford's Guide (2 cups sugar to 1 cup juice, "do not let the juice even simmer", refrigerated "a week or so"). Jeffrey Morgenthaler's DIY grenadine as published by Food52 (2 cups juice, 2 cups sugar); seen through search results only, the page itself was rate limited |
| 4 | "Despite its name suggesting complexity" | "True to its name" | Logic: the word "simple" doesn't suggest complexity |
| 5 | Vodka "about 10% of the volume" as a preservative | "a small splash of high-proof vodka… doesn't replace refrigeration" | No source for the 10% figure, so softened. The vodka trick itself is mentioned in the Tales of the Cocktail article above |
| 6 | Rich syrup "dissolves more slowly into cold cocktails, giving you better control over sweetness" | Removed; now "so you'll need a little less of it" | No source, removed. The replacement follows from "more sweetness per ounce" |
| 7 | Honey syrup "classic in Whiskey Sours and Hot Toddies"; "some bartenders add a squeeze of lemon" | "a natural fit for sours and warm drinks like the Hot Toddy"; lemon line dropped | A classic Whiskey Sour is sweetened with sugar, so softened |
| 8 | Spirits "vary by brand and vintage"; Sazerac named for rich syrup (traditionally a sugar cube) | Both removed | No source, removed |
| 9 | Infusions: no storage note | "store infused syrups in the fridge too"; "Keep… in your fridge" instead of "in your bar" | Consistent with 1 |

**Checked, no change**: 1:1 by weight or volume (both are in common use); syrup can be made cold; spoilage signs (fizzing added alongside cloudiness, mold, off smells); demerara syrup method; Shirley Temple and Tequila Sunrise use grenadine.

**Source caveat**: no food safety agency or university extension page with a shelf life for homemade syrup turned up. The figures above come from bar industry references, and the article states nothing beyond them.

**Rollback**: an export of the previous body (md5 `69e9472f…`) was saved locally at build time; the text before the fix is also quoted per claim above.
