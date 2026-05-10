import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  ensureHarness,
  harnessPath,
  recordKnowledge,
  queryKnowledge
} from "../assets/codex-harness-mcp/src/core.mjs";

// R4-1: knowledge index growth is bounded per item.
// 100 items where each carries an 8KB blob of repeating chars (single token).
// Without the cap, indexKnowledgeItem stored the whole blob as a termCount key
// (~8 KB per item, ~800 KB / 100 items). With the cap, the blob is dropped
// from termCounts (token > 80 chars), and each entry stays well under 5 KB.
{
  const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "r4-index-"));
  try {
    await ensureHarness({ project_path: projectPath });

    const N = 100;
    for (let i = 0; i < N; i++) {
      await recordKnowledge({
        project_path: projectPath,
        title: `Item ${i}`,
        content: "x".repeat(8000),
        summary: "Real summary for item " + i,
        key_findings: ["finding one", "finding two"],
        tags: ["bucket-" + (i % 5)],
        kind: "knowledge"
      });
    }

    const indexPath = harnessPath(projectPath, "knowledge", "index.json");
    const stat = await fs.stat(indexPath);
    const perItem = stat.size / N;
    assert.ok(
      perItem < 4096,
      `index per item must stay under 4KB after cap, got ${perItem.toFixed(0)} bytes/item`
    );

    const raw = JSON.parse(await fs.readFile(indexPath, "utf8"));
    assert.equal(raw.items.length, N);
    for (const entry of raw.items) {
      for (const term of Object.keys(entry.termCounts || {})) {
        assert.ok(term.length <= 80, `term length must be <= 80, got ${term.length}`);
      }
      assert.ok(
        Object.keys(entry.termCounts || {}).length <= 40,
        "termCounts capped at 40 entries"
      );
    }

    // Queries on real terms still work
    const r = await queryKnowledge({ project_path: projectPath, query: "finding bucket", max_results: 5 });
    assert.ok(r.results.length > 0, "query on real terms still returns results");

    console.log(`R4-1 PASS: 100 items, index ${stat.size} bytes (${perItem.toFixed(0)} B/item), all term caps respected`);
  } finally {
    await fs.rm(projectPath, { recursive: true, force: true });
  }
}

console.log("Round 4 investigation: index growth bounded; queries preserved.");
