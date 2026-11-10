-- Learn accuracy pass, slice 2: required summary (spec 0033, AC-5) --------
--
-- Adds learn_articles.summary, the hand written, topic only text that feeds
-- each article's meta description, og:description, and list subtitle.
-- Every row gets one, whatever its status (35 rows read from the live
-- database on 2026-11-09: 19 published, 15 draft, 1 archived). Summaries
-- say what an article covers, never a fact from it, so a later body
-- correction can't make one wrong.
--
-- Order: add the column nullable with both checks, backfill by id, raise
-- if any row is still null, then set not null. One transaction, so a
-- missing row aborts the whole thing and leaves the table unchanged.
--
-- Rerun safe: the column and checks are added only when missing, the
-- backfill only fills rows whose summary is still null (so it never
-- overwrites a later edit), and set not null is a no op once set. The
-- set_updated_at trigger bumps updated_at on every backfilled row.
--
-- Deploy order: apply this before deploying the code that reads summary.
--
-- Check after apply:
--   select count(*) filter (where summary is null) as missing,
--          min(char_length(summary)) as shortest,
--          max(char_length(summary)) as longest
--   from public.learn_articles;
--   -- expect missing 0, shortest >= 70, longest <= 160

begin;

alter table public.learn_articles
  add column if not exists summary text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'learn_articles_summary_length_check'
      and conrelid = 'public.learn_articles'::regclass
  ) then
    alter table public.learn_articles
      add constraint learn_articles_summary_length_check
      check (char_length(summary) between 70 and 160);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'learn_articles_summary_trimmed_check'
      and conrelid = 'public.learn_articles'::regclass
  ) then
    alter table public.learn_articles
      add constraint learn_articles_summary_trimmed_check
      check (summary = btrim(summary));
  end if;
end;
$$;

update public.learn_articles as a
set summary = v.summary
from (values
  -- Ales vs. Lagers (published)
  ('ed181d21-3098-4650-aa92-f8860ce0a0f1'::uuid, 'How ales and lagers differ, from the yeast and fermentation temperature behind each to the common styles of both and what that means for your glass.'),
  -- What Is IBU? (published)
  ('f80e36f4-d9dd-42b2-95f5-0516cf83b11f'::uuid, 'What IBU measures on a beer label, how it is tested, and why the number on the can doesn''t always match how bitter a beer tastes.'),
  -- What Is SRM? (published)
  ('92a725cb-240c-4dc1-8bd5-10d52c729850'::uuid, 'What the SRM scale says about a beer''s color, how malt roasting creates that color, and what color can and can''t tell you about flavor.'),
  -- Simple Syrup (published)
  ('73be1b10-c078-414f-a12f-1c18da1e8346'::uuid, 'How to make simple syrup and rich syrup at home, how to store them safely, and a few flavored syrups worth making for your cocktails.'),
  -- What Are Bitters? (published)
  ('ff30c6e6-0126-42f2-a6cf-c74bef784935'::uuid, 'What cocktail bitters are, how they are made, the main types you''ll see, and how a few dashes change a drink you make at home.'),
  -- Non-Alcoholic Spirits (published)
  ('d8f91bd2-1f24-4398-a68b-c4b9bef9a6e6'::uuid, 'What non-alcoholic spirits are, how they are made, the main categories, and how to swap them into cocktail recipes at home.'),
  -- Cask Strength (published)
  ('7e8a0b92-0698-45d5-a3a5-8376fc57986a'::uuid, 'What cask strength means on a spirits label, how it differs from a standard bottling, and how to adjust cocktails when you use one.'),
  -- What Does Proof Mean? (published)
  ('4f0e6dd4-c5b9-4908-bd1f-b8c71b9affca'::uuid, 'What proof and alcohol by volume mean, where the word proof comes from, and how a spirit''s strength shapes the cocktails you mix.'),
  -- Base Spirit (published)
  ('a8c248ae-0644-48a0-834f-7801686b6448'::uuid, 'What a base spirit is, the classic spirits most cocktails are built on, and how your choice of base shapes the drink in your glass.'),
  -- Oak Barrels (published)
  ('703483d8-332f-4028-a5cb-1c7bbf31949f'::uuid, 'Why many spirits are aged in oak barrels, how the wood and its char shape color and flavor, and what aging means for your home bar.'),
  -- Boston vs. Cobbler (published)
  ('bc3c5db2-3d83-4457-98f2-e079cc7b544c'::uuid, 'How the Boston shaker and the cobbler shaker compare, how each one works, and how to pick the right shaker for your home bar.'),
  -- Strainers (published)
  ('3354052f-638a-4899-80b9-fc1b7b09ca45'::uuid, 'What the Hawthorne, julep, and fine mesh strainers each do, when to double strain a cocktail, and which strainer to buy first.'),
  -- The Muddler (published)
  ('f2ef1264-e27c-4281-8894-d033ca877dd4'::uuid, 'How to muddle herbs, fruit, and sugar without overdoing it, what to muddle and what to leave alone, and how to choose a muddler.'),
  -- Bar Spoon (published)
  ('45d76fde-7b6d-406f-b115-f18e9088e8f9'::uuid, 'What a bar spoon is designed for, from stirring cocktails to layering and building drinks, and what to look for when you buy one.'),
  -- What Is a Jigger? (published)
  ('d7389446-31f0-48fd-bc9d-e2c7501bed50'::uuid, 'What a jigger is, why measuring makes better cocktails, the common jigger sizes and styles, and how to use one the right way.'),
  -- Wine Label (published)
  ('877642bc-ad79-4481-9bbe-6e99ae21bd2e'::uuid, 'How to read a wine label: the vintage, grape versus regional naming, and the basics of appellations for everyday wine drinkers.'),
  -- Residual Sugar (published)
  ('cfe1d4f1-e762-4008-b490-13190de2aa11'::uuid, 'What residual sugar is, how wine sweetness is measured and labeled, and why a wine can taste dry even when it has some sugar.'),
  -- Sparkling Methods (published)
  ('ae462cd4-7631-41a1-a9c4-005b48fb3cbc'::uuid, 'How the traditional method and the tank method put bubbles in sparkling wine, and how each one shapes flavor, price, and use.'),
  -- Tannins (published)
  ('b990526b-b1a4-43f8-82b1-456b2e190f24'::uuid, 'What tannins are, where they come from in wine, how they taste and feel in your mouth, and how they work with food pairings.'),
  -- Beer Cocktails (draft)
  ('a29e61c7-812c-4a09-ba24-89635c816e21'::uuid, 'How beer works as a cocktail ingredient, from shandies and micheladas to the Black Velvet and Boilermaker, plus tips on picking a beer.'),
  -- Hops (draft)
  ('53da2567-07d8-420b-89c5-028dbbf18400'::uuid, 'What hops bring to beer, how they add bitterness and aroma, why light can skunk a beer, and why hoppy beers are best drunk fresh.'),
  -- Garnishes (draft)
  ('53310fe0-72eb-4e7a-94e7-87dcfe1b5997'::uuid, 'How garnishes add flavor and aroma to a cocktail, from citrus peels and mint to rims, cherries, olives, and fresh nutmeg.'),
  -- Ice (draft)
  ('0413a156-eb63-46a1-bcc2-aaa89dfeeeda'::uuid, 'How ice size affects melting and dilution, why home ice turns cloudy, how to make clear ice, and how to store ice for cocktails.'),
  -- Shaken or Stirred (draft)
  ('c144d9cf-0e68-46dc-8da7-1e80e1bbce05'::uuid, 'How to decide whether to shake or stir a cocktail, what each method does to a drink, and where dry shakes and highballs fit in.'),
  -- Bourbon Rye Scotch (draft)
  ('e321ec37-136e-4cc8-9097-7729b2f62e29'::uuid, 'How bourbon, rye, and Scotch whisky differ in how they are made and labeled, and how each one fits into the cocktails you make.'),
  -- Gin Styles (draft)
  ('13a42240-4e72-4821-b7ad-e5f8523ce021'::uuid, 'A tour of gin styles, from London dry, Plymouth, and Old Tom to navy strength, contemporary gin, and genever, and how to pick one.'),
  -- Tequila vs. Mezcal (draft)
  ('6a8782b6-98ba-4133-9517-17082244bd4d'::uuid, 'How tequila and mezcal differ in agave, region, production, and aging, and how to use each of them in the cocktails you make.'),
  -- Liqueurs (draft)
  ('164aacf3-112f-4b60-a813-5609c016bb2e'::uuid, 'What makes a spirit a liqueur, the main liqueur families, what crème de means on a label, and how to use and store liqueurs.'),
  -- Glassware (draft)
  ('e3571d3b-d7cb-4631-93a6-801716e2278f'::uuid, 'A guide to cocktail glassware: which glasses suit drinks served up, on ice, or in special vessels, and a starter set for home.'),
  -- Citrus Tools (draft)
  ('c1ce17d0-4d83-459f-977e-6b451d1c1e7c'::uuid, 'The tools for working with fresh citrus, from handheld presses and juicers to peelers, channel knives, and zesters, and how to use them.'),
  -- Mixing Glasses (draft)
  ('9a975d79-d9d5-47d4-a8b3-2f798f6ae6bd'::uuid, 'What to look for in a mixing glass, how to stir a cocktail in one, what to use if you don''t have one, and how to care for it.'),
  -- Fortified Wines (draft)
  ('9d318f41-178f-49c5-93d1-506a70be9ae6'::uuid, 'An introduction to port, sherry, and Madeira: how each fortified wine is made, how to store an open bottle, and using them in cocktails.'),
  -- Wine Temperature (draft)
  ('72c534ea-de0e-415a-a731-5a6750ed29df'::uuid, 'How serving temperature changes the way wine tastes, what room temperature really means, and how to chill or warm a bottle quickly.'),
  -- Vermouth (draft)
  ('3d93351d-461f-4cfe-a49d-c2fbde2c7771'::uuid, 'What vermouth is, its main styles, the classic cocktails that use it, how to store an open bottle, and how to choose one to buy.'),
  -- Jigger (archived) (archived)
  ('5c7e190d-a2ac-4c3a-bce5-c17f5911c2ae'::uuid, 'What a jigger is, why bartenders measure their pours, the common jigger sizes, and how to choose and use your first jigger.')
) as v(id, summary)
where a.id = v.id
  and a.summary is null;

do $$
declare
  missing text;
begin
  select string_agg(id::text || ' (' || title || ')', ', ')
  into missing
  from public.learn_articles
  where summary is null;

  if missing is not null then
    raise exception 'learn_articles rows without a summary: %', missing;
  end if;
end;
$$;

alter table public.learn_articles
  alter column summary set not null;

comment on column public.learn_articles.summary is
  'Topic only plain text, 70 to 160 characters. Feeds the meta description, og:description, and list subtitle (spec 0033).';

commit;
