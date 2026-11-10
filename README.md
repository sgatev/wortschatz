# Wortschatz

A small German vocabulary trainer: add words, practice them as flashcards, and watch your progress over time.

## Run it

```sh
cd ~/dev/wortschatz
node server.js
```

Then open http://localhost:4747. Use `PORT=5000 node server.js` for another port. Needs Node 18 or newer and has no dependencies.

Or host it on the web for others, with no server of your own: see [Hosting it on GitHub Pages](#hosting-it-on-github-pages).

## Files

- `index.html` — the whole app (page, styles, script).
- `server.js` — serves the page and reads/writes the data.
- `lookup.js` — looks up a German word on [de.wiktionary.org](https://de.wiktionary.org): article, plural, English meaning, category and verb forms. Used by the server, or by the page itself when hosted.
- `supabase-config.js` — where the hosted app keeps its data. Empty means "use the local server".
- `supabase.sql` — sets up the Supabase database for the hosted app (run once).
- `config.json` — this computer's settings (data folder and your name), written when you use `--data` or `--user`. Not shared.

The data lives in a folder of its own: next to the code by default, or anywhere you point it (such as a shared iCloud folder):

- `vocabulary.json` — the words: German, article, plural, English, category, verb forms and note. Shared by everyone who uses the folder.
- `progress-<name>.json` — one person's boxes, due dates, right/wrong counts per test, and daily history. Everyone has their own.

Both are plain JSON. Stop the server before editing them by hand.

## Sharing the words through iCloud

Everyone shares one word list and has their own progress. Each person runs the app on their own Mac.

**You (first time):**

1. Create a folder in iCloud Drive, e.g. *Wortschatz*.
2. Point the server at it, once:
   ```sh
   cd ~/dev/wortschatz
   node server.js --data ~/Library/Mobile\ Documents/com~apple~CloudDocs/Wortschatz
   ```
   On the first start it copies your words into the folder as `vocabulary.json`, and your progress as `progress-<your login name>.json`. The originals stay in `~/dev/wortschatz` as a backup. The folder is remembered in `config.json`, so from then on plain `node server.js` uses it.
3. In Finder, right-click the folder → **Share** → **Share Folder…**, choose collaboration, and invite the other person with **Can make changes**.

**The other person:**

1. Accept the invitation. The folder appears in their iCloud Drive.
2. Get a copy of the app (`index.html`, `server.js`, `lookup.js`) into a folder of their own, then:
   ```sh
   node server.js --data ~/Library/Mobile\ Documents/com~apple~CloudDocs/Wortschatz --user anna
   ```
   `--user` names their progress file (`progress-anna.json`); without it, their login name is used.

**How the two stay in step:**

- Practising only writes your own `progress-<name>.json`; the shared `vocabulary.json` changes only when someone adds, edits or deletes a word.
- The server re-reads `vocabulary.json` whenever iCloud updates it and writes back only the word that changed, so two people adding words at the same time don't overwrite each other. If a save does get overwritten in a race, the server notices within seconds and writes the missing word back.
- Each word records when it was last changed, and deleted words leave a short note (kept for 180 days) so an old copy can't bring them back. When two Macs save at the same moment, iCloud may create `vocabulary 2.json`; the server merges such copies, keeping the newest version of each word, and removes them.
- Words the other person adds show up in your open page within about 20 seconds (and right away when you switch back to the tab), with a short notice. It never refreshes in the middle of a practice round.
- With *Optimize Mac Storage* on, iCloud may keep only a placeholder of the file; the server asks iCloud to download it before reading.

## Hosting it on GitHub Pages

The page can run from GitHub Pages (or any static web host) with the words and progress kept in [Supabase](https://supabase.com), a hosted database with a free plan. There's no server to run and no accounts: everyone types their name, shares one word list that anyone can add to, edit and delete from, and has their own boxes and statistics under that name, on any device. Lookups go from the page straight to Wiktionary.

**Once, in Supabase:**

1. Create a free account and a new project.
2. **SQL Editor** → **New query**: paste the whole of `supabase.sql` and press **Run**. It creates the tables for the words, everyone's progress and daily history.
3. **Project Settings** → **API Keys**: copy the **publishable** key (in older projects: the **anon** key), and from **Data API** the project URL. Put both in `supabase-config.js`. The publishable key is meant for web pages; never use the secret / service_role key there.

**Then, on GitHub:**

4. Commit `supabase-config.js` and push the repository to GitHub.
5. **Settings** → **Pages** → **Build and deployment**: deploy from the `main` branch, folder `/ (root)`. After a minute the app is at `https://<your-user>.github.io/<repository>/`.

**Moving your words over:** open the page and type your name (a name nobody has used yet asks you to press **Start** a second time, so a typo doesn't start an empty profile). Then on the **Words** tab open **Import from the Mac app** and choose `vocabulary.json` and your `progress-<name>.json` (from your data folder, e.g. the shared iCloud folder). Words already in the list are left as they are, and progress is only imported for words that are in it. The other person types their own name and imports just their own `progress-<name>.json`. The name is remembered in the browser; **Not you?** at the bottom of the page switches to another name.

Things to know:

- Names aren't protected: anyone who types "anna" practises as Anna and changes her statistics. And anyone who has the link can change the word list. Supabase keeps daily backups on paid plans only, so export now and then (Supabase: **Table Editor** → `words` → **Export to CSV**), or keep the old `vocabulary.json`.
- On a free GitHub account, Pages needs a public repository, so the code and `supabase-config.js` are public. With the key in it, anyone can read and change the words and progress, just as anyone with the link to the page can. Only use this for things you don't mind being public.
- Free Supabase projects are paused after about a week without any use. Restore it from the Supabase dashboard if the page says it can't reach the word list.
- Once `supabase-config.js` is filled in, `node server.js` uses Supabase too (it then only serves the page). Empty the two values to go back to the local files.
- A word added by someone else shows up in your open page within a couple of seconds (never in the middle of a round).

## Starting over

- **Erase your statistics:** stop the server, delete (or rename) your `progress-<name>.json`, and start it again. The words stay; every word is new and due again in every test. Other people's progress isn't affected.
- **Go back to a local folder:** `node server.js --data ~/dev/wortschatz` (or delete `config.json`).

Earlier versions kept everything in one `words.json`, then in `vocabulary.json` + `progress.json`. The server upgrades both automatically and keeps the originals.

## Logo

`assets/logo.svg` is the logo: three flashcards in the der / die / das colours (Nord blue, red and green) with a W on the front card, on a Polar Night tile laid out on the macOS icon grid. The page uses the same drawing for its header and browser-tab icon (inlined in `index.html`, cropped without the icon margin). `assets/wortschatz.png` (1024 px) and `assets/wortschatz.icns` are exports of it.

To use it as the icon of the shared iCloud folder, run this once in Terminal (adjust the paths if yours differ):

```sh
osascript -l JavaScript -e 'ObjC.import("AppKit"); $.NSWorkspace.sharedWorkspace.setIconForFileOptions($.NSImage.alloc.initWithContentsOfFile("/Users/sg/dev/wortschatz/assets/wortschatz.icns"), "/Users/sg/Library/Mobile Documents/com~apple~CloudDocs/Wortschatz", 0)'
```

It prints `true` when it worked. Or by hand: select the folder in Finder, **File → Get Info**, and drag `wortschatz.icns` onto the small icon at the top left of the Info window. Custom folder icons are stored on the folder itself and don't always sync through iCloud, so the other person may need to do the same on their Mac.

## Adding words

Type just the German word (no article) and press Enter. The server fetches the entry from the German Wiktionary and reads the gender (`|Genus=`), the plural (`|Nominativ Plural=`) and the English translations for each numbered meaning. Every distinct meaning becomes its own result (das Land: land / country / soil; die Bank: bench / bank), with Wiktionary's German definition underneath. Meanings whose main English word repeats an earlier one are folded together. The first four show right away; the rest are behind "Show more meanings". Press Enter again to add the top result, or pick another. The German definition is saved as the word's note, so cards for the same word with different meanings can be told apart.

Every word has a category (noun, verb, adjective, adverb, preposition, conjunction, pronoun, number, particle, interjection, article, phrase or other). Lookups fill it in from Wiktionary's part of speech; in the manual form you pick it, and choosing an article makes a word a noun. The word list shows the category on each word and can be filtered by it. Words saved before categories existed get one automatically the next time the page loads: nouns from their article, the rest by a Wiktionary lookup.

Verbs also get their conjugation from Wiktionary. Each verb entry lists the ich/du/er present forms, the ich Präteritum, the Partizip II, the plural imperative and the helper verb; the other forms follow regular rules (wir/sie = infinitive, ihr = plural imperative, Präteritum endings from the ich form, Perfekt = haben/sein + participle). Separable verbs keep their particle at the end ("rufe an"). Verbs already in your list get their forms in the background when the page loads, and the word list shows a verb's principal parts (*geht · ging · ist gegangen*).

Some entries have no English translation on Wiktionary, often female forms such as *Fotografin*. A female form borrows the meaning of its male form (*Fotograf* → "photographer (female)"). Any other entry without English still shows up, with its article, plural and German definition but no Add button: use **Edit first** to type the meaning (pressing Enter again opens the form too). "Add many at once" skips such words and leaves them in the box. In vocabulary answers, a part in parentheses can be typed or left out: "photographer" counts for "photographer (female)", and both "would like" and "would like to" count for "would like (to)".

A few everyday words that Wiktionary leaves incomplete are filled in by `lookup.js` itself (`BUILT_IN`). So far that's *möchten*: Wiktionary treats it as the Konjunktiv II of *mögen* and has no English or conjugation for it, so the app supplies "would like (to)" and its Präsens forms (*möchte, möchtest, …*). It takes part in the Präsens verb test only, since it has no Präteritum or Perfekt of its own.

Lookups need an internet connection and are cached in memory while the server runs. If Wiktionary has no entry, you can still enter the word yourself. "Add many at once" also accepts bare German words, one per line.

## How practice works

There are six tests, plus a mixed round, picked with the switch at the top of the Practice tab:

- **Vocabulary** — see the German, recall the English (or the other way round), by flipping the card or typing.
- **Der, die, das** — see a noun without its article and pick `der`, `die` or `das` (keys `1`, `2`, `3`). A right answer moves on by itself. After a wrong one, type the noun with its article ("die Katze") and press `Enter` to move on: saying it yourself sticks much better than reading it. A missed noun then comes back after 3 cards; get it right and it comes back once more after 6, and it's done when it's right twice in a row (a miss starts it over). Only the first answer of a round counts toward boxes and statistics. Near the end of a round there may be fewer cards to put in between. When the word's ending predicts its gender (‑ung, ‑heit, ‑keit → die; ‑chen, ‑lein → das; ‑ling, ‑ismus → der, …) the answer shows that rule. Only nouns with an article take part.
- **Plural** — see a noun in the singular (der Hund) and type its plural (Hunde; typing "die" is optional). The answer shows the plural pattern the way dictionaries write it: `-e`, `¨-e` (umlaut + e), `-er`, `¨-er`, `-n`, `-en`, `-s`, `¨`, or `–` (same as singular). A missing umlaut gets a "watch the umlaut" hint. Only nouns with a plural take part; words added by lookup get their plural automatically.
- **Verbs** — see a verb and type its forms for all six persons (ich, du, er/sie/es, wir, ihr, sie/Sie), in the tense you pick: **Präsens**, **Präteritum** or **Perfekt** (type the helper verb too: "bin gegangen"). `Enter` moves to the next line and checks after the last one. A card counts as right when all six forms are; wrong ones are struck through with the correct form underneath. Typing the pronoun ("ich gehe") is fine, and alternatives such as *sammle / sammele* or *bin / habe gefahren* both count. Each tense has its own boxes and statistics. Only verbs with their forms take part.
  Set **Ask for** to *One form* for quicker cards: each card then asks for a single person picked at random ("du · gehen"), and the card counts as right when that form is. Both settings share the same boxes per tense.
- **Ein, mein, kein** — decline the article in front of a noun: type its form in each case (Nominativ, Akkusativ, Dativ, Genitiv). Pick **Indefinit** for *ein / eine* (der Hund → ein, einen, einem, eines) **Possessiv** for *mein, dein, sein, ihr, unser, euer, Ihr*, where each card names whose it is ("whose? wir (our)"), or **Negativ** for *kein / keine*. Possessive and negative cards ask for the plural half the time when the noun has one (unsere Hunde, keine Hunde). The noun is shown with its article, so the card is about the endings, not the gender. Typing the noun as well ("einen Hund") is fine, and *unsren / unsern* count as well as *unseren*. Under **Cases**, pick the cases you want to practise (just *Nominativ* to start with; at least one stays on). **Ask for** *One case* asks for a single one of them at random per card. The answer shows the whole row (Masculine: ein · einen · einem · eines). Indefinite, possessive and negative each have their own boxes and statistics; only nouns with an article take part.
- **Kein / nicht** — see a short sentence and pick how to negate it: `kein` or `nicht` (keys `1`, `2`). The sentences are built from your nouns and adjectives, all in the Nominativ: *Das ist ein Hund.* → kein; *Das ist der Hund.* → nicht (*nicht der Hund*); *Das sind Hunde.* → kein (*keine Hunde*); *Das sind die Hunde.* → nicht; *Das ist schön.* → nicht. Each card picks one of the sentences its word fits at random. The answer shows the negated sentence and the rule. A right answer moves on by itself, like the article test.
- **Mixed** — one round with due cards from every test: vocabulary, articles, plurals, verbs in each tense, ein / mein / kein, and kein / nicht. Use **Include** to pick which tests take part; the number on each shows what's due there. Each word comes up at most once per round (in one of the tests it's due in, picked at random), so a vocabulary card for *der Hund* can't give away an article card for *Hund*. Every answer counts toward that test's own boxes and statistics, exactly as if you'd practised it on its own. The vocabulary direction/answer and verb "ask for" settings apply to those cards.

**Practise your mix-ups**, on every test's screen, is a round of the words you've missed in that test at least twice, most-missed first, up to the cards-per-round setting. A word leaves a test's list once you've got it right there 3 times in a row, in any round. In **Mixed**, it gathers the mix-ups of the included tests, one card per word (in the test where it's missed most). A mix-ups round counts like **Practice anyway**: a right answer moves a word up a box only if it was due.

Each test has its own boxes, schedule and statistics, since knowing what a word means says nothing about remembering its article, plural or conjugation. The Progress tab has the same switch. Above the switch, **Most frequent mistakes** ranks everything you've missed across all tests at once (a word can appear once per test), by how many times you've missed it, with the miss rate breaking ties. It shows the top 10, with a button to see the rest.

Each word sits in one of five boxes. Knowing a word moves it up a box; missing it sends it back to box 1. Higher boxes come back less often: every day, next day, 3 days, 1 week, 16 days. A round shows the words that are due today, lowest boxes first. Cards you miss come back once more at the end of the round.

Keys (vocabulary): `Space` shows the answer, `1` = didn't know, `2` = knew it. In typing mode, `Enter` checks and moves on. When typing German, `ae`, `oe`, `ue` and `ss` are accepted for ä, ö, ü and ß.

## File formats

`vocabulary.json`:

```json
{
  "version": 1,
  "words": {
    "w_lx3k9a2b7": {
      "article": "der", "de": "Hund", "en": "dog, hound", "plural": "die Hunde", "category": "noun",
      "note": "Haustier, dessen Vorfahre der Wolf ist", "created": "2026-09-29T20:15:00.000Z"
    }
  }
}
```

A verb also carries its conjugation, one entry per person (ich, du, er/sie/es, wir, ihr, sie/Sie); alternatives are separated by " / ":

```json
"forms": {
  "präsens":    ["gehe", "gehst", "geht", "gehen", "geht", "gehen"],
  "präteritum": ["ging", "gingst", "ging", "gingen", "gingt", "gingen"],
  "perfekt":    ["bin gegangen", "bist gegangen", "ist gegangen", "sind gegangen", "seid gegangen", "sind gegangen"]
}
```

You can correct a form by editing `vocabulary.json` (server stopped). `"forms": {}` means Wiktionary had no forms for that verb.

`progress-<name>.json` (keyed by the same word ids):

```json
{
  "version": 1,
  "words": {
    "w_lx3k9a2b7": {
      "box": 2, "due": "2026-09-30", "seen": 1, "correct": 1, "wrong": 0, "last": "2026-09-29T20:16:00.000Z",
      "artBox": 1, "artDue": "2026-09-29", "artSeen": 0, "artCorrect": 0, "artWrong": 0,
      "plBox": 1, "plDue": "2026-09-29", "plSeen": 0, "plCorrect": 0, "plWrong": 0
    }
  },
  "history": { "days": { "2026-09-29": { "c": 12, "w": 3, "ac": 8, "aw": 2, "pc": 5, "pw": 4 } } }
}
```

`history.days` holds how many answers you got right and wrong each day: `c`/`w` for vocabulary, `ac`/`aw` for articles, `pc`/`pw` for plurals, `vpc`/`vpw`, `vtc`/`vtw`, `vkc`/`vkw` for verbs in Präsens, Präteritum and Perfekt, and `ic`/`iw`, `oc`/`ow`, `nc`/`nw` for the indefinite, possessive and negative article, and `kc`/`kw` for kein / nicht. The unprefixed fields on a word are its vocabulary-test box, due date and counts (`run` is how many times in a row it's been right, for the mix-ups); `art*`, `pl*`, `vp*`, `vt*`, `vk*`, `in*`, `po*`, `ne*` and `kn*` are the same for the article, plural, the three verb tests, the indefinite, possessive and negative article, and kein / nicht. A word with no entry in your progress file is simply new in every test. Progress for an id that isn't in `vocabulary.json` is kept but not shown.

In `vocabulary.json`, the server adds `"updated"` to each word (when it was last changed) and a `"deleted"` list of recently removed word ids with the time they were removed; these let two people's copies be merged safely.
