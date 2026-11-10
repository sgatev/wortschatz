-- Wortschatz on Supabase: lock the data behind the class password.
-- Only needed if you ran supabase.sql before it had the class password (October 2026).
-- Run it once in the SQL Editor, the same way. A new project only needs supabase.sql.
--
-- After this, only someone signed in to the class account (Authentication → Users)
-- can read or change anything. The page signs in with the class password.

drop policy "Everyone uses the word list" on public.words;
drop policy "Everyone keeps progress"     on public.progress;
drop policy "Everyone keeps history"      on public.history;

create policy "The class uses the word list" on public.words    for all to authenticated using (true) with check (true);
create policy "The class keeps progress"     on public.progress for all to authenticated using (true) with check (true);
create policy "The class keeps history"      on public.history  for all to authenticated using (true) with check (true);

revoke all on public.words, public.progress, public.history from anon;
grant select, insert, update, delete on public.words, public.progress, public.history to authenticated;
