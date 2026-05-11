import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  ensureHarness,
  harnessPath,
  migrateHarness,
  resolveProjectPath
} from "../assets/codex-harness-mcp/src/core.mjs";

// R8-1: resolveProjectPath uses process.cwd() ahead of PWD env so that spawn
// with cwd:X writes into X, not into the parent shell's PWD.
{
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "r8-resolve-"));
  const serverPath = path.resolve("assets/codex-harness-mcp/src/server.mjs");
  // Spawn with a brand-new cwd but inherit env (so PWD still points elsewhere).
  const child = spawn(process.execPath, [serverPath], { cwd, stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "";
  child.stdout.on("data", (c) => stdout += c.toString("utf8"));
  child.stdin.on("error", () => {});
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } }) + "\n");
  child.stdin.write(JSON.stringify({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: { name: "harness_create_contract", arguments: { title: "Resolve probe", goal: "Verify projectPath defaults to cwd", completion_conditions: ["done"] } }
  }) + "\n");
  child.stdin.end();
  await new Promise((res) => child.on("close", res));

  const lines = stdout.split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const callResp = lines.find((m) => m.id === 2);
  const payload = JSON.parse(callResp.result.content[0].text);
  assert.equal(payload.projectPath, cwd, `server must write to spawn cwd ${cwd}, got ${payload.projectPath}`);
  const contracts = await fs.readdir(path.join(cwd, ".codex-harness", "contracts"));
  assert.ok(contracts.length >= 1, "contract artifact lives under the spawned cwd");
  await fs.rm(cwd, { recursive: true, force: true });
  console.log("R8-1 PASS: resolveProjectPath honors spawn cwd over inherited PWD");
}

// R8-2: state.v*.backup.json files are pruned to the most recent N.
{
  const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "r8-prune-"));
  try {
    await ensureHarness({ project_path: projectPath });
    const stateFile = harnessPath(projectPath, "state.json");
    // Plant pre-v5 state and migrate repeatedly; each successful migration adds a backup.
    for (let i = 0; i < 8; i++) {
      await fs.writeFile(stateFile, JSON.stringify({
        version: 1,
        projectName: `p${i}`,
        status: "idle",
        focus: null,
        activeContractId: null,
        counters: { contracts: i },
        decisions: [],
        events: []
      }), "utf8");
      // Tiny delay so timestamps differ
      await new Promise((res) => setTimeout(res, 4));
      await migrateHarness({ project_path: projectPath });
    }
    const root = harnessPath(projectPath);
    const backups = (await fs.readdir(root)).filter((n) => /^state\.v\d+\.backup\.\d+\.json$/.test(n));
    assert.ok(backups.length <= 5, `expected at most 5 backups retained, got ${backups.length}`);
    assert.ok(backups.length >= 1, "at least one backup retained after migrations");
    console.log(`R8-2 PASS: backup rotation kept ${backups.length} out of 8 migrations`);
  } finally {
    await fs.rm(projectPath, { recursive: true, force: true });
  }
}

// R8-3 (refuted, documentation): record_eval_run.score is intentionally unbounded
// because evals use heterogeneous ranges (0-1, 0-100, raw f-score, etc.). The
// validator accepts any number; this test merely pins the decision.
{
  const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "r8-score-"));
  try {
    const { recordEvalCase, recordEvalRun } = await import("../assets/codex-harness-mcp/src/core.mjs");
    await ensureHarness({ project_path: projectPath });
    const c = await recordEvalCase({ project_path: projectPath, title: "score range case", task: "" });
    const negative = await recordEvalRun({ project_path: projectPath, eval_case_id: c.case.id, score: -1.5, verdict: "fail" });
    const huge = await recordEvalRun({ project_path: projectPath, eval_case_id: c.case.id, score: 1e9, verdict: "pass" });
    assert.equal(negative.run.score, -1.5, "negative scores stored verbatim");
    assert.equal(huge.run.score, 1e9, "large scores stored verbatim");
    console.log("R8-3 PASS (refuted): score unbounded by design");
  } finally {
    await fs.rm(projectPath, { recursive: true, force: true });
  }
}

console.log("Round 8: cwd resolution honored, backup rotation enforced, score range pinned.");

// Silence unused warning for resolveProjectPath import in editor diagnostics.
void resolveProjectPath;
