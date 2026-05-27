create table if not exists public.application_source_settings (
  id text primary key default 'default',
  spreadsheet_id text not null,
  spreadsheet_url text not null,
  sheet_name text not null default 'Form Responses 1',
  sheet_range text not null default 'A1:BH',
  updated_by_email text not null default 'system@acmucsd.org',
  updated_at timestamptz not null default now(),
  constraint application_source_settings_singleton_id
    check (id = 'default'),
  constraint application_source_settings_spreadsheet_id_not_blank
    check (length(trim(spreadsheet_id)) > 0),
  constraint application_source_settings_spreadsheet_url_not_blank
    check (length(trim(spreadsheet_url)) > 0),
  constraint application_source_settings_sheet_name_not_blank
    check (length(trim(sheet_name)) > 0),
  constraint application_source_settings_sheet_range_not_blank
    check (length(trim(sheet_range)) > 0),
  constraint application_source_settings_updated_by_email_domain
    check (lower(updated_by_email) like '%@acmucsd.org')
);

insert into public.application_source_settings (
  id,
  spreadsheet_id,
  spreadsheet_url,
  sheet_name,
  sheet_range,
  updated_by_email
)
values (
  'default',
  '1lJSS8R-SuGULx3ATWucr9k7FgK_4gmr4E4gUwsUddAY',
  'https://docs.google.com/spreadsheets/d/1lJSS8R-SuGULx3ATWucr9k7FgK_4gmr4E4gUwsUddAY/edit',
  'Form Responses 1',
  'A1:BH',
  'system@acmucsd.org'
)
on conflict (id) do nothing;

create or replace function public.set_application_source_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_application_source_settings_updated_at
  on public.application_source_settings;

create trigger set_application_source_settings_updated_at
before update on public.application_source_settings
for each row
execute function public.set_application_source_settings_updated_at();

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

  delete from public.application_assignments;
  delete from public.application_reviews;

  return new;
end;
$$;

drop trigger if exists clear_application_cycle_state_on_source_change
  on public.application_source_settings;

create trigger clear_application_cycle_state_on_source_change
after insert or update on public.application_source_settings
for each row
execute function public.clear_application_cycle_state_on_source_change();

alter table public.application_source_settings enable row level security;

revoke all on public.application_source_settings from anon, authenticated;
grant all on public.application_source_settings to service_role;

drop policy if exists "Service role can manage application source settings"
  on public.application_source_settings;

create policy "Service role can manage application source settings"
  on public.application_source_settings
  for all
  to service_role
  using (true)
  with check (true);

notify pgrst, 'reload schema';
