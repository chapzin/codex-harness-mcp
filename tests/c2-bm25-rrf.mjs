import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  harnessPath,
  queryKnowledge,
  recordKnowledge,
  rebuildKnowledgeIndex
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

async function readIndex(projectPath) {
  const indexPath = harnessPath(projectPath, "knowledge", "index.json");
  return JSON.parse(await fs.readFile(indexPath, "utf8"));
}

async function rec(projectPath, opts) {
  return recordKnowledge({
    project_path: projectPath,
    kind: "knowledge",
    confidence: "medium",
    ...opts
  });
}

// === SCENARIO 1: IDF — rare term outranks common term ===
const path1 = await fs.mkdtemp(path.join(os.tmpdir(), "codex-harness-c2-idf-"));
try {
  // 4 docs with "kubernetes" (common)
  await rec(path1, { title: "alpha", tags: ["x"], content: "kubernetes cluster nodes" });
  await rec(path1, { title: "beta", tags: ["x"], content: "kubernetes deployment workload" });
  await rec(path1, { title: "gamma", tags: ["x"], content: "kubernetes services ingress" });
  await rec(path1, { title: "delta", tags: ["x"], content: "kubernetes pods scheduling" });
  // 1 doc with "ornithology" (rare)
  const rareItem = await rec(path1, {
    title: "epsilon",
    tags: ["x"],
    content: "ornithology birds taxonomy observation"
  });

  await rebuildKnowledgeIndex({ project_path: path1 });

  // Query both: rare and common
  const result = await queryKnowledge({
    project_path: path1,
    query: "kubernetes ornithology",
    max_results: 5
  });

  check(
    "scenario1.results-returned",
    result.results.length >= 4,
    `got ${result.results.length} results`
  );

  // The rare-term doc must rank highly because "ornithology" has high IDF
  const rareRank = result.results.findIndex((r) => r.item.id === rareItem.item.id);
  check(
    "scenario1.rare-term-doc-top-ranked",
    rareRank === 0,
    `rare-term doc rank=${rareRank}, top results: ${result.results.map((r) => r.item.title).join(",")}`
  );

  // Index shape
  const idx = await readIndex(path1);
  check(
    "scenario1.index-has-document-frequencies",
    idx.documentFrequencies && typeof idx.documentFrequencies === "object" &&
      typeof idx.documentFrequencies.kubernetes === "number" &&
      typeof idx.documentFrequencies.ornithology === "number",
    JSON.stringify(Object.keys(idx.documentFrequencies || {}).slice(0, 8))
  );

  check(
    "scenario1.df-counts-correct",
    idx.documentFrequencies &&
      idx.documentFrequencies.kubernetes === 4 &&
      idx.documentFrequencies.ornithology === 1,
    `kubernetes df=${idx.documentFrequencies?.kubernetes}, ornithology df=${idx.documentFrequencies?.ornithology}`
  );

  check(
    "scenario1.index-has-avg-token-length",
    typeof idx.avgTokenLength === "number" && idx.avgTokenLength > 0,
    `avgTokenLength=${idx.avgTokenLength}`
  );

  check(
    "scenario1.index-version-bumped",
    typeof idx.version === "number" && idx.version >= 2,
    `version=${idx.version}`
  );
} finally {
  await fs.rm(path1, { recursive: true, force: true });
}

// === SCENARIO 2: Length normalization — shorter doc with same TF wins ===
const path2 = await fs.mkdtemp(path.join(os.tmpdir(), "codex-harness-c2-len-"));
try {
  const shortDoc = await rec(path2, {
    title: "shorty",
    tags: ["x"],
    content: "kafka consumer"
  });
  const longDoc = await rec(path2, {
    title: "lengthy",
    tags: ["x"],
    content:
      "kafka consumer plus many many additional irrelevant words lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation"
  });

  await rebuildKnowledgeIndex({ project_path: path2 });

  const result = await queryKnowledge({
    project_path: path2,
    query: "kafka consumer",
    max_results: 5
  });

  const shortRank = result.results.findIndex((r) => r.item.id === shortDoc.item.id);
  const longRank = result.results.findIndex((r) => r.item.id === longDoc.item.id);
  check(
    "scenario2.short-doc-beats-long-doc",
    shortRank >= 0 && longRank >= 0 && shortRank < longRank,
    `short=${shortRank}, long=${longRank}`
  );
} finally {
  await fs.rm(path2, { recursive: true, force: true });
}

// === SCENARIO 3: RRF — title match contributes to fusion ===
const path3 = await fs.mkdtemp(path.join(os.tmpdir(), "codex-harness-c2-rrf-"));
try {
  // Doc A: has "graphql" in body only, repeated several times for high BM25
  const bodyOnly = await rec(path3, {
    title: "alpha alpha alpha",
    tags: ["tagging"],
    content: "graphql graphql graphql graphql graphql graphql graphql"
  });
  // Doc B: has "graphql" only once in title, sparse in body
  const titleHit = await rec(path3, {
    title: "graphql performance review",
    tags: ["tagging"],
    content: "performance considerations and optimization"
  });
  // Doc C: tag match only
  const tagHit = await rec(path3, {
    title: "completely unrelated",
    tags: ["graphql"],
    content: "totally unrelated thing about cats and dogs"
  });

  await rebuildKnowledgeIndex({ project_path: path3 });

  const result = await queryKnowledge({
    project_path: path3,
    query: "graphql",
    max_results: 5
  });

  check(
    "scenario3.all-three-retrieved",
    result.results.length === 3 &&
      result.results.some((r) => r.item.id === bodyOnly.item.id) &&
      result.results.some((r) => r.item.id === titleHit.item.id) &&
      result.results.some((r) => r.item.id === tagHit.item.id),
    `got ${result.results.length} results: ${result.results.map((r) => r.item.title).join(" | ")}`
  );

  // Title-hit doc should be ranked at least as high as body-only despite having lower raw BM25.
  // RRF fuses title rank (1) + tag rank (none) + bm25 rank (low) -> still high.
  const bodyRank = result.results.findIndex((r) => r.item.id === bodyOnly.item.id);
  const titleRank = result.results.findIndex((r) => r.item.id === titleHit.item.id);
  check(
    "scenario3.title-hit-not-buried",
    titleRank <= bodyRank,
    `body=${bodyRank}, title=${titleRank}; titles: ${result.results.map((r) => r.item.title).join(", ")}`
  );
} finally {
  await fs.rm(path3, { recursive: true, force: true });
}

// === SCENARIO 4: Auto-rebuild when version mismatches ===
const path4 = await fs.mkdtemp(path.join(os.tmpdir(), "codex-harness-c2-version-"));
try {
  await rec(path4, { title: "v1", tags: ["x"], content: "version one content" });
  // Manually downgrade the version in the index file
  const indexPath = harnessPath(path4, "knowledge", "index.json");
  const idx = JSON.parse(await fs.readFile(indexPath, "utf8"));
  idx.version = 1;
  delete idx.documentFrequencies;
  delete idx.avgTokenLength;
  await fs.writeFile(indexPath, JSON.stringify(idx));

  // Querying should rebuild
  await queryKnowledge({
    project_path: path4,
    query: "version content"
  });

  const idxAfter = await readIndex(path4);
  check(
    "scenario4.stale-index-auto-rebuilt",
    idxAfter.version >= 2 &&
      idxAfter.documentFrequencies &&
      typeof idxAfter.avgTokenLength === "number",
    `version=${idxAfter.version}, hasDF=${!!idxAfter.documentFrequencies}, hasAvg=${typeof idxAfter.avgTokenLength}`
  );
} finally {
  await fs.rm(path4, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
