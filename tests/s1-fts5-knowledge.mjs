import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  recordKnowledge,
  queryKnowledge,
  queryKnowledgeFts,
  rebuildFtsIndex
} from "../assets/codex-harness-mcp/src/core.mjs";

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

const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "codex-harness-s1-"));

try {
  // Seed knowledge items
  const a = await recordKnowledge({
    project_path: projectPath,
    title: "Kubernetes cluster autoscaling",
    kind: "knowledge",
    summary: "How to scale node pools horizontally",
    content: "Kubernetes supports cluster autoscaler with node pool minimum and maximum sizes.",
    tags: ["k8s", "ops"]
  });
  const b = await recordKnowledge({
    project_path: projectPath,
    title: "Kafka consumer groups",
    kind: "knowledge",
    summary: "Distribute message processing across consumers",
    content: "Kafka consumer groups allow horizontal scaling of message processing.",
    tags: ["kafka", "messaging"]
  });
  const c = await recordKnowledge({
    project_path: projectPath,
    title: "Ornithology field guide",
    kind: "knowledge",
    summary: "Bird identification basics",
    content: "Ornithology covers taxonomy, behavior, and habitat of bird species.",
    tags: ["birds", "science"]
  });

  // --- Query "ornithology" → unique match should rank first ---
  const rare = await queryKnowledgeFts({
    project_path: projectPath,
    query: "ornithology"
  });
  check(
    "fts.rare-term.top-ranked",
    rare.results.length >= 1 && rare.results[0].item.id === c.item.id,
    JSON.stringify(rare.results.map((r) => r.item.title))
  );

  // --- Query "kubernetes" → only one match ---
  const k8s = await queryKnowledgeFts({
    project_path: projectPath,
    query: "kubernetes"
  });
  check(
    "fts.specific-term.unique-match",
    k8s.results.length === 1 && k8s.results[0].item.id === a.item.id,
    JSON.stringify(k8s.results.map((r) => r.item.title))
  );

  // --- Query with phrase (porter stemming) ---
  const scaling = await queryKnowledgeFts({
    project_path: projectPath,
    query: "scaling"
  });
  check(
    "fts.porter-stemming-active",
    scaling.results.length >= 2 &&
      scaling.results.some((r) => r.item.id === a.item.id) &&
      scaling.results.some((r) => r.item.id === b.item.id),
    JSON.stringify(scaling.results.map((r) => r.item.title))
  );

  // --- Score field exposed (bm25-based) ---
  check(
    "fts.results-have-score",
    rare.results.length > 0 && typeof rare.results[0].score === "number",
    JSON.stringify(rare.results[0])
  );

  // --- Limit respected ---
  const limited = await queryKnowledgeFts({
    project_path: projectPath,
    query: "scaling",
    limit: 1
  });
  check(
    "fts.limit-respected",
    limited.results.length === 1,
    `got ${limited.results.length}`
  );

  // --- FTS5 special chars sanitized (no SQL injection / FTS5 syntax error) ---
  const injection = await queryKnowledgeFts({
    project_path: projectPath,
    query: "' OR 1=1; DROP TABLE knowledge_fts; --"
  });
  check(
    "fts.injection-safe",
    Array.isArray(injection.results),
    JSON.stringify(injection)
  );

  // --- Special characters that confuse FTS5 query parser ---
  const specialChars = await queryKnowledgeFts({
    project_path: projectPath,
    query: "(kubernetes OR \"unclosed quote"
  });
  check(
    "fts.special-chars-handled",
    Array.isArray(specialChars.results),
    JSON.stringify(specialChars)
  );

  // --- Empty query returns empty (or all up to limit) without error ---
  const empty = await queryKnowledgeFts({
    project_path: projectPath,
    query: ""
  });
  check(
    "fts.empty-query-safe",
    Array.isArray(empty.results),
    JSON.stringify(empty)
  );

  // --- fts.db file created ---
  const dbDir = path.join(projectPath, ".codex-harness");
  const entries = await fs.readdir(dbDir);
  check(
    "fts.db-file-created",
    entries.includes("fts.db"),
    `entries=${entries.filter((e) => e.startsWith("fts")).join(",")}`
  );

  // --- Rebuild: nuke fts.db then call rebuildFtsIndex, expect re-population ---
  const dbPath = path.join(dbDir, "fts.db");
  await fs.rm(dbPath, { force: true });
  // also remove WAL sidecars
  for (const sidecar of ["fts.db-wal", "fts.db-shm"]) {
    await fs.rm(path.join(dbDir, sidecar), { force: true });
  }
  const rebuilt = await rebuildFtsIndex({ project_path: projectPath });
  check(
    "fts.rebuild-from-items",
    rebuilt && rebuilt.itemCount === 3,
    JSON.stringify(rebuilt)
  );

  const afterRebuild = await queryKnowledgeFts({
    project_path: projectPath,
    query: "ornithology"
  });
  check(
    "fts.rebuilt-index-queryable",
    afterRebuild.results.length === 1 && afterRebuild.results[0].item.id === c.item.id,
    JSON.stringify(afterRebuild.results.map((r) => r.item.title))
  );

  // --- Backward compat: existing queryKnowledge (BM25+RRF) still works ---
  const bm25 = await queryKnowledge({
    project_path: projectPath,
    query: "ornithology"
  });
  check(
    "fts.backward-compat-bm25-still-works",
    bm25.results.length >= 1 && bm25.results.some((r) => r.item.id === c.item.id),
    JSON.stringify(bm25.results.map((r) => r.item.title))
  );

  // --- Item content is fetched and exposed (not just FTS row) ---
  check(
    "fts.full-item-returned",
    rare.results[0].item &&
      typeof rare.results[0].item.id === "string" &&
      typeof rare.results[0].item.title === "string" &&
      Array.isArray(rare.results[0].item.tags),
    JSON.stringify(rare.results[0].item).slice(0, 200)
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
} finally {
  await fs.rm(projectPath, { recursive: true, force: true });
}
