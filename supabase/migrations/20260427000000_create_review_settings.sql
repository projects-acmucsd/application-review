create table if not exists public.review_settings (
  id text primary key default 'default',
  due_date date not null default '2026-05-03',
  updated_by_email text not null default 'system@acmucsd.org',
  updated_at timestamptz not null default now(),
  constraint review_settings_singleton_id
    check (id = 'default'),
  constraint review_settings_updated_by_email_domain
    check (lower(updated_by_email) like '%@acmucsd.org')
);

insert into public.review_settings (id, due_date, updated_by_email)
values ('default', '2026-05-03', 'system@acmucsd.org')
on conflict (id) do nothing;

create or replace function public.set_review_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_review_settings_updated_at
  on public.review_settings;

create trigger set_review_settings_updated_at
before update on public.review_settings
for each row
execute function public.set_review_settings_updated_at();

alter table public.review_settings enable row level security;

revoke all on public.review_settings from anon, authenticated;
grant all on public.review_settings to service_role;

drop policy if exists "Service role can manage review settings"
  on public.review_settings;

create policy "Service role can manage review settings"
  on public.review_settings
  for all
  to service_role
  using (true)
  with check (true);

notify pgrst, 'reload schema';
