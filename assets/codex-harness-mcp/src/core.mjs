import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const HARNESS_DIR = ".codex-harness";

const DEFAULT_STATE = {
  version: 1,
  projectName: null,
  focus: null,
  status: "idle",
  activeContractId: null,
  counters: {
    contracts: 0,
    traces: 0,
    gates: 0
  },
  decisions: [],
  events: []
};

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function nowIso() {
  return new Date().toISOString();
}

export function resolveProjectPath(inputPath) {
  const selected = inputPath || process.env.CODEX_WORKDIR || process.env.PWD || process.cwd();
  return path.resolve(selected);
}

export function harnessPath(projectPath, ...parts) {
  return path.join(projectPath, HARNESS_DIR, ...parts);
}

export function slugify(value) {
  return String(value || "contract")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 56) || "contract";
}

export async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

export async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function appendJsonl(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify(value)}\n`, "utf8");
}

export async function ensureHarness(input = {}) {
  const projectPath = resolveProjectPath(input.project_path);
  const root = harnessPath(projectPath);
  await fs.mkdir(root, { recursive: true });
  await Promise.all([
    fs.mkdir(harnessPath(projectPath, "contracts"), { recursive: true }),
    fs.mkdir(harnessPath(projectPath, "traces"), { recursive: true }),
    fs.mkdir(harnessPath(projectPath, "gates"), { recursive: true }),
    fs.mkdir(harnessPath(projectPath, "decisions"), { recursive: true }),
    fs.mkdir(harnessPath(projectPath, "artifacts"), { recursive: true }),
    fs.mkdir(harnessPath(projectPath, "scratch"), { recursive: true })
  ]);

  const stateFile = harnessPath(projectPath, "state.json");
  const exists = await fileExists(stateFile);
  if (!exists || input.force) {
    const state = {
      ...DEFAULT_STATE,
      projectName: input.project_name || path.basename(projectPath),
      events: [
        {
          ts: nowIso(),
          type: "bootstrap",
          summary: "Harness workspace initialized."
        }
      ]
    };
    await writeJson(stateFile, state);
  }

  const guideFile = harnessPath(projectPath, "HARNESS.md");
  if (!(await fileExists(guideFile)) || input.force) {
    await fs.writeFile(guideFile, renderHarnessGuide(projectPath), "utf8");
  }

  return {
    projectPath,
    harnessRoot: root,
    stateFile,
    guideFile
  };
}

export async function loadState(projectPath) {
  const state = await readJson(harnessPath(projectPath, "state.json"), DEFAULT_STATE);
  return {
    ...DEFAULT_STATE,
    ...state,
    counters: {
      ...DEFAULT_STATE.counters,
      ...(state.counters || {})
    },
    decisions: state.decisions || [],
    events: state.events || []
  };
}

export async function saveState(projectPath, state) {
  await writeJson(harnessPath(projectPath, "state.json"), state);
}

export async function updateState(input) {
  const { projectPath } = await ensureHarness({ project_path: input.project_path });
  const state = await loadState(projectPath);

  if (input.focus !== undefined) state.focus = input.focus;
  if (input.status !== undefined) state.status = input.status;
  if (input.active_contract_id !== undefined) state.activeContractId = input.active_contract_id;

  if (input.decision) {
    const decision = {
      id: `decision-${today()}-${crypto.randomBytes(3).toString("hex")}`,
      ts: nowIso(),
      text: input.decision
    };
    state.decisions.push(decision);
    await fs.writeFile(
      harnessPath(projectPath, "decisions", `${decision.id}.md`),
      `# ${decision.id}\n\n${decision.text}\n`,
      "utf8"
    );
  }

  if (input.note || input.decision || input.status || input.focus || input.active_contract_id) {
    state.events.push({
      ts: nowIso(),
      type: "state_update",
      note: input.note || null,
      status: state.status,
      focus: state.focus,
      activeContractId: state.activeContractId
    });
  }

  state.events = state.events.slice(-80);
  state.decisions = state.decisions.slice(-80);
  await saveState(projectPath, state);
  return { projectPath, state };
}

export async function createContract(input) {
  const { projectPath } = await ensureHarness({ project_path: input.project_path });
  const state = await loadState(projectPath);
  const id = `${today()}-${slugify(input.title)}-${crypto.randomBytes(3).toString("hex")}`;
  const contract = {
    id,
    title: input.title,
    goal: input.goal,
    createdAt: nowIso(),
    status: "active",
    requiredInputs: input.required_inputs || [],
    budget: {
      maxSteps: input.max_steps ?? 8,
      maxMinutes: input.max_minutes ?? 45,
      maxToolCalls: input.max_tool_calls ?? 30
    },
    permissions: input.permissions || [
      "Read project files needed for the task.",
      "Edit only files required by this contract.",
      "Run verification commands listed in this contract or safer narrower variants."
    ],
    completionConditions: input.completion_conditions || [],
    outputPaths: input.output_paths || [],
    verificationCommands: input.verification_commands || [],
    failureTaxonomy: input.failure_taxonomy || [
      "missing-context",
      "wrong-file",
      "test-failure",
      "build-failure",
      "unsafe-side-effect",
      "premature-completion"
    ],
    notes: input.notes || null
  };

  await writeJson(harnessPath(projectPath, "contracts", `${id}.json`), contract);
  await fs.writeFile(harnessPath(projectPath, "contracts", `${id}.md`), renderContract(contract), "utf8");

  state.counters.contracts += 1;
  state.status = "executing";
  state.activeContractId = id;
  state.focus = contract.title;
  state.events.push({
    ts: nowIso(),
    type: "contract_created",
    contractId: id,
    summary: contract.title
  });
  state.events = state.events.slice(-80);
  await saveState(projectPath, state);

  return { projectPath, contract, markdown: renderContract(contract) };
}

export async function listContracts(projectPath) {
  await ensureHarness({ project_path: projectPath });
  const root = harnessPath(resolveProjectPath(projectPath), "contracts");
  const names = await fs.readdir(root);
  const jsonNames = names.filter((name) => name.endsWith(".json")).sort();
  const contracts = [];
  for (const name of jsonNames) {
    contracts.push(await readJson(path.join(root, name), null));
  }
  return contracts.filter(Boolean);
}

export async function loadContract(projectPath, contractId) {
  const state = await loadState(projectPath);
  const selected = contractId || state.activeContractId;
  if (!selected) {
    return null;
  }
  return readJson(harnessPath(projectPath, "contracts", `${selected}.json`), null);
}

export async function recordTrace(input) {
  const { projectPath } = await ensureHarness({ project_path: input.project_path });
  const state = await loadState(projectPath);
  const entry = {
    id: `trace-${today()}-${crypto.randomBytes(4).toString("hex")}`,
    ts: nowIso(),
    contractId: input.contract_id || state.activeContractId || null,
    kind: input.kind,
    summary: input.summary,
    raw: input.raw,
    evidencePaths: input.evidence_paths || [],
    followUp: input.follow_up || null
  };

  await appendJsonl(harnessPath(projectPath, "traces", `${today()}.jsonl`), entry);
  state.counters.traces += 1;
  state.events.push({
    ts: entry.ts,
    type: "trace_recorded",
    traceId: entry.id,
    contractId: entry.contractId,
    kind: entry.kind,
    summary: entry.summary
  });
  state.events = state.events.slice(-80);
  await saveState(projectPath, state);
  return { projectPath, entry };
}

export async function readRecentTraces(projectPath, limit = 8) {
  await ensureHarness({ project_path: projectPath });
  const tracesRoot = harnessPath(resolveProjectPath(projectPath), "traces");
  const names = (await fs.readdir(tracesRoot)).filter((name) => name.endsWith(".jsonl")).sort().slice(-7);
  const entries = [];
  for (const name of names) {
    const raw = await fs.readFile(path.join(tracesRoot, name), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        entries.push(JSON.parse(line));
      } catch {
        entries.push({ ts: nowIso(), kind: "parse-error", raw: line });
      }
    }
  }
  return entries.slice(-limit);
}

export async function nextStep(input = {}) {
  const { projectPath } = await ensureHarness({ project_path: input.project_path });
  const state = await loadState(projectPath);
  const contract = await loadContract(projectPath, input.contract_id);
  const traces = await readRecentTraces(projectPath, input.max_traces || 6);
  const last = traces[traces.length - 1] || null;

  if (!contract) {
    return {
      projectPath,
      state,
      recommendation: "Create a small execution contract before implementation.",
      reason: "No active contract is recorded. The harness needs a bounded goal, completion conditions, and output paths.",
      suggestedPrompt: "Use harness_create_contract with the smallest useful goal, then work from that contract."
    };
  }

  const outputChecks = await Promise.all(
    (contract.outputPaths || []).map(async (outputPath) => {
      const absolute = path.resolve(projectPath, outputPath);
      return { path: outputPath, exists: await fileExists(absolute) };
    })
  );

  const missingOutputs = outputChecks.filter((item) => !item.exists);
  if (last?.kind === "failure") {
    return {
      projectPath,
      contractId: contract.id,
      recommendation: "Narrow the next attempt before changing more code.",
      reason: `The latest trace is a failure: ${last.summary}`,
      nextActions: [
        "Restate the smallest failing signal in one sentence.",
        "Inspect only the files or evidence named in the trace.",
        "Make the minimal change that addresses that signal.",
        "Record the attempt and verification result as a new trace."
      ],
      contract,
      recentTraces: traces
    };
  }

  if (missingOutputs.length > 0) {
    return {
      projectPath,
      contractId: contract.id,
      recommendation: "Produce the missing contract artifacts before declaring progress.",
      reason: "One or more required output paths do not exist yet.",
      missingOutputs,
      contract,
      recentTraces: traces
    };
  }

  if ((contract.verificationCommands || []).length > 0 && last?.kind !== "verification") {
    return {
      projectPath,
      contractId: contract.id,
      recommendation: "Run the contract verification commands and record the raw result.",
      reason: "Artifacts exist, but the latest trace is not a verification trace.",
      verificationCommands: contract.verificationCommands,
      contract,
      recentTraces: traces
    };
  }

  return {
    projectPath,
    contractId: contract.id,
    recommendation: "Evaluate the completion gate.",
    reason: "The active contract has artifacts and recent progress. The next useful step is to check completion conditions explicitly.",
    contract,
    recentTraces: traces
  };
}

export async function evalGate(input) {
  const { projectPath } = await ensureHarness({ project_path: input.project_path });
  const state = await loadState(projectPath);
  const contract = await loadContract(projectPath, input.contract_id);
  if (!contract) {
    throw new Error("No active contract found. Pass contract_id or create a contract first.");
  }

  const outputChecks = await Promise.all(
    (contract.outputPaths || []).map(async (outputPath) => {
      const absolute = path.resolve(projectPath, outputPath);
      return { path: outputPath, exists: await fileExists(absolute) };
    })
  );
  const missingOutputs = outputChecks.filter((item) => !item.exists);
  const checked = new Set(input.checked_conditions || []);
  const uncheckedConditions = (contract.completionConditions || []).filter((condition) => !checked.has(condition));
  const verdict = input.verdict || (missingOutputs.length === 0 && uncheckedConditions.length === 0 ? "pass" : "unknown");
  const gate = {
    id: `gate-${today()}-${crypto.randomBytes(3).toString("hex")}`,
    ts: nowIso(),
    contractId: contract.id,
    verdict,
    outputChecks,
    checkedConditions: input.checked_conditions || [],
    uncheckedConditions,
    evidence: input.evidence || [],
    notes: input.notes || null
  };

  const markdown = renderGate(contract, gate);
  await writeJson(harnessPath(projectPath, "gates", `${gate.id}.json`), gate);
  await fs.writeFile(harnessPath(projectPath, "gates", `${gate.id}.md`), markdown, "utf8");

  state.counters.gates += 1;
  state.status = verdict === "pass" ? "done" : "verifying";
  state.events.push({
    ts: gate.ts,
    type: "gate_evaluated",
    contractId: contract.id,
    gateId: gate.id,
    verdict
  });
  state.events = state.events.slice(-80);
  await saveState(projectPath, state);
  return { projectPath, contract, gate, markdown };
}

export async function compactContext(input = {}) {
  const { projectPath } = await ensureHarness({ project_path: input.project_path });
  const state = await loadState(projectPath);
  const contract = await loadContract(projectPath, input.contract_id);
  const traces = await readRecentTraces(projectPath, input.max_traces || 6);
  return {
    projectPath,
    text: renderCompactContext({ state, contract, traces, projectPath })
  };
}

export async function listHarness(input = {}) {
  const { projectPath, harnessRoot } = await ensureHarness({ project_path: input.project_path });
  const state = await loadState(projectPath);
  const contracts = await listContracts(projectPath);
  const traces = await readRecentTraces(projectPath, input.max_traces || 5);
  return {
    projectPath,
    harnessRoot,
    state,
    contracts: contracts.map((contract) => ({
      id: contract.id,
      title: contract.title,
      status: contract.status,
      createdAt: contract.createdAt
    })),
    recentTraces: traces
  };
}

export function renderHarnessGuide(projectPath) {
  return `# Codex Harness Workspace

This directory stores durable harness state for Codex-style agent work.

Use it for:

- execution contracts with required inputs, budgets, permissions, completion conditions, and output paths
- raw traces from attempts, failures, verification, and decisions
- explicit gates before declaring work complete
- compact context blocks for session handoff or recovery

Default project path:

\`\`\`text
${projectPath}
\`\`\`

Recommended loop:

1. Create a small contract.
2. Work only inside the contract boundaries.
3. Record raw traces when something succeeds or fails.
4. Ask for the next step when signals are unclear.
5. Run the eval gate before claiming completion.
6. Keep useful decisions as durable notes.
`;
}

export function renderContract(contract) {
  const lines = [
    `# ${contract.title}`,
    "",
    `Contract ID: \`${contract.id}\``,
    "",
    "## Goal",
    "",
    contract.goal,
    "",
    "## Required Inputs",
    "",
    bulletList(contract.requiredInputs),
    "",
    "## Budget",
    "",
    `- Max steps: ${contract.budget.maxSteps}`,
    `- Max minutes: ${contract.budget.maxMinutes}`,
    `- Max tool calls: ${contract.budget.maxToolCalls}`,
    "",
    "## Permissions",
    "",
    bulletList(contract.permissions),
    "",
    "## Completion Conditions",
    "",
    bulletList(contract.completionConditions),
    "",
    "## Output Paths",
    "",
    bulletList(contract.outputPaths),
    "",
    "## Verification Commands",
    "",
    bulletList(contract.verificationCommands),
    "",
    "## Failure Taxonomy",
    "",
    bulletList(contract.failureTaxonomy)
  ];

  if (contract.notes) {
    lines.push("", "## Notes", "", contract.notes);
  }

  return `${lines.join("\n")}\n`;
}

export function renderGate(contract, gate) {
  return `# Completion Gate: ${contract.title}

Contract ID: \`${contract.id}\`
Gate ID: \`${gate.id}\`
Verdict: \`${gate.verdict}\`
Timestamp: ${gate.ts}

## Output Checks

${bulletList(gate.outputChecks.map((item) => `${item.exists ? "present" : "missing"}: ${item.path}`))}

## Checked Conditions

${bulletList(gate.checkedConditions)}

## Unchecked Conditions

${bulletList(gate.uncheckedConditions)}

## Evidence

${bulletList(gate.evidence)}

## Notes

${gate.notes || "None"}
`;
}

export function renderCompactContext({ state, contract, traces, projectPath }) {
  const lines = [
    "# Harness Context",
    "",
    `Project: ${projectPath}`,
    `Status: ${state.status}`,
    `Focus: ${state.focus || "none"}`,
    `Active contract: ${state.activeContractId || "none"}`,
    ""
  ];

  if (contract) {
    lines.push(
      "## Active Contract",
      "",
      `Title: ${contract.title}`,
      `Goal: ${contract.goal}`,
      "",
      "Completion conditions:",
      bulletList(contract.completionConditions),
      "",
      "Verification commands:",
      bulletList(contract.verificationCommands),
      ""
    );
  }

  if (state.decisions.length > 0) {
    lines.push("## Recent Decisions", "", bulletList(state.decisions.slice(-5).map((item) => item.text)), "");
  }

  if (traces.length > 0) {
    lines.push(
      "## Recent Raw Traces",
      "",
      ...traces.map((trace) => `- ${trace.ts} [${trace.kind}] ${trace.summary}${trace.followUp ? ` | next: ${trace.followUp}` : ""}`),
      ""
    );
  }

  lines.push(
    "## Operating Rule",
    "",
    "Continue with the smallest contract-valid next step. If the latest signal is a failure, narrow the next attempt before broadening scope. Before claiming completion, evaluate the gate."
  );

  return `${lines.join("\n")}\n`;
}

function bulletList(items) {
  if (!items || items.length === 0) {
    return "- None";
  }
  return items.map((item) => `- ${item}`).join("\n");
}
