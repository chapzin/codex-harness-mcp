import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createContract,
  evalGate,
  nextStep,
  recordEvalCase,
  recordHarnessProposal,
  recordVerification
} from "../assets/codex-harness-mcp/src/core.mjs";

const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "codex-harness-next-step-adv-"));

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
  // Scenario 1: Fresh project, no contract — advisories empty array
  {
    const result = await nextStep({ project_path: projectPath });
    check(
      "s1.advisories-array",
      Array.isArray(result.advisories),
      typeof result.advisories
    );
    check(
      "s1.advisories-empty-fresh",
      result.advisories?.length === 0,
      `len=${result.advisories?.length}`
    );
  }

  // Scenario 2: Active contract with no signals — advisories still empty
  {
    const contractResult = await createContract({
      project_path: projectPath,
      title: "s2 active no signals",
      goal: "Verify no advisories when state is clean",
      completion_conditions: ["condition-x"]
    });
    await recordVerification({
      project_path: projectPath,
      contract_id: contractResult.contract.id,
      command_or_check: "node tests/s2.mjs",
      status: "pass",
      raw_output: "passes"
    });

    const result = await nextStep({ project_path: projectPath });
    check(
      "s2.advisories-still-empty",
      Array.isArray(result.advisories) && result.advisories.length === 0,
      JSON.stringify(result.advisories)
    );
  }

  // Scenario 3: Trigger coverageWarning + M5 reconsider → 2 advisories
  {
    // Create a contract with eval_case in unrelated area to fire coverageWarning
    const contractResult = await createContract({
      project_path: projectPath,
      title: "s3 fire coverage warning",
      goal: "Fire coverage warning to populate counter",
      completion_conditions: ["only-c"]
    });
    const contractId = contractResult.contract.id;

    await recordEvalCase({
      project_path: projectPath,
      title: "unrelated area case",
      split: "regression",
      verification_checks: ["node tests/unrelated.mjs passes"]
    });
    await recordVerification({
      project_path: projectPath,
      contract_id: contractId,
      command_or_check: "node tests/s3-this.mjs",
      status: "pass",
      raw_output: "passes"
    });
    await evalGate({
      project_path: projectPath,
      contract_id: contractId,
      checked_conditions: ["only-c"]
    });

    // Trigger M5 shouldReconsider by recording 5 proposals
    for (let i = 0; i < 5; i++) {
      await recordHarnessProposal({
        project_path: projectPath,
        title: `proposal s3-${i}`,
        proposed_change: "exploratory tweak"
      });
    }

    const result = await nextStep({ project_path: projectPath });
    check(
      "s3.advisories-has-entries",
      Array.isArray(result.advisories) && result.advisories.length >= 2,
      `len=${result.advisories?.length} contents=${JSON.stringify(result.advisories)}`
    );

    const types = (result.advisories || []).map((a) => a.type);
    check(
      "s3.advisories-coverage-warning-emitted",
      types.includes("coverage_warnings_observed"),
      JSON.stringify(types)
    );
    check(
      "s3.advisories-m5-reconsider-emitted",
      types.some((t) => t === "deferred_signal_threshold_met"),
      JSON.stringify(types)
    );

    const m5Advisory = (result.advisories || []).find(
      (a) => a.type === "deferred_signal_threshold_met" && a.signal === "m5_reflection"
    );
    check(
      "s3.advisories-m5-signal-named",
      !!m5Advisory,
      JSON.stringify(result.advisories)
    );
    check(
      "s3.advisories-suggestion-present",
      m5Advisory && typeof m5Advisory.suggestion === "string" && m5Advisory.suggestion.length > 0,
      JSON.stringify(m5Advisory)
    );
  }
} finally {
  await fs.rm(projectPath, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
