alter table public.review_settings
  alter column due_date set default (current_date + 14);

update public.review_settings
set
  due_date = current_date + 14,
  updated_by_email = 'system@acmucsd.org'
where id = 'default'
  and due_date = date '2026-05-03';
