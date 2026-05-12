import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  ensureHarness,
  createContract,
  evalGate,
  recordTrace,
  recordVerification,
  recordKnowledge,
  recordEvalCase,
  recordEvalRun,
  recordHarnessProfile,
  recordHarnessProposal,
  recordPromotionDecision,
  loadContract,
  readEvalCase,
  readEvalRun,
  readHarnessProfile,
  readHarnessProposal,
  readPromotionDecision,
  readKnowledgeItem,
  loadState,
  checkStorageIntegrity,
  harnessPath
} from "../assets/codex-harness-mcp/src/core.mjs";

import {
  isSqliteAvailable,
  openHarnessDb
} from "../assets/codex-harness-mcp/src/db.mjs";

let passed = 0;
let failed = 0;

function check(name, condition, detail) {
  if (condition) {
    console.log(`PASS: ${name}`);
    passed++;
  } else {
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

if (!isSqliteAvailable()) {
  console.log("SKIP: requires Node 22.5+ (node:sqlite)");
  process.exit(0);
}

const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "codex-harness-l-flip-"));

try {
  // --- Bootstrap ---
  await ensureHarness({ project_path: projectPath, force: true, project_name: "l-flip-fixture" });

  const harnessRoot = harnessPath(projectPath);
  const db = openHarnessDb(harnessRoot);

  // --- L2 contracts: write + read SQLite-canonical ---
  const c = await createContract({
    project_path: projectPath,
    title: "l flip canonical test",
    goal: "validate full canonical pipeline"
  });
  const cid = c.contract.id;

  const contractRow = db
    .prepare("SELECT payload_json FROM contracts WHERE contract_id = ?")
    .get(cid);
  check(
    "L2.contract-row-in-sqlite",
    contractRow && contractRow.payload_json,
    `row=${JSON.stringify(contractRow)}`
  );

  const loaded = await loadContract(projectPath, cid);
  check(
    "L2.loadContract-returns-data",
    loaded && loaded.id === cid,
    `loaded=${JSON.stringify(loaded).slice(0, 80)}`
  );

  // --- L3 gates ---
  const gate = await evalGate({
    project_path: projectPath,
    contract_id: cid,
    verdict: "pass",
    checked_conditions: [],
    notes: "l-flip-canonical test"
  });
  const gateRow = db.prepare("SELECT payload_json FROM gates WHERE gate_id = ?").get(gate.gate.id);
  check(
    "L3.gate-row-in-sqlite",
    gateRow && gateRow.payload_json,
    `row=${JSON.stringify(gateRow)?.slice(0, 80)}`
  );

  // --- L4 traces (and trace subkinds via recordVerification) ---
  await recordTrace({
    project_path: projectPath,
    contract_id: cid,
    kind: "attempt",
    summary: "l-flip trace test",
    raw: "x"
  });
  await recordVerification({
    project_path: projectPath,
    contract_id: cid,
    command_or_check: "node tests/foo.mjs",
    status: "pass",
    raw_output: "ok"
  });
  const tracesCount = db.prepare("SELECT COUNT(*) AS c FROM traces").get().c;
  check(
    "L4.trace-rows-in-sqlite",
    Number(tracesCount) >= 2,
    `count=${tracesCount}`
  );

  // --- L5 knowledge_items ---
  const k = await recordKnowledge({
    project_path: projectPath,
    title: "l flip knowledge",
    kind: "knowledge",
    content: "test content for l-flip"
  });
  const knowledgeRow = db
    .prepare("SELECT payload_json FROM knowledge_items WHERE item_id = ?")
    .get(k.item.id);
  check(
    "L5.knowledge-row-in-sqlite",
    knowledgeRow && knowledgeRow.payload_json,
    `row=${JSON.stringify(knowledgeRow)?.slice(0, 80)}`
  );
  const ki = await readKnowledgeItem(projectPath, k.item.id);
  check(
    "L5.readKnowledgeItem-returns-data",
    ki && ki.id === k.item.id,
    `ki=${JSON.stringify(ki).slice(0, 80)}`
  );

  // --- L6 eval_cases + eval_runs ---
  const ec = await recordEvalCase({
    project_path: projectPath,
    title: "l-flip eval case",
    summary: "test case",
    inputs: { foo: "bar" },
    expectedOutputs: { ok: true }
  });
  const ecRow = db.prepare("SELECT payload_json FROM eval_cases WHERE case_id = ?").get(ec.case.id);
  check(
    "L6.eval_case-row-in-sqlite",
    ecRow && ecRow.payload_json,
    `row=${JSON.stringify(ecRow)?.slice(0, 80)}`
  );

  // record a profile first so eval run has a valid harness_profile_id
  const hp = await recordHarnessProfile({
    project_path: projectPath,
    name: "l-flip profile",
    summary: "test profile"
  });
  const hpRow = db
    .prepare("SELECT payload_json FROM harness_profiles WHERE profile_id = ?")
    .get(hp.profile.id);
  check(
    "L7.harness_profile-row-in-sqlite",
    hpRow && hpRow.payload_json,
    `row=${JSON.stringify(hpRow)?.slice(0, 80)}`
  );

  const er = await recordEvalRun({
    project_path: projectPath,
    eval_case_id: ec.case.id,
    harness_profile_id: hp.profile.id,
    verdict: "pass",
    score: 1
  });
  const erRow = db.prepare("SELECT payload_json FROM eval_runs WHERE run_id = ?").get(er.run.id);
  check(
    "L6.eval_run-row-in-sqlite",
    erRow && erRow.payload_json,
    `row=${JSON.stringify(erRow)?.slice(0, 80)}`
  );

  // --- L7 harness_proposals + promotion_decisions ---
  const proposal = await recordHarnessProposal({
    project_path: projectPath,
    title: "l-flip proposal",
    proposed_change: "switch foo to bar"
  });
  const propRow = db
    .prepare("SELECT payload_json FROM harness_proposals WHERE proposal_id = ?")
    .get(proposal.proposal.id);
  check(
    "L7.harness_proposal-row-in-sqlite",
    propRow && propRow.payload_json,
    `row=${JSON.stringify(propRow)?.slice(0, 80)}`
  );

  const pd = await recordPromotionDecision({
    project_path: projectPath,
    proposal_id: proposal.proposal.id,
    decision: "promote",
    rationale: "test rationale for l-flip canonical"
  });
  const pdRow = db
    .prepare("SELECT payload_json FROM promotion_decisions WHERE decision_id = ?")
    .get(pd.decision.id);
  check(
    "L7.promotion_decision-row-in-sqlite",
    pdRow && pdRow.payload_json,
    `row=${JSON.stringify(pdRow)?.slice(0, 80)}`
  );

  // --- L1 round-trip across all entities via reads ---
  const c2 = await loadContract(projectPath, cid);
  const ec2 = await readEvalCase(projectPath, ec.case.id);
  const er2 = await readEvalRun(projectPath, er.run.id);
  const hp2 = await readHarnessProfile(projectPath, hp.profile.id);
  const prop2 = await readHarnessProposal(projectPath, proposal.proposal.id);
  const pd2 = await readPromotionDecision(projectPath, pd.decision.id);
  const ki2 = await readKnowledgeItem(projectPath, k.item.id);
  const state = await loadState(projectPath);
  check(
    "round-trip.all-readers-return-data",
    Boolean(c2 && ec2 && er2 && hp2 && prop2 && pd2 && ki2 && state),
    `c2=${!!c2} ec2=${!!ec2} er2=${!!er2} hp2=${!!hp2} prop2=${!!prop2} pd2=${!!pd2} ki2=${!!ki2} state=${!!state}`
  );

  // --- Final drift check: all canonical tables ok=true ---
  const integrity = await checkStorageIntegrity({ project_path: projectPath, deep: true });
  check(
    "integrity.deep-pass-after-flip",
    integrity.ok === true,
    `pragmaResult=${integrity.pragmaResult}, failures=${integrity.tables.filter((t) => !t.ok).map((t) => `${t.name}(missingInJson=${t.missingInJson.length}, missingInSqlite=${t.missingInSqlite.length}, contentMismatch=${t.contentMismatch.length})`).join("; ")}`
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
} finally {
  await fs.rm(projectPath, { recursive: true, force: true });
}
