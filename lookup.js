// Looks up a German word on de.wiktionary.org and returns its article,
// plural and English meaning. The German Wiktionary has a consistent
// structure for this: each entry has a "Deutsch Substantiv Übersicht"
// table (|Genus=…, |Nominativ Plural=…) and per-sense translation tables
// with lines like "*{{en}}: {{Ü|en|dog}}, {{Ü|en|hound}}".
"use strict";

const USER_AGENT = "Wortschatz/1.0 (personal vocabulary trainer)";
const ARTICLES = { m: "der", f: "die", n: "das" };
const SKIP_POS = /Deklinierte Form|Konjugierte Form|Eigenname|Nachname|Vorname|Toponym|Abkürzung|Partizip/;
const cache = new Map();

// Wiktionary's German part-of-speech labels -> a small set of English categories.
// Order matters: "Adverb" and "Pronomen" must be checked before the broader "verb".
const CATEGORY_RULES = [
  [/^Substantiv$/, "noun"],
  [/^Adjektiv$|Partizip/, "adjective"],
  [/adverb$/i, "adverb"],
  [/pronomen$/i, "pronoun"],
  [/verb$/i, "verb"],
  [/Präposition|Postposition/, "preposition"],
  [/Konjunktion|Subjunktion/, "conjunction"],
  [/Numerale|zahl$/i, "number"],
  [/partikel$/i, "particle"],
  [/Interjektion|Grußformel/, "interjection"],
  [/Artikel/, "article"],
  [/Redewendung|Wortverbindung|Sprichwort|Phrase/, "phrase"],
];
function categoryOf(pos) {
  for (const [re, cat] of CATEGORY_RULES) if (re.test(pos)) return cat;
  return "other";
}

// ---------- verb forms ----------
// Each German verb entry has a "Deutsch Verb Übersicht" block with the ich/du/er
// present forms, the ich Präteritum, the Partizip II, the plural imperative and the
// auxiliary. The remaining persons follow regular rules from those:
//   wir / sie = infinitive (sein: sind), ihr = plural imperative (geht, arbeitet, ruft an),
//   Präteritum from the ich form (ging → gingst, gingen, gingt),
//   Perfekt = haben/sein + Partizip II.
// Separable verbs keep their particle at the end ("rufe an", "riefen an").
// A cell can hold alternatives separated by " / " (sammle / sammele); any of them counts.
const PERSONS = ["ich", "du", "er/sie/es", "wir", "ihr", "sie/Sie"];
const AUX = {
  haben: ["habe", "hast", "hat", "haben", "habt", "haben"],
  sein:  ["bin", "bist", "ist", "sind", "seid", "sind"],
};

function verbForms(lines, inf) {
  const get = name => {
    const vals = [];
    for (const star of ["", "*", "**"]) {
      const key = "|" + name + star + "=";
      const line = lines.find(l => l.startsWith(key));
      if (!line) continue;
      const v = cleanWiki(line.slice(key.length));
      if (v && v !== "—" && v !== "-" && !vals.includes(v)) vals.push(v);
    }
    return vals;
  };
  const ich = get("Präsens_ich"), du = get("Präsens_du"), er = get("Präsens_er, sie, es");
  if (!ich.length || !du.length || !er.length) return null;
  const pratIch = get("Präteritum_ich"), part = get("Partizip II"), impPl = get("Imperativ Plural");
  const aux = get("Hilfsverb").filter(a => AUX[a]);

  const split = s => { const i = s.indexOf(" "); return i < 0 ? [s, ""] : [s.slice(0, i), s.slice(i + 1)]; };
  const particle = split(ich[0])[1];
  const withP = v => particle ? v + " " + particle : v;
  const base = particle && inf.startsWith(particle) ? inf.slice(particle.length) : inf;
  const alt = list => list.join(" / ");

  // Present
  const wir = inf === "sein" ? "sind" : withP(base);
  let ihr;
  if (inf === "sein") ihr = "seid";
  else if (impPl.length) ihr = impPl.slice().sort((a, b) => a.length - b.length)[0];   // geht, not gehet
  else {
    // No imperative (modal verbs): stem + t, or + et after t/d and after m/n following another consonant (atmet, öffnet).
    const stem = base.replace(/e?n$/, "");
    const needsE = /[td]$/.test(stem) || /([^aeiouäöüylrhmn]|ch)[mn]$/.test(stem);
    ihr = withP(stem + (needsE ? "et" : "t"));
  }
  const forms = { präsens: [alt(ich), alt(du), alt(er), wir, ihr, wir] };

  // Präteritum
  if (pratIch.length) {
    const [v, p] = split(pratIch[0]);
    const add = suffix => (p ? v + suffix + " " + p : v + suffix);
    const endsE = /e$/.test(v), endsTD = /[td]$/.test(v), endsS = /[sßz]$/.test(v);
    forms.präteritum = [
      alt(pratIch),
      add(endsE ? "st" : endsTD || endsS ? "est" : "st"),
      alt(pratIch),
      add(endsE ? "n" : "en"),
      add(endsE ? "t" : endsTD ? "et" : "t"),
      add(endsE ? "n" : "en"),
    ];
  }

  // Perfekt
  if (part.length && aux.length) {
    let pp = part[0];
    // Modal verbs list the "Ersatzinfinitiv" (können); on their own they use ge- + Präteritum stem (gekonnt).
    if (pp === inf && pratIch.length) pp = "ge" + split(pratIch[0])[0].replace(/e$/, "");
    forms.perfekt = PERSONS.map((_, i) => aux.map(a => AUX[a][i] + " " + pp).join(" / "));
  }
  return forms;
}

// Pure: wikitext of one page -> list of entries found in its German section.
function parseEntries(wikitext, title) {
  const lines = wikitext.split("\n");
  const start = lines.findIndex(l => /^==\s.*\(\{\{Sprache\|Deutsch\}\}\)\s*==\s*$/.test(l));
  if (start < 0) return [];
  let end = lines.findIndex((l, i) => i > start && /^==\s[^=]/.test(l));
  if (end < 0) end = lines.length;
  const section = lines.slice(start + 1, end);

  // Split the German section into parts of speech ("=== {{Wortart|Substantiv|Deutsch}}, {{m}} ===").
  const parts = [];
  for (const line of section) {
    const m = line.match(/^===\s*\{\{Wortart\|([^|}]+)\|Deutsch\}\}(.*?)===\s*$/);
    if (m) parts.push({ pos: m[1], head: m[0], lines: [] });
    else if (parts.length) parts[parts.length - 1].lines.push(line);
  }

  const entries = [];
  for (const p of parts) {
    if (SKIP_POS.test(p.head)) continue;
    const field = name => {
      const re = new RegExp(`^\\|${name}(?: 1)?=(.*)$`);
      for (const l of p.lines) { const m = l.match(re); if (m) return m[1].trim(); }
      return "";
    };

    let article = "", plural = "";
    if (p.pos === "Substantiv") {
      const genus = field("Genus") || (p.head.match(/\{\{([mfn])\}\}/) || [])[1] || "";
      article = ARTICLES[genus] || "";
      const pl = field("Nominativ Plural");
      if (pl && pl !== "—" && pl !== "-") plural = "die " + cleanWiki(pl);
      if (genus === "0" || genus === "") {
        // Plural-only nouns such as "Leute".
        const sg = field("Nominativ Singular");
        if (sg === "—") { article = "die"; plural = ""; }
      }
    }

    // One translation table per numbered meaning:
    //   {{Ü-Tabelle|2|G=unabhängiges politisches Gebilde|Ü-Liste=
    //   *{{en}}: {{Ü|en|country}}
    const tables = [];
    p.lines.forEach((l, i) => { if (l.includes("{{Ü-Tabelle")) tables.push(i); });
    tables.forEach((start, k) => {
      const stop = k + 1 < tables.length ? tables[k + 1] : p.lines.length;
      const head = p.lines[start].match(/\{\{Ü-Tabelle\|([^|]*)\|G=([^|]*)/) || [];
      const line = p.lines.slice(start + 1, stop).find(l => /^\*\{\{en\}\}:/.test(l));
      if (!line) return;
      let en = [...new Set([...line.matchAll(/\{\{Ü\|en\|([^|}]+)/g)].map(m => m[1].trim()))].slice(0, 3);
      if (!en.length) return;
      if (p.pos === "Verb") en = en.map(e => e.startsWith("to ") ? e : "to " + e);
      entries.push({
        article,
        de: title,
        plural,
        en: en.join(", "),
        pos: p.pos,
        category: categoryOf(p.pos),
        forms: categoryOf(p.pos) === "verb" ? verbForms(p.lines, title) || undefined : undefined,
        sense: (head[1] || "").trim(),
        gloss: cleanWiki(head[2] || ""),
        _first: en[0].toLowerCase(),
        _order: k,
      });
    });
  }

  // Wiktionary splits meanings finely (Land has 8). Keep a meaning only when its
  // main English word is new, so "country" shows once and "land" isn't repeated.
  // Order by sense number across entries, so both "Bank" nouns show their first meaning first.
  entries.sort((a, b) => a._order - b._order);
  const seen = new Set(), out = [];
  for (const e of entries) {
    const key = e.article + "|" + e._first;
    if (seen.has(key)) continue;
    seen.add(key);
    const { _first, _order, ...rest } = e;
    out.push(rest);
  }
  return out;
}

function cleanWiki(s) {
  return s.replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, "$1").replace(/''+/g, "").replace(/<[^>]+>/g, "").trim();
}

async function fetchRaw(title) {
  const url = "https://de.wiktionary.org/w/index.php?action=raw&title=" + encodeURIComponent(title);
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(8000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Wiktionary answered ${res.status}`);
  return res.text();
}

// "hund" and "Hund" are different pages; try both spellings and merge.
async function lookup(word) {
  const w = word.trim().replace(/^(der|die|das)\s+/i, "");
  if (!w) return [];
  const key = w.toLowerCase();
  if (cache.has(key)) return cache.get(key);

  const cap = w[0].toUpperCase() + w.slice(1);
  const low = w[0].toLowerCase() + w.slice(1);
  const titles = [...new Set([w, cap, low])];
  const pages = await Promise.all(titles.map(t => fetchRaw(t).then(text => ({ t, text }))));

  const seen = new Set(), results = [];
  // Prefer the spelling the user typed, then nouns (capitalized) before other words.
  const order = [w, cap, low].filter((t, i, a) => a.indexOf(t) === i);
  for (const t of order) {
    const page = pages.find(p => p.t === t);
    if (!page || !page.text) continue;
    for (const e of parseEntries(page.text, t)) {
      const k = [e.article, e.de, e.en].join("|");
      if (!seen.has(k)) { seen.add(k); results.push(e); }
    }
  }
  cache.set(key, results);
  return results;
}

module.exports = { lookup, parseEntries, categoryOf, verbForms, PERSONS };
