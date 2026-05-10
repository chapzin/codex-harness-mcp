import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  appendJsonl,
  ensureHarness,
  harnessPath,
  loadState,
  migrateHarness
} from "../assets/codex-harness-mcp/src/core.mjs";

// R5-1 (refuted): appendJsonl in-process stays atomic even with large lines.
{
  const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "r5-append-"));
  try {
    await ensureHarness({ project_path: projectPath });
    const target = harnessPath(projectPath, "traces", "race.jsonl");
    const N = 25;
    const big = "Z".repeat(8000);
    const writers = [];
    for (let i = 0; i < N; i++) {
      writers.push(appendJsonl(target, { id: i, payload: big }));
    }
    await Promise.all(writers);
    const raw = await fs.readFile(target, "utf8");
    const lines = raw.split("\n").filter(Boolean);
    assert.equal(lines.length, N, `every concurrent line is present (${lines.length}/${N})`);
    for (const line of lines) JSON.parse(line); // must all parse
    console.log(`R5-1 PASS (refuted): ${N} concurrent appends with 8KB payload, all parseable`);
  } finally {
    await fs.rm(projectPath, { recursive: true, force: true });
  }
}

// R5-2: migration creates a pre-write backup and lock prevents double-apply.
{
  const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "r5-mig-"));
  try {
    await ensureHarness({ project_path: projectPath });
    const statePath = harnessPath(projectPath, "state.json");
    const planted = {
      version: 1,
      projectName: "legacy",
      focus: null,
      status: "idle",
      activeContractId: null,
      counters: { contracts: 7, traces: 13 },
      decisions: [{ id: "old", text: "keep me" }],
      events: []
    };
    await fs.writeFile(statePath, JSON.stringify(planted), "utf8");

    // Two concurrent migrations: lock should serialize them.
    const [a, b] = await Promise.all([
      migrateHarness({ project_path: projectPath }),
      migrateHarness({ project_path: projectPath })
    ]);

    // One of them did the work (applied.length > 0); the other became a no-op.
    const worker = a.applied.length > 0 ? a : b;
    const noop = worker === a ? b : a;
    assert.ok(worker.applied.length >= 1, "worker actually migrated");
    assert.equal(noop.applied.length, 0, "second migration is a no-op under lock");
    assert.ok(worker.backupPath, "worker writes a backup path");

    // Backup file exists and contains the original v1 state.
    const backup = JSON.parse(await fs.readFile(worker.backupPath, "utf8"));
    assert.equal(backup.version, 1, "backup preserves the original version");
    assert.equal(backup.counters.contracts, 7, "backup preserves counters");
    assert.equal(backup.decisions[0].id, "old", "backup preserves decisions");

    // Final state has migrated counters but preserved old user data.
    const state = await loadState(projectPath);
    assert.equal(state.version, 5);
    assert.equal(state.counters.contracts, 7);
    assert.equal(state.counters.traces, 13);
    assert.equal(state.decisions[0].id, "old");

    console.log("R5-2 PASS: migration backup is created and the lock serializes concurrent runs");
  } finally {
    await fs.rm(projectPath, { recursive: true, force: true });
  }
}

console.log("Round 5 hardening: all checks passed.");
