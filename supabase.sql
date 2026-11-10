-- Wortschatz on Supabase. Run this once in your project's SQL Editor (Dashboard → SQL Editor → New query).
--
--   words     the shared word list: anyone using the page can add, edit and delete words.
--   progress  each person's boxes, due dates and counts per word, under their name.
--   history   each person's daily right/wrong totals, under their name.
--
-- There are no accounts: people pick a name on the page, and that name is all that
-- separates one person's progress from another's. The fields match vocabulary.json
-- and progress-<name>.json from the local app.

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

-- Row level security stays on (Supabase warns about tables without it), with rules
-- that let the page do everything it needs using the publishable key.
alter table public.words    enable row level security;
alter table public.progress enable row level security;
alter table public.history  enable row level security;

create policy "Everyone uses the word list" on public.words    for all to anon, authenticated using (true) with check (true);
create policy "Everyone keeps progress"     on public.progress for all to anon, authenticated using (true) with check (true);
create policy "Everyone keeps history"      on public.history  for all to anon, authenticated using (true) with check (true);

grant select, insert, update, delete on public.words, public.progress, public.history to anon, authenticated;

-- Tell open pages right away when someone adds, edits or deletes a word.
alter publication supabase_realtime add table public.words;
