-- Batch cocktail conversion (spec 0022, AC-9): tracks the hash of the
-- ingredient name last used to set category, mirroring spec 0020's
-- source_name_hash gate on the translation tables, so classification is only
-- redone when the name actually changes rather than on every import run.

alter table public.ingredients
  add column category_source_name_hash text;

comment on column public.ingredients.category_source_name_hash is
  'sha256 of the ingredient name last classified. Null until first classified. Compared against the current name''s hash to decide whether reclassification is needed (AC-9).';
