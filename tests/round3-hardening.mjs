import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  createContract,
  ensureHarness,
  harnessPath,
  loadState,
  recordKnowledge,
  recordTrace,
  recordVerification
} from "../assets/codex-harness-mcp/src/core.mjs";

// R3-1: state.json corruption recovery — no brick
{
  const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "r3-brick-"));
  try {
    await ensureHarness({ project_path: projectPath });
    const statePath = harnessPath(projectPath, "state.json");
    await fs.writeFile(statePath, "{garbage not json", "utf8");

    const state = await loadState(projectPath);
    assert.ok(state, "loadState returns a value when state.json is corrupt");
    assert.equal(state.status, "idle", "recovered state has default status");
    assert.ok(state.counters, "recovered state has counters object");
    assert.equal(state.counters.contracts, 0, "counters are reset to defaults");
    assert.ok(
      state.events.some((e) => e.type === "state_recovered"),
      "recovery event is recorded"
    );

    // Subsequent writes work
    const result = await recordKnowledge({
      project_path: projectPath,
      title: "Post-recovery write",
      content: "x",
      kind: "knowledge"
    });
    assert.ok(result.item, "recordKnowledge succeeds after recovery");

    // Corrupt backup was preserved
    const files = await fs.readdir(harnessPath(projectPath));
    assert.ok(
      files.some((f) => f.startsWith("state.corrupt.")),
      "corrupt state.json is backed up as state.corrupt.*"
    );

    console.log("R3-1 PASS: state.json corruption recovers without brick");
  } finally {
    await fs.rm(projectPath, { recursive: true, force: true });
  }
}

// R3-2: concurrent state writers no longer lose updates
{
  const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "r3-race-"));
  try {
    await ensureHarness({ project_path: projectPath });
    const contract = await createContract({
      project_path: projectPath,
      title: "Race contract",
      goal: "Test concurrent state writers",
      completion_conditions: ["done"]
    });

    const N = 25;
    const tasks = [];
    for (let i = 0; i < N; i++) {
      tasks.push(
        recordTrace({
          project_path: projectPath,
          contract_id: contract.contract.id,
          kind: "attempt",
          summary: `Race trace ${i}`,
          raw: `payload ${i}`
        })
      );
    }
    await Promise.all(tasks);

    const state = await loadState(projectPath);
    assert.equal(
      state.counters.traces,
      N,
      `concurrent traces all counted (expected ${N}, got ${state.counters.traces})`
    );

    // Mixed concurrent writers (trace + verification + knowledge) should still tally
    const mixed = [];
    for (let i = 0; i < 8; i++) {
      mixed.push(recordTrace({
        project_path: projectPath,
        contract_id: contract.contract.id,
        kind: "attempt", summary: `mixed-trace-${i}`, raw: "x"
      }));
      mixed.push(recordVerification({
        project_path: projectPath,
        contract_id: contract.contract.id,
        command_or_check: `check-${i}`, status: "pass", exit_code: 0, raw_output: "ok"
      }));
      mixed.push(recordKnowledge({
        project_path: projectPath,
        title: `mixed-k-${i}`, content: "x", kind: "knowledge"
      }));
    }
    await Promise.all(mixed);

    const final = await loadState(projectPath);
    assert.equal(final.counters.traces, N + 16, "traces (trace+verification) all counted");
    assert.equal(final.counters.verifications, 8, "verifications all counted");
    assert.equal(final.counters.knowledgeItems, 8, "knowledge items all counted");
    console.log("R3-2 PASS: concurrent writers no longer lose state updates");
  } finally {
    await fs.rm(projectPath, { recursive: true, force: true });
  }
}

console.log("Round 3 hardening all checks passed.");
