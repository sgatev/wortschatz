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
- `server.js` — serves the page and reads/writes the word list.
- `lookup.js` — looks up a German word on [de.wiktionary.org](https://de.wiktionary.org) and returns its article, plural and English meaning.
- `vocabulary.json` — the words: German, article, plural, English, category and note. Nothing about how you're doing, so it's the file to share.
- `progress.json` — your boxes, due dates, right/wrong counts per test, and daily history.

Both are plain JSON, created on the first save. Stop the server before editing them by hand.

## Sharing and starting over

- **Share your vocabulary:** send `vocabulary.json`. The other person puts it in their own `wortschatz` folder (with the server stopped) and starts fresh, since they have no `progress.json` yet.
- **Erase your statistics:** stop the server, delete (or rename) `progress.json`, and start it again. Your words stay; every word is new and due again in all three tests.
- Practising only ever rewrites `progress.json`; adding, editing or deleting a word rewrites `vocabulary.json` (and drops that word's progress on delete). So `vocabulary.json` works well under version control.

Earlier versions kept everything in one `words.json`. On its first start the server splits that file into the two above and keeps the original as `words.json.bak`.

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

`progress.json` (keyed by the same word ids):

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

`history.days` holds how many answers you got right and wrong each day: `c`/`w` for vocabulary, `ac`/`aw` for articles, `pc`/`pw` for plurals, and `vpc`/`vpw`, `vtc`/`vtw`, `vkc`/`vkw` for verbs in Präsens, Präteritum and Perfekt. The unprefixed fields on a word are its vocabulary-test box, due date and counts; `art*`, `pl*`, `vp*`, `vt*` and `vk*` are the same for the article, plural and the three verb tests. A word with no entry in `progress.json` is simply new in every test. Progress for an id that isn't in `vocabulary.json` is ignored.
