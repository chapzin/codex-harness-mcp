import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  ensureHarness,
  createContract,
  recordTrace,
  recordKnowledge,
  checkStorageIntegrity,
  migrateToSqlite
} from "../assets/codex-harness-mcp/src/core.mjs";

import {
  isSqliteAvailable,
  openHarnessDb,
  mirrorToDb,
  TABLE_NAMES
} from "../assets/codex-harness-mcp/src/db.mjs";

let passed = 0;
let failed = 0;
let skipped = 0;

function check(name, condition, detail) {
  if (condition) {
    console.log(`PASS: ${name}`);
    passed++;
  } else {
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

function skip(name, reason) {
  console.log(`SKIP: ${name}${reason ? ` — ${reason}` : ""}`);
  skipped++;
}

const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "codex-harness-k-"));

try {
  // --- Lazy import contract: module loads cleanly regardless of Node version ---
  check(
    "lazy.module-loads-without-throwing",
    typeof isSqliteAvailable === "function",
    "import succeeded but isSqliteAvailable is not exported"
  );

  const sqliteOk = isSqliteAvailable();
  check(
    "lazy.is-available-returns-boolean",
    typeof sqliteOk === "boolean",
    `got ${typeof sqliteOk}`
  );

  if (!sqliteOk) {
    skip("schema.tables-present", "node:sqlite unavailable on this Node");
    skip("mirror.idempotent", "node:sqlite unavailable on this Node");
    skip("integrity.drift-detected", "node:sqlite unavailable on this Node");
    skip("migrate.idempotent", "node:sqlite unavailable on this Node");
    skip("bigint.not-leaked", "node:sqlite unavailable on this Node");

    let threw = false;
    try {
      openHarnessDb(path.join(projectPath, ".codex-harness"));
    } catch (err) {
      threw = /sqlite/i.test(err?.message || "") && /node/i.test(err?.message || "");
    }
    check(
      "lazy.helpers-throw-clean-message",
      threw,
      "expected openHarnessDb to throw a clear node:sqlite required message"
    );

    console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped`);
    if (failed > 0) process.exit(1);
    process.exit(0);
  }

  // --- Bootstrap harness then open the harness.db file ---
  await ensureHarness({ project_path: projectPath, force: true });

  const harnessRoot = path.join(projectPath, ".codex-harness");
  const db = openHarnessDb(harnessRoot);
  check("schema.db-handle-returned", db && typeof db.prepare === "function", "expected DatabaseSync handle");

  // --- Verify schema_version + all 20 mirror tables exist ---
  const expectedTables = new Set([
    "schema_version",
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
  ]);
  const tableRows = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all();
  const present = new Set(tableRows.map((r) => r.name));
  const missing = [...expectedTables].filter((t) => !present.has(t));
  check(
    "schema.tables-present",
    missing.length === 0,
    `missing: ${missing.join(", ") || "(none)"}`
  );

  check(
    "schema.exported-table-names-match",
    Array.isArray(TABLE_NAMES) && TABLE_NAMES.length >= 20 && TABLE_NAMES.every((t) => present.has(t)),
    `TABLE_NAMES=${(TABLE_NAMES || []).join(",")}`
  );

  const schemaVersion = db
    .prepare("SELECT MAX(version) AS v FROM schema_version")
    .get();
  check(
    "schema.version-recorded",
    schemaVersion && Number(schemaVersion.v) >= 1,
    `version=${JSON.stringify(schemaVersion)}`
  );

  // --- mirrorToDb idempotency (INSERT OR REPLACE on natural PK) ---
  const sampleContract = {
    id: "k-test-contract-001",
    title: "k mirror test",
    goal: "validate idempotent mirror",
    createdAt: new Date().toISOString(),
    status: "active",
    payload: { custom: "data" }
  };
  const r1 = mirrorToDb(harnessRoot, "contracts", sampleContract);
  const r2 = mirrorToDb(harnessRoot, "contracts", sampleContract);
  check(
    "mirror.returns-success-shape",
    r1 && r1.ok === true && typeof r1.rowsAffected === "number",
    JSON.stringify(r1)
  );
  check(
    "bigint.not-leaked",
    r1 && (typeof r1.rowsAffected !== "bigint") && (typeof r2?.rowsAffected !== "bigint"),
    `r1.rowsAffected type=${typeof r1?.rowsAffected}`
  );
  const cnt = db.prepare("SELECT COUNT(*) AS c FROM contracts WHERE contract_id = ?").get(sampleContract.id);
  check(
    "mirror.idempotent",
    Number(cnt.c) === 1,
    `expected exactly 1 row after 2 mirror calls; got ${cnt.c}`
  );

  // --- migrateToSqlite: writers still write JSON; we batch-import them ---
  const c2 = await createContract({
    project_path: projectPath,
    title: "k migrate fixture",
    goal: "produce JSON contract for migration"
  });
  await recordTrace({
    project_path: projectPath,
    contract_id: c2.contract.id,
    tool_name: "harness_create_contract",
    summary: "created fixture",
    arguments: {},
    result: { ok: true }
  });
  await recordKnowledge({
    project_path: projectPath,
    title: "k migrate knowledge fixture",
    kind: "knowledge",
    content: "tiny content"
  });

  const m1 = await migrateToSqlite({ project_path: projectPath });
  check(
    "migrate.returns-summary",
    m1 && m1.ok === true && Array.isArray(m1.tables),
    JSON.stringify(m1).slice(0, 200)
  );
  const after = db.prepare("SELECT COUNT(*) AS c FROM contracts").get().c;
  await migrateToSqlite({ project_path: projectPath });
  const after2 = db.prepare("SELECT COUNT(*) AS c FROM contracts").get().c;
  check(
    "migrate.idempotent",
    Number(after) === Number(after2) && Number(after) >= 2,
    `after=${after}, after2=${after2}`
  );

  // --- checkStorageIntegrity returns concrete struct ---
  const integrityQuick = await checkStorageIntegrity({ project_path: projectPath });
  check(
    "integrity.shape-quick",
    integrityQuick &&
      typeof integrityQuick.ok === "boolean" &&
      typeof integrityQuick.sqliteAvailable === "boolean" &&
      Array.isArray(integrityQuick.tables),
    JSON.stringify(integrityQuick).slice(0, 200)
  );
  const contractsRow = integrityQuick.tables.find((t) => t.name === "contracts");
  check(
    "integrity.contracts-table-tracked",
    contractsRow &&
      typeof contractsRow.jsonCount === "number" &&
      typeof contractsRow.sqliteCount === "number" &&
      typeof contractsRow.countDelta === "number" &&
      Array.isArray(contractsRow.missingInSqlite) &&
      Array.isArray(contractsRow.missingInJson),
    JSON.stringify(contractsRow)
  );

  // --- Synthetic drift: insert SQLite row with no JSON counterpart ---
  mirrorToDb(harnessRoot, "contracts", {
    id: "k-test-orphan-sqlite-only",
    title: "orphan",
    goal: "no json on disk"
  });
  const integrityDeep = await checkStorageIntegrity({ project_path: projectPath, deep: true });
  const contractsDeep = integrityDeep.tables.find((t) => t.name === "contracts");
  check(
    "integrity.drift-detected",
    contractsDeep &&
      contractsDeep.missingInJson.includes("k-test-orphan-sqlite-only"),
    `missingInJson=${JSON.stringify(contractsDeep?.missingInJson)}`
  );

  // --- Zero-touch invariant: db.mjs is dependency-free of writers ---
  const dbSource = await fs.readFile(
    path.join(process.cwd(), "assets/codex-harness-mcp/src/db.mjs"),
    "utf8"
  );
  check(
    "isolation.db-mjs-does-not-import-writers",
    !/from\s+["']\.\/core\.mjs["']/.test(dbSource) &&
      !/writeJson\b/.test(dbSource) &&
      !/appendJsonl\b/.test(dbSource),
    "db.mjs must not import core.mjs writers"
  );

  console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped`);
  if (failed > 0) process.exit(1);
} finally {
  await fs.rm(projectPath, { recursive: true, force: true });
}
