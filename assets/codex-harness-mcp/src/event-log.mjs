import path from "node:path";

let sqliteModule = null;
let sqliteImportError = null;
try {
  sqliteModule = await import("node:sqlite");
} catch (err) {
  sqliteImportError = err;
}

const NODE_22_REQUIRED =
  "Event log requires node:sqlite (Node.js >= 22.5). Upgrade Node or disable event log usage.";

const SCHEMA_SQL = `
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS events (
  event_id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  contract_id TEXT,
  kind TEXT NOT NULL,
  summary TEXT,
  payload_json TEXT,
  parent_event_id INTEGER REFERENCES events(event_id)
);
CREATE INDEX IF NOT EXISTS idx_events_contract ON events(contract_id);
CREATE INDEX IF NOT EXISTS idx_events_kind ON events(kind);
CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);
`;

const connections = new Map();

function requireSqlite() {
  if (sqliteModule && sqliteModule.DatabaseSync) return sqliteModule.DatabaseSync;
  const detail = sqliteImportError ? ` (${sqliteImportError.message})` : "";
  throw new Error(`${NODE_22_REQUIRED}${detail}`);
}

export function openEventLog(harnessRoot) {
  const dbPath = path.join(harnessRoot, "events.db");
  const cached = connections.get(dbPath);
  if (cached) return cached;
  const DatabaseSync = requireSqlite();
  const db = new DatabaseSync(dbPath);
  db.exec(SCHEMA_SQL);
  connections.set(dbPath, db);
  return db;
}

export function closeEventLog(harnessRoot) {
  const dbPath = path.join(harnessRoot, "events.db");
  const db = connections.get(dbPath);
  if (!db) return;
  try {
    db.close();
  } catch {
    // ignore
  }
  connections.delete(dbPath);
}

export function isEventLogAvailable() {
  return sqliteModule !== null && typeof sqliteModule.DatabaseSync === "function";
}

function serializePayload(payload) {
  if (payload === undefined || payload === null) return null;
  if (typeof payload === "string") return payload;
  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
}

function deserializePayload(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function rowToEvent(row) {
  if (!row) return null;
  return {
    eventId: row.event_id,
    ts: row.ts,
    contractId: row.contract_id ?? null,
    kind: row.kind,
    summary: row.summary ?? null,
    payload: deserializePayload(row.payload_json),
    parentEventId: row.parent_event_id ?? null
  };
}

export function appendEvent(harnessRoot, entry) {
  const db = openEventLog(harnessRoot);
  const stmt = db.prepare(
    `INSERT INTO events (ts, contract_id, kind, summary, payload_json, parent_event_id)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const ts = entry.ts || new Date().toISOString();
  const info = stmt.run(
    ts,
    entry.contractId ?? null,
    entry.kind,
    entry.summary ?? null,
    serializePayload(entry.payload),
    entry.parentEventId ?? null
  );
  const insertedId =
    typeof info.lastInsertRowid === "bigint"
      ? Number(info.lastInsertRowid)
      : info.lastInsertRowid;
  return {
    eventId: insertedId,
    ts,
    contractId: entry.contractId ?? null,
    kind: entry.kind,
    summary: entry.summary ?? null,
    payload: deserializePayload(serializePayload(entry.payload)),
    parentEventId: entry.parentEventId ?? null
  };
}

export function queryEventLog(harnessRoot, filters = {}) {
  const db = openEventLog(harnessRoot);
  const where = [];
  const params = [];
  if (filters.contractId) {
    where.push("contract_id = ?");
    params.push(filters.contractId);
  }
  if (filters.kind) {
    where.push("kind = ?");
    params.push(filters.kind);
  }
  if (Number.isInteger(filters.sinceId) && filters.sinceId > 0) {
    where.push("event_id > ?");
    params.push(filters.sinceId);
  }
  if (typeof filters.sinceTs === "string" && filters.sinceTs.length > 0) {
    where.push("ts >= ?");
    params.push(filters.sinceTs);
  }
  const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  const limit = Number.isInteger(filters.limit) && filters.limit > 0 ? Math.min(filters.limit, 1000) : 100;
  const stmt = db.prepare(
    `SELECT event_id, ts, contract_id, kind, summary, payload_json, parent_event_id
     FROM events
     ${whereClause}
     ORDER BY event_id ASC
     LIMIT ?`
  );
  const rows = stmt.all(...params, limit);
  return rows.map(rowToEvent);
}
