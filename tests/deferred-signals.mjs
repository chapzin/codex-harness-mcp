import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  listHarness,
  recordKnowledge,
  recordHarnessProposal,
  writeGovernancePolicy
} from "../assets/codex-harness-mcp/src/core.mjs";

const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "codex-harness-deferred-signals-"));

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
  // Scenario 1: Fresh project — all signals at zero, nothing should reconsider
  {
    const result = await listHarness({ project_path: projectPath });

    check(
      "s1.deferredSignals-present",
      result.deferredSignals && typeof result.deferredSignals === "object",
      typeof result.deferredSignals
    );

    const ds = result.deferredSignals || {};

    check(
      "s1.s2-shape",
      ds.s2_worker_threads &&
        typeof ds.s2_worker_threads.corpusSize === "number" &&
        typeof ds.s2_worker_threads.shouldReconsider === "boolean",
      JSON.stringify(ds.s2_worker_threads)
    );
    check(
      "s1.s2-shouldReconsider-false",
      ds.s2_worker_threads?.shouldReconsider === false,
      `corpusSize=${ds.s2_worker_threads?.corpusSize}`
    );

    check(
      "s1.c4-shape",
      ds.c4_rego_lite &&
        typeof ds.c4_rego_lite.policyCustomized === "boolean" &&
        typeof ds.c4_rego_lite.shouldReconsider === "boolean",
      JSON.stringify(ds.c4_rego_lite)
    );
    check(
      "s1.c4-fresh-not-customized",
      ds.c4_rego_lite?.policyCustomized === false && ds.c4_rego_lite?.shouldReconsider === false,
      JSON.stringify(ds.c4_rego_lite)
    );

    check(
      "s1.m5-shape",
      ds.m5_reflection &&
        typeof ds.m5_reflection.proposalsCount === "number" &&
        typeof ds.m5_reflection.decisionsCount === "number" &&
        typeof ds.m5_reflection.shouldReconsider === "boolean",
      JSON.stringify(ds.m5_reflection)
    );
    check(
      "s1.m5-zero-proposals",
      ds.m5_reflection?.proposalsCount === 0 && ds.m5_reflection?.shouldReconsider === false,
      JSON.stringify(ds.m5_reflection)
    );

    check(
      "s1.regression-strong-shape",
      ds.regression_coverage_strong &&
        typeof ds.regression_coverage_strong.coverageWarningFiredCount === "number" &&
        typeof ds.regression_coverage_strong.shouldReconsider === "boolean",
      JSON.stringify(ds.regression_coverage_strong)
    );

    check(
      "s1.thresholds-documented",
      ds.s2_worker_threads?.threshold &&
        ds.c4_rego_lite?.threshold &&
        ds.m5_reflection?.threshold &&
        ds.regression_coverage_strong?.threshold,
      "thresholds field expected on all 4 signals"
    );
  }

  // Scenario 2: M5 should reconsider when proposals >= 5
  {
    for (let i = 0; i < 5; i++) {
      await recordHarnessProposal({
        project_path: projectPath,
        title: `manual proposal ${i}`,
        proposed_change: "minor exploratory change"
      });
    }

    const result = await listHarness({ project_path: projectPath });
    const m5 = result.deferredSignals?.m5_reflection;

    check(
      "s2.m5-proposals-count-5",
      m5?.proposalsCount === 5,
      `got ${m5?.proposalsCount}`
    );
    check(
      "s2.m5-shouldReconsider-true",
      m5?.shouldReconsider === true,
      JSON.stringify(m5)
    );
  }

  // Scenario 3: C4 customized policy triggers shouldReconsider when updatedAt > createdAt
  {
    // First write creates the policy (createdAt = updatedAt)
    await writeGovernancePolicy({
      project_path: projectPath,
      network_allowed: false
    });
    // Sleep briefly to ensure a distinct timestamp on second write
    await new Promise((resolve) => setTimeout(resolve, 50));
    await writeGovernancePolicy({
      project_path: projectPath,
      notes: "experiment customization #1"
    });

    const result = await listHarness({ project_path: projectPath });
    const c4 = result.deferredSignals?.c4_rego_lite;

    check(
      "s3.c4-customized-true",
      c4?.policyCustomized === true,
      `created=${c4?.policyCreatedAt} updated=${c4?.policyUpdatedAt}`
    );
  }

  // Scenario 4: S2 corpus size signal grows with knowledge items
  {
    // Record many knowledge items to bump corpus
    for (let i = 0; i < 3; i++) {
      await recordKnowledge({
        project_path: projectPath,
        title: `corpus growth item ${i}`,
        kind: "knowledge",
        summary: "test corpus growth"
      });
    }

    const result = await listHarness({ project_path: projectPath });
    const s2 = result.deferredSignals?.s2_worker_threads;

    check(
      "s2.s2-corpus-tracks-items",
      s2?.corpusSize >= 3,
      `corpusSize=${s2?.corpusSize}`
    );
    check(
      "s2.s2-still-not-reconsider-small-corpus",
      s2?.shouldReconsider === false,
      `corpus=${s2?.corpusSize} threshold expected high`
    );
  }
} finally {
  await fs.rm(projectPath, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
