create table if not exists public.application_reviews (
  application_id text primary key,
  rating integer,
  decision text,
  updated_by_email text not null,
  updated_by_name text not null,
  updated_at timestamptz not null default now(),
  constraint application_reviews_application_id_not_blank
    check (length(trim(application_id)) > 0),
  constraint application_reviews_rating_range
    check (rating is null or rating between 1 and 10),
  constraint application_reviews_decision_value
    check (decision is null or decision in ('reject', 'waitlist', 'accept')),
  constraint application_reviews_updated_by_email_domain
    check (lower(updated_by_email) like '%@acmucsd.org')
);

create index if not exists application_reviews_decision_idx
  on public.application_reviews (decision)
  where decision is not null;

create index if not exists application_reviews_updated_at_idx
  on public.application_reviews (updated_at desc);

create or replace function public.set_application_reviews_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_application_reviews_updated_at
  on public.application_reviews;

create trigger set_application_reviews_updated_at
before update on public.application_reviews
for each row
execute function public.set_application_reviews_updated_at();

alter table public.application_reviews enable row level security;

revoke all on public.application_reviews from anon, authenticated;
grant all on public.application_reviews to service_role;

drop policy if exists "Service role can manage application reviews"
  on public.application_reviews;

create policy "Service role can manage application reviews"
  on public.application_reviews
  for all
  to service_role
  using (true)
  with check (true);

notify pgrst, 'reload schema';
