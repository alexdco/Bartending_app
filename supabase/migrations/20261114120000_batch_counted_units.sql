-- Batch calculator v2 (spec 0054): widen the recipe_ingredients unit check
-- to the counted units the shared parser now stores (dash, splash, drop,
-- and "each" for a bare number), and enforce that amount_max_value (the
-- high end of a range) is only set beside amount_value and above it.
-- Widening a check never rejects existing rows. The max check is guarded by
-- a count that must be 0, so it can never fail halfway through apply.
-- Unit sizes (a dash, a splash) live only in code, never here.
-- Spec: docs/specs/0054-batch-calculator-v2/index.md

do $$
declare
  bad_max bigint;
begin
  select count(*) into bad_max
  from public.recipe_ingredients
  where amount_max_value is not null
    and (amount_value is null or amount_max_value <= amount_value);

  if bad_max <> 0 then
    raise exception
      'recipe_ingredients has % rows with an amount_max_value that is not above amount_value; fix them before adding recipe_ingredients_amount_max_check',
      bad_max;
  end if;
end $$;

alter table public.recipe_ingredients
  drop constraint if exists recipe_ingredients_amount_unit_check;

alter table public.recipe_ingredients
  add constraint recipe_ingredients_amount_unit_check
  check (
    amount_unit is null
    or amount_unit in (
      'oz', 'ml', 'cl', 'tsp', 'tbsp', 'cup',
      'shot', 'jigger', 'dl', 'l', 'pint', 'qt', 'gal', 'part',
      'dash', 'splash', 'drop', 'each'
    )
  );

alter table public.recipe_ingredients
  drop constraint if exists recipe_ingredients_amount_max_check;

alter table public.recipe_ingredients
  add constraint recipe_ingredients_amount_max_check
  check (
    amount_max_value is null
    or (amount_value is not null and amount_max_value > amount_value)
  );

comment on column public.recipe_ingredients.amount_value is
  'Parsed leading number from measure (e.g. 1.5 for "1 1/2 oz"; the part count for a part line; the count for a counted line). The low end of a range. Null if measure could not be parsed.';
comment on column public.recipe_ingredients.amount_unit is
  'Unit parsed from measure, stored as written: oz/ml/cl/tsp/tbsp/cup/shot/jigger/dl/l/pint/qt/gal, part (a ratio with no fixed volume), or a counted unit: dash/splash/drop, or each (a bare number). Null if measure could not be parsed.';
comment on column public.recipe_ingredients.amount_max_value is
  'The high end of a range measure ("2-3 oz" stores 2 and 3). Null for a single amount. Always above amount_value when set.';
