# Wortschatz

A small German vocabulary trainer: add words, practice them as flashcards, and watch your progress over time.

## Run it

```sh
cd ~/dev/wortschatz
node server.js
```

Then open http://localhost:4747. Use `PORT=5000 node server.js` for another port. Needs Node 18 or newer and has no dependencies.

## Files

- `index.html` — the whole app (page, styles, script).
- `server.js` — serves the page and reads/writes the data.
- `lookup.js` — looks up a German word on [de.wiktionary.org](https://de.wiktionary.org): article, plural, English meaning, category and verb forms.
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

## Starting over

- **Erase your statistics:** stop the server, delete (or rename) your `progress-<name>.json`, and start it again. The words stay; every word is new and due again in every test. Other people's progress isn't affected.
- **Go back to a local folder:** `node server.js --data ~/dev/wortschatz` (or delete `config.json`).

Earlier versions kept everything in one `words.json`, then in `vocabulary.json` + `progress.json`. The server upgrades both automatically and keeps the originals.

## Adding words

Type just the German word (no article) and press Enter. The server fetches the entry from the German Wiktionary and reads the gender (`|Genus=`), the plural (`|Nominativ Plural=`) and the English translations for each numbered meaning. Every distinct meaning becomes its own result (das Land: land / country / soil; die Bank: bench / bank), with Wiktionary's German definition underneath. Meanings whose main English word repeats an earlier one are folded together. The first four show right away; the rest are behind "Show more meanings". Press Enter again to add the top result, or pick another. The German definition is saved as the word's note, so cards for the same word with different meanings can be told apart.

Every word has a category (noun, verb, adjective, adverb, preposition, conjunction, pronoun, number, particle, interjection, article, phrase or other). Lookups fill it in from Wiktionary's part of speech; in the manual form you pick it, and choosing an article makes a word a noun. The word list shows the category on each word and can be filtered by it. Words saved before categories existed get one automatically the next time the page loads: nouns from their article, the rest by a Wiktionary lookup.

Verbs also get their conjugation from Wiktionary. Each verb entry lists the ich/du/er present forms, the ich Präteritum, the Partizip II, the plural imperative and the helper verb; the other forms follow regular rules (wir/sie = infinitive, ihr = plural imperative, Präteritum endings from the ich form, Perfekt = haben/sein + participle). Separable verbs keep their particle at the end ("rufe an"). Verbs already in your list get their forms in the background when the page loads, and the word list shows a verb's principal parts (*geht · ging · ist gegangen*).

Lookups need an internet connection and are cached in memory while the server runs. If Wiktionary has no entry, you can still enter the word yourself. "Add many at once" also accepts bare German words, one per line.

## How practice works

There are four tests, picked with the switch at the top of the Practice tab:

- **Vocabulary** — see the German, recall the English (or the other way round), by flipping the card or typing.
- **Der, die, das** — see a noun without its article and pick `der`, `die` or `das` (keys `1`, `2`, `3`). A right answer moves on by itself; after a wrong one, press `Enter` to continue. When the word's ending predicts its gender (‑ung, ‑heit, ‑keit → die; ‑chen, ‑lein → das; ‑ling, ‑ismus → der, …) the answer shows that rule. Only nouns with an article take part.
- **Plural** — see a noun in the singular (der Hund) and type its plural (Hunde; typing "die" is optional). The answer shows the plural pattern the way dictionaries write it: `-e`, `¨-e` (umlaut + e), `-er`, `¨-er`, `-n`, `-en`, `-s`, `¨`, or `–` (same as singular). A missing umlaut gets a "watch the umlaut" hint. Only nouns with a plural take part; words added by lookup get their plural automatically.
- **Verbs** — see a verb and type its forms for all six persons (ich, du, er/sie/es, wir, ihr, sie/Sie), in the tense you pick: **Präsens**, **Präteritum** or **Perfekt** (type the helper verb too: "bin gegangen"). `Enter` moves to the next line and checks after the last one. A card counts as right when all six forms are; wrong ones are struck through with the correct form underneath. Typing the pronoun ("ich gehe") is fine, and alternatives such as *sammle / sammele* or *bin / habe gefahren* both count. Each tense has its own boxes and statistics. Only verbs with their forms take part.
  Set **Ask for** to *One form* for quicker cards: each card then asks for a single person picked at random ("du · gehen"), and the card counts as right when that form is. Both settings share the same boxes per tense.

Each test has its own boxes, schedule and statistics, since knowing what a word means says nothing about remembering its article, plural or conjugation. The Progress tab has the same switch.

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

`history.days` holds how many answers you got right and wrong each day: `c`/`w` for vocabulary, `ac`/`aw` for articles, `pc`/`pw` for plurals, and `vpc`/`vpw`, `vtc`/`vtw`, `vkc`/`vkw` for verbs in Präsens, Präteritum and Perfekt. The unprefixed fields on a word are its vocabulary-test box, due date and counts; `art*`, `pl*`, `vp*`, `vt*` and `vk*` are the same for the article, plural and the three verb tests. A word with no entry in your progress file is simply new in every test. Progress for an id that isn't in `vocabulary.json` is kept but not shown.

In `vocabulary.json`, the server adds `"updated"` to each word (when it was last changed) and a `"deleted"` list of recently removed word ids with the time they were removed; these let two people's copies be merged safely.
