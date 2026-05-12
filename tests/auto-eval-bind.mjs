import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createContract,
  evalGate,
  listEvalRuns,
  recordEvalCase,
  recordVerification
} from "../assets/codex-harness-mcp/src/core.mjs";

const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "codex-harness-auto-eval-bind-"));

let passed = 0;
let failed = 0;
function check(label, ok, extra) {
  if (ok) {
    console.log("PASS:", label);
    passed += 1;
  } else {
    console.error("FAIL:", label, extra ?? "");
    failed += 1;
  }
}

try {
  // Scenario 1: Gate pass, no eval_cases registered → autoEvalRuns = []
  {
    const contractResult = await createContract({
      project_path: projectPath,
      title: "scenario-1 contract no eval_case",
      goal: "Verify no-binding when no cases exist",
      completion_conditions: ["condition-a"]
    });
    const contractId = contractResult.contract.id;

    await recordVerification({
      project_path: projectPath,
      contract_id: contractId,
      command_or_check: "node tests/scenario-1.mjs",
      status: "pass",
      raw_output: "1 passed, 0 failed"
    });

    const gateResult = await evalGate({
      project_path: projectPath,
      contract_id: contractId,
      checked_conditions: ["condition-a"]
    });

    check(
      "s1.gate-pass-no-cases.autoEvalRuns-empty-array",
      Array.isArray(gateResult.autoEvalRuns) && gateResult.autoEvalRuns.length === 0,
      `got ${JSON.stringify(gateResult.autoEvalRuns)}`
    );
  }

  // Scenario 2: Gate pass, 1 eval_case fully matched → autoEvalRuns has 1 entry, score=1.0, verdict=pass
  {
    const contractResult = await createContract({
      project_path: projectPath,
      title: "scenario-2 contract single match",
      goal: "Verify binding when verification_checks fully matched",
      completion_conditions: ["condition-b"]
    });
    const contractId = contractResult.contract.id;

    await recordEvalCase({
      project_path: projectPath,
      title: "scenario-2 case for contract",
      split: "regression",
      verification_checks: ["node tests/scenario-2.mjs passes"],
      acceptance_criteria: ["scenario-2 happy path"]
    });

    await recordVerification({
      project_path: projectPath,
      contract_id: contractId,
      command_or_check: "node tests/scenario-2.mjs",
      status: "pass",
      raw_output: "1 passed"
    });

    const before = await listEvalRuns({ project_path: projectPath });
    const beforeCount = before.runs.length;

    const gateResult = await evalGate({
      project_path: projectPath,
      contract_id: contractId,
      checked_conditions: ["condition-b"]
    });

    check(
      "s2.gate-pass-full-match.autoEvalRuns-one-entry",
      Array.isArray(gateResult.autoEvalRuns) && gateResult.autoEvalRuns.length === 1,
      `got ${JSON.stringify(gateResult.autoEvalRuns)}`
    );

    const entry = gateResult.autoEvalRuns?.[0] || {};
    check("s2.entry.score-1", entry.score === 1, `score=${entry.score}`);
    check("s2.entry.verdict-pass", entry.verdict === "pass", `verdict=${entry.verdict}`);
    check(
      "s2.entry.matchedCount-totalChecks",
      entry.matchedCount === 1 && entry.totalChecks === 1,
      `matched=${entry.matchedCount}/${entry.totalChecks}`
    );
    check(
      "s2.entry.evalRunId-present",
      typeof entry.evalRunId === "string" && entry.evalRunId.length > 0,
      entry.evalRunId
    );

    const after = await listEvalRuns({ project_path: projectPath });
    check(
      "s2.persisted.runs-incremented-by-1",
      after.runs.length === beforeCount + 1,
      `before=${beforeCount} after=${after.runs.length}`
    );
  }

  // Scenario 3: Gate FAIL → no autoEvalRuns even if case would match
  {
    const contractResult = await createContract({
      project_path: projectPath,
      title: "scenario-3 contract fail gate",
      goal: "Verify no-binding when gate fails",
      completion_conditions: ["condition-c1", "condition-c2"]
    });
    const contractId = contractResult.contract.id;

    await recordEvalCase({
      project_path: projectPath,
      title: "scenario-3 case",
      split: "regression",
      verification_checks: ["node tests/scenario-3.mjs passes"]
    });

    await recordVerification({
      project_path: projectPath,
      contract_id: contractId,
      command_or_check: "node tests/scenario-3.mjs",
      status: "pass",
      raw_output: "passes"
    });

    const gateResult = await evalGate({
      project_path: projectPath,
      contract_id: contractId,
      checked_conditions: ["condition-c1"],
      verdict: "fail"
    });

    check("s3.gate-fail.verdict", gateResult.gate.verdict === "fail", gateResult.gate.verdict);
    check(
      "s3.gate-fail.no-auto-binding",
      Array.isArray(gateResult.autoEvalRuns) && gateResult.autoEvalRuns.length === 0,
      `got ${JSON.stringify(gateResult.autoEvalRuns)}`
    );
  }

  // Scenario 4: No verification traces → no binding (score=0)
  {
    const contractResult = await createContract({
      project_path: projectPath,
      title: "scenario-4 contract no traces",
      goal: "Verify no-binding when no traces back the checks",
      completion_conditions: ["condition-d"]
    });
    const contractId = contractResult.contract.id;

    await recordEvalCase({
      project_path: projectPath,
      title: "scenario-4 case no evidence",
      split: "regression",
      verification_checks: ["node tests/scenario-4-never-ran.mjs passes"]
    });

    const gateResult = await evalGate({
      project_path: projectPath,
      contract_id: contractId,
      checked_conditions: ["condition-d"],
      verdict: "pass"
    });

    check(
      "s4.no-traces.no-binding",
      Array.isArray(gateResult.autoEvalRuns) && gateResult.autoEvalRuns.length === 0,
      `got ${JSON.stringify(gateResult.autoEvalRuns)}`
    );
  }

  // Scenario 5: Multi-check case with partial match → score=fraction, verdict derived (unknown for middle)
  {
    const contractResult = await createContract({
      project_path: projectPath,
      title: "scenario-5 contract partial",
      goal: "Verify fractional score on partial check match",
      completion_conditions: ["condition-e"]
    });
    const contractId = contractResult.contract.id;

    await recordEvalCase({
      project_path: projectPath,
      title: "scenario-5 case multi-check",
      split: "regression",
      verification_checks: [
        "node tests/scenario-5-a.mjs passes",
        "node tests/scenario-5-b.mjs passes",
        "node tests/scenario-5-c.mjs passes"
      ]
    });

    // Only 2 of 3 checks have evidence
    await recordVerification({
      project_path: projectPath,
      contract_id: contractId,
      command_or_check: "node tests/scenario-5-a.mjs",
      status: "pass",
      raw_output: "a passes"
    });
    await recordVerification({
      project_path: projectPath,
      contract_id: contractId,
      command_or_check: "node tests/scenario-5-b.mjs",
      status: "pass",
      raw_output: "b passes"
    });

    const gateResult = await evalGate({
      project_path: projectPath,
      contract_id: contractId,
      checked_conditions: ["condition-e"]
    });

    const entry = gateResult.autoEvalRuns?.[0] || {};
    check(
      "s5.partial.score-2-of-3",
      Math.abs(entry.score - 2 / 3) < 0.0001,
      `score=${entry.score}`
    );
    check(
      "s5.partial.verdict-unknown",
      entry.verdict === "unknown",
      `verdict=${entry.verdict}`
    );
    check(
      "s5.partial.matchedCount-totalChecks",
      entry.matchedCount === 2 && entry.totalChecks === 3,
      `matched=${entry.matchedCount}/${entry.totalChecks}`
    );
  }

  // Scenario 6: Multi-case match — 2 eval_cases both fully matched → autoEvalRuns has 2 entries
  {
    const contractResult = await createContract({
      project_path: projectPath,
      title: "scenario-6 contract multi-case",
      goal: "Verify binding emits one entry per matched eval_case",
      completion_conditions: ["condition-f"]
    });
    const contractId = contractResult.contract.id;

    const caseA = await recordEvalCase({
      project_path: projectPath,
      title: "scenario-6 case A",
      split: "regression",
      verification_checks: ["node tests/scenario-6-shared.mjs passes"]
    });
    const caseB = await recordEvalCase({
      project_path: projectPath,
      title: "scenario-6 case B",
      split: "regression",
      verification_checks: ["node tests/scenario-6-shared.mjs passes"]
    });

    await recordVerification({
      project_path: projectPath,
      contract_id: contractId,
      command_or_check: "node tests/scenario-6-shared.mjs",
      status: "pass",
      raw_output: "shared passes"
    });

    const gateResult = await evalGate({
      project_path: projectPath,
      contract_id: contractId,
      checked_conditions: ["condition-f"]
    });

    check(
      "s6.multi-case.autoEvalRuns-two-entries",
      Array.isArray(gateResult.autoEvalRuns) && gateResult.autoEvalRuns.length === 2,
      `count=${gateResult.autoEvalRuns?.length}`
    );
    const evalCaseIds = (gateResult.autoEvalRuns || []).map((entry) => entry.evalCaseId);
    check(
      "s6.multi-case.both-cases-bound",
      evalCaseIds.includes(caseA.case.id) && evalCaseIds.includes(caseB.case.id),
      JSON.stringify(evalCaseIds)
    );
  }

  // Scenario 7: Gate verdict=unknown → no auto-binding (only pass triggers bind)
  {
    const contractResult = await createContract({
      project_path: projectPath,
      title: "scenario-7 contract unknown verdict",
      goal: "Verify no-binding when gate verdict is unknown",
      completion_conditions: ["condition-g1", "condition-g2"]
    });
    const contractId = contractResult.contract.id;

    await recordEvalCase({
      project_path: projectPath,
      title: "scenario-7 case",
      split: "regression",
      verification_checks: ["node tests/scenario-7.mjs passes"]
    });

    await recordVerification({
      project_path: projectPath,
      contract_id: contractId,
      command_or_check: "node tests/scenario-7.mjs",
      status: "pass",
      raw_output: "passes"
    });

    // Leave condition-g2 unchecked and do not pass explicit verdict → derives "unknown"
    const gateResult = await evalGate({
      project_path: projectPath,
      contract_id: contractId,
      checked_conditions: ["condition-g1"]
    });

    check(
      "s7.unknown-verdict.gate-verdict",
      gateResult.gate.verdict === "unknown",
      gateResult.gate.verdict
    );
    check(
      "s7.unknown-verdict.no-binding",
      Array.isArray(gateResult.autoEvalRuns) && gateResult.autoEvalRuns.length === 0,
      `got ${JSON.stringify(gateResult.autoEvalRuns)}`
    );
  }
} finally {
  await fs.rm(projectPath, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
