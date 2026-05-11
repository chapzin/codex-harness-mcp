import path from "node:path";

let sqliteModule = null;
let sqliteImportError = null;
try {
  sqliteModule = await import("node:sqlite");
} catch (err) {
  sqliteImportError = err;
}

const NODE_22_REQUIRED =
  "FTS5 index requires node:sqlite (Node.js >= 22.5). Upgrade Node or use queryKnowledge (BM25+RRF backend) instead.";

const SCHEMA_SQL = `
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(
  item_id UNINDEXED,
  title,
  summary,
  content,
  tags,
  kind,
  tokenize='porter unicode61'
);
`;

const connections = new Map();

function requireSqlite() {
  if (sqliteModule && sqliteModule.DatabaseSync) return sqliteModule.DatabaseSync;
  const detail = sqliteImportError ? ` (${sqliteImportError.message})` : "";
  throw new Error(`${NODE_22_REQUIRED}${detail}`);
}

export function isFtsAvailable() {
  return sqliteModule !== null && typeof sqliteModule.DatabaseSync === "function";
}

export function openFtsIndex(harnessRoot) {
  const dbPath = path.join(harnessRoot, "fts.db");
  const cached = connections.get(dbPath);
  if (cached) return cached;
  const DatabaseSync = requireSqlite();
  const db = new DatabaseSync(dbPath);
  db.exec(SCHEMA_SQL);
  connections.set(dbPath, db);
  return db;
}

export function closeFtsIndex(harnessRoot) {
  const dbPath = path.join(harnessRoot, "fts.db");
  const db = connections.get(dbPath);
  if (!db) return;
  try {
    db.close();
  } catch {
    // ignore
  }
  connections.delete(dbPath);
}

function knowledgeTexts(item) {
  return {
    itemId: item.id,
    title: item.title || "",
    summary: item.summary || "",
    content: item.content || "",
    tags: Array.isArray(item.tags) ? item.tags.join(" ") : "",
    kind: item.kind || ""
  };
}

export function upsertKnowledgeFts(harnessRoot, item) {
  if (!item || !item.id) return;
  const db = openFtsIndex(harnessRoot);
  const del = db.prepare("DELETE FROM knowledge_fts WHERE item_id = ?");
  del.run(item.id);
  const ins = db.prepare(
    `INSERT INTO knowledge_fts (item_id, title, summary, content, tags, kind)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const texts = knowledgeTexts(item);
  ins.run(texts.itemId, texts.title, texts.summary, texts.content, texts.tags, texts.kind);
}

export function rebuildKnowledgeFts(harnessRoot, items) {
  const db = openFtsIndex(harnessRoot);
  db.exec("DELETE FROM knowledge_fts");
  const ins = db.prepare(
    `INSERT INTO knowledge_fts (item_id, title, summary, content, tags, kind)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  let count = 0;
  for (const item of items || []) {
    if (!item || !item.id) continue;
    const texts = knowledgeTexts(item);
    ins.run(texts.itemId, texts.title, texts.summary, texts.content, texts.tags, texts.kind);
    count++;
  }
  return count;
}

function sanitizeFtsQuery(rawQuery) {
  if (typeof rawQuery !== "string") return "";
  const trimmed = rawQuery.trim();
  if (!trimmed) return "";
  // Tokenize: keep alphanumeric / underscore, drop FTS5 operators (AND, OR, NOT, NEAR, parens,
  // quotes, asterisks, colons, minus). Then wrap each token in double quotes to neutralize
  // remaining metacharacters and join with spaces (implicit AND).
  const tokens = trimmed
    .toLowerCase()
    .split(/[^a-z0-9_]+/g)
    .filter((token) => token.length >= 2);
  if (tokens.length === 0) return "";
  // Limit to 32 tokens to bound query cost
  const bounded = tokens.slice(0, 32);
  return bounded.map((token) => `"${token.replace(/"/g, "")}"`).join(" OR ");
}

export function queryKnowledgeFtsBackend(harnessRoot, query, limit = 5) {
  const db = openFtsIndex(harnessRoot);
  const sanitized = sanitizeFtsQuery(query);
  if (!sanitized) return [];
  const cappedLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 50) : 5;
  try {
    const stmt = db.prepare(
      `SELECT item_id, bm25(knowledge_fts) AS score
       FROM knowledge_fts
       WHERE knowledge_fts MATCH ?
       ORDER BY score ASC
       LIMIT ?`
    );
    const rows = stmt.all(sanitized, cappedLimit);
    return rows.map((row) => ({
      itemId: row.item_id,
      score: typeof row.score === "number" ? row.score : Number(row.score) || 0
    }));
  } catch {
    return [];
  }
}
