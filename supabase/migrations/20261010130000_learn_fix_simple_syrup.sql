-- Learn accuracy pass, slice 1: simple syrup (spec 0033, scope feature 39) --
--
-- Replaces the body of "Simple Syrup and Other Bar Syrups, Explained" in
-- full. The old text said syrup keeps indefinitely and never mentioned
-- refrigeration (a food safety error), gave an unsourced 1:4 simmered
-- grenadine ratio, and said the name "simple" suggests complexity. Every
-- change and its source is recorded in
-- docs/reviews/2026-10-learn-article-fact-check.md.
--
-- Rerun safe: a full replacement by id writes the same text again.
-- status and published_at are untouched (AC-11); the set_updated_at
-- trigger bumps updated_at.
--
-- Paste safe: the SQL editor on Windows turns pasted newlines into CRLF,
-- so the body is wrapped in replace(..., chr(13), '') to store LF only.
--
-- Check after apply:
--   select md5(body_markdown) from public.learn_articles
--   where id = '73be1b10-c078-414f-a12f-1c18da1e8346';
-- Previous md5: 69e9472f8ded24aaca392905c0e1bbac
-- Expected md5: b562ed3205d4f7f2c1e01ae9855cb0f6
update public.learn_articles
set body_markdown = replace($learn$## The Foundation of Every Great Cocktail

Simple syrup is perhaps the most essential ingredient in any home bar. It's straightforward to make and easy to control, which makes it an ideal foundation for consistent, delicious cocktails.

### Making Simple Syrup at Home

True to its name, simple syrup couldn't be easier. The basic formula is equal parts sugar and water (recipes use both weight and volume). Here's how to make it:

1. Combine one cup of sugar with one cup of water in a saucepan
2. Heat over medium until the sugar dissolves completely
3. Remove from heat and let cool to room temperature
4. Pour into a clean bottle, seal it, and refrigerate

That's it. The heat simply speeds up dissolving; you can also make it cold by stirring sugar into room-temperature water until it dissolves, though warm preparation is faster.

### Regular vs. Rich Simple Syrup

The ratio above creates **regular simple syrup** (1:1), which is lighter and less viscous. Many bartenders prefer **rich simple syrup** (2:1, or two parts sugar to one part water), which has a heavier mouthfeel and delivers more sweetness per ounce, so you'll need a little less of it.

For home use, try both and see which you prefer. Rich syrup pairs well with spirit-forward drinks like Old Fashioneds, while regular syrup works nicely in lighter, citrus-forward cocktails.

### Storage and Shelf Life

Keep simple syrup in the refrigerator in a clean, tightly sealed bottle. Regular 1:1 syrup is best used within about a month. Rich 2:1 syrup keeps longer, up to about six months in the fridge, because the extra sugar makes it harder for microbes to grow. Writing the date on the bottle helps you keep track.

Some bartenders add a small splash of high-proof vodka to help syrup keep longer, but that doesn't replace refrigeration. If you notice any cloudiness, mold, fizzing, or off smells, discard it and make a fresh batch. The ingredients are cheap and homemade syrup is so easy that there's no reason to take chances.

### Flavored Syrups Worth Making

**Demerara Syrup** uses demerara sugar instead of white sugar, creating a richer, slightly molasses-tinged sweetness. Make it exactly like regular simple syrup but with demerara sugar. It's particularly good in tiki drinks, rum cocktails, and anything with spice.

**Honey Syrup** combines one part honey with one part water (warm it gently to mix more easily). This syrup brings floral notes and a different mouthfeel than sugar-based options. It's a natural fit for sours and warm drinks like the Hot Toddy.

**Grenadine** is the pomegranate-based syrup you've likely seen in Shirley Temples. Store-bought versions often contain artificial ingredients, but homemade grenadine is simple: warm pomegranate juice gently with sugar just until the sugar dissolves, without letting it simmer, then cool, strain, and bottle it. Recipes vary from equal parts sugar and juice to two parts sugar per part juice, by volume. Keep it in the fridge and use it within about a week. It adds tartness and beautiful color to drinks like the Tequila Sunrise.

### Beyond the Basics

Once you're comfortable with simple syrup, experiment with infusions. Steep ginger slices, cinnamon sticks, fresh herbs, or citrus peels in warm simple syrup, then strain before using, and store infused syrups in the fridge too. These flavored syrups elevate cocktails without requiring complicated recipes.

The beauty of making your own syrups is control and freshness. You know exactly what's in them, you can adjust sweetness to taste, and they cost very little to produce. Keep a bottle of regular simple syrup and one specialty syrup in your fridge, and you'll be prepared for nearly any cocktail.

Start simple, taste as you go, and don't be afraid to adjust ratios based on your preferences. That's what makes you a better bartender.$learn$, chr(13), '')
where id = '73be1b10-c078-414f-a12f-1c18da1e8346';
