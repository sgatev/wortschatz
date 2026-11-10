-- Wortschatz on Supabase: let pages fetch only what changed since their last visit.
-- Only needed if you ran supabase.sql before it had this (November 2026). Run it once in
-- the SQL Editor, the same way. A new project only needs supabase.sql.

-- When each person's progress for a word last changed.
alter table public.progress add column updated timestamptz not null default now();
create trigger progress_touch before update on public.progress
  for each row execute function public.words_touch();   -- sets "updated" to now()

-- Which words were deleted, and when, so pages that kept a copy can drop them too.
-- Kept for 180 days (pages fetch everything afresh at least once a week anyway).
create table public.deleted_words (
  id       text primary key,
  deleted  timestamptz not null default now()
);
create function public.words_deleted() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into deleted_words (id) values (old.id) on conflict (id) do update set deleted = now();
  delete from deleted_words where deleted < now() - interval '180 days';
  return old;
end $$;
create trigger words_deleted after delete on public.words
  for each row execute function public.words_deleted();
-- A word that comes back (an import of an old list) is no longer deleted.
create function public.words_undeleted() returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from deleted_words where id = new.id;
  return new;
end $$;
create trigger words_undeleted after insert on public.words
  for each row execute function public.words_undeleted();

alter table public.deleted_words enable row level security;
create policy "The class sees deleted words" on public.deleted_words for select to authenticated using (true);
revoke all on public.deleted_words from anon;
grant select on public.deleted_words to authenticated;

-- "What changed since …" is a lookup by time.
create index words_updated on public.words (updated);
create index progress_user_updated on public.progress (user_name, updated);
create index deleted_words_deleted on public.deleted_words (deleted);
