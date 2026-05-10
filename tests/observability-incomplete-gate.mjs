import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  createContract,
  evalGate,
  exportObservabilityReport,
  recordTrace,
  recordVerification
} from "../assets/codex-harness-mcp/src/core.mjs";

const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "codex-harness-gate-blindspot-"));

try {
  const created = await createContract({
    project_path: projectPath,
    title: "Gate blind-spot contract",
    goal: "Surface incomplete gate evidence in the observability report.",
    completion_conditions: [
      "Outputs exist",
      "Verification passed",
      "Manual sign-off captured"
    ],
    output_paths: [],
    verification_commands: ["node tests/observability-incomplete-gate.mjs"]
  });
  const contractId = created.contract.id;

  await recordTrace({
    project_path: projectPath,
    contract_id: contractId,
    kind: "attempt",
    summary: "Initial attempt",
    raw: "ok"
  });

  await recordVerification({
    project_path: projectPath,
    contract_id: contractId,
    command_or_check: "node tests/observability-incomplete-gate.mjs",
    status: "pass",
    exit_code: 0,
    summary: "Verification recorded",
    raw_output: "ok"
  });

  await evalGate({
    project_path: projectPath,
    contract_id: contractId,
    checked_conditions: ["Outputs exist"],
    verdict: "unknown",
    notes: "Awaiting manual sign-off"
  });

  const exported = await exportObservabilityReport({
    project_path: projectPath,
    max_traces: 5
  });

  assert.match(
    exported.report,
    /unchecked completion conditions/i,
    "blind spot must mention unchecked completion conditions"
  );
  assert.match(
    exported.report,
    /Last completion gate verdict is `unknown`/,
    "blind spot must mention non-pass gate verdict"
  );

  console.log("Observability blind spots cover incomplete gates.");
} finally {
  await fs.rm(projectPath, { recursive: true, force: true });
}
