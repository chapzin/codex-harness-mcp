import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  compactContext,
  createContract,
  ensureHarness,
  evalGate,
  nextStep,
  recordTrace
} from "../assets/codex-harness-mcp/src/core.mjs";

const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "codex-harness-core-smoke-"));

try {
  await ensureHarness({ project_path: projectPath, project_name: "smoke" });
  const created = await createContract({
    project_path: projectPath,
    title: "Smoke contract",
    goal: "Verify core harness operations work.",
    completion_conditions: ["Smoke trace recorded"],
    output_paths: [".codex-harness/HARNESS.md"]
  });
  await recordTrace({
    project_path: projectPath,
    contract_id: created.contract.id,
    kind: "verification",
    summary: "Smoke verification trace",
    raw: "Core functions completed without throwing."
  });
  const next = await nextStep({ project_path: projectPath });
  const gate = await evalGate({
    project_path: projectPath,
    contract_id: created.contract.id,
    checked_conditions: ["Smoke trace recorded"],
    verdict: "pass"
  });
  const compact = await compactContext({ project_path: projectPath });

  if (!next.recommendation || gate.gate.verdict !== "pass" || !compact.text.includes("Harness Context")) {
    throw new Error("Core smoke test failed.");
  }

  console.log("Core smoke test passed.");
} finally {
  await fs.rm(projectPath, { recursive: true, force: true });
}
