#!/usr/bin/env node
// Wortschatz — a tiny local server for the vocabulary trainer.
// Serves index.html and keeps your data in two files next to this one:
//
//   vocabulary.json  the words themselves (German, article, plural, English, note).
//                    Safe to share: it holds nothing about how you're doing.
//   progress.json    your boxes, due dates, right/wrong counts and daily history.
//                    Delete it (with the server stopped) to start your statistics over.
//
// No dependencies; needs Node 18 or newer.
//
//   node server.js            # http://localhost:4747
//   PORT=5000 node server.js  # another port

"use strict";
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { lookup } = require("./lookup");

const DIR = __dirname;
const VOCAB_FILE = path.join(DIR, "vocabulary.json");
const PROGRESS_FILE = path.join(DIR, "progress.json");
const LEGACY_FILE = path.join(DIR, "words.json");        // the single file used before the split
const INDEX = path.join(DIR, "index.html");
const PORT = Number(process.env.PORT) || 4747;
const HOST = "127.0.0.1";
const MAX_BODY = 1024 * 1024;
const ID_RE = /^w_[a-z0-9]{1,40}$/;

// Fields that describe the word itself. Everything else on a word is progress.
const DICT_FIELDS = ["article", "de", "en", "plural", "category", "forms", "note", "created"];

// ---------- files ----------
function readJsonFile(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    // Never overwrite a file we couldn't read; the user may want to fix it by hand.
    console.error(`Could not parse ${path.basename(file)}: ${e.message}`);
    console.error("Fix or move the file, then start the server again.");
    process.exit(1);
  }
}

function splitWord(word) {
  const dict = {}, prog = {};
  for (const [k, v] of Object.entries(word)) (DICT_FIELDS.includes(k) ? dict : prog)[k] = v;
  return { dict, prog };
}

// One-time move from words.json to vocabulary.json + progress.json.
// The old file is kept as words.json.bak.
function migrateLegacy() {
  if (fs.existsSync(VOCAB_FILE) || !fs.existsSync(LEGACY_FILE)) return;
  const old = readJsonFile(LEGACY_FILE, {});
  const vocab = { version: 1, words: {} }, progress = { version: 1, words: {}, history: { days: {} } };
  for (const [id, w] of Object.entries(old.words || {})) {
    const { dict, prog } = splitWord(w);
    vocab.words[id] = dict;
    if (Object.keys(prog).length) progress.words[id] = prog;
  }
  progress.history = { days: {}, ...(old.history || {}) };
  writeFileAtomicSync(VOCAB_FILE, vocab);
  if (!fs.existsSync(PROGRESS_FILE)) writeFileAtomicSync(PROGRESS_FILE, progress);
  fs.renameSync(LEGACY_FILE, LEGACY_FILE + ".bak");
  console.log(`Moved ${Object.keys(vocab.words).length} words from words.json into vocabulary.json and progress.json (old file kept as words.json.bak).`);
}

function writeFileAtomicSync(file, data) {
  fs.writeFileSync(file + ".tmp", JSON.stringify(data, null, 2) + "\n", "utf8");
  fs.renameSync(file + ".tmp", file);
}

migrateLegacy();

const vocab = readJsonFile(VOCAB_FILE, { version: 1, words: {} });
vocab.words = vocab.words || {};
const progress = readJsonFile(PROGRESS_FILE, { version: 1, words: {}, history: { days: {} } });
progress.words = progress.words || {};
progress.history = { days: {}, ...(progress.history || {}) };

// Progress for words that are no longer in the vocabulary (deleted, or a different
// vocabulary.json was dropped in) is ignored and dropped on the next save.
for (const id of Object.keys(progress.words)) if (!(id in vocab.words)) delete progress.words[id];

// Writes are serialized per file and atomic (write a temp file, then rename over the old one).
const writing = {};
function save(file, data) {
  const snapshot = JSON.stringify(data, null, 2) + "\n";
  writing[file] = (writing[file] || Promise.resolve()).then(async () => {
    await fs.promises.writeFile(file + ".tmp", snapshot, "utf8");
    await fs.promises.rename(file + ".tmp", file);
  });
  return writing[file];
}
const saveVocab = () => save(VOCAB_FILE, vocab);
const saveProgress = () => save(PROGRESS_FILE, progress);

// The page works with whole words (dictionary + progress fields together).
function mergedData() {
  const words = {};
  for (const [id, dict] of Object.entries(vocab.words)) words[id] = { ...dict, ...(progress.words[id] || {}) };
  return { version: 1, words, history: progress.history };
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

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

// ---------- routes ----------
async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || HOST}`);
  const p = url.pathname;

  if (req.method === "GET" && (p === "/" || p === "/index.html")) {
    return send(res, 200, await fs.promises.readFile(INDEX), "text/html; charset=utf-8");
  }

  if (p === "/api/data" && req.method === "GET") {
    return send(res, 200, mergedData());
  }

  // Article, plural and meaning for a German word, from de.wiktionary.org.
  if (p === "/api/lookup" && req.method === "GET") {
    const word = (url.searchParams.get("word") || "").trim();
    if (!word || word.length > 60) return send(res, 400, "Give a German word to look up", "text/plain");
    try {
      return send(res, 200, { word, results: await lookup(word) });
    } catch (e) {
      return send(res, 502, `Couldn't reach Wiktionary: ${e.message}`, "text/plain");
    }
  }

  const m = p.match(/^\/api\/words\/([^/]+)$/);
  if (m) {
    const id = decodeURIComponent(m[1]);
    if (!ID_RE.test(id)) return send(res, 400, "Invalid word id", "text/plain");
    if (req.method === "PUT") {
      const word = await readJson(req);
      if (typeof word.de !== "string" || typeof word.en !== "string") return send(res, 400, "A word needs 'de' and 'en'", "text/plain");
      // Only rewrite the file whose part actually changed: practising touches
      // progress.json only, so vocabulary.json stays stable for sharing.
      const { dict, prog } = splitWord(word);
      const writes = [];
      if (!same(vocab.words[id], dict)) { vocab.words[id] = dict; writes.push(saveVocab()); }
      if (!same(progress.words[id] || {}, prog)) {
        if (Object.keys(prog).length) progress.words[id] = prog; else delete progress.words[id];
        writes.push(saveProgress());
      }
      await Promise.all(writes);
      return send(res, 204);
    }
    if (req.method === "DELETE") {
      const writes = [];
      if (id in vocab.words) { delete vocab.words[id]; writes.push(saveVocab()); }
      if (id in progress.words) { delete progress.words[id]; writes.push(saveProgress()); }
      await Promise.all(writes);
      return send(res, 204);
    }
  }

  if (p === "/api/history" && req.method === "PUT") {
    const body = await readJson(req);
    if (!body.days || typeof body.days !== "object") return send(res, 400, "Expected { days: {...} }", "text/plain");
    progress.history = { days: body.days };
    await saveProgress();
    return send(res, 204);
  }

  send(res, 404, "Not found", "text/plain");
}

const server = http.createServer((req, res) => {
  // Only accept requests addressed to this machine (guards against DNS rebinding).
  const host = (req.headers.host || "").replace(/:\d+$/, "");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(host)) return send(res, 403, "Forbidden", "text/plain");
  handle(req, res).catch(e => send(res, e.status || 500, e.message || "Server error", "text/plain"));
});

server.listen(PORT, HOST, () => {
  const n = Object.keys(vocab.words).length, tracked = Object.keys(progress.words).length;
  console.log(`Wortschatz is running at http://localhost:${PORT}`);
  console.log(`Vocabulary: ${VOCAB_FILE} (${n} word${n === 1 ? "" : "s"})`);
  console.log(`Progress:   ${PROGRESS_FILE} (${tracked} word${tracked === 1 ? "" : "s"} practised)`);
});
