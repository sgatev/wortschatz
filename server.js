#!/usr/bin/env node
// Wortschatz — a tiny local server for the vocabulary trainer.
// Serves index.html and keeps the data in a folder of your choice:
//
//   vocabulary.json        the words (German, article, plural, English, category, verb forms, note).
//                          Can be shared: several people can add to it at the same time.
//   progress-<name>.json   one person's boxes, due dates, right/wrong counts and daily history.
//                          Each person has their own; delete yours (server stopped) to start over.
//
// The folder can live in iCloud Drive (or Dropbox, …) and be shared with someone else.
// Because a synced file can change underneath us, the server re-reads vocabulary.json when
// it changes on disk, writes only the word that changed, and merges the "vocabulary 2.json"
// copies iCloud creates when two Macs save at the same moment.
//
// No dependencies; needs Node 18 or newer.
//
//   node server.js                                   # data next to this file, http://localhost:4747
//   node server.js --data ~/path/to/folder           # use (and remember) another data folder
//   node server.js --user anna                       # whose progress file to use (default: your login name)
//   PORT=5000 node server.js                         # another port

"use strict";
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { lookup } = require("./lookup");

const DIR = __dirname;
const INDEX = path.join(DIR, "index.html");
const CONFIG_FILE = path.join(DIR, "config.json");   // this machine's settings: data folder and user name
const PORT = Number(process.env.PORT) || 4747;
const HOST = "127.0.0.1";
const MAX_BODY = 1024 * 1024;
const ID_RE = /^w_[a-z0-9]{1,40}$/;
const TOMBSTONE_DAYS = 180;

// Fields that describe the word itself. Everything else on a word is progress.
const DICT_FIELDS = ["article", "de", "en", "plural", "category", "forms", "note", "created", "updated"];

// ---------- settings: --data / --user, then environment, then config.json ----------
const expandHome = p => p && p.replace(/^~(?=$|\/)/, os.homedir());
function argValue(name) {
  const i = process.argv.indexOf("--" + name);
  if (i > 0 && process.argv[i + 1]) return process.argv[i + 1];
  const eq = process.argv.find(a => a.startsWith("--" + name + "="));
  return eq ? eq.slice(name.length + 3) : "";
}
const config = readJsonFile(CONFIG_FILE, {}, { fatal: false }) || {};
const cliData = argValue("data"), cliUser = argValue("user");
const DATA_DIR = path.resolve(expandHome(cliData || process.env.WORTSCHATZ_DATA || config.dataDir || DIR));
const USER = (cliUser || process.env.WORTSCHATZ_USER || config.user || os.userInfo().username || "me")
  .toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "me";
if (cliData || cliUser) {
  writeFileAtomicSync(CONFIG_FILE, { ...config, dataDir: DATA_DIR, user: USER });
  console.log(`Remembered in config.json: data folder and user "${USER}". Next time plain "node server.js" uses them.`);
}

const VOCAB_FILE = path.join(DATA_DIR, "vocabulary.json");
const PROGRESS_FILE = path.join(DATA_DIR, `progress-${USER}.json`);

// ---------- file helpers ----------
function readJsonFile(file, fallback, { fatal = true } = {}) {
  ensureLocal(file);
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    if (!fatal) return null;
    // Never overwrite a file we couldn't read; the user may want to fix it by hand.
    console.error(`Could not parse ${file}: ${e.message}`);
    console.error("Fix or move the file, then start the server again.");
    process.exit(1);
  }
}

// Copy so that nobody (another server, iCloud) ever sees a half-written file.
function copyAtomicSync(from, to) {
  const tmp = path.join(path.dirname(to), "." + path.basename(to) + ".tmp-" + process.pid);
  fs.copyFileSync(from, tmp);
  fs.renameSync(tmp, to);
}

function writeFileAtomicSync(file, data) {
  const tmp = path.join(path.dirname(file), "." + path.basename(file) + ".tmp-" + process.pid);
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, file);
}

// With "Optimize Mac Storage", iCloud may keep only a placeholder (".vocabulary.json.icloud")
// until the file is opened. Ask iCloud to download it and wait a little.
function ensureLocal(file) {
  if (fs.existsSync(file)) return;
  const placeholder = path.join(path.dirname(file), "." + path.basename(file) + ".icloud");
  if (!fs.existsSync(placeholder)) return;
  console.log(`Downloading ${path.basename(file)} from iCloud…`);
  spawnSync("brctl", ["download", file], { stdio: "ignore" });
  const until = Date.now() + 30000;
  while (!fs.existsSync(file) && Date.now() < until) spawnSync("sleep", ["0.5"]);
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const withoutUpdated = w => { if (!w) return w; const { updated, ...rest } = w; return rest; };

function splitWord(word) {
  const dict = {}, prog = {};
  for (const [k, v] of Object.entries(word)) (DICT_FIELDS.includes(k) ? dict : prog)[k] = v;
  return { dict, prog };
}

// ---------- first start in a (new) data folder ----------
fs.mkdirSync(DATA_DIR, { recursive: true });

// The single words.json used before the vocabulary/progress split.
const LEGACY_FILE = path.join(DIR, "words.json");
if (!fs.existsSync(path.join(DIR, "vocabulary.json")) && fs.existsSync(LEGACY_FILE)) {
  const old = readJsonFile(LEGACY_FILE, {});
  const v = { version: 1, words: {} }, p = { version: 1, words: {}, history: { days: {} } };
  for (const [id, w] of Object.entries(old.words || {})) {
    const { dict, prog } = splitWord(w);
    v.words[id] = dict;
    if (Object.keys(prog).length) p.words[id] = prog;
  }
  p.history = { days: {}, ...(old.history || {}) };
  writeFileAtomicSync(path.join(DIR, "vocabulary.json"), v);
  if (!fs.existsSync(path.join(DIR, "progress.json"))) writeFileAtomicSync(path.join(DIR, "progress.json"), p);
  fs.renameSync(LEGACY_FILE, LEGACY_FILE + ".bak");
  console.log("Split words.json into vocabulary.json and progress.json (old file kept as words.json.bak).");
}

// Moving to a shared folder: bring this machine's words along if the folder has none yet.
// (If it already has a vocabulary, that one is used as is; your local file is left alone.)
const localVocab = path.join(DIR, "vocabulary.json");
if (DATA_DIR !== DIR && !fs.existsSync(VOCAB_FILE) && fs.existsSync(localVocab)) {
  ensureLocal(VOCAB_FILE);
  if (!fs.existsSync(VOCAB_FILE)) {
    copyAtomicSync(localVocab, VOCAB_FILE);
    console.log(`Copied your words into ${VOCAB_FILE} (the original stays in ${DIR}).`);
  }
} else if (DATA_DIR !== DIR && fs.existsSync(VOCAB_FILE) && fs.existsSync(localVocab)) {
  console.log(`Using the shared vocabulary in ${DATA_DIR}. Your local ${localVocab} is not used.`);
}

// Progress was a single progress.json before it became one file per person.
if (!fs.existsSync(PROGRESS_FILE)) {
  const own = path.join(DIR, "progress.json");
  if (fs.existsSync(own)) {
    if (DATA_DIR === DIR) fs.renameSync(own, PROGRESS_FILE);
    else copyAtomicSync(own, PROGRESS_FILE);
    console.log(`Your progress is now in ${PROGRESS_FILE}${DATA_DIR === DIR ? "" : ` (the original stays in ${DIR})`}.`);
  }
}

// ---------- vocabulary: shared, can change on disk at any time ----------
// Each word carries "updated" (when it was last saved); deleted words leave a tombstone
// in "deleted" so a stale copy can't bring them back. Merging keeps the newer of each word.
// A file that is still syncing can be briefly unreadable: retry for a few seconds before giving up.
function readVocabAtStart() {
  for (let i = 0; i < 20; i++) {
    const v = readJsonFile(VOCAB_FILE, {}, { fatal: false });
    if (v) return v;
    spawnSync("sleep", ["0.5"]);
  }
  return readJsonFile(VOCAB_FILE, {});   // still unreadable: report it and stop
}
let vocab = normalizeVocab(readVocabAtStart());
let vocabRaw = fs.existsSync(VOCAB_FILE) ? fs.readFileSync(VOCAB_FILE, "utf8") : null;   // the file as we last read or wrote it
let rev = 1;   // bumps whenever the vocabulary changes; the page polls it to pick up the other person's words

function normalizeVocab(v) {
  v = v && typeof v === "object" ? v : {};
  return { version: 1, words: v.words || {}, deleted: v.deleted || {} };
}

function mergeInto(base, other) {
  let changed = false;
  for (const [id, ts] of Object.entries(other.deleted || {})) {
    if (!base.deleted[id] || base.deleted[id] < ts) { base.deleted[id] = ts; changed = true; }
  }
  for (const [id, w] of Object.entries(other.words || {})) {
    const mine = base.words[id], ts = w.updated || "";
    if (base.deleted[id] && base.deleted[id] >= ts) continue;
    if (!mine || ts > (mine.updated || "")) { base.words[id] = w; changed = true; }
  }
  for (const [id, ts] of Object.entries(base.deleted)) {
    if (base.words[id] && (base.words[id].updated || "") <= ts) { delete base.words[id]; changed = true; }
  }
  return changed;
}

function pruneTombstones() {
  const cutoff = new Date(Date.now() - TOMBSTONE_DAYS * 864e5).toISOString();
  for (const [id, ts] of Object.entries(vocab.deleted)) if (ts < cutoff) delete vocab.deleted[id];
}

// Pick up changes iCloud (or the other person's server) brought in, and fold in any
// conflict copies. If the file on disk lacks something only we have — because another
// save overwrote ours a moment after we wrote it — write the merged result back, so
// both sides end up with everything.
function refreshVocab() {
  let changed = false;
  ensureLocal(VOCAB_FILE);
  let raw = null;
  try { raw = fs.readFileSync(VOCAB_FILE, "utf8"); } catch {}
  if (raw !== null && raw !== vocabRaw) {
    let disk = null;
    try { disk = JSON.parse(raw); } catch {}   // half-synced file: try again on the next check
    if (disk) {
      const mine = vocab;
      vocab = normalizeVocab(disk);
      vocabRaw = raw;
      changed = true;
      if (mergeInto(vocab, mine)) writeVocabSync();
    }
  }
  // iCloud names conflicting copies "vocabulary 2.json", "vocabulary 3.json", …
  let conflicts = [];
  try { conflicts = fs.readdirSync(DATA_DIR).filter(f => /^vocabulary[ -].*\.json$/i.test(f)); } catch {}
  const merged = [];
  for (const f of conflicts) {
    const other = readJsonFile(path.join(DATA_DIR, f), null, { fatal: false });
    if (!other) continue;
    mergeInto(vocab, normalizeVocab(other));
    merged.push(f);
  }
  if (merged.length) {
    writeVocabSync();
    for (const f of merged) { try { fs.unlinkSync(path.join(DATA_DIR, f)); } catch {} }
    console.log(`Merged and removed iCloud conflict cop${merged.length === 1 ? "y" : "ies"}: ${merged.join(", ")}`);
    changed = true;
  }
  if (changed) rev++;
}

function writeVocabSync() {
  pruneTombstones();
  const text = JSON.stringify(vocab, null, 2) + "\n";
  const tmp = path.join(DATA_DIR, ".vocabulary.json.tmp-" + process.pid);
  fs.writeFileSync(tmp, text, "utf8");
  fs.renameSync(tmp, VOCAB_FILE);
  vocabRaw = text;
}

// Every change to the vocabulary: re-read the file first, change one word, write it back.
let vocabQueue = Promise.resolve();
function changeVocab(fn) {
  const run = vocabQueue.then(() => {
    refreshVocab();
    const before = rev;
    if (fn(vocab) === false) return { before, after: rev };
    writeVocabSync();
    rev++;
    return { before, after: rev };
  });
  vocabQueue = run.catch(() => {});
  return run;
}

// ---------- progress: one person's own file ----------
const progress = readJsonFile(PROGRESS_FILE, { version: 1, words: {}, history: { days: {} } });
progress.words = progress.words || {};
progress.history = { days: {}, ...(progress.history || {}) };
// Progress for a word that isn't in the vocabulary (yet, or any more) is kept but not shown.

let progressQueue = Promise.resolve();
function saveProgress() {
  const snapshot = JSON.parse(JSON.stringify(progress));
  progressQueue = progressQueue.then(() => writeFileAtomicSync(PROGRESS_FILE, snapshot)).catch(e => console.error("Couldn't save progress:", e.message));
  return progressQueue;
}

// The page works with whole words (dictionary + this person's progress together).
function mergedData() {
  const words = {};
  for (const [id, dict] of Object.entries(vocab.words)) words[id] = { ...dict, ...(progress.words[id] || {}) };
  return { version: 1, rev, user: USER, words, history: progress.history };
}

// ---------- http helpers ----------
function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(body === undefined ? "" : typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", c => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error("Request body too large"), { status: 413 })); req.destroy(); }
      else chunks.push(c);
    });
    req.on("end", () => {
      try {
        const v = JSON.parse(Buffer.concat(chunks).toString("utf8") || "null");
        if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("Expected a JSON object");
        resolve(v);
      } catch (e) { reject(Object.assign(e, { status: 400 })); }
    });
    req.on("error", reject);
  });
}

function setProgress(id, prog) {
  if (same(progress.words[id] || {}, prog)) return false;
  if (Object.keys(prog).length) progress.words[id] = prog; else delete progress.words[id];
  return true;
}

// ---------- routes ----------
async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || HOST}`);
  const p = url.pathname;

  if (req.method === "GET" && (p === "/" || p === "/index.html")) {
    return send(res, 200, await fs.promises.readFile(INDEX), "text/html; charset=utf-8");
  }

  if (p === "/api/data" && req.method === "GET") {
    await vocabQueue; refreshVocab();
    return send(res, 200, mergedData());
  }

  // Cheap check the page polls to notice words the other person added.
  if (p === "/api/version" && req.method === "GET") {
    await vocabQueue; refreshVocab();
    return send(res, 200, { rev });
  }

  // Article, plural, meaning and verb forms for a German word, from de.wiktionary.org.
  if (p === "/api/lookup" && req.method === "GET") {
    const word = (url.searchParams.get("word") || "").trim();
    if (!word || word.length > 60) return send(res, 400, "Give a German word to look up", "text/plain");
    try {
      return send(res, 200, { word, results: await lookup(word) });
    } catch (e) {
      return send(res, 502, `Couldn't reach Wiktionary: ${e.message}`, "text/plain");
    }
  }

  // Practising: only this person's progress changes; the shared vocabulary is not touched.
  const mp = p.match(/^\/api\/progress\/([^/]+)$/);
  if (mp && req.method === "PUT") {
    const id = decodeURIComponent(mp[1]);
    if (!ID_RE.test(id)) return send(res, 400, "Invalid word id", "text/plain");
    const { prog } = splitWord(await readJson(req));
    if (setProgress(id, prog)) await saveProgress();
    return send(res, 200, { rev, before: rev, after: rev });
  }

  const m = p.match(/^\/api\/words\/([^/]+)$/);
  if (m) {
    const id = decodeURIComponent(m[1]);
    if (!ID_RE.test(id)) return send(res, 400, "Invalid word id", "text/plain");

    // Adding or editing a word: the whole word as the page has it.
    if (req.method === "PUT") {
      const word = await readJson(req);
      if (typeof word.de !== "string" || typeof word.en !== "string") return send(res, 400, "A word needs 'de' and 'en'", "text/plain");
      const { dict, prog } = splitWord(word);
      const r = await changeVocab(v => {
        if (same(withoutUpdated(v.words[id]), withoutUpdated(dict))) return false;
        v.words[id] = { ...dict, updated: new Date().toISOString() };
        delete v.deleted[id];
      });
      if (setProgress(id, prog)) await saveProgress();
      return send(res, 200, r);
    }

    // Filling in a few fields (category, verb forms) without overwriting the rest,
    // which the other person may have just edited.
    if (req.method === "PATCH") {
      const fields = await readJson(req);
      const r = await changeVocab(v => {
        const cur = v.words[id];
        if (!cur) return false;   // deleted meanwhile
        const next = { ...cur };
        for (const k of Object.keys(fields)) if (DICT_FIELDS.includes(k) && k !== "updated") next[k] = fields[k];
        if (same(withoutUpdated(cur), withoutUpdated(next))) return false;
        v.words[id] = { ...next, updated: new Date().toISOString() };
      });
      return send(res, 200, r);
    }

    if (req.method === "DELETE") {
      const r = await changeVocab(v => {
        if (!(id in v.words)) return false;
        delete v.words[id];
        v.deleted[id] = new Date().toISOString();
      });
      if (id in progress.words) { delete progress.words[id]; await saveProgress(); }
      return send(res, 200, r);
    }
  }

  if (p === "/api/history" && req.method === "PUT") {
    const body = await readJson(req);
    if (!body.days || typeof body.days !== "object") return send(res, 400, "Expected { days: {...} }", "text/plain");
    progress.history = { days: body.days };
    await saveProgress();
    return send(res, 200, { rev, before: rev, after: rev });
  }

  send(res, 404, "Not found", "text/plain");
}

const server = http.createServer((req, res) => {
  // Only accept requests addressed to this machine (guards against DNS rebinding).
  const host = (req.headers.host || "").replace(/:\d+$/, "");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(host)) return send(res, 403, "Forbidden", "text/plain");
  handle(req, res).catch(e => send(res, e.status || 500, e.message || "Server error", "text/plain"));
});

refreshVocab();   // fold in any conflict copies left from last time
// Keep checking even when no page is open, so a word overwritten by the other side is restored quickly.
setInterval(() => { vocabQueue = vocabQueue.then(refreshVocab).catch(e => console.error("Couldn't check vocabulary.json:", e.message)); }, 5000).unref();
server.listen(PORT, HOST, () => {
  const n = Object.keys(vocab.words).length, tracked = Object.keys(progress.words).length;
  console.log(`Wortschatz is running at http://localhost:${PORT}`);
  console.log(`Vocabulary: ${VOCAB_FILE} (${n} word${n === 1 ? "" : "s"})`);
  console.log(`Progress:   ${PROGRESS_FILE} (${tracked} word${tracked === 1 ? "" : "s"} practised, user "${USER}")`);
});
