import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  auditGovernance,
  createContract,
  ensureHarness,
  evalGate,
  harnessPath,
  recordTrace,
  recordVerification,
  writeGovernancePolicy
} from "../assets/codex-harness-mcp/src/core.mjs";
import {
  listHarnessResources,
  readHarnessResource
} from "../assets/codex-harness-mcp/src/mcp-features.mjs";

const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "codex-harness-governance-"));

try {
  await ensureHarness({ project_path: projectPath, project_name: "governance" });

  const initial = await auditGovernance({ project_path: projectPath });
  assertFinding(initial, "missing_contract", "block");
  if (initial.status !== "block") {
    throw new Error("Governance audit should block a harness with no contract.");
  }

  const policyResult = await writeGovernancePolicy({
    project_path: projectPath,
    allowed_write_roots: ["docs/**", "tests/**", "assets/**"],
    forbidden_paths: [".env", ".secrets/**", "node_modules/**"],
    required_verification: ["targeted test", "security gate"],
    require_trace_raw: true,
    require_completion_gate: true,
    network_allowed: false,
    install_packages_allowed: false,
    subagent_policy: "Subagents need contract, scope, budget, output format, and stop rule."
  });
  if (!policyResult.policy.requiredVerification.includes("targeted test")) {
    throw new Error("Governance policy did not persist required verification classes.");
  }

  const created = await createContract({
    project_path: projectPath,
    title: "Governance rich contract",
    goal: "Prove governance audit can validate a controlled harness change.",
    completion_conditions: ["Tests pass", "Security gates pass"],
    output_paths: ["docs/governance-output.md"],
    verification_commands: ["node tests/governance-audit.mjs"],
    permissions: [
      "Read project files needed for governance.",
      "Edit docs/**, tests/**, and assets/** only.",
      "Do not install packages or call network from the MCP server."
    ],
    failure_taxonomy: ["F01 missing_artifact", "F02 schema_validation_error", "F10 harness_cost_regression"]
  });

  await fs.mkdir(path.join(projectPath, "docs"), { recursive: true });
  await fs.writeFile(path.join(projectPath, "docs", "governance-output.md"), "ok\n", "utf8");

  await recordTrace({
    project_path: projectPath,
    contract_id: created.contract.id,
    kind: "attempt",
    summary: "Governance audit attempt",
    raw: "Raw trace preserved with command, output, and decision evidence."
  });

  await recordVerification({
    project_path: projectPath,
    contract_id: created.contract.id,
    command_or_check: "node tests/governance-audit.mjs",
    status: "pass",
    raw_output: "governance test passed",
    summary: "Targeted governance test passed"
  });

  await evalGate({
    project_path: projectPath,
    contract_id: created.contract.id,
    checked_conditions: ["Tests pass", "Security gates pass"],
    evidence: ["node tests/governance-audit.mjs"],
    verdict: "pass"
  });

  const finalAudit = await auditGovernance({ project_path: projectPath });
  if (finalAudit.status !== "pass") {
    throw new Error(`Governance audit should pass after contract, policy, trace, verification, and gate evidence. Got ${finalAudit.status}.`);
  }
  for (const expected of [
    "contract_present",
    "completion_conditions_present",
    "verification_evidence_present",
    "raw_trace_present",
    "policy_present",
    "completion_gate_passed"
  ]) {
    assertFinding(finalAudit, expected, "pass");
  }

  const resources = await listHarnessResources({ project_path: projectPath });
  const resourceUris = resources.resources.map((resource) => resource.uri);
  if (!resourceUris.includes("harness://governance/report")) {
    throw new Error("Governance report resource is not listed.");
  }

  const report = await readHarnessResource("harness://governance/report", { project_path: projectPath });
  const reportText = report.contents[0].text;
  if (!reportText.includes("# Harness Governance Report") || !reportText.includes("PASS")) {
    throw new Error("Governance report resource did not include the expected report content.");
  }

  const policyPath = harnessPath(projectPath, "policy.json");
  const policy = JSON.parse(await fs.readFile(policyPath, "utf8"));
  if (policy.networkAllowed !== false || policy.installPackagesAllowed !== false) {
    throw new Error("Governance policy should default to network/package-install denial.");
  }

  console.log("Harness governance audit, policy, and report are available.");
} finally {
  await fs.rm(projectPath, { recursive: true, force: true });
}

function assertFinding(audit, id, level) {
  const finding = audit.findings.find((item) => item.id === id);
  if (!finding) {
    throw new Error(`Missing governance finding: ${id}`);
  }
  if (finding.level !== level) {
    throw new Error(`Governance finding ${id} should be ${level}, got ${finding.level}.`);
  }
}
