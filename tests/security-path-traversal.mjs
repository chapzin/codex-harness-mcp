import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  ensureHarness,
  createContract,
  loadContract,
  auditGovernance,
  evalGate,
  nextStep
} from "../assets/codex-harness-mcp/src/core.mjs";
import { readHarnessResource } from "../assets/codex-harness-mcp/src/mcp-features.mjs";

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "harness-pathtraversal-"));

try {
  await ensureHarness({ project_path: tmp });

  const created = await createContract({
    project_path: tmp,
    title: "Sample contract",
    completion_conditions: ["done"]
  });
  const contract = created.contract;
  assert.ok(contract.id, "contract created");

  const traversalIds = [
    "../../etc/passwd",
    "..\\..\\windows\\system32\\config",
    "/etc/passwd",
    "contract/../../escape",
    "..",
    "abc/../def"
  ];

  for (const malicious of traversalIds) {
    const result = await loadContract(tmp, malicious);
    assert.equal(result, null, `loadContract must reject traversal id: ${malicious}`);
  }

  for (const malicious of traversalIds) {
    const audit = await auditGovernance({ project_path: tmp, contract_id: malicious });
    const missing = audit.findings.find((finding) => finding.id === "missing_contract");
    assert.ok(missing, `auditGovernance must surface missing_contract for traversal id: ${malicious}`);
    assert.equal(missing.level, "block", `auditGovernance must BLOCK on traversal id: ${malicious}`);
  }

  for (const malicious of traversalIds) {
    await assert.rejects(
      evalGate({ project_path: tmp, contract_id: malicious }),
      /No active contract/i,
      `evalGate must reject traversal id: ${malicious}`
    );
  }

  const ns = await nextStep({ project_path: tmp, contract_id: "../../escape" });
  assert.ok(
    /create a small execution contract|create a contract/i.test(ns.recommendation || ""),
    "nextStep returns the no-contract recommendation when id is malicious"
  );

  const legitimate = await loadContract(tmp, contract.id);
  assert.equal(legitimate.id, contract.id, "legitimate contract still loads");

  const traversalUris = [
    "harness://contract/..%2F..%2F..%2Fetc%2Fhostname",
    "harness://contract/..%2F..%2Fpasswd",
    "harness://contract/%2Fetc%2Fpasswd",
    "harness://contract/..%5C..%5Cwindows",
    "harness://contract/foo%2F..%2Fbar"
  ];
  for (const uri of traversalUris) {
    await assert.rejects(
      readHarnessResource(uri, { project_path: tmp }),
      /Invalid harness contract id|not found/i,
      `readHarnessResource must reject traversal URI: ${uri}`
    );
  }

  const legitimateUri = `harness://contract/${encodeURIComponent(contract.id)}`;
  const legitimateRead = await readHarnessResource(legitimateUri, { project_path: tmp });
  assert.ok(legitimateRead?.contents?.[0]?.text, "legitimate contract URI still resolves");

  console.log("Path traversal guards reject malicious contract IDs.");
} finally {
  await fs.rm(tmp, { recursive: true, force: true });
}
