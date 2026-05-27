create table if not exists public.application_assignments (
  application_id text primary key,
  assignee_email text not null,
  assignee_name text not null,
  assigned_by_email text not null,
  assigned_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint application_assignments_application_id_not_blank
    check (length(trim(application_id)) > 0),
  constraint application_assignments_assignee_email_domain
    check (lower(assignee_email) like '%@acmucsd.org'),
  constraint application_assignments_assigned_by_email_domain
    check (lower(assigned_by_email) like '%@acmucsd.org')
);

create index if not exists application_assignments_assignee_email_idx
  on public.application_assignments (assignee_email);

create index if not exists application_assignments_assigned_by_email_idx
  on public.application_assignments (assigned_by_email);

create index if not exists application_assignments_assigned_at_idx
  on public.application_assignments (assigned_at desc);

create or replace function public.set_application_assignments_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_application_assignments_updated_at
  on public.application_assignments;

create trigger set_application_assignments_updated_at
before update on public.application_assignments
for each row
execute function public.set_application_assignments_updated_at();

alter table public.application_assignments enable row level security;

revoke all on public.application_assignments from anon, authenticated;
grant all on public.application_assignments to service_role;

drop policy if exists "Service role can manage application assignments"
  on public.application_assignments;

create policy "Service role can manage application assignments"
  on public.application_assignments
  for all
  to service_role
  using (true)
  with check (true);
