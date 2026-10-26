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

**Slice 3 read (2026-10-20)**: 19 `published` rows (one more than at step 0), none containing `$learn$` or a CR. Every row's md5 before the fix is recorded in its entry below. Each correction was drafted from the live body as read that day, and is a find and replace of exact passages, so all the text outside the changed claims stays byte for byte the same. Sources were checked through web search results this pass, not always on the cited page itself; where a page couldn't be opened, the entry says what the claim rests on.

## Entries

### Simple Syrup and Other Bar Syrups, Explained

- **id**: `73be1b10-c078-414f-a12f-1c18da1e8346`
- **Migration**: `supabase/migrations/20261010130000_learn_fix_simple_syrup.sql`
- **md5**: before `69e9472f8ded24aaca392905c0e1bbac`, expected after `b562ed3205d4f7f2c1e01ae9855cb0f6`
- **Approved**: owner, 2026-10-10
- **Applied**: yes. The live md5 read on 2026-10-20 matches the expected `b562ed3205d4f7f2c1e01ae9855cb0f6`

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

### What Is a Jigger?

- **id**: `d7389446-31f0-48fd-bc9d-e2c7501bed50`
- **Migration**: `supabase/migrations/20261020130000_learn_article_corrections.sql`
- **md5**: before `ea942a7483a8e6d54b3ab487254db4d6`, expected after `8eb0cc8ccdb2b8d30e418f1dcb6a3f74`
- **Approved**: _pending (owner)_
- **Applied**: _pending (owner runs the migration in the SQL editor)_

| # | Claim before | Claim after | Source or reason |
|---|---|---|---|
| 1 | The 1 oz/2 oz double jigger is "the most popular" | "A common choice", one popular size | No source for "most popular", so softened |
| 2 | Bitters measured with the 1 oz side; "fortifiers" | Bitters go in by the dash; "modifiers" like vermouth, liqueurs, juice, syrup | Known finding (scope feature 39). IBA official specs give bitters in dashes (e.g. the IBA Sazerac, "2 dashes Peychaud's Bitters", iba-world.com). "Fortifiers" was the wrong word |
| 3 | 2 oz is "the standard pour for most cocktails" | "A common pour for the base spirit" | No source for a single standard pour, so softened (the base spirit article already says 1.5 to 2 oz) |
| 4 | Measure "all ingredients into the jigger sequentially before pouring them together"; spirit poured over ice first | Measure and pour one ingredient at a time | Known finding (scope feature 39). Logic: a jigger holds one measure, so the described sequence can't work |
| 5 | Plastic jiggers are "less precise" | Claim dropped | No source, removed |
| 6 | Costs "$5 and $15"; a "standard" 1 oz/2 oz jigger | Price and "standard" dropped | No source for the price range (and prices date), removed |

**Checked, no change**: measuring for consistency and to control strength; the 1.5 oz/0.75 oz jigger as an alternative; single-ended jiggers; fill to the brim; stainless, glass, and plastic materials; etched lines.

### What Is a Bar Spoon For?

- **id**: `45d76fde-7b6d-406f-b115-f18e9088e8f9`
- **Migration**: `supabase/migrations/20261020130000_learn_article_corrections.sql`
- **md5**: before `7ce81143cb4915bda4fcd42f078b80ad`, expected after `18cfd07d8f52bd5f2cff3346ac5f9986`
- **Approved**: _pending (owner)_
- **Applied**: _pending (owner runs the migration in the SQL editor)_

| # | Claim before | Claim after | Source or reason |
|---|---|---|---|
| 1 | "Typically 12 to 15 inches" | "Often around a foot long, sometimes longer" | No source for the range, softened |
| 2 | Stir "from the bottom of the glass upward" | Stir the whole drink in one smooth motion | The stirring motion is circular, not bottom to top; reworded to match the technique section |
| 3 | "Bartenders stir in the middle of a tall glass" | Reach to stir among the ice | Conflicts with the usual technique of running the spoon's back along the inside wall (see the new Mixing Glasses article); removed |
| 4 | The twist "helps with balance; the spoon naturally rests at the correct angle" | Grip, and lets the spoon spin smoothly as you stir | No source for the balance claim, removed. Grip kept and hedged ("usually credited") |
| 5 | Stir "in the middle of the glass", "about 30 rotations or 10 to 15 seconds" | Spoon against the glass wall; stir until cold, taste to check | No source for the rotation count or time, removed; taste test instead. Wall technique matches the Mixing Glasses article |
| 6 | The spoon lets "heavier ingredients sink gently below lighter ones" | Pour heaviest first; each lighter layer floats on top | Logic (density): layers are built from the densest liquid up, the new layer floats, it doesn't sink |
| 7 | Sazerac built in the serving glass | Old Fashioned and highballs | IBA Sazerac: stirred over ice and strained into a glass rinsed with absinthe (iba-world.com), so it isn't built in the glass |
| 8 | Fork or disc end "serves as a muddler or measuring aid" | Fork for garnishes, disc for gentle muddling or layering | "Measuring aid" has no source, removed |

**Checked, no change**: the long handle's reach; flat-handled spoons exist; the shallow bowl; layering over the back of the spoon; B-52 and Pousse-Café as layered drinks; stainless steel.

### Boston Shaker vs. Cobbler Shaker

- **id**: `bc3c5db2-3d83-4457-98f2-e079cc7b544c`
- **Migration**: `supabase/migrations/20261020130000_learn_article_corrections.sql`
- **md5**: before `b2373089c8cf5b041275e00fc5ca21e7`, expected after `487003af10b86f34ba006533654c2688`
- **Approved**: _pending (owner)_
- **Applied**: _pending (owner runs the migration in the SQL editor)_

| # | Claim before | Claim after | Source or reason |
|---|---|---|---|
| 1 | "A larger mixing glass" and "a slightly larger metal tin" | A large tin plus a smaller glass or tin that fits into it | Logic: the description had both parts larger than each other |
| 2 | "What bartenders use worldwide" | "The shaker you'll see behind many bars" | No source for a worldwide standard (many bartenders use cobblers), softened |
| 3 | Seal "keeps your drink cold and prevents leaks" | Pieces lock together firmly | A seal doesn't keep a drink cold; softened |
| 4 | Boston shakers "generally cost less" | Removed | No source, removed |
| 5 | "No technique needed" | "Gentle learning curve" | Overstated; shaking well still takes technique |
| 6 | Cap sticks "from ice freezing around the threads" | Cold metal contracts and locks the top; tap the seam | "The Science Behind Why Your Cocktail Shaker Always Seems To Get Stuck", The Daily Meal (cold stainless steel contracts; chilled air creates suction). America's Test Kitchen, "How to open a stuck cocktail shaker". Cobbler tops are usually press fit, not threaded |
| 7 | "You can't use the container independently for stirring" | Removed | Logic: the cobbler's base is an open cup you can stir in |
| 8 | "You'll need to switch to a Boston shaker anyway" | Removed | No source; plenty of professional bartenders shake with cobblers |
| 9 | Cobbler "makes sense only if you're genuinely intimidated" | "A fine choice too" | Opinion stated as fact, softened, consistent with the stuck top fix |
| 10 | "$20-30"; cheap shakers replaced "every few months" | Removed | No source for price or lifespan, removed |

**Checked, no change**: the two-piece and three-piece descriptions (as corrected); a Boston shaker needs a separate strainer; the cobbler's built-in strainer; the recommendation itself (kept as the article's opinion).

### Strainers, Explained: Hawthorne, Julep, and Fine Mesh

- **id**: `3354052f-638a-4899-80b9-fc1b7b09ca45`
- **Migration**: `supabase/migrations/20261020130000_learn_article_corrections.sql`
- **md5**: before `2afdf9ce2f962c1e0a9067470ac8c93f`, expected after `86f18b11cba51addda42028d7193667f`
- **Approved**: _pending (owner)_
- **Applied**: _pending (owner runs the migration in the SQL editor)_

| # | Claim before | Claim after | Source or reason |
|---|---|---|---|
| 1 | "Spoon-like"; spring "creates a seal against the rim" | Perforated paddle; spring fits inside the mouth | Description correction: the spring sits inside the vessel and holds ice back; it doesn't seal |
| 2 | Coil "filters out most ice chips" | "Catches many of the larger ice chips" | Conflicts with the article's own double straining section (small shards get through); softened |
| 3 | Bowl "sits directly inside your mixing glass while you stir" | Set in after stirring, held against the ice while pouring | Technique correction: you can't stir with the strainer in the glass |
| 4 | "Stays in the glass during stirring, reducing splashing" | Fits a mixing glass, clean pour | Same as the change above |
| 5 | Fine mesh "looks similar to a tiny Hawthorne" | A small cone-shaped sieve | Description correction: it has no spring and is a conical sieve |
| 6 | Fine mesh "sits in your serving glass" | Held over the serving glass while pouring through both | Technique correction; a strainer in the glass would sit in the drink |
| 7 | Double strain drinks "with aged spirits" | Citrus pulp and muddled bits | No reason aged spirits need it, removed. Muddled ingredients added, the usual reason to double strain |
| 8 | Double straining matters "especially for spirit-forward drinks" | For shaken drinks; stirred drinks rarely need it | Logic: shards come from shaking, which the article's own list says |
| 9 | "90%" | "Most" | Invented figure, removed |

**Checked, no change**: Hawthorne for shaken and stirred drinks; the spring adjusting to different mouths; Julep for stirred drinks; buy a Hawthorne first.

### The Muddler, Explained

- **id**: `f2ef1264-e27c-4281-8894-d033ca877dd4`
- **Migration**: `supabase/migrations/20261020130000_learn_article_corrections.sql`
- **md5**: before `7c0c8fd9b13ca638e0891b2242b92c11`, expected after `59c63fdfa47da6aff1ca537f7de818d0`
- **Approved**: _pending (owner)_
- **Applied**: _pending (owner runs the migration in the SQL editor)_

| # | Claim before | Claim after | Source or reason |
|---|---|---|---|
| 1 | Releases "bitter compounds and chlorophyll" | "Can release bitter, grassy flavors" | No source for the chlorophyll mechanism, softened |
| 2 | "Bitter pith oils" | The white pith is bitter | The oils are in the colored peel; the pith is the bitter part |
| 3 | Sazerac given as a muddled herb drink | Mojito and Mint Julep | IBA Sazerac has no herbs (cognac, absinthe, sugar cube, Peychaud's, iba-world.com). The IBA Mojito and Mint Julep both muddle mint |
| 4 | Muddled raspberries "in a Bramble" | General berries and fruit | The IBA Bramble is gin, lemon juice, syrup, and crème de mûre (blackberry liqueur), with no muddled fruit |
| 5 | Sugar and bitters "should definitely be muddled" | When you use a sugar cube, the classic way | IBA Old Fashioned muddles a sugar cube with bitters and a little water; many recipes use syrup instead, so "should definitely" softened |
| 6 | "Muddling lemon or lime halves will give you bitter, unpleasant flavors" | Some classics muddle lime (Caipirinha); press gently | IBA Caipirinha: lime cut into wedges and muddled with sugar. The flat rule contradicted a classic |
| 7 | Don't muddle "delicate spirits or liqueurs" because "they've already been processed" | Muddling is for solids, not liquids | Logic: you can't extract anything by pressing a liquid |
| 8 | "6-8 ounces" | Figure removed | No source, removed |

**Checked, no change**: muddling releases oils and juice; gentle, controlled presses; mint and basil need a light touch; a flat or slightly cupped muddler.

### What Does Proof Mean?

- **id**: `4f0e6dd4-c5b9-4908-bd1f-b8c71b9affca`
- **Migration**: `supabase/migrations/20261020130000_learn_article_corrections.sql`
- **md5**: before `298999eb1bb58a2de15e2cf66d23de4c`, expected after `a826dfacdd3f5f2bd77b24194a4014f2`
- **Approved**: _pending (owner)_
- **Applied**: _pending (owner runs the migration in the SQL editor)_

| # | Claim before | Claim after | Source or reason |
|---|---|---|---|
| 1 | Both numbers are "on the label" | "You'll often see two numbers" | 27 CFR 5.65 (eCFR): the ABV statement is mandatory, proof is optional, so not every label shows both |
| 2 | Gunpowder test dated to "18th-century England" and told as fact | Told as "the popular story", undated | No source found for the date or details; the story is kept, hedged |
| 3 | Older British bottles show "higher proof numbers than their American equivalents" | British numbers are lower (40% ABV: US 80, UK about 70) | Logic from the article's own factor: 1.75 × ABV is smaller than 2 × ABV. 100 British proof ≈ 57% ABV (the Navy Strength figure) |
| 4 | 100-proof tequila "can restore the character the recipe intended" | Removed | No source, removed |
| 5 | "Many classic cocktails call for higher-proof spirits" because recipes expected dilution | A stronger spirit stays more assertive after the same dilution | Known finding (the water explanation). No source for the history claim, replaced by the arithmetic |
| 6 | "A stirred Negroni benefits from bold, high-proof components"; higher proof "more complex" | Higher proof hotter and more intense; taste and adjust | Known finding (the Negroni advice): a Negroni is equal parts gin, sweet vermouth, and Campari (IBA), and no source backs the advice. "More complex" unsourced |
| 7 | Proof "usually larger and more prominent"; "both should be on the label" | US labels must show ABV; proof optional | Known finding (US label rules). 27 CFR 5.65 (eCFR): alcohol content must be stated as percent alcohol by volume; a proof statement may also appear |
| 8 | "Adding 20% more volume of water essentially" | "The same pour carries 20% less alcohol" | Known finding (the water explanation). Arithmetic: 40/50 = 0.8; water goes from 50% to 60% of the pour, so "20% more water" was also misleading |

**Checked, no change**: US proof = 2 × ABV; 40% ABV = 80 proof, 100 proof = 50% ABV; ABV as the international standard; dilution from ice; adjusting other ingredients when swapping proof (already hedged with "might").

### Why Spirits Age in Oak Barrels

- **id**: `703483d8-332f-4028-a5cb-1c7bbf31949f`
- **Migration**: `supabase/migrations/20261020130000_learn_article_corrections.sql`
- **md5**: before `8a4c715e5e8ccda0177e613c84facac4`, expected after `d37104b6bf03e1d865679a93baef5b18`
- **Approved**: _pending (owner)_
- **Applied**: _pending (owner runs the migration in the SQL editor)_

| # | Claim before | Claim after | Source or reason |
|---|---|---|---|
| 1 | "Essentially concentrated grain alcohol and water" | New spirit carries the flavor of its raw material | Known finding. The article covers cognac and rum, which aren't grain spirits; bourbon is distilled to no more than 160 proof precisely to keep grain flavor (27 CFR 5.143) |
| 2 | Oak "contains" sugars and vanillin that leach out | Toasting and charring create vanillin and wood sugars | Independent Stave Company (iscbarrels.com): darker char levels extract more vanilla flavor and color, i.e. heat treatment drives these compounds |
| 3 | Evaporation "intensifies flavors and can actually improve" the spirit | Removed | No source, removed |
| 4 | Color "almost entirely" from the barrel; every barrel is charred | Mostly from the barrel; caramel allowed in some; bourbon charred, others toasted or reused | Scotch Whisky Regulations 2009, reg. 3 (plain caramel colouring permitted). 27 CFR 5.143 (bourbon: new charred oak containers) |
| 5 | Light "30 seconds", medium "60 seconds", heavy "90+ seconds" | #1 to #4 scale; #4 roughly a minute; ISC flavor guidance | Known finding (char times). Buffalo Trace, via Food Ingredients First and a quoted statement on StraightBourbon.com: #3 about 45 seconds, #4 about 55 seconds. Independent Stave Company (iscbarrels.com): lighter char more fruit and spice, darker more vanilla and color. Sulfur filtering kept but hedged |
| 6 | Stages at "1-2", "3-5", and "6+" years | Same progression, no year figures | No source for the year bands, removed |
| 7 | Kentucky "4-6 years" vs cooler "8-10 years" | Removed | No source, removed |

**Checked, no change**: the angel's share; char acting as a filter and flavor source; over-extraction; warm climates speeding aging; a 12 year old isn't automatically better; vanillin as the vanilla note.

### What Does Cask Strength Mean?

- **id**: `7e8a0b92-0698-45d5-a3a5-8376fc57986a`
- **Migration**: `supabase/migrations/20261020130000_learn_article_corrections.sql`
- **md5**: before `cf64c20c37a2d2c7e4df9b58224057da`, expected after `eedd4131d0fd393f4f8fe55d2a859c70`
- **Approved**: _pending (owner)_
- **Applied**: _pending (owner runs the migration in the SQL editor)_

| # | Claim before | Claim after | Source or reason |
|---|---|---|---|
| 1 | "Non-chill filtered" listed as meaning undiluted | Separated: it refers to filtering | Definition: chill filtration is a filtering step; it says nothing about added water |
| 2 | "Typically ranges from 100 to 130+ proof" | "Often well above 100 proof" | No source for the range, softened |
| 3 | "The larger surface area of cask strength means more flavor infusion" | Removed | Not a real effect: a liquid's proof has no surface area |

**Checked, no change**: most spirits are diluted before bottling; cask strength varies by batch; the 120 vs 80 proof arithmetic (50% more alcohol); using 1.5 oz in place of 2 oz (0.9 oz vs 0.8 oz of alcohol, close enough for "similar"); taste neat with a few drops of water.

### What Is a Base Spirit?

- **id**: `a8c248ae-0644-48a0-834f-7801686b6448`
- **Migration**: `supabase/migrations/20261020130000_learn_article_corrections.sql`
- **md5**: before `007282ee6b0a0971aba0bace09dae1f6`, expected after `224295a8b4164c78cca4c8593b063db8`
- **Approved**: _pending (owner)_
- **Applied**: _pending (owner runs the migration in the SQL editor)_

| # | Claim before | Claim after | Source or reason |
|---|---|---|---|
| 1 | Gin is "a grain or grain-based spirit" | A neutral spirit, often from grain | Regulation (EU) 2019/787, Annex I: gin is made from ethyl alcohol of agricultural origin, which isn't limited to grain |
| 2 | Vodka "filtered extensively" | "Often filtered" | Not true of every vodka, softened |
| 3 | Rum has "a naturally sweet character" | Reads as rich or sweet; not sugary unless sweetened | Logic: distillation leaves sugar behind, so an unsweetened rum contains none |
| 4 | "Its inherent sweetness" | "Its rich, often fruity character" | Same as the change above |
| 5 | Blanco is "unaged" | "Unaged or only briefly rested" | NOM-006-SCFI, via Difford's Guide tequila classifications: blanco may rest up to two months |
| 6 | All brandy is oak aged; "Cognacs" listed as a cocktail | Many are aged; Sidecar and the IBA Sazerac | Cognac is a brandy, not a drink. IBA Sazerac specifies 50 ml Cognac (iba-world.com). Unaged brandies exist, so "aged in oak" softened |

**Checked, no change**: the base spirit as the drink's backbone, typically 1.5 to 2 oz; whiskey grains and barrel aging; vodka's neutrality; tequila from agave; the example cocktails for each spirit.

### What Are Bitters?

- **id**: `ff30c6e6-0126-42f2-a6cf-c74bef784935`
- **Migration**: `supabase/migrations/20261020130000_learn_article_corrections.sql`
- **md5**: before `78195c9121f628df44d4d360b6240fa7`, expected after `794f2de847e4677f3353bba50b586aac`
- **Approved**: _pending (owner)_
- **Applied**: _pending (owner runs the migration in the SQL editor)_

| # | Claim before | Claim after | Source or reason |
|---|---|---|---|
| 1 | "Typically contain 35-45% alcohol" | Two named examples: Angostura 44.7%, Peychaud's 35% | Retailer listings for Angostura Aromatic Bitters (44.7% ABV) and Cocktail Society on Peychaud's (35% ABV). A general range for all bitters had no source |
| 2 | Angostura "dominated by gentian"; aromatic bitters in a Sazerac | Secret recipe; Peychaud's for the Sazerac | The Angostura recipe is secret, so "dominated by gentian" softened. IBA Sazerac: 2 dashes Peychaud's Bitters (iba-world.com) |
| 3 | Orange bitters for "champagne cocktails" | Martini | The classic Champagne Cocktail is made with Angostura (aromatic) bitters |
| 4 | Chocolate bitters "in a Sazerac" | Manhattan or Old Fashioned | Consistent with the Peychaud's change above |
| 5 | A dash is "roughly 1/8 teaspoon"; a "2-ounce cocktail" | "Just a fraction of a teaspoon" | No source for a fixed dash volume (dasher tops vary), softened |
| 6 | Two dashes in "Daiquiris" | Manhattans, Old Fashioneds, orange bitters in a Martini | IBA Daiquiri: white rum, lime juice, simple syrup, with no bitters |
| 7 | Dash cap makes measurement "consistent" | Dash size varies | Same as the dash volume change |
| 8 | "Not debatable among serious bartenders" | "Many classic cocktails are built around them" | Opinion stated as fact, softened |

**Checked, no change**: bitters made by steeping botanicals in high-proof alcohol; some sweetened, some dry; orange, chocolate, celery, and peach bitters; the Old Fashioned's ingredients; long shelf life thanks to high alcohol.

### What Are Non-Alcoholic Spirits?

- **id**: `d8f91bd2-1f24-4398-a68b-c4b9bef9a6e6`
- **Migration**: `supabase/migrations/20261020130000_learn_article_corrections.sql`
- **md5**: before `5cd0937f3677c23a37e9e451b6da47e3`, expected after `1e8db6c207ae9749382ba48838fbb635`
- **Approved**: _pending (owner)_
- **Applied**: _pending (owner runs the migration in the SQL editor)_

| # | Claim before | Claim after | Source or reason |
|---|---|---|---|
| 1 | Distillation that "bypass[es] alcohol production entirely" | Methods vary; some distill with alcohol and remove it | No source for a general method, softened |
| 2 | "Advanced producers ferment normally" then remove alcohol | Some producers, several methods | Overstated, softened |
| 3 | Named brands "ideal for martinis" | No brand names | Brand claims had no source, and Seedlip doesn't market itself as a gin; removed |
| 4 | "Try adding 0.5 ounces more" | Adjust in small steps | Invented figure, removed (spec 0033 AC-10: no invented figures) |
| 5 | "Many... are slightly sweeter"; "reduce... by 0.25 ounces" | Varies by brand; taste first | Invented figure and unsourced generalization, removed |
| 6 | "Lower-proof traditional spirits (like 40 ABV rum...)" | Split base for a lower-alcohol drink | 40% ABV is a standard strength, not lower proof; reworded |
| 7 | No storage guidance | Refrigerate after opening, finish within a few weeks, follow the label; check for trace alcohol | Spec 0033 AC-10 (storage guidance where relevant). "Do Zero-Proof Spirits Expire?", InsideHook: a Death & Co bar manager keeps opened bottles refrigerated and uses them within a few weeks; shelf lives vary by brand (one brand says 3 months, another 9 to 10 months) |

**Checked, no change**: infusion and concentrated bases as production methods; the product categories; leaning on bitters, citrus, and modifiers; thorough chilling and dilution; NA spirits are not exact replacements.

### Traditional Method vs. Tank Method Sparkling Wine

- **id**: `ae462cd4-7631-41a1-a9c4-005b48fb3cbc`
- **Migration**: `supabase/migrations/20261020130000_learn_article_corrections.sql`
- **md5**: before `ad5df599b7b76e040d300aaa59cd8f14`, expected after `7287415fa91cbf8dbae9246a76be9ec6`
- **Approved**: _pending (owner)_
- **Applied**: _pending (owner runs the migration in the SQL editor)_

| # | Claim before | Claim after | Source or reason |
|---|---|---|---|
| 1 | "Also called Méthode Champenoise" | "Known in Champagne as" | The term belongs to Champagne; elsewhere the method is labeled "traditional method" |
| 2 | The yeast and sugar added for the second fermentation are "the dosage" | That mix is the *liqueur de tirage* | Taittinger, "Vintage vs non-vintage Champagne"; Difford's Guide, Champagne styles: the dosage (liqueur d'expédition) is added after disgorging |
| 3 | Champagne "requires minimum 18 months" | NV 15 months (12 on lees); vintage 3 years | Taittinger, "Vintage vs non-vintage Champagne"; Difford's Guide, Champagne styles and classifications |
| 4 | Final top up unnamed | Named as the dosage; sets final sweetness | Same as the liqueur de tirage change |
| 5 | "Typically spends just 2-3 months in the tank" | "Weeks to months, rather than years" | No source for the figure, softened |
| 6 | Bubbles "typically smaller and more numerous" | "Many tasters find" | No source, hedged |
| 7 | "High-end Prosecco made traditionally" | Champagne, Cava, Crémant, others labeled traditional method | Prosecco is overwhelmingly tank method, as the article itself says; Cava and Crémant are traditional method by definition |

**Checked, no change**: base wine then a second fermentation; riddling and disgorging (frozen plug); tank method in pressurized tanks, filtered and bottled under pressure; lees aging gives brioche and toasted notes; tank wines fresher and fruitier; Prosecco as the tank example.

### Sweet vs. Dry: What Residual Sugar Means

- **id**: `cfe1d4f1-e762-4008-b490-13190de2aa11`
- **Migration**: `supabase/migrations/20261020130000_learn_article_corrections.sql`
- **md5**: before `0ed81335ccaad2070b5bd78ab88b4ce9`, expected after `0cbd36cf4f9c3fb20186fb1eb43660a6`
- **Approved**: _pending (owner)_
- **Applied**: _pending (owner runs the migration in the SQL editor)_

| # | Claim before | Claim after | Source or reason |
|---|---|---|---|
| 1 | "Leave some grapes unfermented" | Stop fermentation by chilling, removing yeast, or fortifying | "Leave some grapes unfermented" isn't a winemaking technique; reworded. Port fortification: see the new Fortified Wines article |
| 2 | Wines at "0 g/L" | "Only a few grams per liter" | Wines keep some unfermentable sugar, so 0 g/L is misleading |
| 3 | Invented five-band scale; off-dry "still considered dry in marketing"; "lighter reds" at 30-120 g/L; Port and Moscato at 120-250 g/L | EU still wine bands, port at about 90 to 120 g/L, plus the sparkling scale | Decanter, "Residual sugar" (EU bands: dry ≤4, medium dry 4–12, medium 12–45, sweet >45 g/L, and the sparkling scale). Vitisphere on EU 607/2009 (the 9 and 18 g/L acidity tolerances). BKWine, sugar levels in sparkling wines. Port: producer tech sheets via Meininger's (Graham's Tawny Reserve 116 g/L, Cockburn's Fine Tawny 106 g/L) and Ramos Pinto Ruby (96.5 g/L) |
| 4 | Dry vermouth "usually 3-5 g/L" | EU: extra dry <30 g/L, dry <50 g/L | Regulation (EU) No 251/2014, Article 6 (sugar terms for aromatised wine products), EUR-Lex consolidated text |
| 5 | "Sec" means lower sugar, unqualified | True on still wine; on sparkling, sec is sweet | Decanter, "Residual sugar" (sparkling Sec 17–32 g/L, sweeter than Brut) |
| 6 | Tawny "can reach 50 g/L" | Ruby and tawny often around 90 to 120 g/L | Producer tech sheets, as in the scale change above. The old figure was less than half the real value |
| 7 | "Especially German and Austrian winemakers"; Vivino | Producer technical sheets | No source for the country claim; tech sheets are where figures were found for this check |

**Checked, no change**: residual sugar defined; measured in g/L; acidity, alcohol, tannin, and fruit affecting perceived sweetness; off-dry wines with spicy food; sweetness perception is subjective.

### What Are Tannins?

- **id**: `b990526b-b1a4-43f8-82b1-456b2e190f24`
- **Migration**: `supabase/migrations/20261020130000_learn_article_corrections.sql`
- **md5**: before `acc9210193e943c1831d108a8cc56f37`, expected after `085dc22e1f7e690cfb032f0617618bf1`
- **Approved**: _pending (owner)_
- **Applied**: _pending (owner runs the migration in the SQL editor)_

| # | Claim before | Claim after | Source or reason |
|---|---|---|---|
| 1 | Rosé has "moderate tannin levels" | Typically low, closer to white | Follows from the article's own point that tannin comes from skin contact, which is brief for rosé |
| 2 | Tannins "don't taste... bitter" | Mostly texture, can add some bitterness | Overstated; tannins can taste bitter as well as astringent |
| 3 | Fat "literally coats your mouth" | Protein and fat help soften | Mechanism overstated, softened |
| 4 | Barolo with "dark chocolate" | Ribeye only | No source for the chocolate pairing, removed |

**Checked, no change**: tannins from skins, seeds, and stems; red wine's longer skin contact; oak adds tannin, new oak more than old; the black tea comparison; young Cabernet and Nebbiolo as tannic; tannins soften with age; fatty, protein-rich pairings; Pinot Noir with salmon.

### How to Read a Wine Label

- **id**: `877642bc-ad79-4481-9bbe-6e99ae21bd2e`
- **Migration**: `supabase/migrations/20261020130000_learn_article_corrections.sql`
- **md5**: before `e4052613397dfccee8f8b4d06d1cf386`, expected after `463539824829882fa95167a40b271e3c`
- **Approved**: _pending (owner)_
- **Applied**: _pending (owner runs the migration in the SQL editor)_

| # | Claim before | Claim after | Source or reason |
|---|---|---|---|
| 1 | Bordeaux is "likely" Cabernet Sauvignon | A blend; Merlot most planted | CIVB, Bordeaux Key Facts 2021: Merlot 66% of plantings, Cabernet Sauvignon 22% |
| 2 | "Burgundy means Pinot Noir" | Red Burgundy Pinot Noir, white Burgundy Chardonnay | White Burgundy is Chardonnay; Chablis is in Burgundy |
| 3 | "Appellation Controlée"; "a mark of quality" | Full name; guarantees origin and method | Name correction; an appellation regulates origin and production, and the article itself later says it doesn't guarantee you'll like it |
| 4 | A château listed as the smallest appellation | Bordeaux, Haut-Médoc, Pauillac; producer named separately | A château is a producer, not an appellation |

**Checked, no change**: vintage = harvest year; non-vintage = blend of years; varietal naming in the US, Australia, Argentina, and New Zealand; regional naming in France, Italy, and Spain; Chianti and Sangiovese; DOCG, DOC, and DO.

### Ales vs. Lagers: What's the Difference?

- **id**: `ed181d21-3098-4650-aa92-f8860ce0a0f1`
- **Migration**: `supabase/migrations/20261020130000_learn_article_corrections.sql`
- **md5**: before `a10a9ae7f9f807ae1d102fff996eb6a0`, expected after `1d9ae7bf8587d0440e2373542f1a52b3`
- **Approved**: _pending (owner)_
- **Applied**: _pending (owner runs the migration in the SQL editor)_

| # | Claim before | Claim after | Source or reason |
|---|---|---|---|
| 1 | An IPA's character comes from ale yeast | Hefeweizen and tripel as the yeast examples | An IPA's character comes mainly from hops (see the article's own pale ale section and the new Hops article); the hefeweizen example matches the article's wheat ale section |
| 2 | Lagers have "subtle sweetness" | "Many lagers finish smooth and crisp" | Contradicts the article's own "crisp, dry" pilsner; softened |
| 3 | Ales "dominate craft brewing because they're forgiving for home brewers" | A favorite; faster and easier to manage | The causal claim had no source, softened |
| 4 | IPA yeast character "fruity, spicy" | Character mostly from hops | Same as the first change |
| 5 | "Bavaria, Germany" listed as separate regions | Bohemia and Bavaria | Bavaria is part of Germany |

**Checked, no change**: S. cerevisiae vs S. pastorianus, warm/top vs cool/bottom; esters and phenols; the lagering period; hefeweizen clove and banana; sour ales; pilsner, helles, bock, and dunkel descriptions.

### What Is IBU?

- **id**: `f80e36f4-d9dd-42b2-95f5-0516cf83b11f`
- **Migration**: `supabase/migrations/20261020130000_learn_article_corrections.sql`
- **md5**: before `18a851c07cd9877bdab37685a86eacf0`, expected after `225ffddd6dca8e061edab0660932f822`
- **Approved**: _pending (owner)_
- **Applied**: _pending (owner runs the migration in the SQL editor)_

| # | Claim before | Claim after | Source or reason |
|---|---|---|---|
| 1 | Boiling "releases alpha acids", which are bitter | Boiling transforms alpha acids into bitter iso-alpha acids | ASBC Beer-23 measures iso-alpha acids, the boiled form; consistent with the next sentence of the article |
| 2 | Ranges stated as fixed | Hedged | Style ranges vary between guidelines |
| 3 | IBU "is determined through HPLC"; label numbers "scientifically measured, not guessed" | ASBC spectrophotometric method; many labels are calculated | ASBC Methods of Analysis, Beer-23 (isooctane extraction, absorbance at 275 nm). Brauwelt, "Bitterness measurement": craft breweries often predict bitterness with formulas |
| 4 | A "pale lager with 40 IBUs" (above its own 5–15 range) | A pilsner at 35 IBUs | Contradicted the article's own range for light lagers |
| 5 | Salty foods make bitterness "more pronounced" | Salt suppresses bitterness | Breslin & Beauchamp, "Salt enhances flavour by suppressing bitterness", Nature 387 (1997). Keast, Breslin & Beauchamp, Chimia 55 (2001): sodium salts and sucrose suppress bitterness |

**Checked, no change**: IBU from hops; the style ranges (now hedged); longer boils extract more bitterness; IBU vs perceived bitterness; malt balancing bitterness; hop variety matters.

### What Is SRM? Understanding Beer Color

- **id**: `92a725cb-240c-4dc1-8bd5-10d52c729850`
- **Migration**: `supabase/migrations/20261020130000_learn_article_corrections.sql`
- **md5**: before `540286414e8e7c7553f3760ac26c758a`, expected after `005b736f14276e77c3835c1e48168a04`
- **Approved**: _pending (owner)_
- **Applied**: _pending (owner runs the migration in the SQL editor)_

| # | Claim before | Claim after | Source or reason |
|---|---|---|---|
| 1 | SRM is the counterpart of "the European Lovibond scale" | Counterpart of EBC (≈ SRM × 1.97); Lovibond rates malt | BeerSmith, "Beer Color: Understanding SRM, Lovibond and EBC"; Craft Beer & Brewing color calculator (EBC ≈ SRM × 1.97; °L mostly for malt) |
| 2 | Malt is "soaked and roasted"; malt rated in SRM | Malting includes sprouting and kilning; malt rated in °L | Definition of malting (steep, germinate, kiln). °L for malt: same sources as above |
| 3 | Malt colors in "SRM"; amber malts "10-20" | Malt colors in °L; caramel/crystal malts | Same as above; the unit was wrong |
| 4 | Roasting time sets the malt's "SRM value" | Kilning or roasting intensity sets the color | Same as above |

**Checked, no change**: the SRM range from about 2 to 40+; SRM measures color, not flavor; flavor depends on malt choice, hops, yeast, and fermentation; darker beers tend toward roasted flavors.

### Quiz questions that repeated a corrected claim

- **Migration**: `supabase/migrations/20261020130000_learn_article_corrections.sql` (same file, after the articles)
- **Approved**: _pending (owner)_
- **Applied**: _pending_

| Quiz | Question | Problem | Fix | Source or reason |
|---|---|---|---|---|
| Bar Tools Quiz | 1 (`167f9aaf`) | Fine mesh "sits in your serving glass" | explanation rewritten | Matches the corrected Strainers article |
| Bar Tools Quiz | 3 (`0b4ce14c`) | Correct answer: cap stuck "from ice freezing around the threads" | options, explanation rewritten | The Daily Meal and America's Test Kitchen, as in the shaker article fix. Correct index unchanged (2) |
| Bar Tools Quiz | 4 (`b8bf90e5`) | "Bitter compounds and chlorophyll" | explanation rewritten | Matches the corrected Muddler article |
| Bar Tools Quiz | 6 (`4d60da50`) | "The twisted design also helps with balance" | explanation rewritten | Matches the corrected Bar Spoon article |
| Bar Tools Quiz | 7 (`7e91efba`) | "Most common jigger size" (the 1 oz/2 oz "standard pour" claim) | prompt, options, correct_option_index, explanation rewritten | The premise was unsourced and is softened in the Jigger article; replaced with the article's corrected bitters point |
| Bar Tools Quiz | 8 (`069cc3d6`) | "All of the above", counting "look more professional" as a correct reason | options, correct_option_index, explanation rewritten | Looking professional isn't a reason measuring matters; rewritten with one correct answer |
| IBA Classics Quiz | 4 (`544efe4f`) | Sazerac contains "Bourbon" and "Ricard" | explanation rewritten | IBA official cocktail: Sazerac (iba-world.com): 50 ml Cognac, 10 ml absinthe, 1 sugar cube, 2 dashes Peychaud's; rye noted as the historical substitute |
| IBA Classics Quiz | 5 (`be045b77`) | Lillet Blanc called one of three "spirits" | prompt, explanation rewritten | Lillet Blanc is an aromatized wine, not a spirit |

**Checked, no change**: Bar Tools Quiz questions 2 (Julep strainer) and 5 (muddling technique); IBA Classics Quiz questions 1, 2, 3, 6, and 7 against the IBA specs.
