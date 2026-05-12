import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  ensureHarness,
  recordKnowledge,
  queryKnowledge,
  queryKnowledgeFts,
  inferMemoryType,
  harnessPath,
  writeJson
} from "../assets/codex-harness-mcp/src/core.mjs";

import {
  isSqliteAvailable,
  openHarnessDb,
  resetMigrationCache,
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

const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "codex-harness-c1-"));

try {
  await ensureHarness({ project_path: projectPath, force: true, project_name: "c1-fixture" });
  const harnessRoot = harnessPath(projectPath);

  // ───────────────────────────── 1. inferMemoryType pure mapping ─────────────────────────────
  check("infer.implementation_lesson->episodic", inferMemoryType("implementation_lesson") === "episodic");
  check("infer.decision->episodic", inferMemoryType("decision") === "episodic");
  check("infer.knowledge->semantic", inferMemoryType("knowledge") === "semantic");
  check("infer.research->semantic", inferMemoryType("research") === "semantic");
  check("infer.source->semantic", inferMemoryType("source") === "semantic");
  check("infer.project_note->semantic", inferMemoryType("project_note") === "semantic");
  check("infer.pattern->procedural", inferMemoryType("pattern") === "procedural");
  check("infer.unknown-default->semantic", inferMemoryType("totally-unknown-kind") === "semantic");
  check("infer.null-default->semantic", inferMemoryType(null) === "semantic");

  // ───────────────────────────── 2. Schema: memory_type column ─────────────────────────────
  const db = openHarnessDb(harnessRoot);
  const cols = db.prepare("PRAGMA table_info(knowledge_items)").all();
  const memCol = cols.find((c) => c.name === "memory_type");
  check(
    "schema.memory_type-column-exists",
    Boolean(memCol),
    `cols=${cols.map((c) => c.name).join(",")}`
  );

  // ───────────────────────────── 3. recordKnowledge persists memoryType ─────────────────────────────
  const ke = await recordKnowledge({
    project_path: projectPath,
    title: "C1 episodic case alpha",
    kind: "implementation_lesson",
    content: "Solved bug by foo. Episodic event."
  });
  const ks = await recordKnowledge({
    project_path: projectPath,
    title: "C1 semantic case alpha",
    kind: "research",
    content: "Background research about alpha."
  });
  const kp = await recordKnowledge({
    project_path: projectPath,
    title: "C1 procedural case alpha",
    kind: "pattern",
    content: "How to perform alpha workflow."
  });

  const rowEp = db.prepare("SELECT memory_type FROM knowledge_items WHERE item_id = ?").get(ke.item.id);
  const rowSe = db.prepare("SELECT memory_type FROM knowledge_items WHERE item_id = ?").get(ks.item.id);
  const rowPr = db.prepare("SELECT memory_type FROM knowledge_items WHERE item_id = ?").get(kp.item.id);
  check("record.episodic-stored", rowEp?.memory_type === "episodic", `got=${rowEp?.memory_type}`);
  check("record.semantic-stored", rowSe?.memory_type === "semantic", `got=${rowSe?.memory_type}`);
  check("record.procedural-stored", rowPr?.memory_type === "procedural", `got=${rowPr?.memory_type}`);

  // payload_json round-trip preserves memoryType
  const payload = db
    .prepare("SELECT payload_json FROM knowledge_items WHERE item_id = ?")
    .get(ke.item.id);
  const parsed = JSON.parse(payload.payload_json);
  check(
    "record.payload_json-has-memoryType",
    parsed.memoryType === "episodic",
    `parsed.memoryType=${parsed.memoryType}`
  );

  // ───────────────────────────── 3b. Explicit override + invalid fallback ─────────────────────────────
  // Distinct titles (no overlap with section-4 query "C1 case alpha") to avoid poisoning later counts.
  // kind=research → default memory_type=semantic, but explicit memory_type='procedural' must win.
  const override = await recordKnowledge({
    project_path: projectPath,
    title: "Override scenario zeta",
    kind: "research",
    memory_type: "procedural",
    content: "Should be classified procedural despite kind=research."
  });
  const rowOverride = db
    .prepare("SELECT memory_type FROM knowledge_items WHERE item_id = ?")
    .get(override.item.id);
  check(
    "record.explicit-memory_type-overrides-kind",
    rowOverride?.memory_type === "procedural",
    `got=${rowOverride?.memory_type}`
  );

  // Invalid value must silently fall back to inferred from kind.
  const invalid = await recordKnowledge({
    project_path: projectPath,
    title: "Invalid value scenario zeta",
    kind: "implementation_lesson",
    memory_type: "totally-bogus-value",
    content: "Bogus memory_type should fall back to kind-inferred 'episodic'."
  });
  const rowInvalid = db
    .prepare("SELECT memory_type FROM knowledge_items WHERE item_id = ?")
    .get(invalid.item.id);
  check(
    "record.invalid-memory_type-falls-back-to-inferred",
    rowInvalid?.memory_type === "episodic",
    `got=${rowInvalid?.memory_type}`
  );

  // ───────────────────────────── 4. queryKnowledge filter ─────────────────────────────
  const onlyEp = await queryKnowledge({
    project_path: projectPath,
    query: "C1 case alpha",
    memory_type: "episodic",
    max_results: 10
  });
  check(
    "query.episodic-only",
    onlyEp.results.length === 1 && onlyEp.results[0].item.memoryType === "episodic",
    `count=${onlyEp.results.length}, types=[${onlyEp.results.map((r) => r.item.memoryType).join(",")}]`
  );

  const onlySe = await queryKnowledge({
    project_path: projectPath,
    query: "C1 case alpha",
    memory_type: "semantic",
    max_results: 10
  });
  check(
    "query.semantic-only",
    onlySe.results.length === 1 && onlySe.results[0].item.memoryType === "semantic",
    `count=${onlySe.results.length}, types=[${onlySe.results.map((r) => r.item.memoryType).join(",")}]`
  );

  const onlyPr = await queryKnowledge({
    project_path: projectPath,
    query: "C1 case alpha",
    memory_type: "procedural",
    max_results: 10
  });
  check(
    "query.procedural-only",
    onlyPr.results.length === 1 && onlyPr.results[0].item.memoryType === "procedural",
    `count=${onlyPr.results.length}`
  );

  const noFilter = await queryKnowledge({
    project_path: projectPath,
    query: "C1 case alpha",
    max_results: 10
  });
  check(
    "query.no-filter-returns-all",
    noFilter.results.length === 3,
    `count=${noFilter.results.length}`
  );

  // ───────────────────────────── 5. queryKnowledgeFts filter ─────────────────────────────
  const ftsAll = await queryKnowledgeFts({ project_path: projectPath, query: "alpha" });
  check("fts.unfiltered-returns-results", ftsAll.results.length >= 1, `count=${ftsAll.results.length}`);

  const ftsEp = await queryKnowledgeFts({
    project_path: projectPath,
    query: "alpha",
    memory_type: "episodic"
  });
  check(
    "fts.episodic-only",
    ftsEp.results.length === 1 && ftsEp.results[0].item.memoryType === "episodic",
    `count=${ftsEp.results.length}, types=[${ftsEp.results.map((r) => r.item.memoryType).join(",")}]`
  );

  const ftsPr = await queryKnowledgeFts({
    project_path: projectPath,
    query: "alpha",
    memory_type: "procedural"
  });
  check(
    "fts.procedural-only",
    ftsPr.results.length === 1 && ftsPr.results[0].item.memoryType === "procedural",
    `count=${ftsPr.results.length}`
  );

  // ───────────────────────────── 6. Backfill: legacy JSON row → migrated with memoryType ─────────────────────────────
  closeHarnessDb(harnessRoot);
  await fs.rm(harnessDbPath(harnessRoot), { force: true });
  await fs.rm(`${harnessDbPath(harnessRoot)}-wal`, { force: true });
  await fs.rm(`${harnessDbPath(harnessRoot)}-shm`, { force: true });
  resetMigrationCache(harnessRoot);

  const legacyId = "knowledge-1970-01-01-legacy-deadbeef";
  const legacyItem = {
    id: legacyId,
    ts: "1970-01-01T00:00:00.000Z",
    kind: "implementation_lesson",
    contractId: null,
    title: "legacy title without memoryType",
    summary: null,
    content: "legacy content (no memoryType field at all)",
    tags: [],
    keyFindings: [],
    filesChanged: [],
    evidence: [],
    confidence: "unknown",
    source: { type: null, url: null, path: null }
  };
  await writeJson(harnessPath(projectPath, "knowledge", "items", `${legacyId}.json`), legacyItem);

  // Trigger migration by querying
  const queried = await queryKnowledge({ project_path: projectPath, query: "legacy" });

  const dbAfter = openHarnessDb(harnessRoot);
  const rowLegacy = dbAfter
    .prepare("SELECT memory_type FROM knowledge_items WHERE item_id = ?")
    .get(legacyId);
  check(
    "backfill.legacy-row-typed-after-migrate",
    rowLegacy?.memory_type === "episodic",
    `got=${rowLegacy?.memory_type}, queryHits=${queried.results.length}`
  );

  const payloadLegacy = dbAfter
    .prepare("SELECT payload_json FROM knowledge_items WHERE item_id = ?")
    .get(legacyId);
  const parsedLegacy = JSON.parse(payloadLegacy.payload_json);
  check(
    "backfill.payload_json-enriched",
    parsedLegacy.memoryType === "episodic",
    `parsed.memoryType=${parsedLegacy.memoryType}`
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
} finally {
  await fs.rm(projectPath, { recursive: true, force: true });
}
