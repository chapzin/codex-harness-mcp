import { promises as fs } from "node:fs";
import path from "node:path";
import {
  agentSafeGate,
  agentSafeState,
  agentSafeTrace,
  fileExists,
  harnessPath,
  loadState,
  readJson,
  renderContract,
  resolveProjectPath,
  untrustedBlock
} from "./core.mjs";

const JSON_MIME = "application/json";
const MARKDOWN_MIME = "text/markdown";

const staticResources = [
  {
    uri: "harness://state",
    name: "state",
    title: "Harness State",
    description: "Current harness metadata, counters, active contract, decisions, and recent events.",
    mimeType: JSON_MIME,
    annotations: { audience: ["assistant"], priority: 1 }
  },
  {
    uri: "harness://contracts",
    name: "contracts",
    title: "Harness Contracts",
    description: "List of stored harness contracts for the current project.",
    mimeType: JSON_MIME,
    annotations: { audience: ["assistant"], priority: 0.9 }
  },
  {
    uri: "harness://traces/recent",
    name: "recent-traces",
    title: "Recent Harness Traces",
    description: "Recent attempt, failure, decision, success, and verification traces.",
    mimeType: JSON_MIME,
    annotations: { audience: ["assistant"], priority: 0.9 }
  },
  {
    uri: "harness://gates/recent",
    name: "recent-gates",
    title: "Recent Harness Gates",
    description: "Recent completion gate evaluations.",
    mimeType: JSON_MIME,
    annotations: { audience: ["assistant"], priority: 0.8 }
  }
];

const promptDefinitions = [
  {
    name: "harness_bootstrap_project",
    title: "Bootstrap Harness Project",
    description: "Start a project-local harness workspace and prepare the control loop.",
    arguments: [
      { name: "project_name", description: "Optional project display name.", required: false }
    ]
  },
  {
    name: "harness_contract_from_request",
    title: "Create Harness Contract",
    description: "Turn a user request into a small bounded execution contract.",
    arguments: [
      { name: "task", description: "The user request or task summary.", required: true }
    ]
  },
  {
    name: "harness_failure_recovery",
    title: "Recover From Harness Failure",
    description: "Use stored traces to choose the smallest safe recovery step after a failure.",
    arguments: [
      { name: "contract_id", description: "Optional contract id to inspect.", required: false },
      { name: "failure_summary", description: "Optional current failure summary.", required: false }
    ]
  },
  {
    name: "harness_verify_and_close",
    title: "Verify And Close Contract",
    description: "Run verification outside the MCP, record evidence, and evaluate the completion gate.",
    arguments: [
      { name: "contract_id", description: "Optional contract id to close.", required: false }
    ]
  },
  {
    name: "harness_handoff_context",
    title: "Create Harness Handoff",
    description: "Generate compact restart context from state, contract, decisions, and recent traces.",
    arguments: [
      { name: "contract_id", description: "Optional contract id to summarize.", required: false }
    ]
  }
];

export async function listHarnessResources(input = {}) {
  const projectPath = resolveProjectPath(input.project_path);
  const contracts = await readContractsFromDisk(projectPath);
  const contractResources = contracts.map((contract) => ({
    uri: `harness://contract/${encodeURIComponent(contract.id)}`,
    name: `contract-${contract.id}`,
    title: `Harness Contract ${contract.id}`,
    description: "Stored harness contract markdown with untrusted data boundaries.",
    mimeType: MARKDOWN_MIME,
    annotations: { audience: ["assistant"], priority: 0.95 }
  }));

  return {
    resources: [...staticResources, ...contractResources]
  };
}

export async function readHarnessResource(uri, input = {}) {
  const projectPath = resolveProjectPath(input.project_path);
  const parsed = parseHarnessUri(uri);

  if (parsed.kind === "state") {
    const initialized = await fileExists(harnessPath(projectPath, "state.json"));
    const state = await loadState(projectPath);
    return resourceText(uri, JSON_MIME, {
      projectPath,
      initialized,
      state: agentSafeState(state)
    });
  }

  if (parsed.kind === "contracts") {
    const contracts = await readContractsFromDisk(projectPath);
    return resourceText(uri, JSON_MIME, {
      projectPath,
      contracts: contracts.map((contract) => ({
        id: contract.id,
        title: untrustedBlock(contract.title, "contract.title"),
        status: contract.status,
        createdAt: contract.createdAt
      }))
    });
  }

  if (parsed.kind === "contract") {
    const contract = await readJson(harnessPath(projectPath, "contracts", `${parsed.id}.json`), null);
    if (!contract) {
      throw new Error(`Harness contract not found: ${parsed.id}`);
    }
    return resourceText(uri, MARKDOWN_MIME, renderContract(contract), false);
  }

  if (parsed.kind === "traces" && parsed.id === "recent") {
    const traces = await readRecentTracesFromDisk(projectPath, input.max_traces || 8);
    return resourceText(uri, JSON_MIME, {
      projectPath,
      recentTraces: traces.map(agentSafeTrace)
    });
  }

  if (parsed.kind === "gates" && parsed.id === "recent") {
    const gates = await readRecentGatesFromDisk(projectPath, input.max_gates || 8);
    return resourceText(uri, JSON_MIME, {
      projectPath,
      recentGates: gates.map(agentSafeGate)
    });
  }

  throw new Error(`Unknown harness resource: ${uri}`);
}

export function listHarnessPrompts() {
  return {
    prompts: promptDefinitions
  };
}

export function getHarnessPrompt(name, args = {}) {
  const prompt = promptDefinitions.find((item) => item.name === name);
  if (!prompt) {
    throw new Error(`Unknown harness prompt: ${name || "missing name"}`);
  }

  return {
    description: prompt.description,
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: renderPromptText(name, args)
        }
      }
    ]
  };
}

function renderPromptText(name, args) {
  switch (name) {
    case "harness_bootstrap_project":
      return [
        "Use codex-harness for this project.",
        "Call `harness_bootstrap` for the current project before planning implementation work.",
        "Project name:",
        promptArg(args, "project_name")
      ].join("\n\n");

    case "harness_contract_from_request":
      return [
        "Use codex-harness to create a small execution contract from the request below.",
        "Keep the contract bounded, include explicit completion conditions, output paths, verification checks, and safe permissions.",
        "User request:",
        promptArg(args, "task")
      ].join("\n\n");

    case "harness_failure_recovery":
      return [
        "Use codex-harness to recover from the latest failure.",
        "Call `harness_next_step`, inspect only relevant evidence, make the smallest useful change, and record the next trace.",
        "Contract id:",
        promptArg(args, "contract_id"),
        "Failure summary:",
        promptArg(args, "failure_summary")
      ].join("\n\n");

    case "harness_verify_and_close":
      return [
        "Use codex-harness to verify the active contract before claiming completion.",
        "Run verification outside the MCP, then call `harness_record_verification` with raw evidence and `harness_eval_gate` with the final verdict.",
        "Contract id:",
        promptArg(args, "contract_id")
      ].join("\n\n");

    case "harness_handoff_context":
      return [
        "Use codex-harness to generate compact handoff context for a future session.",
        "Call `harness_compact_context` and include only the resulting summary in the handoff.",
        "Contract id:",
        promptArg(args, "contract_id")
      ].join("\n\n");

    default:
      throw new Error(`Unknown harness prompt: ${name}`);
  }
}

function promptArg(args, name) {
  if (args?.[name] === undefined || args?.[name] === null || args?.[name] === "") {
    return "(not provided)";
  }
  return untrustedBlock(args[name], `prompt.${name}`);
}

function parseHarnessUri(uri) {
  let parsed;
  try {
    parsed = new URL(uri);
  } catch {
    throw new Error(`Invalid harness resource URI: ${uri}`);
  }

  if (parsed.protocol !== "harness:") {
    throw new Error(`Unsupported resource URI scheme: ${uri}`);
  }

  return {
    kind: parsed.hostname,
    id: decodeURIComponent(parsed.pathname.replace(/^\/+/, ""))
  };
}

function resourceText(uri, mimeType, value, stringify = true) {
  return {
    contents: [
      {
        uri,
        mimeType,
        text: stringify ? `${JSON.stringify(value, null, 2)}\n` : value
      }
    ]
  };
}

async function readContractsFromDisk(projectPath) {
  const root = harnessPath(projectPath, "contracts");
  if (!(await fileExists(root))) {
    return [];
  }

  const names = (await fs.readdir(root)).filter((name) => name.endsWith(".json")).sort();
  const contracts = [];
  for (const name of names) {
    contracts.push(await readJson(path.join(root, name), null));
  }
  return contracts.filter(Boolean);
}

async function readRecentTracesFromDisk(projectPath, limit) {
  const root = harnessPath(projectPath, "traces");
  if (!(await fileExists(root))) {
    return [];
  }

  const names = (await fs.readdir(root)).filter((name) => name.endsWith(".jsonl")).sort().slice(-7);
  const entries = [];
  for (const name of names) {
    const raw = await fs.readFile(path.join(root, name), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        entries.push(JSON.parse(line));
      } catch {
        entries.push({ ts: new Date().toISOString(), kind: "parse-error", raw: line });
      }
    }
  }
  return entries.slice(-limit);
}

async function readRecentGatesFromDisk(projectPath, limit) {
  const root = harnessPath(projectPath, "gates");
  if (!(await fileExists(root))) {
    return [];
  }

  const names = (await fs.readdir(root)).filter((name) => name.endsWith(".json")).sort().slice(-limit);
  const gates = [];
  for (const name of names) {
    gates.push(await readJson(path.join(root, name), null));
  }
  return gates.filter(Boolean);
}
