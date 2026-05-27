create or replace function public.clear_application_cycle_state_on_source_change()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    if old.spreadsheet_id is not distinct from new.spreadsheet_id
      and old.sheet_name is not distinct from new.sheet_name
      and old.sheet_range is not distinct from new.sheet_range
    then
      return new;
    end if;
  end if;

  delete from public.application_assignments
  where true;

  delete from public.application_reviews
  where true;

  return new;
end;
$$;
