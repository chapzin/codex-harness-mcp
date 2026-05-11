import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  recordEvalCase,
  recordEvalRun
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

const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "codex-harness-e4-"));

try {
  // Seed eval case
  const evalCase = await recordEvalCase({
    project_path: projectPath,
    title: "Auth flow regression case",
    description: "validate login + role assignment",
    expected_artifacts: ["auth/login.spec.ts"]
  });
  const caseId = evalCase.case.id;

  // --- Full E4 shape ---
  const full = await recordEvalRun({
    project_path: projectPath,
    eval_case_id: caseId,
    verdict: "pass",
    score: 0.92,
    model: "claude-opus",
    k_shot_n: 8,
    k_shot_variance: 0.18,
    k_shot_p95: 0.87,
    holdout_split: "holdout",
    contamination_check: true,
    reward_hack_flags: ["test_file_read", "exit_code_only"]
  });

  check(
    "evalrun.full-shape-persisted",
    full.run &&
      full.run.kShotN === 8 &&
      full.run.kShotVariance === 0.18 &&
      full.run.kShotP95 === 0.87 &&
      full.run.holdoutSplit === "holdout" &&
      full.run.contaminationCheck === true &&
      Array.isArray(full.run.rewardHackFlags) &&
      full.run.rewardHackFlags.length === 2,
    JSON.stringify(full.run).slice(0, 300)
  );

  // --- Minimal: no E4 fields → defaults sane (null / [] / false) ---
  const minimal = await recordEvalRun({
    project_path: projectPath,
    eval_case_id: caseId,
    verdict: "pass"
  });
  check(
    "evalrun.minimal-shape-defaults",
    minimal.run &&
      minimal.run.kShotN === null &&
      minimal.run.kShotVariance === null &&
      minimal.run.kShotP95 === null &&
      minimal.run.holdoutSplit === null &&
      minimal.run.contaminationCheck === false &&
      Array.isArray(minimal.run.rewardHackFlags) &&
      minimal.run.rewardHackFlags.length === 0,
    JSON.stringify(minimal.run).slice(0, 300)
  );

  // --- Validation: k_shot_n must be >= 1 (else null) ---
  let badN = false;
  try {
    await recordEvalRun({
      project_path: projectPath,
      eval_case_id: caseId,
      verdict: "pass",
      k_shot_n: 0
    });
  } catch (err) {
    badN = /k_shot_n|kShotN/i.test(err?.message || "");
  }
  check("evalrun.k_shot_n.validates", badN, "expected throw on k_shot_n < 1");

  // --- Validation: k_shot_variance must be in [0, 1] ---
  let badV = false;
  try {
    await recordEvalRun({
      project_path: projectPath,
      eval_case_id: caseId,
      verdict: "pass",
      k_shot_variance: 1.5
    });
  } catch (err) {
    badV = /k_shot_variance|kShotVariance|range/i.test(err?.message || "");
  }
  check("evalrun.k_shot_variance.validates", badV, "expected throw on variance > 1");

  let negV = false;
  try {
    await recordEvalRun({
      project_path: projectPath,
      eval_case_id: caseId,
      verdict: "pass",
      k_shot_variance: -0.5
    });
  } catch (err) {
    negV = /k_shot_variance|kShotVariance|range/i.test(err?.message || "");
  }
  check("evalrun.k_shot_variance.no-negative", negV, "expected throw on variance < 0");

  // --- Validation: holdout_split enum ---
  let badSplit = false;
  try {
    await recordEvalRun({
      project_path: projectPath,
      eval_case_id: caseId,
      verdict: "pass",
      holdout_split: "explosion"
    });
  } catch (err) {
    badSplit = /holdout_split|holdoutSplit|train|validation|holdout|production/i.test(err?.message || "");
  }
  check("evalrun.holdout_split.validates-enum", badSplit, "expected throw on invalid split");

  // --- All 4 valid holdout_split values ---
  for (const s of ["train", "validation", "holdout", "production"]) {
    const r = await recordEvalRun({
      project_path: projectPath,
      eval_case_id: caseId,
      verdict: "pass",
      holdout_split: s
    });
    if (r.run.holdoutSplit !== s) {
      check("evalrun.holdout_split.all-accepted", false, `${s} -> ${r.run.holdoutSplit}`);
      break;
    }
  }
  check("evalrun.holdout_split.all-4-accepted", true, "all 4 enum values accepted");

  // --- reward_hack_flags coerces non-string/empty out ---
  const flags = await recordEvalRun({
    project_path: projectPath,
    eval_case_id: caseId,
    verdict: "pass",
    reward_hack_flags: ["config_file_access", "", "gold_answer_leak", "  "]
  });
  check(
    "evalrun.reward_hack_flags.sanitized",
    Array.isArray(flags.run.rewardHackFlags) &&
      flags.run.rewardHackFlags.length === 2 &&
      flags.run.rewardHackFlags.some((s) => String(s).includes("config_file_access")) &&
      flags.run.rewardHackFlags.some((s) => String(s).includes("gold_answer_leak")),
    JSON.stringify(flags.run.rewardHackFlags)
  );

  // --- Boundaries: variance=0 and variance=1 accepted ---
  const v0 = await recordEvalRun({
    project_path: projectPath,
    eval_case_id: caseId,
    verdict: "pass",
    k_shot_variance: 0
  });
  const v1 = await recordEvalRun({
    project_path: projectPath,
    eval_case_id: caseId,
    verdict: "pass",
    k_shot_variance: 1
  });
  check(
    "evalrun.variance-boundaries-accepted",
    v0.run.kShotVariance === 0 && v1.run.kShotVariance === 1,
    `0=${v0.run.kShotVariance}, 1=${v1.run.kShotVariance}`
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
} finally {
  await fs.rm(projectPath, { recursive: true, force: true });
}
