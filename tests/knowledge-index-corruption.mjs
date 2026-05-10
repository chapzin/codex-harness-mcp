import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  harnessPath,
  queryKnowledge,
  readKnowledgeIndex,
  recordImplementationLesson,
  recordResearchSource
} from "../assets/codex-harness-mcp/src/core.mjs";

const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "codex-harness-corrupt-"));

try {
  await recordResearchSource({
    project_path: projectPath,
    title: "Corruption recovery research",
    source_url: "example.invalid/corruption",
    summary: "Test fixture for corruption recovery.",
    key_findings: ["Indexes must self-heal."],
    content: "Knowledge indexes must rebuild when corrupted.",
    tags: ["corruption"],
    confidence: "high"
  });

  await recordImplementationLesson({
    project_path: projectPath,
    title: "Self-healing index lesson",
    problem: "Corrupt JSON breaks downstream queries.",
    solution: "Rebuild the index from items when parse fails.",
    files_changed: ["core.mjs"],
    evidence: ["tests/knowledge-index-corruption.mjs passes"],
    tags: ["recovery"]
  });

  const indexPath = harnessPath(projectPath, "knowledge", "index.json");
  await fs.writeFile(indexPath, "{not valid json :::", "utf8");

  const recovered = await readKnowledgeIndex(projectPath);
  assert.ok(recovered, "readKnowledgeIndex returned a value");
  assert.ok(Array.isArray(recovered.items), "recovered index has items array");
  assert.equal(recovered.items.length, 2, "recovered index restored both items");

  await fs.writeFile(indexPath, "[]", "utf8");
  const recoveredFromShape = await readKnowledgeIndex(projectPath);
  assert.equal(
    recoveredFromShape.items.length,
    2,
    "wrong-shape JSON also triggers rebuild"
  );

  await fs.writeFile(indexPath, "{garbage", "utf8");
  const result = await queryKnowledge({
    project_path: projectPath,
    query: "self-healing rebuild",
    max_results: 5
  });
  assert.ok(result.results.length > 0, "query returns rebuilt results after corruption");

  console.log("Knowledge index recovers from corruption and shape mismatch.");
} finally {
  await fs.rm(projectPath, { recursive: true, force: true });
}
