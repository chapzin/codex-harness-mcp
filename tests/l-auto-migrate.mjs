import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  ensureHarness,
  loadState,
  saveState,
  harnessPath
} from "../assets/codex-harness-mcp/src/core.mjs";

import {
  isSqliteAvailable,
  openHarnessDb,
  resetMigrationCache,
  hasBeenMigrated,
  closeHarnessDb,
  harnessDbPath
} from "../assets/codex-harness-mcp/src/db.mjs";

let passed = 0;
let failed = 0;

function check(name, condition, detail) {
  if (condition) {
    console.log(`PASS: ${name}`);
    passed++;
  } else {
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

if (!isSqliteAvailable()) {
  console.log("SKIP: requires Node 22.5+ (node:sqlite)");
  process.exit(0);
}

const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "codex-harness-l-am-"));

try {
  // --- Setup: create harness with state.json but no harness.db ---
  await ensureHarness({ project_path: projectPath, force: true, project_name: "auto-migrate-fixture" });

  const harnessRoot = harnessPath(projectPath);
  const stateFile = harnessPath(projectPath, "state.json");

  // Save twice to populate state.json with non-default content
  const stateFromBoot = await loadState(projectPath);
  stateFromBoot.events.push({ ts: new Date().toISOString(), type: "test", summary: "fixture marker" });
  await saveState(projectPath, stateFromBoot);

  // --- Force a fresh-install scenario: blow away SQLite, reset cache ---
  closeHarnessDb(harnessRoot);
  await fs.rm(harnessDbPath(harnessRoot), { force: true });
  await fs.rm(`${harnessDbPath(harnessRoot)}-wal`, { force: true });
  await fs.rm(`${harnessDbPath(harnessRoot)}-shm`, { force: true });
  resetMigrationCache(harnessRoot);

  const dbExistsBefore = await fs
    .access(harnessDbPath(harnessRoot))
    .then(() => true)
    .catch(() => false);
  check(
    "fixture.sqlite-absent-before-load",
    !dbExistsBefore,
    "expected harness.db to be removed for fresh-install scenario"
  );

  const stateAfter = await loadState(projectPath);
  check(
    "auto-migrate.loadState-returns-data-from-json",
    Array.isArray(stateAfter.events) &&
      stateAfter.events.some((e) => e.summary === "fixture marker"),
    `events length=${stateAfter.events?.length ?? 0}`
  );

  // --- Verify SQLite was populated as side effect ---
  const dbExistsAfter = await fs
    .access(harnessDbPath(harnessRoot))
    .then(() => true)
    .catch(() => false);
  check(
    "auto-migrate.sqlite-created-by-loadState",
    dbExistsAfter,
    "expected harness.db to exist after first loadState"
  );

  const db = openHarnessDb(harnessRoot);
  const row = db.prepare("SELECT payload_json FROM state_snapshots WHERE snapshot_id = 'current'").get();
  check(
    "auto-migrate.sqlite-row-populated",
    row && row.payload_json,
    `row=${JSON.stringify(row)}`
  );

  let parsed = null;
  try {
    parsed = JSON.parse(row.payload_json);
  } catch {
    parsed = null;
  }
  check(
    "auto-migrate.sqlite-payload-matches-json",
    parsed && Array.isArray(parsed.events) && parsed.events.some((e) => e.summary === "fixture marker"),
    `parsed events length=${parsed?.events?.length ?? 0}`
  );

  // --- Migration cache: subsequent loadState should NOT re-migrate ---
  check(
    "auto-migrate.cache-flag-set",
    hasBeenMigrated(harnessRoot) === true,
    `hasBeenMigrated=${hasBeenMigrated(harnessRoot)}`
  );

  // --- saveState writes to SQLite as canonical and exports JSON ---
  stateAfter.events.push({ ts: new Date().toISOString(), type: "test", summary: "second marker" });
  await saveState(projectPath, stateAfter);

  const dbAfterSave = openHarnessDb(harnessRoot);
  const row2 = dbAfterSave
    .prepare("SELECT payload_json FROM state_snapshots WHERE snapshot_id = 'current'")
    .get();
  const parsed2 = JSON.parse(row2.payload_json);
  check(
    "save.sqlite-updated",
    parsed2.events.some((e) => e.summary === "second marker"),
    `events=${parsed2.events.map((e) => e.summary).join(",")}`
  );

  const jsonRaw = await fs.readFile(stateFile, "utf8");
  const jsonParsed = JSON.parse(jsonRaw);
  check(
    "save.json-export-updated",
    jsonParsed.events.some((e) => e.summary === "second marker"),
    `json events=${jsonParsed.events.map((e) => e.summary).join(",")}`
  );

  // --- Round-trip: loadState reflects what saveState wrote ---
  const loaded2 = await loadState(projectPath);
  check(
    "round-trip.loadState-reflects-savestate",
    loaded2.events.some((e) => e.summary === "second marker"),
    `loaded events=${loaded2.events.map((e) => e.summary).join(",")}`
  );

  // --- SQLite-as-canonical: tamper JSON, loadState should ignore JSON drift ---
  const tamperedState = { ...loaded2, projectName: "TAMPERED-IN-JSON-ONLY" };
  await fs.writeFile(stateFile, `${JSON.stringify(tamperedState, null, 2)}\n`, "utf8");
  const loaded3 = await loadState(projectPath);
  check(
    "canonical.sqlite-wins-over-json-tamper",
    loaded3.projectName !== "TAMPERED-IN-JSON-ONLY",
    `projectName=${loaded3.projectName}`
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
} finally {
  await fs.rm(projectPath, { recursive: true, force: true });
}
