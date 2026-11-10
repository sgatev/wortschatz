-- Wortschatz on Supabase. Run this once in your project's SQL Editor (Dashboard → SQL Editor → New query).
--
--   words     the shared word list: everyone in the class can add, edit and delete words.
--   progress  each person's boxes, due dates and counts per word, under their name.
--   history   each person's daily right/wrong totals, under their name.
--
-- Everyone signs in to one class account (create it under Authentication → Users) with
-- the class password; nothing can be read or changed without it. Within the class, people
-- pick a name on the page, and that name is what separates one person's progress from
-- another's. The fields match vocabulary.json and progress-<name>.json from the local app.

create table public.words (
  id        text primary key check (id ~ '^w_[a-z0-9]{1,40}$'),
  article   text not null default '' check (article in ('', 'der', 'die', 'das')),
  de        text not null check (length(de) between 1 and 200),
  en        text not null check (length(en) between 1 and 500),
  plural    text not null default '',
  category  text not null default '',
  forms     jsonb,                                   -- verb conjugation, see README
  note      text not null default '',
  created   timestamptz not null default now(),
  updated   timestamptz not null default now()
);

-- Names are stored as the page sends them: trimmed and lower case ("anna").
create table public.progress (
  user_name  text not null check (user_name = lower(btrim(user_name)) and length(user_name) between 1 and 40),
  word_id    text not null references public.words (id) on delete cascade,
  data       jsonb not null default '{}',            -- box, due, seen, correct, wrong, artBox, … per test
  primary key (user_name, word_id)
);

create table public.history (
  user_name  text primary key check (user_name = lower(btrim(user_name)) and length(user_name) between 1 and 40),
  days       jsonb not null default '{}'             -- { "2026-09-29": { "c": 12, "w": 3, … } }
);

-- "updated" always says when a word last changed, whoever changed it.
create function public.words_touch() returns trigger language plpgsql as $$
begin
  new.updated := now();
  return new;
end $$;
create trigger words_touch before update on public.words
  for each row execute function public.words_touch();

-- Row level security: only someone signed in to the class account gets anywhere.
-- The publishable key in the page alone can't read or change anything.
alter table public.words    enable row level security;
alter table public.progress enable row level security;
alter table public.history  enable row level security;

create policy "The class uses the word list" on public.words    for all to authenticated using (true) with check (true);
create policy "The class keeps progress"     on public.progress for all to authenticated using (true) with check (true);
create policy "The class keeps history"      on public.history  for all to authenticated using (true) with check (true);

revoke all on public.words, public.progress, public.history from anon;
grant select, insert, update, delete on public.words, public.progress, public.history to authenticated;

-- Tell open pages right away when someone adds, edits or deletes a word.
alter publication supabase_realtime add table public.words;
