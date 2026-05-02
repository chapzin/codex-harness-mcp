import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  CURRENT_STATE_VERSION,
  harnessPath,
  loadState,
  migrateHarness
} from "../assets/codex-harness-mcp/src/core.mjs";

const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "codex-harness-migration-"));

try {
  await fs.mkdir(harnessPath(projectPath), { recursive: true });
  await fs.writeFile(
    harnessPath(projectPath, "state.json"),
    `${JSON.stringify({
      version: 1,
      projectName: "old-state",
      status: "executing",
      counters: { contracts: 2, traces: 3, gates: 1 },
      decisions: [],
      events: []
    }, null, 2)}\n`,
    "utf8"
  );

  const result = await migrateHarness({ project_path: projectPath });
  if (result.fromVersion !== 1 || result.toVersion !== CURRENT_STATE_VERSION) {
    throw new Error("Migration did not report the expected version transition.");
  }
  if (!result.applied.includes("state-v2-verification-counter")) {
    throw new Error("Migration did not apply the v2 verification counter migration.");
  }
  if (!result.applied.includes("state-v3-knowledge-counters")) {
    throw new Error("Migration did not apply the v3 knowledge counter migration.");
  }

  const state = await loadState(projectPath);
  if (state.version !== CURRENT_STATE_VERSION) {
    throw new Error("Migrated state did not persist the current state version.");
  }
  if (state.counters.verifications !== 0) {
    throw new Error("Migrated state did not backfill verification counter.");
  }
  if (state.counters.knowledgeItems !== 0 || state.counters.knowledgeQueries !== 0) {
    throw new Error("Migrated state did not backfill knowledge counters.");
  }

  const migrationFiles = await fs.readdir(harnessPath(projectPath, "migrations"));
  if (!migrationFiles.some((name) => name.endsWith(".jsonl"))) {
    throw new Error("Migration audit log was not written.");
  }

  console.log("Harness state migration is versioned and audited.");
} finally {
  await fs.rm(projectPath, { recursive: true, force: true });
}
