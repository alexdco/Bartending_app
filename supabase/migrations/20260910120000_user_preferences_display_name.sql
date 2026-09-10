alter table public.user_preferences
  add column display_name text;

alter table public.user_preferences
  add constraint user_preferences_display_name_check
  check (
    display_name is null
    or (display_name = btrim(display_name) and char_length(display_name) between 1 and 50)
  );
