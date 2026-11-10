// Where the hosted app keeps its words and progress. Leave both empty to use the
// local server (node server.js) instead. Both values are in your Supabase project under
// Project Settings → API Keys (and Data API for the URL). The publishable key (called
// "anon" / "public" in older projects) is meant to be in web pages: what it can do is
// limited by the rules in supabase.sql. Never put the secret / service_role key here.
window.WORTSCHATZ_SUPABASE = {
  url: "",       // e.g. "https://abcdefghijkl.supabase.co"
  anonKey: "",   // the publishable key ("sb_publishable_…") or, in older projects, the anon key
};
