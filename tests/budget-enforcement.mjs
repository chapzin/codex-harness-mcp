import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  auditGovernance,
  createContract,
  ensureHarness,
  evalGate,
  harnessPath,
  loadContract,
  recordTrace,
  recordVerification,
  writeJson
} from "../assets/codex-harness-mcp/src/core.mjs";
import {
  isSqliteAvailable,
  mirrorToDb
} from "../assets/codex-harness-mcp/src/db.mjs";

const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "budget-"));

try {
  await ensureHarness({ project_path: projectPath });

  // Contract with max_steps=5, max_minutes=10 so we can trigger both flags
  const created = await createContract({
    project_path: projectPath,
    title: "Budget probe",
    goal: "Trigger budget findings",
    completion_conditions: ["done"],
    output_paths: ["readme.md"],
    verification_commands: ["echo ok"],
    max_steps: 5,
    max_minutes: 10
  });
  const cid = created.contract.id;
  // Provide an output so missing_required_outputs does not BLOCK
  await fs.writeFile(path.join(projectPath, "readme.md"), "ok", "utf8");

  // Record 4 traces (80% of 5) -> near_limit
  for (let i = 0; i < 4; i++) {
    await recordTrace({
      project_path: projectPath,
      contract_id: cid,
      kind: "attempt",
      summary: `step ${i}`,
      raw: "x"
    });
  }
  await recordVerification({
    project_path: projectPath,
    contract_id: cid,
    command_or_check: "echo ok",
    status: "pass",
    exit_code: 0,
    raw_output: "ok"
  });
  await evalGate({
    project_path: projectPath,
    contract_id: cid,
    checked_conditions: ["done"]
  });

  let audit = await auditGovernance({ project_path: projectPath, contract_id: cid, max_traces: 50 });
  let near = audit.findings.find((f) => f.id === "budget_steps_near_limit");
  let exceeded = audit.findings.find((f) => f.id === "budget_steps_exceeded");
  assert.ok(near || exceeded, "near_limit or exceeded must be present at 5 traces (verification counts too)");

  // Push past the limit
  for (let i = 0; i < 3; i++) {
    await recordTrace({
      project_path: projectPath,
      contract_id: cid,
      kind: "attempt",
      summary: `over ${i}`,
      raw: "x"
    });
  }
  audit = await auditGovernance({ project_path: projectPath, contract_id: cid, max_traces: 50 });
  exceeded = audit.findings.find((f) => f.id === "budget_steps_exceeded");
  assert.ok(exceeded, "budget_steps_exceeded must be present when step count >= maxSteps");
  assert.equal(exceeded.level, "flag", "budget exceeded is a flag, not block");
  assert.match(exceeded.summary, /5\)/, "summary includes maxSteps");

  // Time budget: backdate the contract (simulate elapsed). Since L promoted
  // SQLite to source-of-truth for contracts, we have to update both layers
  // for the audit reader (which goes through SQLite first) to see the change.
  const contractFile = harnessPath(projectPath, "contracts", `${cid}.json`);
  const c = await loadContract(projectPath, cid);
  const backdated = new Date(Date.now() - 12 * 60 * 1000).toISOString();
  const backdatedContract = { ...c, createdAt: backdated };
  await writeJson(contractFile, backdatedContract);
  if (isSqliteAvailable()) {
    mirrorToDb(harnessPath(projectPath), "contracts", backdatedContract);
  }

  audit = await auditGovernance({ project_path: projectPath, contract_id: cid, max_traces: 50 });
  const timeExceeded = audit.findings.find((f) => f.id === "budget_time_exceeded");
  assert.ok(timeExceeded, "budget_time_exceeded must be present when elapsed >= maxMinutes");
  assert.equal(timeExceeded.level, "flag", "time exceeded is a flag, not block");
  assert.match(timeExceeded.summary, /10 min/, "summary includes maxMinutes");

  // Contract with no budget should not produce these findings
  const noBudget = await createContract({
    project_path: projectPath,
    title: "No budget probe",
    goal: "Test no-budget path",
    completion_conditions: ["done"]
  });
  const auditNb = await auditGovernance({ project_path: projectPath, contract_id: noBudget.contract.id });
  // Default budget is { maxSteps:8, maxMinutes:45, maxToolCalls:30 } so SOME budget keys exist;
  // but at 0 traces and 0 minutes, no budget finding should fire.
  const budgetFindings = auditNb.findings.filter((f) => f.id.startsWith("budget_"));
  assert.equal(budgetFindings.length, 0, "no budget findings at 0 steps / 0 minutes");

  console.log("Budget enforcement: steps + time findings fire correctly and do not false-positive.");
} finally {
  await fs.rm(projectPath, { recursive: true, force: true });
}
