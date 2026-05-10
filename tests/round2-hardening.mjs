import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  auditGovernance,
  createContract,
  ensureHarness,
  harnessPath,
  nextStep,
  readKnowledgeIndex,
  readKnowledgeItem,
  recordKnowledge
} from "../assets/codex-harness-mcp/src/core.mjs";

// 1. nextStep + auditGovernance respect project scope (R2-1)
{
  const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "r2-scope-"));
  try {
    const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), "r2-outside-"));
    const outsidePath = path.join(outsideDir, "secret.txt");
    await fs.writeFile(outsidePath, "leaked", "utf8");

    const created = await createContract({
      project_path: projectPath,
      title: "Scope contract round 2",
      goal: "Probe nextStep and auditGovernance scoping.",
      output_paths: ["build/result.txt", outsidePath, "../../etc/hostname"],
      completion_conditions: ["done"]
    });

    const ns = await nextStep({ project_path: projectPath, contract_id: created.contract.id });
    // nextStep returns recentTraces shape; smoke that it didn't throw and contract is recognized
    assert.ok(ns.contract || ns.contractId, "nextStep returns contract context");

    const audit = await auditGovernance({ project_path: projectPath, contract_id: created.contract.id });
    const missing = audit.findings.find((f) => f.id === "missing_required_outputs");
    // The audit must report ALL outputs as missing (since none exist in the project root),
    // and must NOT have probed the outsidePath (it should be treated as out-of-scope).
    assert.ok(missing, "auditGovernance reports missing_required_outputs when outputs absent");
    assert.ok(
      missing.evidence.includes(outsidePath),
      "out-of-scope output is reported as missing rather than probed"
    );

    await fs.rm(outsideDir, { recursive: true, force: true });
    console.log("R2-1 PASS: scope helper applied to nextStep + auditGovernance");
  } finally {
    await fs.rm(projectPath, { recursive: true, force: true });
  }
}

// 2. upsertKnowledgeIndex recovers from corrupt index without deadlock (R2-2)
{
  const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "r2-deadlock-"));
  try {
    await ensureHarness({ project_path: projectPath });
    const indexPath = harnessPath(projectPath, "knowledge", "index.json");
    // Corrupt the index BEFORE any recordKnowledge call so upsert hits recovery in-lock
    await fs.mkdir(path.dirname(indexPath), { recursive: true });
    await fs.writeFile(indexPath, "{not valid json", "utf8");

    // Must complete (no deadlock); fix should rebuild within the lock.
    const result = await Promise.race([
      recordKnowledge({
        project_path: projectPath,
        title: "Deadlock recovery probe",
        content: "should not hang",
        kind: "knowledge"
      }),
      new Promise((_, rej) => setTimeout(() => rej(new Error("DEADLOCK")), 4000))
    ]);
    assert.ok(result.item, "recordKnowledge resolves under corrupt index");
    const index = await readKnowledgeIndex(projectPath);
    assert.ok(index.items.length >= 1, "rebuilt index contains the new item");
    console.log("R2-2 PASS: upsert under corrupt index recovers without deadlock");
  } finally {
    await fs.rm(projectPath, { recursive: true, force: true });
  }
}

// 3. writeJson refuses symlinks (R2-6)
{
  const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "r2-symlink-"));
  const victimDir = await fs.mkdtemp(path.join(os.tmpdir(), "r2-victim-"));
  const victimFile = path.join(victimDir, "v.json");
  await fs.writeFile(victimFile, '{"keep":"me"}', "utf8");

  try {
    await ensureHarness({ project_path: projectPath });
    const indexPath = harnessPath(projectPath, "knowledge", "index.json");
    await fs.rm(indexPath, { force: true });
    await fs.symlink(victimFile, indexPath);

    await assert.rejects(
      recordKnowledge({
        project_path: projectPath,
        title: "Symlink probe",
        content: "x",
        kind: "knowledge"
      }),
      /Refusing to write through symlink/,
      "writeJson refuses to write through a symlink"
    );

    const after = await fs.readFile(victimFile, "utf8");
    assert.equal(after, '{"keep":"me"}', "victim file unchanged");
    console.log("R2-6 PASS: writeJson refuses symlinks");
  } finally {
    await fs.rm(projectPath, { recursive: true, force: true });
    await fs.rm(victimDir, { recursive: true, force: true });
  }
}

// 4. harnessPath rejects parts that escape the harness root (R2-3)
{
  const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "r2-escape-"));
  try {
    assert.throws(
      () => harnessPath(projectPath, "..", "outside"),
      /escapes harness root/,
      "harnessPath blocks .. escape"
    );
    assert.throws(
      () => harnessPath(projectPath, "/etc/passwd"),
      /escapes harness root/,
      "harnessPath blocks absolute escape"
    );
    // Legitimate paths still resolve
    const ok = harnessPath(projectPath, "contracts", "foo.json");
    assert.ok(ok.includes(".codex-harness"), "legitimate path resolves under harness root");
    console.log("R2-3 PASS: harnessPath blocks escape attempts");
  } finally {
    await fs.rm(projectPath, { recursive: true, force: true });
  }
}

// 5. readKnowledgeItem uses safeFileId (R2-4) — rejects unicode/spaces
{
  const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "r2-validator-"));
  try {
    await ensureHarness({ project_path: projectPath });
    const result = await readKnowledgeItem(projectPath, "id with spaces");
    assert.equal(result, null, "readKnowledgeItem rejects id with spaces");
    const result2 = await readKnowledgeItem(projectPath, "idé");
    assert.equal(result2, null, "readKnowledgeItem rejects unicode id");
    console.log("R2-4 PASS: readKnowledgeItem uses unified safeFileId");
  } finally {
    await fs.rm(projectPath, { recursive: true, force: true });
  }
}

console.log("Round 2 hardening all checks passed.");
