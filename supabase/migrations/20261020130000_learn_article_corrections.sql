-- Learn accuracy pass, slice 3: remaining corrections (spec 0033) ---------
--
-- Replaces the body of the 18 remaining published Learn articles in full,
-- one commented block per article, and fixes 8 quiz questions whose text
-- repeated a corrected claim or was itself wrong. Every change and its
-- source is recorded in docs/reviews/2026-10-learn-article-fact-check.md;
-- apply only after the owner has approved those entries.
--
-- Rerun safe: full replacements by id write the same text again. status
-- and published_at are untouched (AC-11); the set_updated_at trigger bumps
-- updated_at.
--
-- Paste safe: the SQL editor on Windows turns pasted newlines into CRLF, so
-- each body is wrapped in replace(..., chr(13), '') to store LF only.
--
-- Freeze: don't edit these rows in Studio until this is applied, or the
-- edit is overwritten (the md5 check below catches it either way).
--
-- Check after apply (every row should say ok):
--   select id, title, case md5(body_markdown)
--     when '8eb0cc8ccdb2b8d30e418f1dcb6a3f74' then 'ok'
--     when '18cfd07d8f52bd5f2cff3346ac5f9986' then 'ok'
--     when '487003af10b86f34ba006533654c2688' then 'ok'
--     when '86f18b11cba51addda42028d7193667f' then 'ok'
--     when '59c63fdfa47da6aff1ca537f7de818d0' then 'ok'
--     when 'a826dfacdd3f5f2bd77b24194a4014f2' then 'ok'
--     when 'd37104b6bf03e1d865679a93baef5b18' then 'ok'
--     when 'eedd4131d0fd393f4f8fe55d2a859c70' then 'ok'
--     when '224295a8b4164c78cca4c8593b063db8' then 'ok'
--     when '794f2de847e4677f3353bba50b586aac' then 'ok'
--     when '1e8db6c207ae9749382ba48838fbb635' then 'ok'
--     when '7287415fa91cbf8dbae9246a76be9ec6' then 'ok'
--     when '0cbd36cf4f9c3fb20186fb1eb43660a6' then 'ok'
--     when '085dc22e1f7e690cfb032f0617618bf1' then 'ok'
--     when '463539824829882fa95167a40b271e3c' then 'ok'
--     when '1d9ae7bf8587d0440e2373542f1a52b3' then 'ok'
--     when '225ffddd6dca8e061edab0660932f822' then 'ok'
--     when '005b736f14276e77c3835c1e48168a04' then 'ok'
--     else 'MISMATCH' end as check
--   from public.learn_articles
--   where id in ('d7389446-31f0-48fd-bc9d-e2c7501bed50', '45d76fde-7b6d-406f-b115-f18e9088e8f9', 'bc3c5db2-3d83-4457-98f2-e079cc7b544c', '3354052f-638a-4899-80b9-fc1b7b09ca45', 'f2ef1264-e27c-4281-8894-d033ca877dd4', '4f0e6dd4-c5b9-4908-bd1f-b8c71b9affca', '703483d8-332f-4028-a5cb-1c7bbf31949f', '7e8a0b92-0698-45d5-a3a5-8376fc57986a', 'a8c248ae-0644-48a0-834f-7801686b6448', 'ff30c6e6-0126-42f2-a6cf-c74bef784935', 'd8f91bd2-1f24-4398-a68b-c4b9bef9a6e6', 'ae462cd4-7631-41a1-a9c4-005b48fb3cbc', 'cfe1d4f1-e762-4008-b490-13190de2aa11', 'b990526b-b1a4-43f8-82b1-456b2e190f24', '877642bc-ad79-4481-9bbe-6e99ae21bd2e', 'ed181d21-3098-4650-aa92-f8860ce0a0f1', 'f80e36f4-d9dd-42b2-95f5-0516cf83b11f', '92a725cb-240c-4dc1-8bd5-10d52c729850');

begin;

-- Articles ------------------------------------------------------------------

-- What Is a Jigger? (6 changes)
-- Previous md5: ea942a7483a8e6d54b3ab487254db4d6
-- Expected md5: 8eb0cc8ccdb2b8d30e418f1dcb6a3f74
update public.learn_articles
set body_markdown = replace($learn$## Why Every Home Bartender Needs a Jigger

A **jigger** is a small measuring cup used to portion spirits, liqueurs, and other cocktail ingredients with precision. If you've ever wondered how bartenders consistently make drinks that taste the same every time, a jigger is a major part of the answer. It's one of the most essential tools in any bar setup, yet it's often overlooked by beginners.

### The Importance of Measuring

Unlike cooking, where a pinch more of an ingredient might not ruin a dish, cocktail making is more like chemistry. The balance between spirits, citrus, sweeteners, and other components creates the final flavor profile. A drink made with 1.5 ounces of bourbon tastes noticeably different from one made with 2 ounces. Using a jigger ensures consistency—your margaritas will taste the same whether you make them on Monday or next month.

Measuring also helps you **control alcohol content**. When you know exactly how much spirit goes into each drink, you can make informed decisions about strength and serve guests responsibly. Plus, consistent portioning helps your bottles last longer and makes it easier to calculate costs if you're hosting parties.

### Common Jigger Sizes

A common choice for home bartenders is the **double jigger**, which has a cup on each end. One popular size pairs a 1-ounce cup with a 2-ounce cup:

- **1-ounce side**: Used for smaller pours of modifiers like vermouth, liqueurs, citrus juice, and syrups. Bitters are too concentrated for a jigger; they're added in dashes straight from the bottle.
- **2-ounce side**: A common pour for the base spirit in many cocktails, such as margaritas, daiquiris, and whiskey sours.

Some home bartenders prefer a **1.5-ounce/0.75-ounce jigger**, which offers different proportions. This is great if you find yourself making smaller drinks or prefer a lighter hand with spirits.

You'll also see **single-ended jiggers** that measure just one volume, but double jiggers offer much more flexibility for the small investment.

### How to Use a Jigger Properly

Using a jigger is straightforward, but technique matters. Fill it to the brim for an accurate pour—don't estimate or underfill. Measure one ingredient at a time and pour each into your mixing glass or shaker before measuring the next. A jigger only holds one measure, so there's no way to measure several ingredients in it together.

### Materials and Styles

Jiggers come in **stainless steel** (durable and easy to clean), **glass** (lets you see the liquid level clearly), or **plastic** (budget-friendly). Stainless steel is the most popular choice for serious home bartenders because it's long-lasting and professional-looking.

You'll also find jiggers with **measurement lines etched on the sides**. These are helpful for visualizing ounces and halves, though they're optional—a simple jigger with unmarked cups works perfectly fine.

### Building Your Bar

A jigger is one of the most affordable tools in a home bar. Start with a 1-ounce/2-ounce double jigger in stainless steel. As you develop your skills and discover your preferred cocktail styles, you might add a second jigger with different proportions—but honestly, most home bartenders get by perfectly well with just one.

The difference between a casual home bartender and someone who consistently makes excellent drinks often comes down to one simple thing: **they measure**. A jigger removes guesswork, ensures your drinks taste right every single time, and makes the whole bartending process feel more professional and intentional. It's a small tool that makes a big difference.$learn$, chr(13), '')
where id = 'd7389446-31f0-48fd-bc9d-e2c7501bed50';

-- What Is a Bar Spoon For? (8 changes)
-- Previous md5: 7ce81143cb4915bda4fcd42f078b80ad
-- Expected md5: 18cfd07d8f52bd5f2cff3346ac5f9986
update public.learn_articles
set body_markdown = replace($learn$## Understanding the Bar Spoon's Design and Purpose

The bar spoon is one of the most underrated tools in a home bar. With its long handle, shallow bowl, and often twisted or spiral shaft, it looks different from a regular kitchen spoon for good reason. Understanding how to use it properly will improve both your technique and your cocktails.

### Why the Length Matters

The bar spoon's extended handle—often around a foot long, sometimes longer—serves several functions. First, it allows you to reach the bottom of a mixing glass without your hand getting wet or getting in the way. This matters because you want to stir the whole drink, ice included, in one smooth, controlled motion. A shorter spoon forces you to use awkward angles or submerge your hand, neither of which gives you good control.

The length also keeps your hand away from the cold glass and any chilled liquid splashes. More importantly, it gives you the reach to stir down among the ice in a tall mixing glass.

### The Twisted Handle Explained

You'll notice the bar spoon's handle has a twisted or spiral pattern. This isn't just decorative. The twist is usually credited with two jobs: it gives your fingers grip when they're wet or cold, and it lets the spoon spin smoothly between your fingers as you stir.

Some bar spoons feature a flat handle instead of a twist. Both work well; it's mostly a matter of personal preference and what feels comfortable in your grip.

### Stirring Cocktails

The bar spoon is your primary tool for mixing spirit-forward drinks like Martinis, Negronis, and Manhattans. Proper stirring chills the ingredients and dilutes them slightly with ice melt, which is essential for a well-balanced drink. Hold the spoon's handle between your thumb and first two fingers, letting it rest against your ring finger. Keep the back of the spoon against the inside of the glass and move it in a smooth circle so the ice turns as one mass. Stir until the drink is cold and its alcohol has softened, tasting a drop from the spoon to check.

The shallow bowl of a bar spoon is ideal for this work. It moves smoothly through the liquid and ice without creating unwanted aeration or splashing. A deeper spoon traps liquid and ice, making stirring less efficient.

### Layering and Building

Beyond stirring, the bar spoon is essential for **layering drinks**—creating distinct color bands in a cocktail by carefully pouring ingredients over the back of the spoon. This technique relies on the spoon's shallow bowl and length. You position the spoon's back just above the surface of the liquid already in the glass, then slowly pour the new ingredient over it. The spoon breaks the pour's force, so the new ingredient spreads gently across the top instead of mixing in. Pour in order from the heaviest (usually the most sugary) ingredient to the lightest, so each new layer floats on the one below.

Layering creates visually stunning drinks like B-52s and Pousse-Cafés. It requires patience and practice, but the bar spoon makes it manageable.

### Building Drinks at the Glass

When you're building a cocktail directly in the serving glass (rather than in a separate mixing glass), the bar spoon helps you stir without splashing and lets you control the order and mixing of ingredients. This approach is common for drinks like the Old Fashioned and simple highballs.

### Choosing Your Bar Spoon

Look for a spoon with a reasonably heavy bowl—it should feel balanced in your hand. The handle should be long enough that when the bowl rests in a tall glass, your hand stays clear. Stainless steel is durable and easy to clean. Some bar spoons have a small fork at the other end for spearing garnishes, or a flat disc that can be used for gentle muddling or layering.

Once you start using a proper bar spoon regularly, you'll understand why professional bartenders consider it essential. It becomes an extension of your hand, enabling better control, more elegant presentations, and better-balanced drinks.$learn$, chr(13), '')
where id = '45d76fde-7b6d-406f-b115-f18e9088e8f9';

-- Boston Shaker vs. Cobbler Shaker (10 changes)
-- Previous md5: b2373089c8cf5b041275e00fc5ca21e7
-- Expected md5: 487003af10b86f34ba006533654c2688
update public.learn_articles
set body_markdown = replace($learn$## Understanding Your Shaker Options

When you're starting your home bar, one of the first tools you'll need is a cocktail shaker. You'll quickly discover there are two main types: the Boston shaker and the cobbler shaker. Each has distinct advantages and disadvantages, and understanding the differences will help you choose the right one for your needs.

### The Boston Shaker

The Boston shaker consists of **two parts**: a large metal tin and a smaller mixing glass (or a smaller metal tin) that fits into its mouth. When shaking, you fill the mixing glass with ice and ingredients, place the metal tin over it, and shake vigorously. The two pieces separate, and you strain the cocktail into your serving glass.

**Pros of the Boston Shaker:**
- **Bar favorite**: It's the shaker you'll see behind many bars, so learning with it connects you to professional technique
- **Versatile**: You can use the mixing glass independently for stirring cocktails like Martinis and Negronis
- **Durable**: With fewer moving parts, there's less to break
- **Tight seal**: Once you get the hang of it, the two pieces lock together firmly with little leaking
- **Easier to clean**: Simple two-piece construction means no crevices where ice gets stuck

**Cons of the Boston Shaker:**
- **Learning curve**: Getting the seal right takes practice; too loose and it leaks, too tight and it's hard to separate
- **Requires a strainer**: You'll need a separate Hawthorne or Julep strainer to pour
- **Less intuitive**: Beginners often find the shaking motion and separation technique intimidating

### The Cobbler Shaker

The cobbler shaker has **three parts**: a metal container, a built-in strainer top, and a cap that fits over the strainer. Everything is self-contained, making it an all-in-one solution. You fill it, shake, and pour directly through the built-in strainer.

**Pros of the Cobbler Shaker:**
- **Beginner-friendly**: The all-in-one design is intuitive and requires no additional tools
- **Gentle learning curve**: Just fill, cap, shake, and pour
- **Built-in strainer**: Everything you need is included
- **Attractive**: The sleek design looks nice sitting on a home bar
- **Compact storage**: One unified piece takes up less space

**Cons of the Cobbler Shaker:**
- **The stuck top problem**: As the metal gets cold during shaking, it contracts, and the strainer top can lock tight onto the body. A firm tap where the pieces meet usually frees it
- **Harder to clean**: Ice gets trapped between the strainer and cap, making thorough cleaning difficult
- **Weaker seal**: The three-piece design creates more potential leak points
- **Quality concerns**: Many affordable options don't seal well or have weak strainers

### Which Should You Choose?

**For most home bartenders, we recommend starting with a Boston shaker.** Yes, there's a slight learning curve—but it's honestly quite short. Spend five minutes watching a video and practicing your first shake, and you'll have it down. The investment pays off immediately: you get a tool that works better, lasts longer, and actually improves your technique.

A cobbler shaker is a fine choice too, especially if you want an all-in-one tool or only make cocktails occasionally. If the top sticks, a firm tap usually frees it.

### The Middle Ground

Some bartenders love using a Boston shaker with a separate mixing glass specifically for stirred drinks. This setup gives you maximum versatility for less than the cost of a high-end cobbler shaker.

Whichever you choose, invest in quality. A good shaker becomes a staple you'll use for years.$learn$, chr(13), '')
where id = 'bc3c5db2-3d83-4457-98f2-e079cc7b544c';

-- Strainers, Explained: Hawthorne, Julep, and Fine Mesh (9 changes)
-- Previous md5: 2afdf9ce2f962c1e0a9067470ac8c93f
-- Expected md5: 86f18b11cba51addda42028d7193667f
update public.learn_articles
set body_markdown = replace($learn$## Understanding Your Straining Options

When you're building cocktails at home, straining is one of the most important techniques you'll master. The liquid that ends up in your glass should be perfectly clear and ice-free—and that means choosing the right strainer for the job. Most home bars need just two or three strainers, each designed with a specific purpose in mind.

### The Hawthorne Strainer

The **Hawthorne** is the workhorse of cocktail straining. You'll recognize it immediately: it's a flat, perforated paddle with a handle and a coil spring around its edge. The spring fits snugly inside the mouth of your shaker tin or mixing glass, letting liquid through while holding back ice and larger particles.

Use the Hawthorne when:
- Shaking cocktails in a cocktail shaker
- Stirring cocktails in a mixing glass
- You need a fast, reliable strain for most standard drinks

The Hawthorne works because the spring naturally adjusts to fit different glass sizes, and the coil catches many of the larger ice chips. It's your go-to strainer for Daiquiris, Margaritas, Martinis, and nearly everything else.

### The Julep Strainer

The **Julep** strainer looks quite different—it's a small, oval-shaped bowl with a handle, almost like a tiny slotted spoon. Today it's used mostly for *stirred* drinks rather than juleps. After you stir, you set the perforated bowl inside the mouth of the mixing glass and hold it against the ice with a finger as you pour, keeping the ice in the glass.

Use the Julep when:
- Stirring cocktails in a mixing glass
- You want a more elegant, controlled pour
- Making drinks like Negronis, Manhattans, or Martinis

Many bartenders prefer the Julep for stirred drinks because it fits a mixing glass well and gives a clean, controlled pour. However, the Hawthorne works fine for this purpose too—it really comes down to personal preference and technique.

### The Fine Mesh Strainer

The **fine mesh** strainer (much like a tea strainer) is a small, cone-shaped sieve with a handle and very fine mesh. This strainer is designed for one specific job: catching tiny ice shards and debris that other strainers miss.

You won't use this alone for initial straining. Instead, you'll use it as a *second* strainer, a technique called **double straining**.

### When to Double Strain

Double straining means pouring through two strainers at once: you strain from the shaker with a Hawthorne while holding the fine mesh strainer over the serving glass, so the drink passes through both.

Double strain when:
- Making drinks with small ice shards from shaking (like Daiquiris or Sours)
- You want a completely pristine, crystal-clear drink
- Making drinks with citrus juice, which can leave pulp, or with muddled herbs or fruit, which leave small bits behind

Double straining isn't always necessary—many casual home drinks look perfectly fine with just a Hawthorne strain. But if you're after bar-quality clarity in a shaken drink, it's worth the extra step. Stirred drinks rarely need it, since stirring doesn't break the ice into shards.

### Building Your Strainer Collection

If you're just starting out, buy a **Hawthorne strainer** first. It handles most of what you'll make. Once you're comfortable, add a **Julep strainer** if you enjoy stirred drinks and want more elegance in your technique. Finally, grab a **fine mesh strainer** if you want to level up to restaurant-quality presentation.

All three tools are inexpensive and will last for years. The key is understanding what each one does and when it matters most.$learn$, chr(13), '')
where id = '3354052f-638a-4899-80b9-fc1b7b09ca45';

-- The Muddler, Explained (8 changes)
-- Previous md5: 7c0c8fd9b13ca638e0891b2242b92c11
-- Expected md5: 59c63fdfa47da6aff1ca537f7de818d0
update public.learn_articles
set body_markdown = replace($learn$## Understanding the Art of Muddling

Muddling is one of the most misunderstood techniques in cocktail making. At its core, muddling is the gentle crushing of ingredients—typically fruits, herbs, or sugar—directly in your mixing glass or shaker to release flavors, oils, and juices. When done correctly, it transforms a drink. When done poorly, it ruins one. Let's break down what you need to know.

### Why Muddlers Matter

The purpose of muddling is to extract essential oils from herbs and break down fruit to release juice and flavor compounds. Think of it like this: when you crush a mint leaf between your fingers, you smell that bright, fresh aroma instantly. That's because you've ruptured the cell walls, releasing the aromatic oils. The same principle applies in your cocktail. A properly muddled ingredient contributes depth and complexity that you simply can't achieve by stirring alone.

### The Over-Muddling Problem

The most common mistake home bartenders make is **over-muddling**. When you crush ingredients too aggressively, you break down the plant matter excessively, which can release bitter, grassy flavors from herbs. In fruits, over-muddling can create unwanted flavors and turn your drink cloudy or grainy.

Over-muddled mint, for example, becomes bitter and woody rather than fresh and bright. Similarly, muddling citrus too hard grinds into the white pith, which is bitter. The solution? Use **gentle, controlled pressure**. Press down firmly but don't grind or twist the muddler. Think of it as a controlled release, not aggressive destruction.

### What Should Be Muddled

**Herbs like mint, basil, and rosemary** respond beautifully to muddling. Use light pressure—just 2-3 gentle presses—to release their aromatic oils. The Mojito and Mint Julep are classic examples where proper muddling makes all the difference.

**Fresh fruits** such as berries, citrus, or stone fruits can be muddled to release juice and break down the flesh, but be careful not to pulverize them. Muddling helps release flavor from soft berries and ripe fruit.

**Sugar and bitters** are muddled together when you make an Old Fashioned the classic way, with a sugar cube. The pressing helps the sugar dissolve and creates a flavorful base for the drink.

### What Shouldn't Be Muddled

Go easy on **citrus**. Some classics do muddle it: the Caipirinha is made by muddling lime wedges with sugar. Press just enough to release the juice and some oil from the peel, since grinding hard into the white pith adds bitterness. For most drinks, it's easier to juice the fruit and add the juice separately.

There's no reason to muddle **liquids** like spirits or liqueurs; muddling is for solid ingredients. And **tender herbs like basil** should only get the lightest touch; a few gentle presses are all you need.

### The Right Technique

Hold your muddler like a baseball bat or hammer with a relaxed grip. Place it in your glass or shaker and apply firm but controlled downward pressure. Make 2-4 slow, deliberate presses rather than many rapid, aggressive ones. Let the weight of the muddler do most of the work—you're directing the pressure, not generating it through force.

### Choosing a Muddler

You don't need fancy equipment. A basic wooden muddler works perfectly fine. Look for one with a flat or slightly cupped bottom—this creates better surface contact with your ingredients. Avoid rough, splintering wood. Some bartenders prefer a slightly heavier muddler, since its weight helps with the technique.

### The Takeaway

Muddling is about finesse, not force. Extract aromatic oils and fruit juice gently, using controlled pressure and minimal movements. Respect your ingredients, and they'll reward you with balanced, flavorful cocktails that showcase the fresh, natural tastes you're trying to highlight.$learn$, chr(13), '')
where id = 'f2ef1264-e27c-4281-8894-d033ca877dd4';

-- What Does Proof Mean? (8 changes)
-- Previous md5: 298999eb1bb58a2de15e2cf66d23de4c
-- Expected md5: a826dfacdd3f5f2bd77b24194a4014f2
update public.learn_articles
set body_markdown = replace($learn$## Understanding Proof and Alcohol by Volume

When you're shopping for spirits or following a cocktail recipe, you'll often see two numbers: **proof** and **ABV (alcohol by volume)**. These measure the same thing—how much pure alcohol is in the bottle—but they're expressed differently. Understanding the relationship between them is essential for building balanced cocktails at home.

### The Modern Proof System

In the United States today, proof is simple math: it's exactly twice the ABV percentage. So a spirit that's 40% ABV is 80 proof. A high-proof bourbon at 100 proof contains 50% alcohol by volume. This straightforward 2:1 relationship makes it easy to convert between the two numbers in your head.

**ABV (Alcohol by Volume)** is the international standard and what most bartenders think in terms of today. It's simply the percentage of pure ethanol in the liquid. This is what matters most when you're building cocktails, since it determines how "strong" your drink will be.

### Why the Name "Proof"?

The term "proof" has a quirky origin. The popular story comes from England: before alcohol could be measured precisely, a spirit was tested by soaking gunpowder in a sample and trying to ignite it. If it still burned, that was "proof" the spirit hadn't been watered down too far. Britain later defined proof precisely, and its definition differs from the American one.

**Historical note:** On the old British scale, 100 proof was about 57% ABV, so British proof works out to roughly ABV × 1.75. That means an older British label shows a *lower* proof number than an American label for the same spirit: 40% ABV is 80 proof in the US but about 70 proof on the old British scale. Today, most countries use ABV exclusively, but understanding this history helps explain why proof exists at all.

### Why Proof Matters in Cocktails

When you're crafting drinks at home, proof affects several important things:

**Balance and Intensity** — Higher-proof spirits deliver more alcohol impact with less volume. A 100-proof bourbon creates a more assertive drink than an 80-proof version in the same recipe.

**Dilution from Stirring or Shaking** — When you stir or shake a cocktail, ice melts and adds water, which dilutes the drink. A higher-proof spirit starts out stronger, so the finished drink still tastes more assertive after the same amount of dilution.

**Flavor Development** — Proof influences how flavors come through. A higher-proof spirit tastes hotter and more intense, while a lower-proof one tastes gentler. Neither is "better"—they're different tools for different drinks, so taste and adjust.

### Reading Labels and Building Recipes

In the United States, a spirits label must state the alcohol content as a percentage of alcohol by volume. Proof is optional, though many brands print it too. For cocktail recipes, you'll see them written either way. If a recipe calls for "100-proof rye" and you only have 80-proof on hand, the same pour carries 20% less alcohol (40% ABV instead of 50%), which changes the drink's balance.

This doesn't mean you can't substitute, but be aware of the adjustment. Using lower-proof spirits? You might need slightly less other ingredients to keep the drink balanced. Using higher-proof? You might add a touch more citrus or sweetener to compensate.

### The Practical Takeaway

For home bartending, remember: **proof = ABV × 2** in America. The higher the proof, the more alcohol impact per ounce. Understanding this relationship helps you make intentional choices about which spirits to buy and how they'll behave in your favorite cocktails. Start with standard 80-proof spirits to learn the basics, then experiment with higher-proof alternatives to see how they change your drinks.$learn$, chr(13), '')
where id = '4f0e6dd4-c5b9-4908-bd1f-b8c71b9affca';

-- Why Spirits Age in Oak Barrels (7 changes)
-- Previous md5: 8a4c715e5e8ccda0177e613c84facac4
-- Expected md5: d37104b6bf03e1d865679a93baef5b18
update public.learn_articles
set body_markdown = replace($learn$## The Magic Behind the Barrel

When you pour a glass of bourbon, cognac, or aged rum, you're tasting the direct result of time spent in wood. But what exactly happens inside that oak barrel? Understanding this process helps explain why aged spirits command premium prices and taste so dramatically different from their clear, newly distilled counterparts.

### How Oak Transforms Spirit

Spirit enters the barrel as a clear, often harsh liquid fresh off the still, carrying the flavors of whatever it was made from: grain for whiskey, grapes for brandy, sugarcane or molasses for rum. Over months or years, oak works like a patient flavor architect, breaking down harsh compounds while introducing new ones. The wood is porous, allowing the spirit to seep into its grain and extract compounds that soften the taste and add complexity.

Oak supplies tannins, and when the inside of a barrel is toasted or charred, the heat breaks the wood down into new flavor compounds, including vanillin (the main flavor compound in vanilla) and caramel-like wood sugars. These slowly dissolve into the aging spirit. Additionally, a small amount of spirit evaporates through the barrel walls in a process called the "angel's share."

### The Color Comes From Char

You've likely noticed that whiskey, brandy, and rum range from pale gold to deep amber. That color comes mostly from the barrel, not from the base spirit (though some categories, such as Scotch, also allow plain caramel coloring). Barrels are prepared with heat before they're filled: bourbon must go into new, charred oak, so the inside is burned intentionally, while many other spirits age in barrels that are toasted or have held another drink before.

The char level matters. American cooperages number char levels from #1 (lightest) to #4 (heaviest); a #4 char, sometimes called "alligator char" for its cracked, scaly surface, takes roughly a minute of flame. According to the cooperage Independent Stave, lighter chars tend to give more fruity and spicy notes, while darker chars extract more vanilla flavor and color. The charred layer is also thought to act a little like charcoal, helping filter out harsh sulfur compounds.

The char acts as a filter and flavor delivery system. As spirit sits in the barrel, it penetrates the char layer, extracting color and specific flavor compounds depending on how deeply the char has penetrated the wood.

### Time Really Does Matter

Aging isn't a linear process—the spirit doesn't simply get "better" the longer it sits. In its early years, a spirit loses its sharpest edges and picks up oak and vanilla notes. With more time, caramel, spice, and wood become more pronounced. Very long aging can add great depth, but it can also over-extract, leaving the spirit woody or astringent. How fast this happens depends on the barrel, the char, and the warehouse, so there's no fixed timetable.

Climate affects aging speed too. Warm climates accelerate the process because heat expands the spirit, forcing it deeper into the oak and wood.

### Why It Matters for Your Home Bar

Understanding oak aging helps you appreciate what you're drinking and make smarter purchasing decisions. A 12-year-old whiskey isn't automatically "better" than a 6-year-old one—it depends on the barrel quality, climate, and your personal taste. Some people prefer the bright, slightly spicy notes of younger spirits; others crave the smooth, complex character only time provides.

When you taste an aged spirit, you're experiencing the accumulated effect of oak's chemistry. That vanilla note? Vanillin from the wood. The caramel sweetness? Sugars extracted from oak during charring. The silky mouthfeel? Years of harsh compounds breaking down and blending together.

Next time you reach for an aged spirit, take a moment to appreciate the barrel's patient work—it's genuinely transforming simple alcohol into something with real character.$learn$, chr(13), '')
where id = '703483d8-332f-4028-a5cb-1c7bbf31949f';

-- What Does Cask Strength Mean? (3 changes)
-- Previous md5: cf64c20c37a2d2c7e4df9b58224057da
-- Expected md5: eedd4131d0fd393f4f8fe55d2a859c70
update public.learn_articles
set body_markdown = replace($learn$## Understanding Cask Strength and Why It Matters

When you're shopping for spirits, you might notice some bottles labeled "cask strength" or "barrel proof." These terms refer to whiskey (and occasionally other spirits) bottled directly from the barrel with little to no dilution. You'll often see "non-chill filtered" on the same bottles, but that term is about a filtering step, not about dilution. To understand why this matters for your home bar, it helps to know what happens during the typical bottling process.

### The Standard Bottling Process

Most spirits you buy are diluted with water before bottling. Distilleries do this for several practical reasons: to reach a consistent proof level (usually around 80-100 for whiskey), to reduce costs, and to create a product that appeals to the broadest audience. This dilution is normal and expected—there's nothing wrong with it. However, some distillers choose to skip this step entirely.

### What Is Cask Strength?

Cask strength whiskey comes straight from the barrel at whatever proof the spirit naturally reached during aging. This is often well above 100 proof, and it varies with the barrel, the climate, and how long the spirit aged. Since no water is added, you're getting the spirit exactly as it finished maturation. The flavor tends to be more **concentrated and intense** than standard bottles, with bolder oak, spice, and fruit notes.

The catch? Cask strength bottles vary from barrel to barrel. A distillery might release a cask strength whiskey at 118 proof one year and 121 proof the next, since they're not standardizing the product. This unpredictability is part of the appeal for enthusiasts.

### Why Choose Cask Strength?

For sipping neat or with a single ice cube, cask strength whiskey delivers maximum flavor intensity. Some bartenders prefer it because the higher proof carries flavors more boldly into mixed drinks. That said, **it's not automatically "better"**—it's simply different. A well-made 80-proof whiskey can be excellent. Cask strength is best when you specifically want concentrated flavor and are willing to pay the premium price (cask strength bottles often cost more).

### Adjusting Your Cocktails for High-Proof Spirits

When mixing with cask strength or high-proof whiskey, you might need to rethink your proportions slightly. A standard Whiskey Sour recipe typically uses 2 ounces of 80-proof whiskey. If you switch to a 120-proof version, that same 2-ounce pour delivers 50% more alcohol.

**Here are practical adjustments:**

- **Reduce the spirit slightly**: Use 1.5 ounces of cask strength instead of 2 ounces of standard proof. This maintains similar alcohol content while letting you taste the concentrated flavor.
- **Add slightly more mixer**: A touch more lemon juice or syrup balances the intensity without weakening the drink.
- **Taste and adjust**: High-proof spirits are forgiving because you can always add water or ice to find your preference.

### Practical Tips for Your Home Bar

If you're curious about cask strength, start by tasting it neat or with a few drops of water. This reveals what you're working with before adding it to cocktails. You don't need to overhaul your recipes—most work fine with high-proof spirits if you're comfortable with a bolder drink.

Remember that cask strength isn't a requirement for great cocktails. Many classic drinks were originally made with whatever proof was available. The most important thing is choosing quality spirits you enjoy and adjusting to your taste. Whether that's 80 proof or 130 proof is entirely up to you.$learn$, chr(13), '')
where id = '7e8a0b92-0698-45d5-a3a5-8376fc57986a';

-- What Is a Base Spirit? (6 changes)
-- Previous md5: 007282ee6b0a0971aba0bace09dae1f6
-- Expected md5: 224295a8b4164c78cca4c8593b063db8
update public.learn_articles
set body_markdown = replace($learn$## Understanding the Foundation of Cocktails

When you pick up a cocktail recipe, you'll notice the first ingredient is almost always a base spirit. This is the main alcohol that defines the drink's character and flavor profile. Understanding base spirits is essential because they're not interchangeable—using vodka instead of whiskey in an Old Fashioned would create something entirely different.

A **base spirit** is the primary distilled alcohol in a cocktail, typically making up 1.5 to 2 ounces of a standard drink. It provides the drink's backbone, determines its smoothness or spice, and influences which other ingredients work well with it. Think of it as the canvas for your cocktail masterpiece.

## The Six Classic Base Spirits

**Whiskey** is aged grain spirit known for its warmth and complexity. Made from fermented grain (barley, rye, corn, or wheat), whiskey develops its rich brown color and vanilla or oak notes during barrel aging. Whiskey appears in classics like Manhattans, Old Fashioneds, and Whiskey Sours. Its bold flavor means it pairs beautifully with citrus, bitters, and vermouth.

**Gin** is a neutral spirit (often, but not always, made from grain) flavored with botanicals, primarily juniper. What makes gin distinctive is its herbal, sometimes piney character. Gin shines in Martinis, Gin & Tonics, and Negronis. Its botanical complexity means it can stand up to bold mixers or pair elegantly with subtle ones.

**Vodka** is a neutral spirit with minimal flavor profile, distilled to high proof and often filtered. Because it doesn't contribute its own taste, vodka lets other ingredients shine. It's the go-to for Espresso Martinis, Moscow Mules, and Cosmopolitans—drinks where you want the mixer or other spirits to be the star.

**Rum** is distilled from sugarcane juice or molasses, and its flavor often reads as rich or sweet, even though the spirit itself isn't sugary unless the producer adds sweetening. Rum ranges from light and delicate to dark and rich, depending on aging and production methods. You'll find it in Daiquiris, Mojitos, Hurricanes, and Tiki drinks. Its rich, often fruity character makes it a natural fit for tropical cocktails.

**Tequila** comes from the agave plant and has a distinctive peppery, slightly herbaceous flavor. Tequila is either blanco (unaged or only briefly rested, crisp) or aged in oak, like reposado and añejo (smoother, with oak notes). Margaritas, Palomas, and Tequila Sunrises showcase tequila's versatility. Its brightness works particularly well with citrus and spicy ingredients.

**Brandy** is distilled from wine or fermented fruit, and many brandies, such as Cognac, are aged in oak barrels. Aged brandy has rich, warming flavors with notes of vanilla, oak, and dried fruit. Brandy is the base of the Sidecar, and Cognac is the base of the IBA's Sazerac. Its sophistication and depth make it ideal for sipping cocktails.

## Why Base Spirit Selection Matters

Choosing the right base spirit affects several aspects of your cocktail. **Flavor balance** is crucial—a spirit's inherent sweetness, spice, or herbal notes must complement your other ingredients. **Mouthfeel** varies too; whiskey feels warming and full-bodied, while vodka is clean and neutral. **Color and presentation** matter as well—dark rum and brandy create rich-colored drinks that look luxurious.

Understanding these distinctions helps you improvise confidently. If a recipe calls for gin but you only have vodka, you're making a very different drink—one that loses the botanical complexity. However, knowing why they're different means you can make informed choices about substitutions.

## Getting Started

As a home bartender, start by tasting each base spirit neat or with a splash of water to understand their individual characteristics. Then experiment with classic cocktails that highlight each spirit. This hands-on approach will deepen your appreciation and make you a better bartender.$learn$, chr(13), '')
where id = 'a8c248ae-0644-48a0-834f-7801686b6448';

-- What Are Bitters? (8 changes)
-- Previous md5: 78195c9121f628df44d4d360b6240fa7
-- Expected md5: 794f2de847e4677f3353bba50b586aac
update public.learn_articles
set body_markdown = replace($learn$## The Essential Guide to Cocktail Bitters

Bitters are one of the most misunderstood ingredients in home bartending. They're concentrated, intensely flavored liquids, usually high in alcohol (Angostura is 44.7% ABV and Peychaud's 35%), and a complex blend of herbs, spices, bark, and roots. A single dash or two can transform an ordinary cocktail into something remarkable, yet many home bartenders relegate them to the back of the shelf, unsure how to use them.

### How Bitters Are Made

Bitters are created by steeping botanicals—like gentian root, cinchona bark, dried citrus peel, and various spices—in high-proof alcohol for weeks or months. The mixture is then filtered and bottled. This process extracts the essential flavors and aromas, creating a concentrated liquid that's meant to be used in tiny quantities. Some producers add sugar or glycerin to balance the bitterness, while others keep them completely dry.

### The Main Types You'll Encounter

**Aromatic Bitters** are the most common and versatile. Angostura is the classic example—a dark, complex blend made from a closely guarded recipe. Aromatic bitters work in almost any spirit-forward cocktail, from Old Fashioneds to Manhattans. Peychaud's, a lighter, red aromatic bitters from New Orleans, is the traditional bitters in a Sazerac. They add depth and complexity without dramatically changing the drink's flavor profile.

**Orange Bitters** feature citrus as the primary note, usually combined with spices and herbs. They're slightly lighter and brighter than aromatic bitters, making them ideal for gin cocktails like the Martini and anything where you want a citrus lift. They pair beautifully with whiskey too.

**Chocolate Bitters** bring cocoa notes to stirred cocktails, particularly those made with bourbon or rye. A dash in a Manhattan or Old Fashioned adds an unexpected layer of warmth and sophistication.

**Other Specialties** include celery bitters for Bloody Marys, peach bitters for fruity drinks, and walnut or chocolate-hazelnut variations. These flavored bitters are fun to experiment with, though they're more niche than aromatic and orange.

### Why Just a Few Dashes Matter So Much

Bitters work like seasoning in cooking. When you add a single dash, just a fraction of a teaspoon, to a cocktail, you're adding intensity and complexity without overpowering other ingredients. The botanicals act as a bridge, making the spirit taste rounder and smoother, while adding subtle spice and herbal notes.

Consider an Old Fashioned: bourbon, sugar, water, and bitters. The bitters don't make it taste like bitters—they enhance the bourbon's natural spice notes, complement the sweetness, and add an almost imperceptible bitterness that makes your palate more engaged. Without them, the drink tastes flat and one-dimensional.

### How to Use Them at Home

Keep a bottle of aromatic bitters (like Angostura) and orange bitters in your home bar. Start with two dashes in drinks like Manhattans and Old Fashioneds, or a dash of orange bitters in a Martini. You'll immediately notice the difference.

Store bitters in a cool, dark place—they'll last for years due to their high alcohol content. Most bottles come with a dasher top that releases a little at a time, though the size of a dash varies from bottle to bottle.

### The Bottom Line

Bitters are concentrated flavor enhancers that do heavy lifting in small quantities. They're inexpensive, shelf-stable, and essential to making cocktails taste like cocktails rather than just mixed drinks. Start with the classics—aromatic and orange—and explore from there. Many classic cocktails are built around them for good reason.$learn$, chr(13), '')
where id = 'ff30c6e6-0126-42f2-a6cf-c74bef784935';

-- What Are Non-Alcoholic Spirits? (7 changes)
-- Previous md5: 5cd0937f3677c23a37e9e451b6da47e3
-- Expected md5: 1e8db6c207ae9749382ba48838fbb635
update public.learn_articles
set body_markdown = replace($learn$## Understanding Non-Alcoholic Spirits

Non-alcoholic spirits have revolutionized home bartending by offering sophisticated flavor options without the ethanol. Whether you're exploring lower-ABV cocktails, hosting guests with diverse drinking preferences, or simply experimenting with new taste profiles, these products open up creative possibilities.

### How Non-Alcoholic Spirits Are Made

Unlike traditional spirits created through fermentation and distillation, non-alcoholic alternatives use several production methods:

**Flavor Extraction and Infusion**: Producers steep botanicals, fruits, herbs, and spices in water or glycerin to capture complex flavors. These infusions mimic the taste profiles of gin, whiskey, or rum without fermentation.

**Distillation**: Some brands distill botanicals to capture their aromas. Methods vary by producer; some distill with alcohol and then remove it.

**Concentrated Bases**: Many non-alcoholic spirits use concentrated flavor bases combined with water, gum arabic, and natural sweeteners to create body and mouthfeel similar to their alcoholic counterparts.

**Alcohol Removal**: Some producers start with a fermented or distilled base, then remove the alcohol with methods such as vacuum distillation or reverse osmosis, aiming to keep the original's flavors.

### Common Categories

**Non-Alcoholic Gin**: The most popular category, featuring botanical profiles with juniper, citrus, and herbal notes. Many deliver dry, crisp characteristics that work well in a G&T.

**Non-Alcoholic Whiskey**: These capture warm spice, oak, and vanilla notes reminiscent of barrel-aged spirits. Perfect for sipping neat or building spirit-forward cocktails.

**Non-Alcoholic Rum**: Often featuring tropical fruit, vanilla, and subtle spice notes, these work wonderfully in daiquiris and punches.

**Non-Alcoholic Vermouth and Bitters**: These serve as essential modifiers, adding complexity and depth to your cocktails.

**Amaro and Liqueur Alternatives**: Complex, herbal, or fruit-forward options that add sophistication to digestifs and mixed drinks.

### Substituting in Cocktail Recipes

While non-alcoholic spirits offer exciting flavors, they differ from traditional spirits in several ways that affect substitution:

**Body and Intensity**: Without alcohol, these products can feel thinner and lighter than the spirits they replace. You may want a slightly larger pour; adjust in small steps and taste as you go.

**Sweetness Considerations**: Sweetness varies a lot between brands: some are unsweetened, others noticeably sweet. Taste yours neat first, then adjust the recipe's syrup or liqueur to match.

**Modifier Emphasis**: Without alcohol's preservative and flavor-carrying properties, lean more heavily on bitters, citrus, and aromatic modifiers like vermouth or amaro to build complexity.

**Technique Matters**: Proper dilution through stirring or shaking becomes even more critical. Non-alcoholic spirits benefit from thorough chilling and water incorporation to achieve balance.

### Practical Tips for Home Bartenders

Start by building spirit-forward cocktails like martinis, negronis, or sazeracs with non-alcoholic bases. These formats showcase the product's nuances rather than hiding them.

Keep traditional recipes as a reference, but think of non-alcoholic substitutions as inspiration rather than exact replacements. The absence of alcohol changes mouthfeel and integration, requiring thoughtful adjustment.

If you're making a lower-alcohol drink rather than a zero-proof one, try splitting the base: half a regular spirit and half a non-alcoholic one. You keep some of the spirit's character with less alcohol.

Taste your non-alcoholic spirit neat before building cocktails. Understanding its flavor profile—botanicals, sweetness level, and intensity—helps you make smarter pairing decisions with mixers and modifiers.

Two practical notes. First, storage: without alcohol to preserve them, many of these products don't keep as long after opening as regular spirits. Follow the label, and when in doubt, refrigerate the bottle once opened and finish it within a few weeks. Second, "non-alcoholic" doesn't always mean zero: some products contain a trace of alcohol, so check the label if you or a guest needs to avoid alcohol completely.

Non-alcoholic spirits represent an exciting frontier in home bartending. They're not meant to perfectly replicate their alcoholic cousins, but rather to offer unique flavor expressions that expand your creative options. With thoughtful substitution and a willingness to adjust recipes, you'll craft sophisticated drinks that satisfy any palate.$learn$, chr(13), '')
where id = 'd8f91bd2-1f24-4398-a68b-c4b9bef9a6e6';

-- Traditional Method vs. Tank Method Sparkling Wine (7 changes)
-- Previous md5: ad5df599b7b76e040d300aaa59cd8f14
-- Expected md5: 7287415fa91cbf8dbae9246a76be9ec6
update public.learn_articles
set body_markdown = replace($learn$## Understanding How Sparkling Wine Gets Its Bubbles

When you pop open a bottle of sparkling wine, you're experiencing the result of a deliberate fermentation process—but not all sparkling wines are made the same way. The two primary methods used worldwide are the **Traditional Method** (known in Champagne as the *méthode champenoise*) and the **Tank Method** (also called Charmat). Understanding these differences helps explain why Champagne costs more than Prosecco and why each has its own distinct character.

### The Traditional Method: Time and Labor

The Traditional Method is the time-honored way to make Champagne and premium sparkling wines. Here's the basic process:

1. **Base wine creation**: Still wine is made from grapes, then blended to create the desired flavor profile.
2. **Secondary fermentation in bottle**: The winemaker adds a mix of yeast and sugar (called the *liqueur de tirage*) to the bottled wine, then caps it with a temporary seal. The yeast consumes the sugar and produces CO₂, which becomes trapped inside.
3. **Aging on lees**: The bottles sit undisturbed for months or years (non-vintage Champagne must age at least 15 months in total, 12 of them on the lees, and vintage Champagne at least three years; many producers go much longer). During this time, the dead yeast cells break down, adding rich, toasty, bread-like flavors to the wine.
4. **Riddling and disgorging**: Bottles are gradually tilted and rotated to slide the spent yeast sediment into the neck. Then the bottle is chilled, the cap is removed, and the frozen sediment plug shoots out (disgorging). A small amount of wine, usually with some sugar, is added to top it off. This is the *dosage*, and it sets the wine's final sweetness.

This labor-intensive process requires significant skill and takes considerable time. Each bottle is essentially undergoing a transformation inside its own container.

### The Tank Method: Efficiency and Freshness

The Tank Method streamlines the process for wines like Prosecco:

1. **Base wine creation**: Still wine is made and blended just as in Traditional Method.
2. **Secondary fermentation in tank**: Yeast and sugar are added to a large, pressurized stainless steel tank rather than individual bottles.
3. **Shorter process**: The second fermentation and any rest in the tank take weeks to months, rather than years.
4. **Filtration and bottling**: Once fermentation is done, the wine is filtered to remove the yeast sediment, then bottled under pressure to retain the CO₂.

This method is far more efficient and allows winemakers to preserve fresh, fruity flavors that might be lost during long aging.

### Why This Matters for Flavor and Price

The extra time and complexity of the Traditional Method creates deeper, more complex flavors. The yeast breakdown during aging produces those characteristic brioche, almond, and toasted hazelnut notes you notice in fine Champagne. Many tasters also find the bubbles finer and creamier.

Tank Method sparkling wines offer bright, fresh fruit flavors—think green apple, pear, and citrus—because they skip the extended aging. The bubbles tend to be larger and more exuberant.

Cost reflects this difference. Traditional Method requires:
- Individual bottle handling multiple times
- Specialized labor (riddling and disgorging are skills)
- Years of inventory investment
- Higher risk of loss or damage

Tank Method is streamlined, allowing producers to bottle quickly and efficiently.

### Practical Takeaway for Your Home Bar

Neither method is superior—they're simply different. Choose Traditional Method sparkling wines (Champagne, Cava, Crémant, and other bottles labeled "traditional method") when you want complexity and elegance, or when you're celebrating something special. Reach for Tank Method Prosecco when you want refreshing, fruit-forward bubbles for aperitifs or casual occasions. Understanding the method also helps you set appropriate expectations for flavor and price, making you a more informed buyer and more impressive host.$learn$, chr(13), '')
where id = 'ae462cd4-7631-41a1-a9c4-005b48fb3cbc';

-- Sweet vs. Dry: What Residual Sugar Means (7 changes)
-- Previous md5: 0ed81335ccaad2070b5bd78ab88b4ce9
-- Expected md5: 0cbd36cf4f9c3fb20186fb1eb43660a6
update public.learn_articles
set body_markdown = replace($learn$## Understanding Residual Sugar in Wine

When you're building a wine collection or pairing wines with cocktails, you'll often encounter the term **residual sugar (RS)**. Despite what your taste buds might tell you, a wine labeled "dry" might still contain sugar—just not enough for you to detect it. Understanding residual sugar is key to choosing wines that work in your drinks and at your table.

### What Is Residual Sugar?

Residual sugar is simply the sugar left over in a finished wine after fermentation stops. During fermentation, yeast consumes the natural sugars in grape juice and converts them into alcohol. However, fermentation doesn't always consume every sugar molecule. Winemakers can also stop fermentation early on purpose (for example by chilling the wine and removing the yeast, or, in fortified wines like port, by adding spirit) to keep some sweetness.

### How It's Measured

Residual sugar is measured in **grams per liter (g/L)**. Very dry wines have only a few grams per liter, while some dessert wines contain well over 200 g/L. Most winemakers and regions use this standard, making it easier to compare wines across different producers and countries.

### The Sweetness Scale

In the European Union, a still wine that uses a sweetness term on its label follows these bands:

- **Dry**: up to 4 g/L, or up to 9 g/L if the wine's acidity is high enough to balance it. Most Sauvignon Blanc and unoaked Chardonnay fall here.
- **Medium dry** (off-dry): up to 12 g/L, or up to 18 g/L with enough acidity. Riesling is often made in this style, though it ranges from bone dry to very sweet.
- **Medium** (semi-sweet): 12 to 45 g/L. Clearly sweet.
- **Sweet**: above 45 g/L. This covers dessert wines like late-harvest and ice wines, and fortified wines like port, which often carries around 90 to 120 g/L.

Sparkling wine uses a different scale, and its names are confusing. **Brut** means up to 12 g/L. **Extra Dry** (12 to 17 g/L) and **Sec** or **Dry** (17 to 32 g/L) are actually *sweeter* than Brut. **Demi-sec** runs from 32 to 50 g/L, and **Doux** is above 50 g/L.

### Why Dry Wine Can Still Have Sugar

This often confuses new wine drinkers: how can something "dry" contain sugar? The answer lies in **perception and context**. A wine with 5 g/L of sugar might taste bone dry because:

1. **Acidity masks sweetness**: High acidity (like in a crisp white) makes sugar less noticeable. A tart lemon has sugar, but it tastes sour.
2. **Alcohol presence**: Alcohol can feel warming or slightly sweet, balancing other flavors.
3. **Tannins in red wines**: These compounds create a drying sensation that overwhelms subtle sweetness.
4. **Fruit flavors**: Ripe fruit flavors can be mistaken for sweetness itself.

### Practical Applications for Home Bartenders

Understanding RS helps you in several ways:

- **Cocktail balance**: A dry Martini calls for dry vermouth. Even dry vermouth contains some sugar: under EU rules, "extra dry" vermouth has less than 30 g/L and "dry" less than 50 g/L.
- **Pairing with food**: Dry wines (1-10 g/L) pair with savory dishes, while slightly off-dry wines complement spicy foods by cooling the palate.
- **Wine selection**: If a Riesling tastes too sweet for sipping but you love Riesling, look for one labeled "trocken" (German for dry) or "sec" on a French still wine. On sparkling wine, though, "sec" means fairly sweet, so look for Brut instead.
- **Fortified wines**: Sherry and port vary widely. Fino sherry is bone dry, while ruby and tawny ports often carry around 90 to 120 g/L.

### Finding RS Information

Most labels don't list residual sugar, but many producers publish it on technical sheets, so check the producer's website if you want specifics. When tasting blind, remember that sweetness perception is subjective; what tastes dry to one person might seem slightly sweet to another.

The key takeaway: **residual sugar is a spectrum**, not a binary dry-or-sweet choice. Knowing where a wine falls on that spectrum helps you understand what you're drinking and why it tastes the way it does.$learn$, chr(13), '')
where id = 'cfe1d4f1-e762-4008-b490-13190de2aa11';

-- What Are Tannins? (4 changes)
-- Previous md5: acc9210193e943c1831d108a8cc56f37
-- Expected md5: 085dc22e1f7e690cfb032f0617618bf1
update public.learn_articles
set body_markdown = replace($learn$## Understanding Wine's Natural Astringency

If you've ever sipped a young red wine and felt your mouth pucker slightly, or noticed your gums drying out after a glass, you've experienced tannins in action. These natural compounds are a fundamental part of wine's structure and character, and understanding them will help you appreciate wines more deeply—and pair them better with food.

### Where Tannins Come From

Tannins are polyphenolic compounds found naturally in grape skins, seeds, and stems. During red wine production, the grape skins stay in contact with the juice for days or weeks, allowing tannins to dissolve into the liquid. This is why red wines typically contain far more tannins than white wines—which are usually made with minimal skin contact.

Wine also picks up tannins from aging in oak barrels. The wood imparts both vanilla and caramel flavors *and* additional tannins that contribute to the wine's structure. Newer oak barrels release more tannins than older barrels, which is why a wine aged in brand-new French oak will taste noticeably different from one aged in neutral oak.

White wines do contain some tannins from their skins and seeds, but in much smaller quantities. Rosés usually get only brief skin contact, so they're typically low in tannin, much closer to white wine than to red.

### How Tannins Taste and Feel

Tannins are mostly about texture rather than taste, though they can add some bitterness. Above all, they create a **tactile sensation**: a drying, slightly astringent feeling in your mouth. The best way to experience this is to brew a strong cup of black tea and pay attention to the texture rather than flavor. That's tannin astringency.

In wine, tannins contribute to what professionals call "mouthfeel." High-tannin wines feel fuller, grippier, and more structured. Young Cabernet Sauvignon or Nebbiolo will typically have pronounced tannins that dominate the palate. As wines age, tannins gradually soften and polymerize, becoming more integrated and less aggressive. This is why older wines often feel smoother, even if they had harsh tannins when first released.

### Tannins and Food Pairing

This is where tannins become practical for the home bartender. High-tannin wines pair exceptionally well with **fatty, protein-rich foods** and dishes with char or umami flavors. Grilled steak, lamb, and aged cheeses are classic matches for tannic wines. Protein and fat in the food help soften the tannins' astringent effect and creating a more harmonious pairing.

Conversely, pairing a high-tannin wine with delicate fish or light vegetables often results in an unpleasant clash—the tannins can taste harsh and overwhelming without the right food to balance them.

If you're recommending wines to guests or pairing for a meal, remember: **higher tannins = richer, heavier foods.** A light Pinot Noir with lower tannins works beautifully with salmon or mushroom dishes. A bold Barolo calls for something like a ribeye.

### The Takeaway

Tannins aren't something to fear—they're part of what makes wine interesting and worth exploring. They provide structure, aging potential, and complexity. By recognizing tannin levels in wines you drink and understanding how they interact with food, you'll make smarter pairing choices and develop a more intuitive sense of what wines will work in any situation. Pay attention to that drying sensation in your mouth next time you taste a young red, and you'll understand one of wine's most fundamental characteristics.$learn$, chr(13), '')
where id = 'b990526b-b1a4-43f8-82b1-456b2e190f24';

-- How to Read a Wine Label (4 changes)
-- Previous md5: e4052613397dfccee8f8b4d06d1cf386
-- Expected md5: 463539824829882fa95167a40b271e3c
update public.learn_articles
set body_markdown = replace($learn$## Understanding the Story Behind the Bottle

Wine labels can feel intimidating at first glance, but they're really just telling you a story about what's inside. Once you learn to read the key elements—vintage, varietal, and appellation—you'll navigate wine shops with confidence and pick bottles that match what you're looking for.

### The Vintage: When the Wine Was Made

The **vintage** is the year the grapes were harvested. This number appears prominently on most bottles, and it matters more than you might think. Different years have different weather conditions, so a 2015 Bordeaux will taste different from a 2016 Bordeaux from the same producer.

As a home bartender, you don't need to memorize which years were "great" or "off." What matters is knowing that vintage affects flavor profile and price. Older vintages are sometimes worth seeking out for special occasions, though many excellent wines are made to drink young. If a bottle has no vintage listed, it's likely a blend from multiple years—perfectly fine for mixing or casual drinking.

### Varietal vs. Regional Naming: Two Different Languages

This is where wine labeling gets genuinely confusing, because the wine world uses two completely different systems.

**Varietal naming** focuses on the grape type. Most wines from the United States, Australia, Argentina, and New Zealand use this approach. You'll see labels that say "Cabernet Sauvignon," "Chardonnay," or "Pinot Grigio." This tells you exactly what grape (or grapes, if it's a blend) went into the bottle. It's straightforward: if you loved a Sauvignon Blanc last week, you can confidently buy another one knowing what to expect.

**Regional naming** is the European tradition, especially in France, Italy, and Spain. Here, the label shows you *where* the wine comes from, not necessarily what's in it. A bottle labeled "Bordeaux" tells you it's from the Bordeaux region of France, but you usually won't see grape names on the label. Red Bordeaux is typically a blend, most often led by Merlot or Cabernet Sauvignon; Merlot is the region's most planted grape. Similarly, "Chianti" comes from Tuscany in Italy and traditionally uses Sangiovese grapes, but the label won't announce that.

Why does this matter? Regional names are often associated with specific grape varieties through centuries of tradition. Once you learn that red Burgundy means Pinot Noir, and that white Burgundy (including Chablis) means Chardonnay, you can shop by region instead of hunting for grape names. Many wine lovers find this system elegant; others find it maddening. Both are valid feelings.

### Appellation Basics for Home Drinkers

**Appellation** simply means a defined region where wine is made. Think of it as a guarantee of origin. "Appellation d'Origine Contrôlée" or "AOC" (in France) means the wine meets specific rules about where the grapes grew and how the wine was made. It guarantees origin and method, not that you'll love the wine.

Appellations nest inside each other like Russian dolls. For example:
- **Bordeaux** (broad region, France)
- **Haut-Médoc** (a district within Bordeaux)
- **Pauillac** (a village appellation within the Haut-Médoc)

A producer's name, like Château Lafite Rothschild in Pauillac, is a different thing: it tells you who made the wine, not which appellation it belongs to.

Generally, more specific appellations indicate smaller, more controlled production areas—which often means higher quality and higher price. But don't assume: a straightforward "Bordeaux" can be delicious and affordable.

For Italian wines, you might see "DOCG" (highest quality tier) or "DOC" labels, which work similarly. Spanish wines use "DO" (Denominación de Origen). These certifications don't guarantee you'll love the wine, but they do mean someone official verified it meets standards for that region.

### Practical Tips

When shopping, don't feel obligated to master every appellation. Start by noting which regional names or varietals you enjoy, then explore from there. Ask your wine merchant questions—they love talking about labels. And remember: the best wine is the one you enjoy drinking. All the label knowledge in the world won't matter if you're sipping something that doesn't make you happy.$learn$, chr(13), '')
where id = '877642bc-ad79-4481-9bbe-6e99ae21bd2e';

-- Ales vs. Lagers: What's the Difference? (5 changes)
-- Previous md5: a10a9ae7f9f807ae1d102fff996eb6a0
-- Expected md5: 1d9ae7bf8587d0440e2373542f1a52b3
update public.learn_articles
set body_markdown = replace($learn$## The Yeast Makes the Beer

When you're building your home bar's beer knowledge, understanding the difference between ales and lagers is essential. The distinction comes down to one crucial element: **yeast**. Specifically, which yeast strain ferments your beer and at what temperature.

Ales use *Saccharomyces cerevisiae*, a yeast that ferments at warmer temperatures (typically 60–75°F) and naturally rises to the top of the fermenting vessel. Lagers use *Saccharomyces pastorianus*, which ferments at cooler temperatures (48–55°F) and sinks to the bottom. This simple difference in yeast behavior creates two distinct beer families with dramatically different flavor profiles.

## How Temperature Shapes Flavor

The fermentation temperature is where the magic happens. Ale yeast works quickly in warm conditions, producing beer in just 1–2 weeks. During this rapid fermentation, the yeast generates fruity esters and spicy phenols as byproducts, giving ales their characteristic complex, layered flavors. Think of the clove and banana notes of a German hefeweizen or the fruity, spicy character of a Belgian tripel—those come straight from ale yeast's busy metabolism.

Lager yeast, by contrast, is slow and methodical. Fermenting at cool temperatures over 2–4 weeks, it produces far fewer esters and creates a cleaner, crisper profile. Many lagers finish smooth and crisp. After fermentation, lagers undergo a **lagering** period—extended cold storage that can last weeks or months—which polishes the beer further and softens any harsh edges.

This is why lagers are often described as "clean" and ales as "fruity." Neither is better; they're simply expressing their yeast's natural behavior.

## Common Ale Styles

Ales are a favorite of craft and home brewers: they ferment faster, and their warmer fermentation temperature is easier to manage without specialized equipment.

**Pale Ales and IPAs** showcase the hop-forward side of ales. Much of their bold character comes from hops rather than yeast.

**Stouts and Porters** are dark ales where roasted malt flavors combine with the yeast's complexity. The darkness and richness make them feel substantial.

**Wheat Ales** like Hefeweizens emphasize yeast character—clove and banana notes are the whole point. German brewers deliberately chose strains that produce these flavors.

**Sour Ales** intentionally embrace wild yeast and bacteria, taking the ale family in completely different directions with tartness and funk.

## Common Lager Styles

Lagers require more temperature control, which historically made them popular in regions with cool climates (such as Bohemia and Bavaria). Today they're essential to any beer lover's toolkit.

**Pilsners** are the gold standard. Crisp, dry, and elegant, they showcase clean malt and noble hops without yeast interference.

**Helles** (pale lagers) are soft and slightly sweet, the everyday beers of Bavaria. They're perfect for sessions.

**Bocks** are stronger lagers with rich malt sweetness and warming alcohol, yet still clean and refined compared to similar-strength ales.

**Munich Dunkel** and other dark lagers prove that lagers don't need to be pale. They're smooth, malty, and satisfying—a different beast from dark ales.

## Practical Takeaway

When you're tasting beer or selecting bottles for your home bar, remember that **yeast and temperature are doing the heavy lifting**. If you want something fruity, complex, and bold, reach for an ale. If you want something clean, refreshing, and refined, try a lager.

For home brewers, ales are typically more forgiving since room temperature works reasonably well. Lagers demand a dedicated fermentation chamber or patience, but many brewers find them worth the extra effort. Either way, respecting the yeast—and the fermentation temperature it needs—is the key to understanding why these two beer families taste so fundamentally different.$learn$, chr(13), '')
where id = 'ed181d21-3098-4650-aa92-f8860ce0a0f1';

-- What Is IBU? (5 changes)
-- Previous md5: 18a851c07cd9877bdab37685a86eacf0
-- Expected md5: 225ffddd6dca8e061edab0660932f822
update public.learn_articles
set body_markdown = replace($learn$## Understanding Beer Bitterness

If you've ever noticed that some beers taste noticeably more bitter than others, you've experienced the effects of **IBU**—International Bitterness Units. But what exactly is an IBU, and why does it matter when you're pouring a beer at home? Understanding this scale can help you choose beers you'll actually enjoy and even appreciate why different styles exist.

### What Is IBU?

IBU is a standardized measurement that quantifies the bitterness compounds in beer. These compounds primarily come from **hops**, the plant flowers brewers add during the brewing process. When hops are boiled in wort (the sugary liquid that becomes beer), heat transforms their alpha acids into iso-alpha acids, which contribute the bitter flavor. The IBU scale measures the concentration of these iso-alpha acids—the specific compounds responsible for the bite you taste.

The scale typically ranges from 0 to 100+ IBUs, though some extreme craft beers push well beyond 100. As a rough reference point (ranges vary by source and brewery):

- **Light lagers and wheat beers**: 5–15 IBUs
- **Pale ales and IPAs**: 40–70 IBUs
- **Imperial IPAs and double IPAs**: 70–100+ IBUs
- **Stouts and porters**: 25–50 IBUs (though roasted grains add perceived bitterness)

### How Is It Measured?

Brewers measure IBU through a combination of chemistry and calculation. During brewing, they track several variables: *which* hops they use (different varieties have different alpha acid content), *how long* they boil the hops, and *how much* they add. A longer boil extracts more bitterness; a 60-minute boil is standard for creating base bitterness, while late additions contribute different characteristics.

In a lab, the standard method from the American Society of Brewing Chemists extracts the bitter compounds from a beer sample and measures them with a spectrophotometer; more detailed methods such as HPLC can measure the iso-alpha acids directly. Many breweries, though, estimate IBUs with formulas based on hop weight, alpha acid content, and boil time, so the number on a label may be a calculation rather than a lab result.

### IBU Versus Perceived Bitterness

Here's where things get interesting: **IBU doesn't always match what you taste**. This gap between scientific measurement and perception is crucial to understand.

A beer's perceived bitterness depends on many factors beyond just IBUs. The beer's **malt character** plays a huge role—sweeter, richer malts can balance and mask bitterness, making a 60-IBU beer taste less bitter than you'd expect. An **imperial stout** with 60 IBUs might taste less bitter than a crisp **pilsner** with 35 IBUs, because the stout's rich, sweet malt softens the impact.

Hop *variety* also matters. Some hops are "noble hops" that provide clean, refined bitterness, while others contribute herbal, citrus, or floral notes alongside bitterness. A 70-IBU beer with American hops tastes different from a 70-IBU beer with European hops.

Your personal **taste sensitivity** and experience level affect perception too. Regular beer drinkers often find bitterness less intense than newcomers do. Food influences it as well: salt, for example, is known to suppress bitterness, and sweetness can mask it.

### What This Means for You

As a home bartender, IBU is a useful starting point for choosing beers, but don't treat it as gospel. If you're building a beer selection, use IBU as a guide: lower numbers for guests new to craft beer, higher numbers for those who enjoy bold, hoppy flavors. When tasting, remember that what you experience is shaped by malt, yeast, carbonation, temperature, and context—not just the number on the label.

The best approach? Explore beyond the numbers. Try beers with similar IBUs from different breweries and styles, and you'll quickly develop a feel for what you prefer. IBU is the vocabulary brewers use to describe their work; understanding it helps you appreciate the craft behind every pour.$learn$, chr(13), '')
where id = 'f80e36f4-d9dd-42b2-95f5-0516cf83b11f';

-- What Is SRM? Understanding Beer Color (4 changes)
-- Previous md5: 540286414e8e7c7553f3760ac26c758a
-- Expected md5: 005b736f14276e77c3835c1e48168a04
update public.learn_articles
set body_markdown = replace($learn$## The Standard Reference Method Explained

When you're browsing craft beers or brewing at home, you'll often see a number next to "SRM" or "Color"—something like "12 SRM" or "45 SRM." This number represents the beer's color using the **Standard Reference Method** (SRM), a standardized scale that measures how light passes through beer. It's the North American counterpart to the European EBC scale (an EBC number is roughly twice the SRM number), and it's useful for predicting what your beer will look like before you taste it. An older scale, degrees Lovibond, is still used to rate the color of malt.

The scale runs from about 2 SRM (pale straw, like light pilsners) to 40+ SRM (nearly black, like stouts). Think of it as a universal language—when a brewer tells you their beer is 15 SRM, you immediately know it's somewhere in the amber-to-copper range, whether they're in Colorado or Belgium.

## How Malt Roasting Creates Color

Color in beer comes almost entirely from **malt**: grain, usually barley, that has been soaked, allowed to sprout, and dried with heat. Most malt is simply kilned; specialty malts are kilned hotter or roasted for darker color and flavor. Darker malts mean higher SRM numbers. Malt color is usually given in degrees Lovibond (°L):

- **Pale malts** (around 2-4 °L): Lightly kilned, contribute a golden hue
- **Caramel or crystal malts** (a wide range, roughly 10 °L and up): add amber to copper tones
- **Chocolate malts** (around 350 °L and up): Heavily roasted, bring dark brown color
- **Black malts** (500 °L and up): Intensely roasted, produce a nearly black appearance

When brewers want a darker beer, they simply add darker malts to the grain bill. It's that straightforward. A stout brewer might use a blend of pale malt with chocolate and black malts to hit 40+ SRM. The more intensely the malt is kilned or roasted, the darker it gets.

## What SRM Tells You—and What It Doesn't

Here's where many newcomers get confused: **SRM measures color only, not flavor.** This is crucial.

A beer's color tells you something about malt selection, but it's just one variable among many. Two beers with identical SRM ratings can taste completely different. One might be a sweet stout with notes of chocolate and coffee; another might be a dry Irish stout with minimal sweetness. A 15 SRM amber ale could be hoppy and crisp, while a 15 SRM barleywine could be rich and boozy.

The reasons are simple: flavor depends on *which specific malts* were chosen (beyond just how dark they are), the *amount* of each malt used, *hop varieties*, **yeast type**, *fermentation temperature*, and *aging time*. SRM captures none of these details.

That said, SRM does give you hints. Beers above 20 SRM typically have roasted or toasted flavors somewhere in the profile—even if they're subtle. A super-pale beer (under 5 SRM) almost certainly won't have deep chocolate notes. Use SRM as a starting point for expectations, not a guarantee.

## Practical Use for Home Bartenders

When building a beer list or exploring what to serve, SRM helps with **visual consistency and customer expectations**. If someone wants a light, crisp beer, a 4 SRM pilsner delivers the pale appearance they're anticipating. If they want something bold and dark, a 35+ SRM porter or stout meets that visual promise.

It's also useful for **pairing decisions**. Darker beers (higher SRM) often have enough body and roasted character to stand up to rich foods, while lighter beers stay refreshing alongside delicate dishes.

But remember: always taste before assuming. Read the beer description, check ABV and IBUs (bitterness units), and let tasting notes guide you beyond the number. SRM is a helpful tool—just not the whole story.$learn$, chr(13), '')
where id = '92a725cb-240c-4dc1-8bd5-10d52c729850';

-- Quiz questions ------------------------------------------------------------

-- Bar Tools Quiz, question 1: Fine mesh "sits in your serving glass"
update public.quiz_questions
set explanation = $q$The fine mesh strainer is used for double straining: you hold it over the glass and pour through it to catch the tiny ice shards, pulp, and bits of herbs that other strainers miss.$q$
where id = '167f9aaf-a14a-4649-9b10-afa655033032';

-- Bar Tools Quiz, question 3: Correct answer: cap stuck "from ice freezing around the threads"
update public.quiz_questions
set options = jsonb_build_array($q$It requires a separate strainer$q$, $q$It has fewer moving parts$q$, $q$The top can get stuck when the metal contracts from the cold$q$, $q$It is less affordable than a Boston shaker$q$),
    explanation = $q$The article highlights the stuck top: as the metal chills during shaking it contracts, and the strainer top can lock tight onto the body. A firm tap where the pieces meet usually frees it.$q$
where id = '0b4ce14c-ca0e-426b-a692-12ba33d56830';

-- Bar Tools Quiz, question 4: "Bitter compounds and chlorophyll"
update public.quiz_questions
set explanation = $q$True. Crushing herbs too aggressively breaks down the leaves and can release bitter, grassy flavors, so over-muddled mint tastes bitter rather than fresh and bright.$q$
where id = 'b8bf90e5-54b6-4101-8c59-2904294fd1d3';

-- Bar Tools Quiz, question 6: "The twisted design also helps with balance"
update public.quiz_questions
set explanation = $q$False. The twist is practical: it gives your fingers grip when they're wet or cold, and it lets the spoon spin smoothly between your fingers as you stir.$q$
where id = '4d60da50-7e07-4a50-8331-88ad560e077e';

-- Bar Tools Quiz, question 7: "Most common jigger size" (the 1 oz/2 oz "standard pour" claim)
update public.quiz_questions
set prompt = $q$Which of these ingredients is NOT usually measured with a jigger?$q$,
    options = jsonb_build_array($q$Vermouth$q$, $q$Bitters$q$, $q$Lime juice$q$, $q$Simple syrup$q$),
    correct_option_index = 1,
    explanation = $q$Bitters are so concentrated that they're added in dashes straight from the bottle. A jigger is for measuring spirits, vermouth, juices, and syrups.$q$
where id = '7e91efba-4717-41fe-8907-bb93a3b97c70';

-- Bar Tools Quiz, question 8: "All of the above", counting "look more professional" as a correct reason
update public.quiz_questions
set options = jsonb_build_array($q$It makes the drink stronger$q$, $q$It chills the drink faster$q$, $q$It keeps drinks consistent and lets you control how strong they are$q$, $q$It replaces the need for ice$q$),
    correct_option_index = 2,
    explanation = $q$Measuring keeps each drink tasting the same every time and tells you exactly how much spirit goes into it, so you can control its strength.$q$
where id = '069cc3d6-7259-49fc-bc6c-71f462254737';

-- IBA Classics Quiz, question 4: Sazerac contains "Bourbon" and "Ricard"
update public.quiz_questions
set explanation = $q$False. A Sazerac is served in an old-fashioned glass rinsed with absinthe. The IBA recipe uses Cognac, absinthe, a sugar cube, and Peychaud's bitters, finished with lemon zest; rye whiskey is a common alternative to the Cognac.$q$
where id = '544efe4f-8b84-4a4e-ba35-31a888b333eb';

-- IBA Classics Quiz, question 5: Lillet Blanc called one of three "spirits"
update public.quiz_questions
set prompt = $q$What are the three main ingredients in a Vesper cocktail?$q$,
    explanation = $q$A Vesper is made with gin, vodka, and Lillet Blanc, a French aromatized wine, and it is served in a cocktail glass.$q$
where id = 'be045b77-7f6d-4247-97ed-b01879e63d7c';

commit;
