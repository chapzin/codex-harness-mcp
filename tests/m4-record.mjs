import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createContract,
  recordElicitationInteraction,
  recordSamplingInteraction
} from "../assets/codex-harness-mcp/src/core.mjs";

const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "codex-harness-m4-"));

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

async function readDailyTraces() {
  const today = new Date().toISOString().slice(0, 10);
  const filePath = path.join(projectPath, ".codex-harness", "traces", `${today}.jsonl`);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return raw
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

try {
  const contract = await createContract({
    project_path: projectPath,
    title: "m4-record host contract",
    goal: "Linking host for elicitation/sampling interactions"
  });
  const contractId = contract.contract.id;

  const elicitAccept = await recordElicitationInteraction({
    project_path: projectPath,
    contract_id: contractId,
    message: "Please confirm migration v6",
    requested_schema: { type: "object", properties: { confirm: { type: "boolean" } } },
    client_action: "accept",
    content: { confirm: true },
    notes: "user confirmed inline"
  });
  check(
    "elicitation.accept.persisted",
    elicitAccept.entry &&
      elicitAccept.entry.kind === "elicitation_interaction" &&
      elicitAccept.entry.clientAction === "accept" &&
      elicitAccept.entry.contractId === contractId,
    JSON.stringify(elicitAccept.entry)
  );

  const elicitDecline = await recordElicitationInteraction({
    project_path: projectPath,
    message: "Drop database table?",
    client_action: "decline"
  });
  check(
    "elicitation.decline.no-content-required",
    elicitDecline.entry &&
      elicitDecline.entry.clientAction === "decline" &&
      (elicitDecline.entry.content === null || elicitDecline.entry.content === undefined),
    JSON.stringify(elicitDecline.entry)
  );

  let invalidActionThrew = false;
  try {
    await recordElicitationInteraction({
      project_path: projectPath,
      message: "Anything",
      client_action: "bogus"
    });
  } catch (err) {
    invalidActionThrew = /action|accept|decline|cancel/i.test(err?.message || "");
  }
  check(
    "elicitation.action.validates-enum",
    invalidActionThrew,
    "expected throw with action enum guidance"
  );

  let missingMessageThrew = false;
  try {
    await recordElicitationInteraction({
      project_path: projectPath,
      client_action: "accept"
    });
  } catch (err) {
    missingMessageThrew = /message/i.test(err?.message || "");
  }
  check(
    "elicitation.message.required",
    missingMessageThrew,
    "expected throw when message missing"
  );

  const samplingFull = await recordSamplingInteraction({
    project_path: projectPath,
    contract_id: contractId,
    prompt_summary: "Summarize last trace into 2 lines",
    system_prompt: "You are concise",
    model_hint: "claude-3-sonnet",
    max_tokens: 200,
    response_summary: "Trace pass; gate closed.",
    stop_reason: "endTurn",
    notes: "for observability handoff"
  });
  check(
    "sampling.full-shape.persisted",
    samplingFull.entry &&
      samplingFull.entry.kind === "sampling_interaction" &&
      samplingFull.entry.modelHint === "claude-3-sonnet" &&
      samplingFull.entry.maxTokens === 200 &&
      samplingFull.entry.stopReason === "endTurn" &&
      samplingFull.entry.contractId === contractId,
    JSON.stringify(samplingFull.entry)
  );

  let invalidStopReasonThrew = false;
  try {
    await recordSamplingInteraction({
      project_path: projectPath,
      prompt_summary: "Test",
      stop_reason: "explosion"
    });
  } catch (err) {
    invalidStopReasonThrew = /stop|endTurn|maxTokens|stopSequence/i.test(err?.message || "");
  }
  check(
    "sampling.stop-reason.validates-enum",
    invalidStopReasonThrew,
    "expected throw with stop_reason enum guidance"
  );

  const samplingMinimal = await recordSamplingInteraction({
    project_path: projectPath,
    prompt_summary: "Minimal prompt"
  });
  check(
    "sampling.minimal-shape-allowed",
    samplingMinimal.entry &&
      samplingMinimal.entry.promptSummary === "Minimal prompt" &&
      samplingMinimal.entry.stopReason === null,
    JSON.stringify(samplingMinimal.entry)
  );

  const persisted = await readDailyTraces();
  const elicitOnDisk = persisted.find((e) => e.id === elicitAccept.entry.id);
  const samplingOnDisk = persisted.find((e) => e.id === samplingFull.entry.id);
  check(
    "persistence.traces-jsonl",
    !!elicitOnDisk && !!samplingOnDisk &&
      elicitOnDisk.kind === "elicitation_interaction" &&
      samplingOnDisk.kind === "sampling_interaction",
    `elicitFound=${!!elicitOnDisk} samplingFound=${!!samplingOnDisk}`
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
} finally {
  await fs.rm(projectPath, { recursive: true, force: true });
}
