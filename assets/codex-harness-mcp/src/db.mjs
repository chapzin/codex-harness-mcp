import path from "node:path";
import { promises as fs } from "node:fs";

let sqliteModule = null;
let sqliteImportError = null;
try {
  sqliteModule = await import("node:sqlite");
} catch (err) {
  sqliteImportError = err;
}

const NODE_22_REQUIRED =
  "Harness DB requires node:sqlite (Node.js >= 22.5). Upgrade Node or run integrity/migrate tools only on Node 22+.";

const CURRENT_SCHEMA_VERSION = 1;

export const TABLE_NAMES = [
  "contracts",
  "traces",
  "gates",
  "verifications",
  "knowledge_items",
  "state_snapshots",
  "harness_profiles",
  "harness_proposals",
  "eval_cases",
  "eval_runs",
  "promotion_decisions",
  "a2a_delegations",
  "orchestration_plans",
  "subagent_handoffs",
  "subagent_dispatches",
  "subagent_completions",
  "sampling_interactions",
  "elicitation_interactions",
  "lessons",
  "research_notes"
];

const SCHEMA_SQL = `
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contracts (
  contract_id TEXT PRIMARY KEY,
  title TEXT,
  goal TEXT,
  status TEXT,
  created_at TEXT,
  parent_contract_id TEXT,
  payload_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  mirrored_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status);
CREATE INDEX IF NOT EXISTS idx_contracts_parent ON contracts(parent_contract_id);

CREATE TABLE IF NOT EXISTS traces (
  trace_id TEXT PRIMARY KEY,
  contract_id TEXT,
  ts TEXT,
  tool_name TEXT,
  payload_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  mirrored_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_traces_contract ON traces(contract_id);
CREATE INDEX IF NOT EXISTS idx_traces_ts ON traces(ts);

CREATE TABLE IF NOT EXISTS gates (
  gate_id TEXT PRIMARY KEY,
  contract_id TEXT,
  verdict TEXT,
  decided_at TEXT,
  payload_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  mirrored_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gates_contract ON gates(contract_id);

CREATE TABLE IF NOT EXISTS verifications (
  verification_id TEXT PRIMARY KEY,
  contract_id TEXT,
  status TEXT,
  recorded_at TEXT,
  payload_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  mirrored_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_verifications_contract ON verifications(contract_id);

CREATE TABLE IF NOT EXISTS knowledge_items (
  item_id TEXT PRIMARY KEY,
  kind TEXT,
  title TEXT,
  recorded_at TEXT,
  payload_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  mirrored_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_knowledge_kind ON knowledge_items(kind);

CREATE TABLE IF NOT EXISTS state_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  taken_at TEXT,
  payload_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  mirrored_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS harness_profiles (
  profile_id TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  mirrored_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS harness_proposals (
  proposal_id TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  mirrored_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS eval_cases (
  case_id TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  mirrored_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS eval_runs (
  run_id TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  mirrored_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS promotion_decisions (
  decision_id TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  mirrored_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS a2a_delegations (
  delegation_id TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  mirrored_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS orchestration_plans (
  plan_id TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  mirrored_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subagent_handoffs (
  handoff_id TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  mirrored_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subagent_dispatches (
  dispatch_id TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  mirrored_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subagent_completions (
  completion_id TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  mirrored_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sampling_interactions (
  interaction_id TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  mirrored_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS elicitation_interactions (
  interaction_id TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  mirrored_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lessons (
  lesson_id TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  mirrored_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS research_notes (
  research_id TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  mirrored_at TEXT NOT NULL
);
`;

const TABLE_PK = {
  contracts: "contract_id",
  traces: "trace_id",
  gates: "gate_id",
  verifications: "verification_id",
  knowledge_items: "item_id",
  state_snapshots: "snapshot_id",
  harness_profiles: "profile_id",
  harness_proposals: "proposal_id",
  eval_cases: "case_id",
  eval_runs: "run_id",
  promotion_decisions: "decision_id",
  a2a_delegations: "delegation_id",
  orchestration_plans: "plan_id",
  subagent_handoffs: "handoff_id",
  subagent_dispatches: "dispatch_id",
  subagent_completions: "completion_id",
  sampling_interactions: "interaction_id",
  elicitation_interactions: "interaction_id",
  lessons: "lesson_id",
  research_notes: "research_id"
};

const COLUMN_EXTRACTORS = {
  contracts: (row) => ({
    title: row.title ?? null,
    goal: row.goal ?? null,
    status: row.status ?? null,
    created_at: row.createdAt ?? row.created_at ?? null,
    parent_contract_id: row.parentContractId ?? row.parent_contract_id ?? null
  }),
  traces: (row) => ({
    contract_id: row.contractId ?? row.contract_id ?? null,
    ts: row.ts ?? null,
    tool_name: row.toolName ?? row.tool_name ?? null
  }),
  gates: (row) => ({
    contract_id: row.contractId ?? row.contract_id ?? null,
    verdict: row.verdict ?? null,
    decided_at: row.decidedAt ?? row.decided_at ?? row.recordedAt ?? null
  }),
  verifications: (row) => ({
    contract_id: row.contractId ?? row.contract_id ?? null,
    status: row.status ?? null,
    recorded_at: row.recordedAt ?? row.recorded_at ?? null
  }),
  knowledge_items: (row) => ({
    kind: row.kind ?? null,
    title: row.title ?? null,
    recorded_at: row.recordedAt ?? row.recorded_at ?? null
  }),
  state_snapshots: (row) => ({
    taken_at: row.takenAt ?? row.taken_at ?? null
  })
};

const connections = new Map();

function requireSqlite() {
  if (sqliteModule && sqliteModule.DatabaseSync) return sqliteModule.DatabaseSync;
  const detail = sqliteImportError ? ` (${sqliteImportError.message})` : "";
  throw new Error(`${NODE_22_REQUIRED}${detail}`);
}

export function isSqliteAvailable() {
  return sqliteModule !== null && typeof sqliteModule.DatabaseSync === "function";
}

export function harnessDbPath(harnessRoot) {
  return path.join(harnessRoot, "harness.db");
}

export function openHarnessDb(harnessRoot) {
  const dbPath = harnessDbPath(harnessRoot);
  const cached = connections.get(dbPath);
  if (cached) return cached;
  const DatabaseSync = requireSqlite();
  const db = new DatabaseSync(dbPath);
  db.exec(SCHEMA_SQL);
  const versionRow = db.prepare("SELECT MAX(version) AS v FROM schema_version").get();
  if (!versionRow || versionRow.v == null || Number(versionRow.v) < CURRENT_SCHEMA_VERSION) {
    db.prepare("INSERT OR IGNORE INTO schema_version (version, applied_at) VALUES (?, ?)").run(
      CURRENT_SCHEMA_VERSION,
      new Date().toISOString()
    );
  }
  connections.set(dbPath, db);
  return db;
}

export function closeHarnessDb(harnessRoot) {
  const dbPath = harnessDbPath(harnessRoot);
  const db = connections.get(dbPath);
  if (!db) return;
  try {
    db.close();
  } catch {
    // ignore
  }
  connections.delete(dbPath);
}

const migratedRoots = new Set();

export function hasBeenMigrated(harnessRoot) {
  return migratedRoots.has(harnessRoot);
}

export function resetMigrationCache(harnessRoot) {
  if (harnessRoot) {
    migratedRoots.delete(harnessRoot);
  } else {
    migratedRoots.clear();
  }
}

export async function ensureProjectMigrated(harnessRoot) {
  if (!isSqliteAvailable()) return;
  if (migratedRoots.has(harnessRoot)) return;
  try {
    const db = openHarnessDb(harnessRoot);
    const stateRow = db.prepare("SELECT 1 AS x FROM state_snapshots WHERE snapshot_id = 'current'").get();
    if (!stateRow) {
      const stateFile = path.join(harnessRoot, "state.json");
      try {
        await fs.access(stateFile);
        await migrateFromJson(harnessRoot);
      } catch {
        // no JSON to migrate from; first-run case
      }
    }
  } catch {
    // best-effort; do not block reads on migration failure
  }
  migratedRoots.add(harnessRoot);
}

function normalizeId(value) {
  if (value === null || value === undefined) return null;
  return String(value);
}

function bigIntToNumber(v) {
  if (typeof v === "bigint") return Number(v);
  return v;
}

export function readState(harnessRoot) {
  if (!isSqliteAvailable()) return null;
  const db = openHarnessDb(harnessRoot);
  const row = db
    .prepare("SELECT payload_json FROM state_snapshots WHERE snapshot_id = 'current'")
    .get();
  if (!row || !row.payload_json) return null;
  try {
    const parsed = JSON.parse(row.payload_json);
    if (parsed && typeof parsed === "object" && parsed.state && typeof parsed.state === "object" && !Array.isArray(parsed.events)) {
      return parsed.state;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeState(harnessRoot, state) {
  if (!isSqliteAvailable()) {
    throw new Error(NODE_22_REQUIRED);
  }
  const db = openHarnessDb(harnessRoot);
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO state_snapshots
      (snapshot_id, taken_at, payload_json, schema_version, mirrored_at)
     VALUES (?, ?, ?, ?, ?)`
  );
  const nowTs = new Date().toISOString();
  const info = stmt.run(
    "current",
    nowTs,
    JSON.stringify(state),
    CURRENT_SCHEMA_VERSION,
    nowTs
  );
  return { ok: true, rowsAffected: bigIntToNumber(info.changes) };
}

export function mirrorToDb(harnessRoot, table, row) {
  if (!TABLE_PK[table]) {
    throw new Error(`Unknown mirror table: ${table}`);
  }
  if (!row || typeof row !== "object") {
    throw new Error(`Mirror row must be an object for table ${table}`);
  }
  const db = openHarnessDb(harnessRoot);
  const pkCol = TABLE_PK[table];
  const naturalId = normalizeId(row.id ?? row[pkCol]);
  if (!naturalId) {
    throw new Error(`Mirror row for ${table} requires an id (got: ${JSON.stringify(row).slice(0, 80)})`);
  }
  const extractor = COLUMN_EXTRACTORS[table];
  const extras = extractor ? extractor(row) : {};
  const cols = [pkCol, ...Object.keys(extras), "payload_json", "schema_version", "mirrored_at"];
  const placeholders = cols.map(() => "?").join(", ");
  const values = [
    naturalId,
    ...Object.values(extras),
    JSON.stringify(row),
    CURRENT_SCHEMA_VERSION,
    new Date().toISOString()
  ];
  const sql = `INSERT OR REPLACE INTO ${table} (${cols.join(", ")}) VALUES (${placeholders})`;
  const stmt = db.prepare(sql);
  const info = stmt.run(...values);
  return {
    ok: true,
    table,
    rowId: naturalId,
    rowsAffected: bigIntToNumber(info.changes)
  };
}

async function readJsonFilesIn(dirPath) {
  let entries = [];
  try {
    entries = await fs.readdir(dirPath);
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
  const out = [];
  for (const name of entries) {
    if (!name.endsWith(".json")) continue;
    const filePath = path.join(dirPath, name);
    try {
      const raw = await fs.readFile(filePath, "utf8");
      const parsed = JSON.parse(raw);
      out.push({ id: name.replace(/\.json$/i, ""), data: parsed, path: filePath });
    } catch {
      // skip unreadable / malformed
    }
  }
  return out;
}

async function readJsonlIn(filePath) {
  const out = [];
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const lines = raw.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        out.push(JSON.parse(trimmed));
      } catch {
        // skip malformed
      }
    }
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  return out;
}

async function listTraceJsonl(harnessRoot) {
  const tracesDir = path.join(harnessRoot, "traces");
  try {
    const names = await fs.readdir(tracesDir);
    return names.filter((n) => n.endsWith(".jsonl")).map((n) => path.join(tracesDir, n));
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}

const TABLE_DIRS = {
  contracts: ["contracts"],
  gates: ["gates"],
  knowledge_items: ["knowledge", "items"],
  harness_profiles: ["harness-profiles"],
  harness_proposals: ["harness-proposals"],
  eval_cases: ["evals", "cases"],
  eval_runs: ["evals", "runs"],
  promotion_decisions: ["promotion-decisions"]
};

function resolveTableDir(harnessRoot, table) {
  const parts = TABLE_DIRS[table];
  if (!parts) return null;
  return path.join(harnessRoot, ...parts);
}

async function listJsonIdsForTable(harnessRoot, table) {
  if (table === "traces") {
    const files = await listTraceJsonl(harnessRoot);
    const ids = new Set();
    for (const f of files) {
      const lines = await readJsonlIn(f);
      for (const entry of lines) {
        const id = entry.id || entry.traceId;
        if (id) ids.add(String(id));
      }
    }
    return [...ids];
  }
  if (table === "state_snapshots") {
    const stateFile = path.join(harnessRoot, "state.json");
    try {
      await fs.access(stateFile);
      return ["current"];
    } catch {
      return [];
    }
  }
  const dir = resolveTableDir(harnessRoot, table);
  if (!dir) return [];
  const items = await readJsonFilesIn(dir);
  return items.map((i) => i.data?.id || i.id).filter(Boolean).map(String);
}

async function loadJsonRowsForTable(harnessRoot, table) {
  if (table === "traces") {
    const files = await listTraceJsonl(harnessRoot);
    const rows = [];
    for (const f of files) {
      const lines = await readJsonlIn(f);
      for (const entry of lines) {
        if (entry && (entry.id || entry.traceId)) {
          rows.push({ ...entry, id: entry.id || entry.traceId });
        }
      }
    }
    return rows;
  }
  if (table === "state_snapshots") {
    const stateFile = path.join(harnessRoot, "state.json");
    try {
      const raw = await fs.readFile(stateFile, "utf8");
      const parsed = JSON.parse(raw);
      return [{ id: "current", takenAt: new Date().toISOString(), state: parsed }];
    } catch (err) {
      if (err.code === "ENOENT") return [];
      throw err;
    }
  }
  const dir = resolveTableDir(harnessRoot, table);
  if (!dir) return [];
  const items = await readJsonFilesIn(dir);
  return items.map((i) => ({ ...i.data, id: i.data?.id || i.id }));
}

const MIRRORABLE_TABLES = [
  "contracts",
  "traces",
  "gates",
  "knowledge_items",
  "state_snapshots",
  "harness_profiles",
  "harness_proposals",
  "eval_cases",
  "eval_runs",
  "promotion_decisions"
];

export async function checkIntegrity(harnessRoot, options = {}) {
  if (!isSqliteAvailable()) {
    return {
      ok: false,
      sqliteAvailable: false,
      reason: NODE_22_REQUIRED,
      tables: []
    };
  }
  const deep = options.deep === true;
  const db = openHarnessDb(harnessRoot);
  const tables = [];
  let allOk = true;

  for (const table of MIRRORABLE_TABLES) {
    const pkCol = TABLE_PK[table];
    const sqliteIds = new Set(
      db.prepare(`SELECT ${pkCol} AS id FROM ${table}`).all().map((r) => String(r.id))
    );
    const jsonIds = new Set((await listJsonIdsForTable(harnessRoot, table)).map(String));

    const missingInJson = [];
    for (const id of sqliteIds) {
      if (!jsonIds.has(id)) missingInJson.push(id);
    }
    const missingInSqlite = [];
    for (const id of jsonIds) {
      if (!sqliteIds.has(id)) missingInSqlite.push(id);
    }

    const contentMismatch = [];
    if (deep) {
      const overlap = [...jsonIds].filter((id) => sqliteIds.has(id));
      const jsonRows = await loadJsonRowsForTable(harnessRoot, table);
      const jsonIndex = new Map(jsonRows.map((r) => [String(r.id), r]));
      for (const id of overlap) {
        const jsonRow = jsonIndex.get(id);
        const sqliteRow = db
          .prepare(`SELECT payload_json FROM ${table} WHERE ${pkCol} = ?`)
          .get(id);
        if (!sqliteRow || !jsonRow) continue;
        try {
          const sqliteParsed = JSON.parse(sqliteRow.payload_json);
          if (JSON.stringify(sqliteParsed) !== JSON.stringify(jsonRow)) {
            contentMismatch.push(id);
          }
        } catch {
          contentMismatch.push(id);
        }
      }
    }

    const sampleSize = deep ? jsonIds.size : Math.min(5, jsonIds.size);
    const tableOk =
      missingInJson.length === 0 &&
      missingInSqlite.length === 0 &&
      contentMismatch.length === 0;
    if (!tableOk) allOk = false;
    tables.push({
      name: table,
      jsonCount: jsonIds.size,
      sqliteCount: sqliteIds.size,
      countDelta: sqliteIds.size - jsonIds.size,
      sampleSize,
      missingInJson,
      missingInSqlite,
      contentMismatch,
      ok: tableOk
    });
  }

  let pragmaResult = null;
  try {
    const rows = db.prepare(deep ? "PRAGMA integrity_check" : "PRAGMA quick_check").all();
    pragmaResult = rows.map((r) => Object.values(r)[0]).join("; ");
    if (pragmaResult !== "ok") allOk = false;
  } catch (err) {
    pragmaResult = `pragma_failed: ${err.message}`;
    allOk = false;
  }

  return {
    ok: allOk,
    sqliteAvailable: true,
    deep,
    pragmaResult,
    tables
  };
}

export async function migrateFromJson(harnessRoot) {
  if (!isSqliteAvailable()) {
    return { ok: false, sqliteAvailable: false, reason: NODE_22_REQUIRED, tables: [] };
  }
  const summary = [];
  for (const table of MIRRORABLE_TABLES) {
    if (table === "state_snapshots") {
      const stateFile = path.join(harnessRoot, "state.json");
      let mirrored = 0;
      let failed = 0;
      try {
        const raw = await fs.readFile(stateFile, "utf8");
        const parsed = JSON.parse(raw);
        writeState(harnessRoot, parsed);
        mirrored = 1;
      } catch (err) {
        if (err.code !== "ENOENT") failed = 1;
      }
      summary.push({ table, candidates: mirrored + failed, mirrored, failed });
      continue;
    }
    const rows = await loadJsonRowsForTable(harnessRoot, table);
    let mirrored = 0;
    let failed = 0;
    for (const row of rows) {
      try {
        mirrorToDb(harnessRoot, table, row);
        mirrored++;
      } catch {
        failed++;
      }
    }
    summary.push({ table, candidates: rows.length, mirrored, failed });
  }
  return {
    ok: summary.every((t) => t.failed === 0),
    sqliteAvailable: true,
    tables: summary
  };
}
