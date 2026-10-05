alter table public.application_reviews
  add column comment text;

comment on column public.application_reviews.comment is
  'Shared applicant comment. NULL uses the legacy Sheet comment; an empty string is an intentional clear.';

notify pgrst, 'reload schema';
