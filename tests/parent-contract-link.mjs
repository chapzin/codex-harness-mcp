import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  createContract,
  loadContract,
  ensureHarness,
  renderContract
} from "../assets/codex-harness-mcp/src/core.mjs";

const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "parent-contract-"));

try {
  await ensureHarness({ project_path: projectPath });

  // 1. Parent contract without parent_contract_id stays parentContractId=null
  const parent = await createContract({
    project_path: projectPath,
    title: "Root parent",
    goal: "Root goal example",
    completion_conditions: ["done"]
  });
  assert.equal(parent.contract.parentContractId, null, "no parent by default");
  assert.ok(!parent.markdown.includes("Parent contract:"), "render hides Parent contract line when absent");

  // 2. Child contract links to parent
  const child = await createContract({
    project_path: projectPath,
    title: "Follow-up child",
    goal: "Continue parent goal",
    completion_conditions: ["done"],
    parent_contract_id: parent.contract.id
  });
  assert.equal(child.contract.parentContractId, parent.contract.id, "child carries parentContractId");
  assert.match(child.markdown, /Parent contract: `2026-/, "render shows Parent contract line when linked");

  // 3. Loaded contract round-trips parent
  const loaded = await loadContract(projectPath, child.contract.id);
  assert.equal(loaded.parentContractId, parent.contract.id, "loadContract round-trips parentContractId");
  const rendered = renderContract(loaded);
  assert.match(rendered, new RegExp(`Parent contract: \`${parent.contract.id}\``), "render uses parent id");

  // 4. Invalid parent (traversal) is rejected
  await assert.rejects(
    createContract({
      project_path: projectPath,
      title: "Malicious child",
      goal: "Malicious follow-up",
      completion_conditions: ["done"],
      parent_contract_id: "../etc/passwd"
    }),
    /must be a safe stored contract id/,
    "traversal parent is rejected"
  );

  // 5. Non-existent but well-formed parent id is accepted (the server cannot
  //    enforce existence cheaply and the field is documentation-only).
  const orphan = await createContract({
    project_path: projectPath,
    title: "Orphan child",
    goal: "Has parent that does not exist",
    completion_conditions: ["done"],
    parent_contract_id: "2026-01-01-nonexistent-abcdef"
  });
  assert.equal(orphan.contract.parentContractId, "2026-01-01-nonexistent-abcdef");

  console.log("Parent-contract linking: stores, renders, round-trips, and rejects traversal.");
} finally {
  await fs.rm(projectPath, { recursive: true, force: true });
}
