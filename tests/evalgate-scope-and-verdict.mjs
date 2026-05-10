import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  createContract,
  evalGate
} from "../assets/codex-harness-mcp/src/core.mjs";

const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "harness-evalgate-"));

try {
  // Plant a real file outside the project root that should NOT be probeable.
  const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), "harness-outside-"));
  const outsideFile = path.join(outsideDir, "leaked.txt");
  await fs.writeFile(outsideFile, "secret", "utf8");

  const created = await createContract({
    project_path: projectPath,
    title: "Scope contract",
    goal: "Verify outputs are scoped to project root.",
    output_paths: [
      "build/result.txt",
      outsideFile,
      "../../etc/hostname",
      `${outsideDir}/leaked.txt`
    ],
    completion_conditions: ["scoped"]
  });

  const gate = await evalGate({
    project_path: projectPath,
    contract_id: created.contract.id,
    checked_conditions: ["scoped"]
  });

  const checks = gate.gate.outputChecks;
  const findCheck = (p) => checks.find((c) => c.path === p);

  assert.ok(findCheck("build/result.txt"), "in-scope path is checked");
  assert.equal(findCheck("build/result.txt").exists, false, "missing in-scope file is exists=false");
  assert.equal(findCheck("build/result.txt").outOfScope, undefined, "in-scope path has no outOfScope flag");

  for (const escaped of [outsideFile, "../../etc/hostname", `${outsideDir}/leaked.txt`]) {
    const c = findCheck(escaped);
    assert.ok(c, `out-of-scope path is recorded: ${escaped}`);
    assert.equal(c.exists, false, `out-of-scope path never reports exists=true: ${escaped}`);
    assert.equal(c.outOfScope, true, `out-of-scope path is flagged: ${escaped}`);
  }

  // Verdict normalization: bogus verdict is ignored, falls back to computed.
  const bogus = await evalGate({
    project_path: projectPath,
    contract_id: created.contract.id,
    checked_conditions: ["scoped"],
    verdict: "i-cheated-haha"
  });
  assert.ok(["pass", "fail", "unknown"].includes(bogus.gate.verdict),
    "bogus verdict is normalized to enum value");
  assert.notEqual(bogus.gate.verdict, "i-cheated-haha", "bogus verdict is rejected");

  await fs.rm(outsideDir, { recursive: true, force: true });
  console.log("evalGate output paths are scoped and verdicts are normalized.");
} finally {
  await fs.rm(projectPath, { recursive: true, force: true });
}
