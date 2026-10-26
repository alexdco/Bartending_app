-- Learn content, batch 2 -----------------------------------------------
--
-- Adds 15 Learn articles and 5 category quizzes, all as status = 'draft',
-- following the review then publish workflow of specs 0025 and 0026 (the
-- owner reviews each row in Studio and flips status to published). Written
-- by hand rather than by the Haiku scripts, with the claims most likely to
-- go wrong checked against sources first (see the spec 0033 fact check for
-- why that matters).
--
-- New articles by category:
--   tools: Mixing Glasses, Explained; Citrus Tools: Presses, Peelers, and Channel Knives; A Guide to Cocktail Glassware
--   spirits: Bourbon, Rye, and Scotch: What's the Difference?; Gin Styles, Explained; Tequila vs. Mezcal: How They Differ; What Is a Liqueur?
--   wine: Vermouth: The Wine in Your Cocktails; Fortified Wines: Port, Sherry, and Madeira; Serving Wine at the Right Temperature
--   beer: Hops, Explained; Beer Cocktails: Shandies, Micheladas, and More
--   other: Shaken or Stirred? How to Choose; Ice, Explained: Size, Dilution, and Clear Ice; Garnishes That Do More Than Decorate
--
-- New quizzes (source_type learn_category):
--   Spirits Quiz (spirits, 8 questions)
--   Wine Quiz (wine, 8 questions)
--   Beer Quiz (beer, 8 questions)
--   Home Bar Basics Quiz (other, 8 questions)
--   Glassware and Citrus Tools Quiz (tools, 7 questions)
--
-- The quizzes test material from these new articles, so publish a
-- category's articles before (or with) its quiz.
--
-- Rerun safe: fixed ids with on conflict do nothing, so a second run leaves
-- every row (and any review edits) as is.
--
-- Paste safe: the SQL editor on Windows turns pasted newlines into CRLF, so
-- each body is wrapped in replace(..., chr(13), '') to store LF only.
--
-- To publish everything after review (or trim the id lists first):
--   update public.learn_articles set status = 'published'
--   where id in ('9a975d79-d9d5-47d4-a8b3-2f798f6ae6bd', 'c1ce17d0-4d83-459f-977e-6b451d1c1e7c', 'e3571d3b-d7cb-4631-93a6-801716e2278f', 'e321ec37-136e-4cc8-9097-7729b2f62e29', '13a42240-4e72-4821-b7ad-e5f8523ce021', '6a8782b6-98ba-4133-9517-17082244bd4d', '164aacf3-112f-4b60-a813-5609c016bb2e', '3d93351d-461f-4cfe-a49d-c2fbde2c7771', '9d318f41-178f-49c5-93d1-506a70be9ae6', '72c534ea-de0e-415a-a731-5a6750ed29df', '53da2567-07d8-420b-89c5-028dbbf18400', 'a29e61c7-812c-4a09-ba24-89635c816e21', 'c144d9cf-0e68-46dc-8da7-1e80e1bbce05', '0413a156-eb63-46a1-bcc2-aaa89dfeeeda', '53310fe0-72eb-4e7a-94e7-87dcfe1b5997');
--   update public.quizzes set status = 'published'
--   where id in ('e4bd77c1-74fe-465e-a0a5-bd396a18ed75', 'ab74f9a1-82e1-4e5f-9719-e787b309b5c0', '9e3b3dfd-7fab-4373-8ead-e495e43968ba', '1cad489e-ad01-4ad2-959a-fe765a101792', 'e7ecb72a-5c29-40e0-a9dd-4b637d194533');

begin;

-- Articles ------------------------------------------------------------------

-- Mixing Glasses, Explained (tools, 533 words)
insert into public.learn_articles (id, title, category, body_markdown, status, source_topic)
values (
  '9a975d79-d9d5-47d4-a8b3-2f798f6ae6bd',
  $t$Mixing Glasses, Explained$t$,
  'tools',
  replace($learn$## The Vessel for Stirred Drinks

A mixing glass is a heavy, wide glass vessel used to stir cocktails with ice. If a drink is made only of spirits, vermouths, liqueurs, and bitters, like a Martini, Manhattan, or Negroni, it is usually stirred rather than shaken, and the mixing glass is where that happens.

You could stir a drink in almost anything that holds ice, so why a dedicated glass? Three reasons: it is big enough to hold plenty of ice and two drinks at once, its heavy base keeps it steady while you stir, and because it is clear, you can watch the drink as it chills.

### What to Look For

**Size.** Most mixing glasses hold roughly 500 to 750 milliliters (about 17 to 25 ounces). That leaves room for ice plus one or two cocktails without the liquid sloshing over the rim.

**A thick, flat base.** Weight matters. A heavy bottom keeps the glass planted on the counter while your bar spoon moves around inside it.

**A pouring spout.** A small lip on the rim makes it easier to strain neatly into a glass without dribbling down the side.

**A wide mouth.** You need room for a strainer to sit inside the rim. Julep and Hawthorne strainers both work with a mixing glass, but check that yours fits.

Many mixing glasses have a crosshatched cut pattern on the outside, often called the *yarai* pattern after its Japanese origins. It looks beautiful and gives you a little extra grip, but it does not change how the drink tastes. Plain glass works just as well.

### How to Stir in a Mixing Glass

1. **Chill the glass first** if you have a moment. Fill it with ice and water, let it sit, then dump it out. A room-temperature glass warms the first part of the drink.
2. **Add your ingredients**, measured with a jigger.
3. **Fill the glass about two-thirds with fresh, cold ice.** More ice chills faster and more evenly than a few cubes.
4. **Stir smoothly.** Slip the back of the bar spoon along the inside wall and move it in a circle so the ice rotates as one mass. You are aiming for a quiet, steady motion, not clinking and churning.
5. **Taste and strain.** Most stirred drinks need around 20 to 30 seconds of stirring, depending on your ice. Taste a drop from the spoon: it should be cold and slightly softened by dilution, not hot with alcohol. Then strain into a chilled glass.

### No Mixing Glass? No Problem

If you are just getting started, you do not need to buy one right away. A sturdy pint glass works, and so does the larger tin of a Boston shaker. Neither is as stable or as easy to watch, but the drink will taste the same as long as you use plenty of ice and stir long enough.

### Care Tips

Mixing glasses are thick, which makes them vulnerable to sudden temperature changes. Avoid pouring hot water into a glass that has just been chilled with ice, and the reverse. Many are best washed by hand. Treat it gently and a good mixing glass will last for years.$learn$, chr(13), ''),
  'draft',
  $t$what a mixing glass is for, what to look for when buying one, how to stir in it, and what to use if you don't own one$t$
)
on conflict (id) do nothing;

-- Citrus Tools: Presses, Peelers, and Channel Knives (tools, 504 words)
insert into public.learn_articles (id, title, category, body_markdown, status, source_topic)
values (
  'c1ce17d0-4d83-459f-977e-6b451d1c1e7c',
  $t$Citrus Tools: Presses, Peelers, and Channel Knives$t$,
  'tools',
  replace($learn$## Fresh Citrus Starts With the Right Tools

Lemon and lime juice appear in a huge share of classic cocktails, from the Daiquiri and Margarita to the Whiskey Sour and Gimlet. Citrus peel shows up just as often as a garnish. A few inexpensive tools make both jobs faster, cleaner, and more consistent.

### The Handheld Citrus Press

The most useful citrus tool for a home bar is the hinged handheld press, the kind with two hollow cups and long handles. Lime-sized and lemon-sized versions are common, and some come in a larger orange size.

The trick that trips up almost everyone: **put the fruit in cut side down, facing the holes.** It feels backwards, but when you squeeze, the top cup presses the half inside out, pushing the juice straight down through the holes. If you load it cut side up, juice sprays everywhere and you get less of it.

Squeeze firmly and steadily. You will extract plenty of juice without grinding the bitter white pith into the cup.

### Other Juicers

- **Reamers** are ridged cones, wooden or plastic, that you twist into a citrus half. They are cheap and work well, but you will need to strain out the seeds and pulp.
- **Lever presses** are countertop machines with a long arm. They are worth considering if you regularly juice for a crowd.
- **Electric juicers** spin a reamer for you. They are fast for big batches, though the press is quicker for a drink or two.

### Peelers, Channel Knives, and Zesters

**Y-peeler.** A sharp Y-shaped vegetable peeler is the easiest way to cut a wide strip of peel for a twist. Press lightly so you take the colorful outer skin with as little white pith as possible, since pith tastes bitter.

**Channel knife.** This tool has a small notched blade that carves a long, thin strand of peel. It is the tool for spiral garnishes, like the long lemon coil traditionally draped in a Horse's Neck.

**Microplane zester.** A fine grater for zest, and it doubles as the tool for grating fresh nutmeg over flips and eggnog.

### Peel Before You Juice

Here is a habit worth building: if a drink needs both juice and a peel garnish, cut the peel first. Once a lemon has been squeezed, it is soft and floppy and almost impossible to peel cleanly.

### Why Fresh Juice Matters

Bottled, shelf-stable citrus juice tastes flat and sometimes slightly bitter next to fresh juice, and the difference is obvious in a simple drink like a Daiquiri, where lime is one of only three ingredients. Fresh lemon and lime juice taste brightest on the day they are squeezed, so juice what you need for the evening rather than days in advance.

Citrus also varies more than you might expect. One lime can give noticeably more or less juice than the next, and its tartness changes with the season. Measure the juice with a jigger rather than counting fruit, and taste your drink before you serve it.$learn$, chr(13), ''),
  'draft',
  $t$handheld citrus presses and how to use them correctly, peelers and channel knives for garnishes, zesters, and why fresh juice matters$t$
)
on conflict (id) do nothing;

-- A Guide to Cocktail Glassware (tools, 528 words)
insert into public.learn_articles (id, title, category, body_markdown, status, source_topic)
values (
  'e3571d3b-d7cb-4631-93a6-801716e2278f',
  $t$A Guide to Cocktail Glassware$t$,
  'tools',
  replace($learn$## Why the Glass Matters

Glassware is not just about looks. The shape of a glass decides whether a drink has room for ice, how quickly it warms in your hand, and how much of its aroma reaches your nose. Matching the drink to the right glass is one of the easiest ways to make a home cocktail feel finished.

### Glasses for Drinks Served "Up"

A drink served **up** is chilled with ice, then strained into a glass with no ice. These glasses usually have a stem, so you hold the drink by the stem instead of warming the bowl with your hand.

- **Coupe.** A stemmed glass with a shallow, rounded bowl. It is the most versatile glass for drinks served up, shaken or stirred: Daiquiris, Sidecars, Manhattans. The curved rim also makes it less likely to spill than a martini glass.
- **Nick & Nora.** A smaller, bell-shaped stemmed glass, named after the cocktail-loving couple from *The Thin Man*. Its modest size suits Martinis and other stirred drinks that taste best while very cold.
- **Martini glass.** The classic V-shaped glass. It is iconic, but its wide, sloping sides make it easy to spill, which is why many bars have switched to coupes and Nick & Noras.

### Glasses for Drinks on Ice

- **Rocks glass** (also called an Old Fashioned glass or lowball). Short and wide with a heavy base. It is used for spirit-forward drinks served over ice, like the Old Fashioned and Negroni, and for spirits served neat. A **double rocks** glass is simply a larger version.
- **Highball.** A tall, straight glass for simple mixed drinks: a spirit plus a larger amount of a carbonated mixer, like a whiskey highball or a Gin and Tonic. The narrow shape helps the drink hold its fizz.
- **Collins.** Similar to a highball but usually taller and narrower. It is named for the Tom Collins, and in practice many home bars use the two interchangeably.

### Specialty Vessels

- **Copper mug.** The traditional serve for a Moscow Mule. The metal feels very cold in the hand.
- **Julep cup.** A metal cup, usually silver or stainless steel, packed with crushed ice for a Mint Julep. The outside frosts over as the drink chills.
- **Flute.** A tall, narrow stemmed glass for sparkling wine and sparkling cocktails like the French 75. The small surface helps keep the bubbles lively.

### Chill Your Glasses

A cold glass keeps a drink served up colder for longer. Put glasses in the freezer for a while before serving, or fill them with ice and water while you mix, then empty them right before you pour.

### A Starter Set

You do not need every shape. Three types cover nearly every classic cocktail:

1. **Rocks glasses** for drinks on ice and spirits served neat.
2. **Coupes or Nick & Noras** for anything served up.
3. **Highballs** for tall, fizzy drinks.

One more tip: be wary of very large coupes. A standard cocktail looks lost in an oversized glass, and a glass that is too big tempts you to over-pour. Moderately sized glasses make drinks look generous and keep them cold.$learn$, chr(13), ''),
  'draft',
  $t$the common cocktail glasses (coupe, Nick and Nora, martini, rocks, highball, Collins, flute), what drinks go in each, why stems and chilling matter, and a starter set$t$
)
on conflict (id) do nothing;

-- Bourbon, Rye, and Scotch: What's the Difference? (spirits, 530 words)
insert into public.learn_articles (id, title, category, body_markdown, status, source_topic)
values (
  'e321ec37-136e-4cc8-9097-7729b2f62e29',
  $t$Bourbon, Rye, and Scotch: What's the Difference?$t$,
  'spirits',
  replace($learn$## Three Whiskies, Three Sets of Rules

Bourbon, rye, and Scotch are all whiskies: spirits distilled from fermented grain and aged in wood. What separates them is mostly a matter of law. Each has a legal definition covering what it is made from, where it is made, and how it is aged, and those rules shape how it tastes.

A quick note on spelling: Scotland spells it **whisky**, while American producers usually spell it **whiskey**. Both are correct.

### Bourbon

Under US federal rules, bourbon must be:

- **Made in the United States.** Kentucky makes most of it, but bourbon can legally come from any state.
- **Made from a mash of at least 51% corn.** The rest is usually some mix of rye, wheat, and malted barley.
- **Distilled to no more than 160 proof** (80% ABV), so the spirit keeps flavor from its grain.
- **Put into the barrel at no more than 125 proof.**
- **Aged in new, charred oak containers.** A barrel can only be used once for bourbon.
- **Bottled at 80 proof (40% ABV) or higher.**

There is no minimum aging time for plain "bourbon," but **straight bourbon** must be aged at least two years. All that corn and new charred oak gives bourbon its familiar sweetness, with notes of vanilla and caramel.

### Rye Whiskey

American rye whiskey follows almost the same rules as bourbon, with one key change: the mash must be **at least 51% rye**. Rye grain tastes spicier and drier than corn, so rye whiskey usually reads as peppery and a little leaner than bourbon. It is the classic base for a Manhattan and the traditional whiskey in a Sazerac.

### Scotch Whisky

Scotch must be **made and aged in Scotland**, matured in oak casks for **at least three years**, and bottled at **at least 40% ABV**. Apart from water, the only thing that may be added is plain caramel coloring. There is no rule requiring new barrels, and many Scotch distilleries age their spirit in casks that previously held bourbon or sherry.

You will mostly see two styles:

- **Single malt Scotch** is made entirely from malted barley, distilled in pot stills, at a single distillery.
- **Blended Scotch** combines malt whiskies with grain whisky, which is lighter in flavor. Most of the Scotch sold around the world is blended.

**Peat** is the source of Scotch's famous smoke. Some distilleries dry their malted barley over peat fires, and that smoke carries through into the whisky. Islay, an island off the west coast, is known for heavily peated whiskies, but plenty of Scotch has no smoke at all.

### In Your Cocktails

- **Bourbon** is round and sweet: perfect for an Old Fashioned, Whiskey Sour, or Mint Julep.
- **Rye** adds spice and backbone: try it in a Manhattan or Sazerac.
- **Scotch** stars in the Rob Roy (essentially a Scotch Manhattan) and the Penicillin, where a float of peated Scotch adds a smoky aroma.

Bourbon and rye can often stand in for each other, and the drink simply becomes sweeter or spicier. A heavily peated Scotch is different: its smoke dominates almost anything it touches, so substitute it carefully.$learn$, chr(13), ''),
  'draft',
  $t$the US legal definitions of bourbon and rye whiskey, what makes a whisky Scotch, single malt vs blended, peat, and how each behaves in cocktails$t$
)
on conflict (id) do nothing;

-- Gin Styles, Explained (spirits, 556 words)
insert into public.learn_articles (id, title, category, body_markdown, status, source_topic)
values (
  '13a42240-4e72-4821-b7ad-e5f8523ce021',
  $t$Gin Styles, Explained$t$,
  'spirits',
  replace($learn$## Juniper First

Every gin, whatever its style, shares one thing: **juniper**. Gin is a neutral spirit flavored with botanicals, and in the European Union juniper must be its predominant flavor. Beyond juniper, producers add their own mix of botanicals, commonly coriander seed, citrus peel, angelica root, and orris root, and many others besides.

How those botanicals are added, and what else goes into the bottle, is what separates one gin style from the next.

### London Dry

The most common style, and the most misunderstood. **London Dry is a method, not a place.** It can be made anywhere in the world.

Under the rules, a London gin gets its botanical flavor from redistillation: the botanicals go into the still with the spirit, and nothing except water and a tiny amount of sugar can be added afterward. That sugar limit is so small (0.1 grams per liter in EU rules) that the gin is effectively unsweetened, which is where the "dry" comes from. The result is crisp and juniper-forward. It is the default gin for a Martini, a Gin and Tonic, or a Negroni.

### Plymouth Gin

Plymouth gin is made by a single distillery in Plymouth, England, which has been producing it since the 1790s. It is softer and earthier than a typical London Dry, with juniper a little less sharp. It mixes beautifully in a Martini and has a long association with the Royal Navy.

### Old Tom

Old Tom is a lightly sweetened gin that was popular in the 1700s and 1800s, before London Dry took over. It sits between London Dry and genever in character: rounder and a little sweeter. It nearly vanished in the twentieth century, but craft distillers have revived it, and it is worth seeking out for old recipes like the Martinez and the original Tom Collins.

### Navy Strength

Navy Strength gin is bottled at about 57% ABV, which corresponds to 100 proof on the old British scale. That extra strength gives it a bold, concentrated flavor that holds up in drinks with strong mixers. Treat it with respect: a 2-ounce pour delivers noticeably more alcohol than a standard gin.

### Contemporary Gin

Sometimes called "New Western" gin, this loose category covers gins where juniper steps back and other botanicals, such as cucumber, citrus, rose, or tea, take the lead. These can be lovely in a Gin and Tonic but may taste out of place in a classic built around a juniper-forward London Dry.

### Genever

Genever is the Dutch and Belgian spirit that gin descends from. It is made with a malty, whiskey-like base called malt wine, so it tastes richer and more grain-forward than any English-style gin. It is traditionally sipped neat, but it also makes an excellent Old Fashioned-style drink.

### What About Sloe Gin?

Despite the name, **sloe gin is a liqueur**, not a gin style. It is made by steeping sloe berries (a tart wild plum relative) in gin with sugar, producing a sweet, deep red drink with lower alcohol. Use it like a liqueur, as in the Sloe Gin Fizz.

### Choosing a Gin

If you can only own one bottle, choose a London Dry: it works in nearly every classic gin recipe. Once you have that covered, a Plymouth or an Old Tom opens the door to softer and older-style cocktails.$learn$, chr(13), ''),
  'draft',
  $t$what legally makes a spirit gin, London Dry as a production method, Plymouth, Old Tom, Navy Strength, contemporary gin, genever, and sloe gin$t$
)
on conflict (id) do nothing;

-- Tequila vs. Mezcal: How They Differ (spirits, 555 words)
insert into public.learn_articles (id, title, category, body_markdown, status, source_topic)
values (
  '6a8782b6-98ba-4133-9517-17082244bd4d',
  $t$Tequila vs. Mezcal: How They Differ$t$,
  'spirits',
  replace($learn$## Two Spirits From One Plant Family

Tequila and mezcal are both distilled from **agave**, a spiky succulent native to Mexico. Neither is made from cactus, despite the common myth. The heart of the agave, called the *piña* because it resembles a giant pineapple once its leaves are cut away, is cooked to turn its starches into fermentable sugars, then crushed, fermented, and distilled.

Historically, tequila was one regional kind of mezcal. Today the two are separate, legally protected categories, each with its own rules about where and how it can be made.

### Tequila: One Agave, Specific Places

Tequila must be made from **blue Weber agave**, a single species. It can only be produced in the state of Jalisco and in designated municipalities of four other Mexican states: Guanajuato, Michoacán, Nayarit, and Tamaulipas.

Tequila producers typically cook their agave in large ovens or steam pressure cookers called autoclaves. Steam cooking keeps the flavor clean, letting the agave's bright, peppery, vegetal character come through.

Look for **"100% agave"** on the label. Tequila without it is a *mixto*, which only needs at least 51% of its sugar to come from agave; the rest can come from other sugars. For cocktails and sipping alike, 100% agave tequila is the better choice.

### Tequila's Aging Categories

- **Blanco** (also silver or plata): unaged, or rested for no more than two months. Crisp and agave-forward.
- **Reposado** ("rested"): aged in oak for at least two months but less than a year. Softer, with a little vanilla and spice.
- **Añejo** ("aged"): aged at least one year in oak barrels no larger than 600 liters. Richer, often sipped neat.
- **Extra añejo**: aged at least three years.

### Mezcal: Many Agaves, Smoke, and Tradition

Mezcal can be made from **many different agave species**. The most common is espadín, which is widely cultivated, but producers also use wild agaves such as tobalá and tepeztate, each with its own flavor. Oaxaca produces most of the mezcal on the market, and the mezcal denomination of origin also covers areas in a number of other states.

The biggest flavor difference comes from cooking. Traditional mezcal is made by roasting the piñas in **underground pits** lined with hot stones and covered with earth, often for several days. The smoke from that wood fire soaks into the agave, which is why mezcal is known for its smoky, savory character. Smoke levels vary a lot, though, and the best mezcals show plenty of fruit and earth alongside it.

### Using Them in Cocktails

**Tequila** is the base of the Margarita and the Paloma, where its brightness pairs naturally with lime and grapefruit. Blanco is the usual choice for shaken, citrus drinks; reposado and añejo shine in stirred drinks like a tequila Old Fashioned.

**Mezcal** is powerful, so a little goes a long way. A great way to start is a **split base**: replace a quarter or half of the tequila in a Margarita with mezcal. You get a gentle layer of smoke without overwhelming the drink. Mezcal also stands in for tequila or whiskey in stirred drinks, like the modern classic Oaxaca Old Fashioned, which combines both reposado tequila and mezcal.

Both spirits are worth tasting neat, at room temperature, in small sips. That is the best way to learn how much variety the agave family offers.$learn$, chr(13), ''),
  'draft',
  $t$the agave plant, where tequila and mezcal can be made, blue Weber agave vs many agave species, oven vs pit roasting and smoke, tequila aging categories, and using mezcal in cocktails$t$
)
on conflict (id) do nothing;

-- What Is a Liqueur? (spirits, 546 words)
insert into public.learn_articles (id, title, category, body_markdown, status, source_topic)
values (
  '164aacf3-112f-4b60-a813-5609c016bb2e',
  $t$What Is a Liqueur?$t$,
  'spirits',
  replace($learn$## Sweetened, Flavored Spirits

A **liqueur** is a distilled spirit that has been flavored and sweetened. The flavor can come from fruit, herbs, spices, flowers, nuts, coffee, or cream, and the sugar is part of the definition: in the United States, a liqueur must contain at least 2.5% sugar by weight, and most contain far more.

Liqueurs are usually lower in alcohol than base spirits like gin or whiskey, though a few herbal liqueurs are just as strong. In cocktails, they rarely play the lead role. Instead, they add sweetness, flavor, and body in one ingredient.

### The Main Families

**Orange liqueurs** are the most useful bottles in a home bar. *Triple sec* is the general term for a clear orange liqueur; Cointreau is a well-known premium example. Grand Marnier blends orange liqueur with cognac for a richer flavor. You will need an orange liqueur for the Margarita, Sidecar, and Cosmopolitan.

**Herbal liqueurs** are made from long, often secret lists of botanicals. Chartreuse, made by Carthusian monks in France, and Bénédictine are classic examples. They are intense and complex, so recipes usually call for small amounts.

**Amari** (singular *amaro*) are bittersweet Italian liqueurs, often sipped after dinner. The family also includes the bright red aperitivo bitters like Campari, the bitter backbone of the Negroni, and the lighter, lower-alcohol Aperol.

**Fruit liqueurs** range widely. *Crème de cassis* is made from blackcurrants and is the key to a Kir. *Maraschino liqueur*, made from marasca cherries, tastes nothing like a bright red cocktail cherry: it is dry-ish, funky, and floral, and it is essential in the Aviation and the Last Word.

**Nut and coffee liqueurs** include almond-flavored amaretto and coffee liqueurs used in the Espresso Martini and White Russian.

**Cream liqueurs** combine spirit with dairy cream, as in Irish cream. They are the one family where freshness really matters.

### What "Crème de" Means

A liqueur labeled *crème de* something, like crème de menthe, crème de cacao, or crème de violette, does **not** contain cream. The term traditionally signals a liqueur with a high sugar content and a syrupy texture. Cream liqueurs are a separate category altogether.

### How Liqueurs Work in Cocktails

Because liqueurs are sweet, they often do the job a syrup would otherwise do. In a Margarita, the orange liqueur balances the lime juice; in a Sidecar, it balances the lemon. When you swap one liqueur for another, or substitute a liqueur for syrup, keep the overall sweetness in mind and taste as you go.

Liqueurs are also a great way to change a drink with one small adjustment. A bar spoon of maraschino, a quarter ounce of an herbal liqueur, or a split of two orange liqueurs can shift a familiar recipe in a new direction.

### Storage

Most liqueurs are shelf-stable thanks to their alcohol and sugar, so a cool, dark cupboard is fine. Keep caps tight, since flavors, especially delicate fruit and floral ones, fade slowly once a bottle is open. For cream liqueurs and anything made with egg, follow the storage advice on the label, and use them sooner rather than later.

### Where to Start

If you are building a home bar, start with one orange liqueur and one bittersweet aperitivo like Campari. Those two bottles unlock dozens of classic cocktails.$learn$, chr(13), ''),
  'draft',
  $t$what makes a liqueur different from a spirit, the main families (orange, herbal, bittersweet amari, fruit, nut and coffee, cream), what 'crème de' means, how liqueurs work in cocktails, and storage$t$
)
on conflict (id) do nothing;

-- Vermouth: The Wine in Your Cocktails (wine, 498 words)
insert into public.learn_articles (id, title, category, body_markdown, status, source_topic)
values (
  '3d93351d-461f-4cfe-a49d-c2fbde2c7771',
  $t$Vermouth: The Wine in Your Cocktails$t$,
  'wine',
  replace($learn$## A Wine Hiding in Plain Sight

Vermouth is one of the most important ingredients in classic cocktails, and one of the most misunderstood. It is not a spirit and not a liqueur. **Vermouth is wine**: wine that has been fortified with a little extra alcohol and flavored with herbs, spices, roots, and bark. Wines like this are called *aromatized wines*.

The name comes from *Wermut*, the German word for wormwood, a bitter herb that was traditionally part of the botanical mix. Vermouth is usually around 15 to 18% ABV, stronger than table wine but far gentler than gin or whiskey.

### The Main Styles

**Sweet vermouth** (also called red or *rosso*) grew out of the Italian tradition centered on Turin. It is reddish-brown, sweet, and spiced, with notes of vanilla, dried fruit, and bitter herbs. Despite its color, most of it is made from white wine, with caramel giving it its hue.

**Dry vermouth** grew out of the French tradition. It is pale, crisp, and herbal, with much less sugar. It is the vermouth in a classic Martini.

**Blanc or bianco vermouth** is a pale, sweet style: clear like dry vermouth, but softer and sweeter, often with vanilla and floral notes.

### Vermouth in Classic Cocktails

- **Manhattan**: whiskey, sweet vermouth, and bitters.
- **Negroni**: equal parts gin, sweet vermouth, and Campari.
- **Martini**: gin (or vodka) with dry vermouth. The more vermouth, the "wetter" the Martini; less vermouth makes it "drier."
- **Americano**: Campari, sweet vermouth, and soda water. A lighter cousin of the Negroni.

Vermouth is also excellent on its own. A glass of sweet or blanc vermouth over ice with a splash of soda and an orange slice is a classic aperitif in Spain and Italy.

### The Most Important Rule: Refrigerate After Opening

Because vermouth is wine, it oxidizes once you open it. The added alcohol slows that down compared with an ordinary bottle of wine, but it does not stop it. An open bottle left on a warm shelf for months turns dull, flat, and stale, and many people who think they dislike vermouth have only tasted it that way.

To keep it tasting fresh:

- **Store opened vermouth in the fridge**, tightly sealed.
- **Use it within a month or two.** Producers and drink writers give windows of roughly one to three months in the fridge, with sweet vermouth usually at the shorter end.
- **Buy smaller bottles.** Many vermouths come in 375 ml half bottles, which you can finish before they fade.
- **Trust your senses.** If it smells flat, sour, or like old wine, replace it.

### Choosing a Bottle

A good starter pair is one sweet vermouth and one dry. That covers the Manhattan, Negroni, Martini, and dozens of other classics. Vermouths vary a lot from brand to brand, so if a Manhattan tastes off-balance, try a different sweet vermouth before you give up on the recipe. Taste each one on its own, chilled, to learn its personality.$learn$, chr(13), ''),
  'draft',
  $t$vermouth as an aromatized fortified wine, the wormwood origin of its name, sweet vs dry vs blanc styles, classic cocktails, and why opened vermouth belongs in the fridge$t$
)
on conflict (id) do nothing;

-- Fortified Wines: Port, Sherry, and Madeira (wine, 628 words)
insert into public.learn_articles (id, title, category, body_markdown, status, source_topic)
values (
  '9d318f41-178f-49c5-93d1-506a70be9ae6',
  $t$Fortified Wines: Port, Sherry, and Madeira$t$,
  'wine',
  replace($learn$## Wine With a Little Extra

A **fortified wine** is wine that has had distilled spirit, usually a grape spirit, added to it. Fortification was originally a way to help wine survive long sea voyages. Today it is simply part of what makes these wines taste the way they do.

When the spirit is added matters enormously. Add it during fermentation and the extra alcohol stops the yeast, leaving natural grape sugar behind: the wine stays sweet. Add it after fermentation is finished and the wine is dry. That single choice explains much of the difference between port and sherry.

### Port

Port comes from the Douro Valley in northern Portugal. Grape spirit is added **partway through fermentation**, which stops the yeast and leaves the wine rich and sweet.

The main styles:

- **Ruby port** is young and fruity, aged for a relatively short time in large vessels to keep its deep red color and berry flavors.
- **Tawny port** spends longer in smaller wooden casks, where slow exposure to air turns it amber and gives it nutty, caramel notes. You will often see tawnies labeled 10, 20, 30, or 40 years old, which describes the style and character of the blend.
- **Vintage port** is made from a single excellent year and ages mostly in the bottle. It can mature for decades.

### Sherry

Sherry comes from southern Spain, around the town of Jerez. It is made mostly from the Palomino grape and fortified **after fermentation**, so most sherry is dry. Its styles depend on how it ages:

- **Fino and manzanilla** age under *flor*, a layer of yeast that forms on the wine's surface and protects it from air. They are pale, bone dry, and savory, with almond and bread-dough notes. Manzanilla comes only from the seaside town of Sanlúcar de Barrameda.
- **Amontillado** begins life under flor, then ages with exposure to air, becoming amber and nutty while staying dry.
- **Oloroso** ages without flor from the start, growing darker, richer, and more nutty, yet still dry.
- **Pedro Ximénez** (PX) is made from sun-dried grapes and is intensely sweet, like liquid raisins. *Cream sherry* is a sweetened blend.

### Madeira

Madeira comes from the Portuguese island of the same name. Its unusual secret is **heat**: the wine is deliberately warmed during aging, either in heated tanks or in warm lofts for years. This "cooks" and oxidizes it on purpose, giving flavors of toffee, nuts, and dried fruit, along with bright acidity. The traditional grape names also signal sweetness, running from Sercial (driest) through Verdelho and Bual to Malmsey (sweetest).

### How Long Do They Keep Once Open?

- **Fino and manzanilla** are the most delicate. Refrigerate them and finish them within about a week, sooner for peak freshness.
- **Amontillado, oloroso, and sweet sherries** last longer, especially recorked and kept cool.
- **Ruby and tawny port** hold up for a few weeks after opening; tawny, already exposed to air, is the more forgiving. Vintage port is best within a day or two.
- **Madeira** is the champion. Because it has already been heated and oxidized, an opened bottle keeps for months.

### Fortified Wines in Cocktails

Fortified wines are fantastic low-alcohol cocktail ingredients:

- The **Sherry Cobbler**, a nineteenth-century favorite, is sherry, sugar, and citrus over crushed ice.
- The **Bamboo** combines dry sherry and dry vermouth with bitters for a light, elegant stirred drink.
- A spoonful of **PX** or **tawny port** adds richness to stirred whiskey drinks, much like a syrup with extra depth.

If you have only ever had fortified wine as a dusty bottle in the back of a cupboard, try a chilled fino or a glass of tawny. They are some of the best values in the wine world.$learn$, chr(13), ''),
  'draft',
  $t$what fortification is, how port stays sweet, sherry styles and flor, madeira's heated aging, how long each keeps after opening, and how to use them in cocktails$t$
)
on conflict (id) do nothing;

-- Serving Wine at the Right Temperature (wine, 486 words)
insert into public.learn_articles (id, title, category, body_markdown, status, source_topic)
values (
  '72c534ea-de0e-415a-a731-5a6750ed29df',
  $t$Serving Wine at the Right Temperature$t$,
  'wine',
  replace($learn$## Temperature Changes the Taste

The same wine can taste completely different depending on how cold it is. Serve a red too warm and it tastes hot, soupy, and alcoholic. Serve a white too cold and its aromas shut down, leaving it thin and almost flavorless. Getting the temperature roughly right is one of the easiest ways to make any bottle taste better.

As a rule, colder temperatures emphasize acidity and freshness and mute aroma and sweetness. Warmer temperatures bring out aroma and body, but also make alcohol and bitterness more noticeable.

### A Practical Guide

These are commonly recommended serving ranges. Treat them as targets, not laws.

- **Sparkling wine**: 43 to 50°F (6 to 10°C). Cold keeps the bubbles fine and lively.
- **Light, crisp whites and rosé** (Sauvignon Blanc, Pinot Grigio, dry rosé): 45 to 50°F (7 to 10°C).
- **Fuller whites** (oaked Chardonnay, Viognier): 50 to 55°F (10 to 13°C). A little warmer lets their richness show.
- **Light reds** (Pinot Noir, Beaujolais): 55 to 60°F (13 to 16°C), a gentle chill.
- **Fuller reds** (Cabernet Sauvignon, Syrah, Malbec): 60 to 65°F (16 to 18°C).
- **Sweet dessert wines**: well chilled, similar to whites, which keeps their sweetness feeling fresh rather than syrupy.

For reference, most home refrigerators run around 37 to 40°F (3 to 4°C), colder than almost any wine should be served.

### The "Room Temperature" Myth

The old advice to serve red wine at "room temperature" dates from a time when rooms were much cooler. A modern living room is often 70°F (21°C) or warmer, which is too warm for most reds. If your red tastes boozy or flat, it probably just needs a short chill.

### The 20-Minute Rule

A simple habit covers most situations:

- Take **whites out of the fridge** about 20 minutes before serving, so they warm slightly.
- Put **reds in the fridge** for about 20 minutes before serving, so they cool slightly.

### Chilling Wine Quickly

- **Use an ice bath, not just ice.** Fill a bucket with ice *and* water. Water surrounds the whole bottle, so it chills much faster than ice alone, and far faster than the fridge.
- **The freezer works in a pinch,** but set a timer. A forgotten bottle can freeze, push out its cork, or even crack.
- **Don't add ice cubes to fine wine,** since they dilute it as they melt. (An exception: some casual summer wines and spritz-style drinks are made to be served over ice.)

### Wine Warms Up in the Glass

Remember that wine warms as it sits in the glass, especially when you hold the bowl. It is better to start a little too cold than too warm. A slightly cold wine will open up after a few minutes; an overly warm wine will only get worse. Holding the glass by its stem helps keep your hand's warmth away from the wine.$learn$, chr(13), ''),
  'draft',
  $t$why temperature changes how wine tastes, recommended serving ranges for sparkling, white, rose, red, and dessert wines, the 'room temperature' myth, and quick chilling tricks$t$
)
on conflict (id) do nothing;

-- Hops, Explained (beer, 594 words)
insert into public.learn_articles (id, title, category, body_markdown, status, source_topic)
values (
  '53da2567-07d8-420b-89c5-028dbbf18400',
  $t$Hops, Explained$t$,
  'beer',
  replace($learn$## The Spice of Beer

Hops are the flowers, or *cones*, of the hop plant, *Humulus lupulus*, a climbing vine. Brewers use them the way a cook uses herbs and spices: to balance the sweetness of malt with bitterness and to add aroma and flavor. Hops also have natural antibacterial properties, which helped beer keep longer in the days before refrigeration.

Inside each cone are tiny yellow glands called **lupulin**. They contain the two things brewers care most about: **alpha acids**, which create bitterness, and **essential oils**, which carry aroma.

### Bitterness Comes From the Boil

Alpha acids on their own do not dissolve well in beer and do not taste very bitter. During the boil, heat transforms them into **iso-alpha acids**, which dissolve readily and deliver bitterness. The longer hops boil, the more of this change takes place. That is why hops added early in a long boil are called *bittering hops*.

This bitterness is what the IBU scale measures, and it is the counterweight to malt sweetness. Without it, most beer would taste flat and sugary.

### Aroma Comes Later

The essential oils that give hops their aroma are delicate and easily driven off by heat. So brewers who want a big aroma add hops **late in the boil**, after the boil is over, or during fermentation and conditioning, a technique called **dry hopping**. Dry hopping adds intense aroma and flavor with relatively little extra bitterness. It is a big part of why many modern IPAs smell so strongly of citrus or tropical fruit.

### Hop Character by Region

Different hop varieties have very different personalities:

- **Traditional European hops**, such as Saaz from the Czech Republic and Hallertau from Germany, are prized for gentle, floral, herbal, and spicy notes. They define the classic pilsner.
- **American hops**, like Cascade, are known for citrus, grapefruit, and pine. Cascade's distinctive aroma helped define the American pale ale.
- **Newer varieties** from the United States, New Zealand, and Australia often push into tropical fruit, berry, and stone fruit territory.

### Why Light "Skunks" Beer

Ever opened a beer that smelled like a skunk? That is a real chemical reaction, and hops are part of it. When light, especially blue and ultraviolet light, hits beer, riboflavin in the beer absorbs the energy and helps break down the hop-derived iso-alpha acids. One of the fragments forms a sulfur compound that is extremely similar to the one in skunk spray, and humans can smell it at astonishingly low levels.

That is why bottle color matters:

- **Brown glass** blocks most of the problem wavelengths.
- **Clear and green glass** let them through, so beers in those bottles skunk quickly.
- **Cans** block light completely.

Keep beer out of direct sunlight and away from bright lights, and pour clear-bottled beers soon after you buy them.

### Drink Hoppy Beer Fresh

Hop aroma fades with time, and it fades faster when beer is warm. A hop-forward IPA tastes noticeably brighter in its first weeks than after several months on a shelf. Check the packaging date, buy hoppy beers from stores that keep them cold, and store them in the fridge. Darker, malt-forward styles are generally more forgiving.

### A Note on the IPA Name

India Pale Ale takes its name from the hoppy, strong pale ales that English brewers shipped to India in the 1800s. The popular story that one brewer invented the style specifically for that trip is more legend than history, but the name stuck, and today "IPA" simply signals a beer where hops take center stage.$learn$, chr(13), ''),
  'draft',
  $t$what hops are, how boiling turns alpha acids into bitterness, aroma and dry hopping, regional hop character, why light skunks beer, and why hoppy beer should be drunk fresh$t$
)
on conflict (id) do nothing;

-- Beer Cocktails: Shandies, Micheladas, and More (beer, 533 words)
insert into public.learn_articles (id, title, category, body_markdown, status, source_topic)
values (
  'a29e61c7-812c-4a09-ba24-89635c816e21',
  $t$Beer Cocktails: Shandies, Micheladas, and More$t$,
  'beer',
  replace($learn$## Beer as a Cocktail Ingredient

Beer is not just something to serve alongside cocktails; it can be the main ingredient. Its carbonation, bitterness, and malt flavor make it a natural partner for citrus, spice, and even spirits and wine. Many beer drinks are also lower in alcohol than spirit-based cocktails, which makes them great for long afternoons.

### Shandy and Radler

The **shandy** is the simplest beer cocktail: beer mixed with lemonade. In Britain, where it has long been popular, "lemonade" usually means a clear, fizzy lemon soda, so a British-style shandy is often beer and lemon-lime soda. Half and half is a common starting point, but adjust to taste.

The **radler** is the German take on the same idea. *Radler* means "cyclist" in German, and the drink is traditionally a light lager mixed with sparkling lemonade. You will find many bottled radlers, often with grapefruit or other fruit flavors.

### Michelada and Chelada

The **michelada** is a savory Mexican beer drink. It starts with a light Mexican lager and fresh lime juice in a glass rimmed with salt or a chili-salt blend. From there, recipes vary widely by region and by household: hot sauce, Worcestershire sauce or Maggi seasoning, and sometimes tomato juice or a tomato-clam juice. Think of it as a lighter, fizzier cousin of the Bloody Mary.

The **chelada** is the simple version: beer, lime juice, and a salted rim. It is a great introduction to the style.

### Black Velvet

The **Black Velvet** layers or mixes stout with sparkling wine, traditionally Champagne. The result is surprisingly elegant: the stout brings roast and body, while the wine adds brightness and fine bubbles. Pour the sparkling wine first, then gently add the stout.

### Snakebite

A **snakebite** is equal parts lager and hard cider. It is crisp, slightly sweet, and refreshing. A splash of blackcurrant cordial turns it into a "snakebite and black."

### Boilermaker

A **boilermaker** pairs a beer with a shot of whiskey. Some drinkers take the shot and chase it with beer; others drop the shot into the beer. A more relaxed approach is to sip both side by side and look for pairings that complement each other, like a bourbon with an amber ale. Either way, this combination is strong, so pace yourself.

### Choosing the Right Beer

- **Light lagers and pilsners** are the most versatile base. Their clean, crisp flavor lets citrus and spice shine.
- **Wheat beers** work beautifully with citrus and fruit.
- **Stouts and porters** pair with rich flavors: coffee, chocolate, and sparkling wine.
- **Very hoppy IPAs** can clash with other ingredients, since their bitterness intensifies alongside acidity. Use them carefully.

### Technique Tips

- **Never shake beer.** Shaking carbonated liquid builds pressure and will spray your drink everywhere. Mix any non-beer ingredients first, then add the beer.
- **Build in the glass.** Most beer drinks are made right in the glass you serve them in.
- **Pour the beer last, and pour gently.** Tilt the glass and pour slowly down the side to keep the carbonation and avoid a mountain of foam.
- **Chill everything.** Cold beer, cold mixers, and a cold glass keep the drink fizzy and refreshing.$learn$, chr(13), ''),
  'draft',
  $t$classic beer mixed drinks (shandy, radler, michelada, chelada, black velvet, snakebite, boilermaker), choosing a beer, and technique tips like building in the glass and never shaking beer$t$
)
on conflict (id) do nothing;

-- Shaken or Stirred? How to Choose (other, 572 words)
insert into public.learn_articles (id, title, category, body_markdown, status, source_topic)
values (
  'c144d9cf-0e68-46dc-8da7-1e80e1bbce05',
  $t$Shaken or Stirred? How to Choose$t$,
  'other',
  replace($learn$## One Simple Rule

Every cocktail that is mixed with ice is either shaken or stirred, and choosing correctly makes a big difference. The good news is that one rule of thumb covers almost every drink:

- **Shake** drinks that contain citrus juice, other fruit juices, cream, dairy, or egg.
- **Stir** drinks made only of spirits, vermouths, liqueurs, and bitters.

So a Daiquiri, Margarita, or Whiskey Sour is shaken, while a Martini, Manhattan, or Negroni is stirred. An Old Fashioned is usually stirred too, often right in the glass it is served in.

### What Shaking Does

Shaking is violent, and that is the point. A hard shake:

- **Chills the drink very quickly**, because the ice is smashed around and constantly exposed to the liquid.
- **Mixes thoroughly.** Juices, syrups, and spirits have different textures, and shaking blends them into one smooth liquid.
- **Adds air.** Tiny bubbles give shaken drinks a lively, frothy texture and a cloudy look. That is perfect for a citrus drink and essential for a drink with egg white.

How long? Shake hard for roughly 10 to 15 seconds, until the outside of the shaker tin is painfully cold and frosted.

### What Stirring Does

Stirring is gentle. It chills and dilutes the drink while adding very little air, so the cocktail stays:

- **Clear**, with no cloudiness.
- **Silky and dense**, with a weighty texture that suits spirit-forward drinks.

Stirring takes longer than shaking to reach the same temperature, typically around 20 to 30 seconds with good ice. Taste from the bar spoon as you go: when the drink is cold and its alcohol feels softened, it is ready.

### Dilution Is Part of the Recipe

Whether you shake or stir, melting ice adds water to the drink, and that water is not a flaw. It softens alcohol, opens up flavors, and brings the drink into balance. A cocktail that has not been stirred or shaken long enough tastes harsh and hot; one that has been left too long tastes watery. The timing guidelines above help you land in between.

### Egg White Drinks: The Dry Shake

Drinks with egg white, like a classic Whiskey Sour or Pisco Sour, need extra work to build a silky foam. The usual method is the **dry shake**: shake all the ingredients *without* ice first to whip the egg white, then add ice and shake again to chill. Some bartenders reverse the order, shaking with ice, straining out the ice, then shaking again without it. Both methods produce a lovely foam; try each and see which you prefer.

### Highballs: Neither

Drinks topped with something carbonated, like a Gin and Tonic or a whiskey highball, are usually **built**: poured directly into an ice-filled glass and given a brief, gentle stir. Never shake soda water, tonic, or sparkling wine in a shaker, since the pressure can force the shaker open. If a shaken drink is topped with bubbles, shake the other ingredients first, then add the fizz in the glass.

### What About James Bond?

Bond's "shaken, not stirred" Martini is a matter of taste, not a mistake. Shaking makes a Martini a little colder, a little more diluted, and cloudy, with tiny ice chips on top. Most bartenders stir Martinis for a clear, silky drink, but if you like it shaken, shake it. The rules are there to help you, not to stop you from enjoying your drink.$learn$, chr(13), ''),
  'draft',
  $t$the rule of thumb for shaking vs stirring, what each technique does to texture, temperature, clarity, and dilution, how long to shake or stir, dry shaking egg white drinks, and exceptions$t$
)
on conflict (id) do nothing;

-- Ice, Explained: Size, Dilution, and Clear Ice (other, 582 words)
insert into public.learn_articles (id, title, category, body_markdown, status, source_topic)
values (
  '0413a156-eb63-46a1-bcc2-aaa89dfeeeda',
  $t$Ice, Explained: Size, Dilution, and Clear Ice$t$,
  'other',
  replace($learn$## The Most Overlooked Ingredient

Ice is in nearly every cocktail, yet it is the ingredient home bartenders think about least. It does two jobs at once: it **chills** the drink and it **dilutes** it with meltwater. Both are essential. A well-made cocktail is supposed to contain water from melted ice; that is part of what makes it balanced rather than harsh.

The size, shape, and quality of your ice decide how fast those two things happen.

### Size and Melting

Ice melts from its surface. A large cube has less surface area relative to its volume than several small cubes, so **big ice melts more slowly**. That gives you a few practical rules:

- **Large cubes or spheres** are ideal for drinks served on the rocks, like an Old Fashioned or a whiskey served over ice. The drink stays cold while diluting gradually.
- **Standard cubes** from a tray are perfect for shaking and stirring, where you want steady chilling and dilution.
- **Crushed ice** chills very fast and dilutes quickly. That is exactly what drinks like the Mint Julep, swizzles, and many tiki drinks are designed for: they are meant to be icy, frosty, and long.

To make crushed ice at home, wrap cubes in a clean kitchen towel or a canvas ice bag and give them a few whacks with a mallet or rolling pin.

### Why Home Ice Is Cloudy

The white, cloudy center of most freezer ice is made of trapped air bubbles and dissolved minerals. In an ordinary ice tray, water freezes from every side at once, from the outside in. As it freezes, it pushes air and impurities toward the middle, where they get trapped when the last of the water turns solid.

Cloudy ice works fine, but it is a little weaker structurally, so it can crack and melt faster, and it looks less impressive in the glass.

### Making Clear Ice at Home

The secret to clear ice is **directional freezing**: make the water freeze from one direction only, so the air and impurities are pushed ahead of the ice instead of being trapped inside it.

A simple method:

1. Fill a small, hard-sided insulated cooler with water and put it in your freezer **with the lid off**.
2. The insulated sides and bottom slow freezing there, so the water freezes from the **top down**.
3. After roughly a day, depending on your freezer, the top will be a slab of clear ice, with any cloudy ice and unfrozen water collected at the bottom.
4. Remove the block, let it temper for a few minutes so it does not shatter, and cut it into cubes with a serrated knife, discarding the cloudy bottom.

You may hear that boiling or filtering the water first makes clear ice. Those steps can help a little, but directional freezing is what makes the real difference.

### Fresh Ice for the Glass

When you shake a drink, the ice in the shaker gets smashed into small, wet pieces. If the drink is served on the rocks, **strain it over fresh ice** in the glass rather than dumping the shaker ice in. The fresh ice melts more slowly and looks much better.

### Storing Ice

Ice absorbs odors from the freezer, and old ice can taste like whatever it has been sitting next to. Keep ice in a sealed bag or covered container, and make fresh batches regularly. If your ice smells like the freezer, your drinks will too.$learn$, chr(13), ''),
  'draft',
  $t$why ice is a cocktail ingredient, how cube size affects melting and dilution, crushed ice, why ice turns cloudy and how directional freezing makes clear ice, and storing ice$t$
)
on conflict (id) do nothing;

-- Garnishes That Do More Than Decorate (other, 582 words)
insert into public.learn_articles (id, title, category, body_markdown, status, source_topic)
values (
  '53310fe0-72eb-4e7a-94e7-87dcfe1b5997',
  $t$Garnishes That Do More Than Decorate$t$,
  'other',
  replace($learn$## Garnish Is an Ingredient

It is easy to think of a garnish as decoration, the finishing touch that makes a drink look nice in a photo. But the best garnishes change how a drink tastes. Much of what we perceive as flavor actually comes from smell, and a garnish sits right where your nose meets the glass. Get it right and it adds aroma with every sip.

### Citrus Peels and Expressing Oils

Citrus peel is full of fragrant oils. To **express** a peel:

1. Cut a strip of peel with a Y-peeler, taking the colored outer skin and as little of the white pith as possible. The pith is bitter.
2. Hold the peel colored side down, a few inches above the drink.
3. Pinch it firmly between your fingers. You will see a fine mist of oil spray across the surface of the cocktail.
4. Optionally, rub the peel around the rim, then drop it in or discard it.

That mist of oil is the first thing you smell. A lemon twist brightens a Martini; an orange peel adds warmth to an Old Fashioned or Negroni. If you skip expressing the peel and just drop it in, you lose most of its effect.

### Waking Up Mint

Mint's aroma lives in its leaves. Before using a sprig as a garnish, place it in one palm and give it a single gentle clap with your other hand. This bruises the leaves just enough to release aroma without tearing them up. Set the sprig right next to where you will sip or by the straw, so its smell greets you with every taste. This is especially important in a Mint Julep or Mojito.

### Salt and Sugar Rims

A salted rim turns a Margarita into something special, and a sugared rim does the same for a Sidecar. A few tips:

- **Moisten the rim with a citrus wedge**, then dip it into a shallow plate of salt or sugar.
- **Rim only the outside of the glass.** Salt that falls inside the drink makes it taste salty all the way through.
- **Consider rimming half the glass.** That lets the drinker choose between salty and plain sips.

### Cherries

There is a big difference between the bright red, candy-sweet cherries in many supermarkets and **dark, syrupy cocktail cherries** such as Luxardo maraschino or amarena cherries. The dark varieties taste deeply of real fruit and are the traditional choice for a Manhattan. Once you try them, it is hard to go back.

### Olives and Onions

A Martini garnished with an olive picks up a subtle savory, briny note; a splash of the brine itself makes it a "dirty" Martini. Swap the olive for a pickled cocktail onion and you have a different drink altogether, the **Gibson**.

### Fresh Nutmeg

Rich, creamy drinks, such as flips, eggnog, and many tiki-style drinks like the Painkiller, often finish with grated nutmeg. Pre-ground nutmeg loses its aroma quickly, so buy whole nutmeg and grate a little over the top with a microplane right before serving. The difference in fragrance is dramatic.

### Keep It Simple and Fresh

A garnish should match the drink. It should be fresh, and it should be prepared right before serving. A wilted mint sprig or a dried-out peel does more harm than good. When in doubt, ask yourself what the garnish adds to the drink's aroma or flavor. If the answer is nothing, it is fine to leave it off.$learn$, chr(13), ''),
  'draft',
  $t$garnishes as aroma and flavor, expressing citrus peel oils, avoiding pith, waking up mint, salt and sugar rims, cocktail cherries, olives and onions, and fresh nutmeg$t$
)
on conflict (id) do nothing;

-- Quizzes -------------------------------------------------------------------

-- Spirits Quiz
insert into public.quizzes (id, title, source_type, source_ref, status)
values ('e4bd77c1-74fe-465e-a0a5-bd396a18ed75', $t$Spirits Quiz$t$, 'learn_category', 'spirits', 'draft')
on conflict (id) do nothing;

insert into public.quiz_questions
  (quiz_id, question_type, prompt, options, correct_option_index, explanation, sort_order)
values
  ('e4bd77c1-74fe-465e-a0a5-bd396a18ed75', 'multiple_choice', $q$What is the minimum share of corn in the mash for a whiskey to be called bourbon?$q$,
   jsonb_build_array($q$25%$q$, $q$51%$q$, $q$75%$q$, $q$100%$q$),
   1, $q$Bourbon must be made from a mash of at least 51% corn. The rest is usually a mix of rye, wheat, and malted barley.$q$, 0),
  ('e4bd77c1-74fe-465e-a0a5-bd396a18ed75', 'true_false', $q$Bourbon can only legally be made in Kentucky.$q$,
   jsonb_build_array($q$True$q$, $q$False$q$),
   1, $q$False. Kentucky makes most bourbon, but it can legally be made anywhere in the United States.$q$, 1),
  ('e4bd77c1-74fe-465e-a0a5-bd396a18ed75', 'multiple_choice', $q$How long must Scotch whisky be aged in oak casks, at minimum?$q$,
   jsonb_build_array($q$One year$q$, $q$Two years$q$, $q$Three years$q$, $q$Ten years$q$),
   2, $q$Scotch must be matured in oak casks in Scotland for at least three years.$q$, 2),
  ('e4bd77c1-74fe-465e-a0a5-bd396a18ed75', 'true_false', $q$London Dry gin can be made anywhere in the world.$q$,
   jsonb_build_array($q$True$q$, $q$False$q$),
   0, $q$True. London Dry is a production method, not a place. It gets its flavor from botanicals during distillation, with essentially nothing but water added afterward.$q$, 3),
  ('e4bd77c1-74fe-465e-a0a5-bd396a18ed75', 'multiple_choice', $q$Which gin style is lightly sweetened and was popular in the 1700s and 1800s?$q$,
   jsonb_build_array($q$Old Tom$q$, $q$Navy Strength$q$, $q$Plymouth$q$, $q$London Dry$q$),
   0, $q$Old Tom is a lightly sweetened, rounder gin from before London Dry took over. It suits old recipes like the Martinez.$q$, 4),
  ('e4bd77c1-74fe-465e-a0a5-bd396a18ed75', 'multiple_choice', $q$Which agave must tequila be made from?$q$,
   jsonb_build_array($q$Espadín$q$, $q$Tobalá$q$, $q$Blue Weber agave$q$, $q$Any agave species$q$),
   2, $q$Tequila must be made from blue Weber agave. Mezcal can be made from many species, with espadín the most common.$q$, 5),
  ('e4bd77c1-74fe-465e-a0a5-bd396a18ed75', 'multiple_choice', $q$Where does traditional mezcal's smoky flavor come from?$q$,
   jsonb_build_array($q$Aging in charred oak barrels$q$, $q$Roasting the agave in underground pits$q$, $q$Adding liquid smoke after distillation$q$, $q$Distilling in copper pot stills$q$),
   1, $q$Traditional mezcal roasts agave piñas in earthen pits lined with hot stones, and the wood smoke soaks into the agave.$q$, 6),
  ('e4bd77c1-74fe-465e-a0a5-bd396a18ed75', 'true_false', $q$A liqueur labeled "crème de cacao" contains dairy cream.$q$,
   jsonb_build_array($q$True$q$, $q$False$q$),
   1, $q$False. "Crème de" signals a liqueur that is high in sugar and syrupy, not one with cream. Cream liqueurs are a separate category.$q$, 7)
on conflict (quiz_id, sort_order) do nothing;

-- Wine Quiz
insert into public.quizzes (id, title, source_type, source_ref, status)
values ('ab74f9a1-82e1-4e5f-9719-e787b309b5c0', $t$Wine Quiz$t$, 'learn_category', 'wine', 'draft')
on conflict (id) do nothing;

insert into public.quiz_questions
  (quiz_id, question_type, prompt, options, correct_option_index, explanation, sort_order)
values
  ('ab74f9a1-82e1-4e5f-9719-e787b309b5c0', 'multiple_choice', $q$What is vermouth?$q$,
   jsonb_build_array($q$A grain spirit flavored with herbs$q$, $q$A fortified wine flavored with botanicals$q$, $q$A bitter herbal liqueur$q$, $q$A type of brandy$q$),
   1, $q$Vermouth is wine that has been fortified with a little extra alcohol and flavored with herbs, spices, roots, and bark: an aromatized wine.$q$, 0),
  ('ab74f9a1-82e1-4e5f-9719-e787b309b5c0', 'true_false', $q$An opened bottle of vermouth is best stored in the refrigerator.$q$,
   jsonb_build_array($q$True$q$, $q$False$q$),
   0, $q$True. Vermouth is wine, so it oxidizes once opened. Kept sealed in the fridge, it is best used within a month or two.$q$, 1),
  ('ab74f9a1-82e1-4e5f-9719-e787b309b5c0', 'multiple_choice', $q$Which herb gave vermouth its name?$q$,
   jsonb_build_array($q$Gentian$q$, $q$Juniper$q$, $q$Wormwood$q$, $q$Chamomile$q$),
   2, $q$The name comes from Wermut, the German word for wormwood, a bitter herb traditionally used in vermouth.$q$, 2),
  ('ab74f9a1-82e1-4e5f-9719-e787b309b5c0', 'multiple_choice', $q$Why does port taste sweet?$q$,
   jsonb_build_array($q$Sugar syrup is added before bottling$q$, $q$Spirit is added during fermentation, stopping the yeast and leaving grape sugar$q$, $q$It is made only from raisins$q$, $q$It is aged in barrels that held honey$q$),
   1, $q$Grape spirit is added partway through fermentation. The extra alcohol stops the yeast, leaving natural grape sugar in the wine.$q$, 3),
  ('ab74f9a1-82e1-4e5f-9719-e787b309b5c0', 'multiple_choice', $q$Fino and manzanilla sherries age under flor. What is flor?$q$,
   jsonb_build_array($q$A layer of yeast on the wine's surface$q$, $q$A type of oak barrel$q$, $q$A blend of sweet grapes$q$, $q$A cellar in Jerez$q$),
   0, $q$Flor is a layer of yeast that forms on the wine and shields it from air, keeping fino and manzanilla pale, dry, and savory.$q$, 4),
  ('ab74f9a1-82e1-4e5f-9719-e787b309b5c0', 'true_false', $q$Madeira is deliberately heated during aging.$q$,
   jsonb_build_array($q$True$q$, $q$False$q$),
   0, $q$True. Madeira is warmed in heated tanks or warm lofts, which cooks and oxidizes it on purpose. That is also why an opened bottle keeps for months.$q$, 5),
  ('ab74f9a1-82e1-4e5f-9719-e787b309b5c0', 'multiple_choice', $q$What is a good serving temperature for a full-bodied red like Cabernet Sauvignon?$q$,
   jsonb_build_array($q$37 to 40°F (3 to 4°C)$q$, $q$45 to 50°F (7 to 10°C)$q$, $q$60 to 65°F (16 to 18°C)$q$, $q$72 to 76°F (22 to 24°C)$q$),
   2, $q$Fuller reds show best around 60 to 65°F (16 to 18°C). A modern room is usually too warm, so a short chill often helps.$q$, 6),
  ('ab74f9a1-82e1-4e5f-9719-e787b309b5c0', 'multiple_choice', $q$Where do most of the tannins in red wine come from?$q$,
   jsonb_build_array($q$Added sugar$q$, $q$The yeast$q$, $q$Grape skins, seeds, and stems$q$, $q$The cork$q$),
   2, $q$Tannins come mainly from grape skins, seeds, and stems. Red wine soaks with its skins for days or weeks, so it picks up far more tannin than white wine.$q$, 7)
on conflict (quiz_id, sort_order) do nothing;

-- Beer Quiz
insert into public.quizzes (id, title, source_type, source_ref, status)
values ('9e3b3dfd-7fab-4373-8ead-e495e43968ba', $t$Beer Quiz$t$, 'learn_category', 'beer', 'draft')
on conflict (id) do nothing;

insert into public.quiz_questions
  (quiz_id, question_type, prompt, options, correct_option_index, explanation, sort_order)
values
  ('9e3b3dfd-7fab-4373-8ead-e495e43968ba', 'multiple_choice', $q$What happens to hop alpha acids during the boil?$q$,
   jsonb_build_array($q$They evaporate completely$q$, $q$They turn into iso-alpha acids, which make beer bitter$q$, $q$They turn into alcohol$q$, $q$They darken the beer's color$q$),
   1, $q$Heat turns alpha acids into iso-alpha acids, which dissolve in beer and deliver bitterness. The longer the boil, the more bitterness.$q$, 0),
  ('9e3b3dfd-7fab-4373-8ead-e495e43968ba', 'true_false', $q$Dry hopping mainly adds aroma rather than bitterness.$q$,
   jsonb_build_array($q$True$q$, $q$False$q$),
   0, $q$True. Hops added after the boil, during fermentation or conditioning, add aroma and flavor with relatively little extra bitterness.$q$, 1),
  ('9e3b3dfd-7fab-4373-8ead-e495e43968ba', 'multiple_choice', $q$Which kind of packaging protects beer from light best?$q$,
   jsonb_build_array($q$Clear glass$q$, $q$Green glass$q$, $q$Brown glass$q$, $q$Cans$q$),
   3, $q$Cans block light completely. Brown glass blocks most of the problem wavelengths, while clear and green glass let them through.$q$, 2),
  ('9e3b3dfd-7fab-4373-8ead-e495e43968ba', 'multiple_choice', $q$What causes the skunky smell in light-struck beer?$q$,
   jsonb_build_array($q$Bacteria growing in the bottle$q$, $q$Light breaking down hop compounds into a sulfur compound$q$, $q$The beer getting too warm$q$, $q$Old yeast$q$),
   1, $q$Light, helped along by riboflavin, breaks down hop-derived iso-alpha acids. One fragment forms a sulfur compound very similar to the one in skunk spray.$q$, 3),
  ('9e3b3dfd-7fab-4373-8ead-e495e43968ba', 'true_false', $q$Lager yeast ferments at warmer temperatures than ale yeast.$q$,
   jsonb_build_array($q$True$q$, $q$False$q$),
   1, $q$False. Ale yeast ferments warm and works quickly. Lager yeast ferments cooler and more slowly, which gives a cleaner, crisper beer.$q$, 4),
  ('9e3b3dfd-7fab-4373-8ead-e495e43968ba', 'true_false', $q$A beer's SRM number tells you its color, not its flavor.$q$,
   jsonb_build_array($q$True$q$, $q$False$q$),
   0, $q$True. SRM measures color only. Two beers with the same SRM can taste completely different.$q$, 5),
  ('9e3b3dfd-7fab-4373-8ead-e495e43968ba', 'multiple_choice', $q$A michelada is built on which kind of beer?$q$,
   jsonb_build_array($q$A light Mexican lager$q$, $q$An imperial stout$q$, $q$A Belgian tripel$q$, $q$A double IPA$q$),
   0, $q$A michelada starts with a light Mexican lager and fresh lime juice, served in a salt-rimmed glass with seasonings that vary by region.$q$, 6),
  ('9e3b3dfd-7fab-4373-8ead-e495e43968ba', 'true_false', $q$To mix a beer cocktail, shake the beer with the other ingredients.$q$,
   jsonb_build_array($q$True$q$, $q$False$q$),
   1, $q$False. Never shake beer: the carbonation builds pressure and sprays everywhere. Mix the other ingredients first, then gently pour the beer in last.$q$, 7)
on conflict (quiz_id, sort_order) do nothing;

-- Home Bar Basics Quiz
insert into public.quizzes (id, title, source_type, source_ref, status)
values ('1cad489e-ad01-4ad2-959a-fe765a101792', $t$Home Bar Basics Quiz$t$, 'learn_category', 'other', 'draft')
on conflict (id) do nothing;

insert into public.quiz_questions
  (quiz_id, question_type, prompt, options, correct_option_index, explanation, sort_order)
values
  ('1cad489e-ad01-4ad2-959a-fe765a101792', 'multiple_choice', $q$Which of these drinks should be shaken rather than stirred?$q$,
   jsonb_build_array($q$Manhattan$q$, $q$Negroni$q$, $q$Daiquiri$q$, $q$Martini$q$),
   2, $q$Shake drinks with citrus, juice, dairy, or egg. The Daiquiri has lime juice; the others are all spirits and vermouth, so they are stirred.$q$, 0),
  ('1cad489e-ad01-4ad2-959a-fe765a101792', 'true_false', $q$Stirring a cocktail adds a lot of air, which makes it cloudy.$q$,
   jsonb_build_array($q$True$q$, $q$False$q$),
   1, $q$False. Shaking adds air and makes drinks cloudy. Stirring adds very little air, keeping drinks clear and silky.$q$, 1),
  ('1cad489e-ad01-4ad2-959a-fe765a101792', 'multiple_choice', $q$What is a dry shake?$q$,
   jsonb_build_array($q$Shaking with crushed ice$q$, $q$Shaking without ice to whip egg white into a foam$q$, $q$Shaking with no liquid at all$q$, $q$Shaking a drink that has no sugar$q$),
   1, $q$A dry shake means shaking without ice to whip the egg white, then adding ice and shaking again to chill.$q$, 2),
  ('1cad489e-ad01-4ad2-959a-fe765a101792', 'multiple_choice', $q$Why does a large ice cube melt more slowly than several small ones?$q$,
   jsonb_build_array($q$It is colder$q$, $q$It has less surface area relative to its volume$q$, $q$It is made from filtered water$q$, $q$It is denser$q$),
   1, $q$Ice melts from its surface. A large cube has less surface area relative to its volume, so it melts and dilutes more slowly.$q$, 3),
  ('1cad489e-ad01-4ad2-959a-fe765a101792', 'multiple_choice', $q$What makes clear ice at home?$q$,
   jsonb_build_array($q$Freezing water as fast as possible$q$, $q$Adding salt to the water$q$, $q$Directional freezing, so the water freezes from one side$q$, $q$Using carbonated water$q$),
   2, $q$Directional freezing pushes air and impurities ahead of the ice instead of trapping them. An open insulated cooler in the freezer makes the water freeze from the top down.$q$, 4),
  ('1cad489e-ad01-4ad2-959a-fe765a101792', 'true_false', $q$Water from melting ice is part of a well-balanced cocktail.$q$,
   jsonb_build_array($q$True$q$, $q$False$q$),
   0, $q$True. Dilution softens alcohol and opens up flavors. Too little tastes harsh; too much tastes watery.$q$, 5),
  ('1cad489e-ad01-4ad2-959a-fe765a101792', 'multiple_choice', $q$When you cut a citrus peel for a garnish, why avoid the white pith?$q$,
   jsonb_build_array($q$It is bitter$q$, $q$It is sour$q$, $q$It makes the drink cloudy$q$, $q$It has no aroma, so it adds nothing$q$),
   0, $q$The white pith tastes bitter. Take the colorful outer skin, where the fragrant oils are.$q$, 6),
  ('1cad489e-ad01-4ad2-959a-fe765a101792', 'multiple_choice', $q$Swap the olive in a Martini for a pickled cocktail onion and you get which drink?$q$,
   jsonb_build_array($q$Gimlet$q$, $q$Gibson$q$, $q$Vesper$q$, $q$Martinez$q$),
   1, $q$A Martini garnished with a cocktail onion is a Gibson.$q$, 7)
on conflict (quiz_id, sort_order) do nothing;

-- Glassware and Citrus Tools Quiz
insert into public.quizzes (id, title, source_type, source_ref, status)
values ('e7ecb72a-5c29-40e0-a9dd-4b637d194533', $t$Glassware and Citrus Tools Quiz$t$, 'learn_category', 'tools', 'draft')
on conflict (id) do nothing;

insert into public.quiz_questions
  (quiz_id, question_type, prompt, options, correct_option_index, explanation, sort_order)
values
  ('e7ecb72a-5c29-40e0-a9dd-4b637d194533', 'multiple_choice', $q$How should a lime half go into a handheld citrus press?$q$,
   jsonb_build_array($q$Cut side up, facing the handles$q$, $q$Cut side down, facing the holes$q$, $q$Sideways$q$, $q$It doesn't matter$q$),
   1, $q$Cut side down, facing the holes. When you squeeze, the press turns the fruit inside out and pushes the juice straight through.$q$, 0),
  ('e7ecb72a-5c29-40e0-a9dd-4b637d194533', 'multiple_choice', $q$Which tool cuts long, thin spiral strands of citrus peel?$q$,
   jsonb_build_array($q$Y-peeler$q$, $q$Reamer$q$, $q$Channel knife$q$, $q$Muddler$q$),
   2, $q$A channel knife has a small notched blade that carves a long, thin strand of peel, perfect for spiral garnishes.$q$, 1),
  ('e7ecb72a-5c29-40e0-a9dd-4b637d194533', 'true_false', $q$If a drink needs both juice and a peel garnish, cut the peel before you juice the fruit.$q$,
   jsonb_build_array($q$True$q$, $q$False$q$),
   0, $q$True. Squeezed citrus is soft and floppy and almost impossible to peel cleanly.$q$, 2),
  ('e7ecb72a-5c29-40e0-a9dd-4b637d194533', 'multiple_choice', $q$Why do glasses for drinks served up usually have a stem?$q$,
   jsonb_build_array($q$So you can hold the drink without warming it$q$, $q$To make the drink look bigger$q$, $q$To keep the bubbles in$q$, $q$So it can hold ice$q$),
   0, $q$Drinks served up have no ice to keep them cold. Holding the stem keeps your hand's warmth away from the bowl.$q$, 3),
  ('e7ecb72a-5c29-40e0-a9dd-4b637d194533', 'multiple_choice', $q$Which glass is the usual choice for an Old Fashioned?$q$,
   jsonb_build_array($q$Flute$q$, $q$Coupe$q$, $q$Collins$q$, $q$Rocks glass$q$),
   3, $q$The rocks (Old Fashioned) glass is short and wide with a heavy base, made for spirit-forward drinks served over ice.$q$, 4),
  ('e7ecb72a-5c29-40e0-a9dd-4b637d194533', 'true_false', $q$The crosshatched yarai pattern on a mixing glass changes how a stirred drink tastes.$q$,
   jsonb_build_array($q$True$q$, $q$False$q$),
   1, $q$False. The yarai pattern looks good and gives a little extra grip, but plain glass makes the same drink.$q$, 5),
  ('e7ecb72a-5c29-40e0-a9dd-4b637d194533', 'multiple_choice', $q$What is the easiest way to chill a glass if your freezer is full?$q$,
   jsonb_build_array($q$Rinse it with hot water$q$, $q$Fill it with ice and water while you mix, then empty it$q$, $q$Rub it with a lime wedge$q$, $q$Leave it in the sink$q$),
   1, $q$Fill the glass with ice and water while you make the drink, then pour it out just before you strain the cocktail in.$q$, 6)
on conflict (quiz_id, sort_order) do nothing;

commit;
