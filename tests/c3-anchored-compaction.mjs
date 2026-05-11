import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createContract,
  compactContext,
  recordTrace,
  updateState,
  loadState
} from "../assets/codex-harness-mcp/src/core.mjs";

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

const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "codex-harness-c3-"));

try {
  // --- Open questions: state seeding and persistence ---
  await updateState({
    project_path: projectPath,
    open_question: "Should we use FTS5 for next sprint?"
  });
  await updateState({
    project_path: projectPath,
    open_question: "Does Node 22.5 ship in WSL2 by default?"
  });

  let state = await loadState(projectPath);
  check(
    "open-questions.recorded",
    Array.isArray(state.openQuestions) &&
      state.openQuestions.length === 2 &&
      state.openQuestions[0].text.startsWith("Should we use FTS5") &&
      state.openQuestions.every((q) => typeof q.id === "string" && typeof q.ts === "string"),
    JSON.stringify(state.openQuestions)
  );

  // --- Resolve open question ---
  const firstId = state.openQuestions[0].id;
  await updateState({
    project_path: projectPath,
    resolve_question_id: firstId
  });
  state = await loadState(projectPath);
  check(
    "open-questions.resolved-removed",
    state.openQuestions.length === 1 && state.openQuestions[0].id !== firstId,
    JSON.stringify(state.openQuestions.map((q) => q.id))
  );

  // --- Drift detection: contract goal aligned with trace summaries ---
  const aligned = await createContract({
    project_path: projectPath,
    title: "Aligned contract",
    goal: "Implement FTS5 full-text search using SQLite WAL mode for knowledge index queries"
  });
  await recordTrace({
    project_path: projectPath,
    contract_id: aligned.contract.id,
    kind: "success",
    summary: "Implemented FTS5 full-text search using SQLite WAL mode",
    raw: "All knowledge index queries now use FTS5 with WAL"
  });
  await recordTrace({
    project_path: projectPath,
    contract_id: aligned.contract.id,
    kind: "success",
    summary: "Knowledge index queries verified",
    raw: "Tests pass for FTS5 SQLite WAL"
  });

  const alignedCompact = await compactContext({
    project_path: projectPath,
    contract_id: aligned.contract.id
  });
  check(
    "compact.returns-drift-score",
    typeof alignedCompact.driftScore === "number" &&
      alignedCompact.driftScore >= 0 &&
      alignedCompact.driftScore <= 1,
    `driftScore=${alignedCompact.driftScore}`
  );
  check(
    "compact.aligned-drift-high",
    alignedCompact.driftScore >= 0.3,
    `expected >=0.3 for aligned content, got ${alignedCompact.driftScore}`
  );

  // --- Drift detection: contract goal misaligned with trace summaries ---
  const drifted = await createContract({
    project_path: projectPath,
    title: "Drifted contract",
    goal: "Add OpenTelemetry GenAI semantic conventions for span emission"
  });
  await recordTrace({
    project_path: projectPath,
    contract_id: drifted.contract.id,
    kind: "failure",
    summary: "Refactored unrelated knowledge index lookup helpers",
    raw: "Touched indexing functions only; no telemetry work"
  });

  const driftedCompact = await compactContext({
    project_path: projectPath,
    contract_id: drifted.contract.id
  });
  check(
    "compact.drifted-low-score",
    driftedCompact.driftScore < alignedCompact.driftScore,
    `drifted=${driftedCompact.driftScore} expected lower than aligned=${alignedCompact.driftScore}`
  );

  // --- Budget threshold suggestion ---
  const okSuggestion = await compactContext({
    project_path: projectPath,
    contract_id: aligned.contract.id,
    budget_used_pct: 40
  });
  check(
    "compact.budget-suggestion-ok",
    okSuggestion.suggestion === "ok",
    `got ${okSuggestion.suggestion}`
  );

  const compactSuggestion = await compactContext({
    project_path: projectPath,
    contract_id: aligned.contract.id,
    budget_used_pct: 75
  });
  check(
    "compact.budget-suggestion-compact_now",
    compactSuggestion.suggestion === "compact_now",
    `got ${compactSuggestion.suggestion}`
  );

  const blockSuggestion = await compactContext({
    project_path: projectPath,
    contract_id: aligned.contract.id,
    budget_used_pct: 90
  });
  check(
    "compact.budget-suggestion-block",
    blockSuggestion.suggestion === "block",
    `got ${blockSuggestion.suggestion}`
  );

  // Boundary 70%
  const boundary70 = await compactContext({
    project_path: projectPath,
    contract_id: aligned.contract.id,
    budget_used_pct: 70
  });
  check(
    "compact.boundary-70-compact_now",
    boundary70.suggestion === "compact_now",
    `at 70% expected compact_now, got ${boundary70.suggestion}`
  );

  // Boundary 85%
  const boundary85 = await compactContext({
    project_path: projectPath,
    contract_id: aligned.contract.id,
    budget_used_pct: 85
  });
  check(
    "compact.boundary-85-block",
    boundary85.suggestion === "block",
    `at 85% expected block, got ${boundary85.suggestion}`
  );

  // No budget_used_pct → suggestion is "ok"
  const defaultSuggestion = await compactContext({
    project_path: projectPath,
    contract_id: aligned.contract.id
  });
  check(
    "compact.no-budget-default-ok",
    defaultSuggestion.suggestion === "ok",
    `got ${defaultSuggestion.suggestion}`
  );

  // --- Open Questions appear in rendered markdown ---
  await updateState({
    project_path: projectPath,
    open_question: "Should driftScore weight contract.completionConditions too?"
  });
  const compactWithQ = await compactContext({
    project_path: projectPath,
    contract_id: aligned.contract.id
  });
  check(
    "compact.renders-open-questions",
    compactWithQ.text.includes("Open Questions") &&
      compactWithQ.text.includes("Should driftScore weight"),
    `text length=${compactWithQ.text.length}`
  );

  // --- Backward-compat: state file without openQuestions still loads ---
  const legacyProject = await fs.mkdtemp(path.join(os.tmpdir(), "codex-harness-c3-legacy-"));
  try {
    // ensure harness exists
    await createContract({
      project_path: legacyProject,
      title: "legacy host",
      goal: "test legacy state shape"
    });
    // strip openQuestions from state.json
    const statePath = path.join(legacyProject, ".codex-harness", "state.json");
    const raw = JSON.parse(await fs.readFile(statePath, "utf8"));
    delete raw.openQuestions;
    await fs.writeFile(statePath, JSON.stringify(raw));
    const loaded = await loadState(legacyProject);
    check(
      "compact.legacy-state-loads",
      Array.isArray(loaded.openQuestions) && loaded.openQuestions.length === 0,
      JSON.stringify(loaded.openQuestions)
    );
  } finally {
    await fs.rm(legacyProject, { recursive: true, force: true });
  }

  // --- Invalid budget values reject ---
  let badPctRejected = false;
  try {
    await compactContext({
      project_path: projectPath,
      contract_id: aligned.contract.id,
      budget_used_pct: 150
    });
  } catch (err) {
    badPctRejected = /budget_used_pct|0|100/i.test(err?.message || "");
  }
  check(
    "compact.invalid-pct-rejected",
    badPctRejected,
    "expected throw on budget_used_pct out of [0,100]"
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
} finally {
  await fs.rm(projectPath, { recursive: true, force: true });
}
