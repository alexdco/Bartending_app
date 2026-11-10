-- French locale (spec 0046, AC-3, AC-4, AC-14).
--
-- Adds French (fr, written as in France) as a supported locale, with no SQL
-- function edits: the name_search trigger and every read and search function
-- already take the language list and its text search config from
-- supported_locales (spec 0045).
--
-- French gets its own config, public.french_unaccent: a copy of the built in
-- french config that strips accents before stemming, so "creme" and "crème"
-- both stem to "crem" and a search typed without accents still finds the
-- French translated name. English, Spanish, and Portuguese keep their configs
-- and are untouched. Schema qualified everywhere (here, the seed row, and
-- LOCALE_TEXT_SEARCH_CONFIG.fr) so the parity test compares one exact string
-- and functions with search_path = '' resolve it.
--
-- Order matters: the extension, then the config, then the row (the row's
-- check casts its config to regconfig, which fails if the config is missing).
-- A database restore must create the unaccent extension before this config,
-- and the extension must never be dropped while the config depends on it.
-- If a Postgres upgrade changes the unaccent rules, recompute with
--   update public.recipe_translations set name = name where locale = 'fr';
--
-- fr stays hidden from users until LAUNCHED_LOCALES gains it (spec 0046 AC-7).
-- Rollback: supabase/rollbacks/20261109130000_french_locale_down.sql.
--
-- Check after apply (expect true, true):
--   select
--     to_tsvector('public.french_unaccent', 'Crème de cassis')
--       @@ websearch_to_tsquery('public.french_unaccent', 'creme') as unaccented_query,
--     to_tsvector('public.french_unaccent', 'Creme de cassis')
--       @@ websearch_to_tsquery('public.french_unaccent', 'crème') as unaccented_name;

begin;

create extension if not exists unaccent with schema extensions;

create text search configuration public.french_unaccent (copy = pg_catalog.french);

-- unaccent is a filtering dictionary: it hands the unaccented token on to the
-- French stemmer. asciiword tokens carry no accents, so they keep the plain
-- stemmer from the copy.
alter text search configuration public.french_unaccent
  alter mapping for hword, hword_part, word, hword_numpart, numword
  with extensions.unaccent, pg_catalog.french_stem;

insert into public.supported_locales (code, text_search_config)
values ('fr', 'public.french_unaccent');

commit;
