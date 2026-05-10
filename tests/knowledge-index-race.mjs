import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  readKnowledgeIndex,
  recordKnowledge
} from "../assets/codex-harness-mcp/src/core.mjs";

const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "harness-race-"));

try {
  const concurrentWrites = 12;
  const tasks = [];
  for (let i = 0; i < concurrentWrites; i++) {
    tasks.push(
      recordKnowledge({
        project_path: projectPath,
        title: `Race item ${i}`,
        kind: "knowledge",
        summary: `Concurrent write ${i}`,
        content: `payload ${i}`,
        tags: ["race"]
      })
    );
  }
  const results = await Promise.all(tasks);
  assert.equal(results.length, concurrentWrites, "all concurrent writes resolve");

  const index = await readKnowledgeIndex(projectPath);
  assert.equal(index.items.length, concurrentWrites,
    `index must contain all ${concurrentWrites} concurrent items, found ${index.items.length}`);

  const ids = new Set(index.items.map((entry) => entry.id));
  assert.equal(ids.size, concurrentWrites, "no duplicate IDs in index after race");

  console.log("Knowledge index lock prevents corruption under concurrent writes.");
} finally {
  await fs.rm(projectPath, { recursive: true, force: true });
}
