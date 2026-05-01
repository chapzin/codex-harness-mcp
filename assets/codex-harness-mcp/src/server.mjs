#!/usr/bin/env node
import {
  compactContext,
  createContract,
  ensureHarness,
  evalGate,
  listHarness,
  nextStep,
  recordTrace,
  updateState
} from "./core.mjs";

const SERVER_INFO = {
  name: "codex-harness-mcp",
  version: "0.1.1"
};

const stringArray = {
  type: "array",
  items: { type: "string" },
  default: []
};

const projectPathProperty = {
  project_path: {
    type: "string",
    description: "Project root. Defaults to the Codex process cwd."
  }
};

const tools = [
  {
    name: "harness_bootstrap",
    description: "Create the local .codex-harness workspace for contracts, traces, gates, decisions, and compact context.",
    inputSchema: {
      type: "object",
      properties: {
        ...projectPathProperty,
        project_name: { type: "string" },
        force: { type: "boolean", default: false }
      },
      additionalProperties: false
    },
    handler: ensureHarness
  },
  {
    name: "harness_create_contract",
    description: "Create a bounded execution contract before implementation.",
    inputSchema: {
      type: "object",
      required: ["title", "goal"],
      properties: {
        ...projectPathProperty,
        title: { type: "string", minLength: 3 },
        goal: { type: "string", minLength: 5 },
        required_inputs: stringArray,
        max_steps: { type: "integer", minimum: 1, default: 8 },
        max_minutes: { type: "integer", minimum: 1, default: 45 },
        max_tool_calls: { type: "integer", minimum: 1, default: 30 },
        permissions: stringArray,
        completion_conditions: stringArray,
        output_paths: stringArray,
        verification_commands: stringArray,
        failure_taxonomy: stringArray,
        notes: { type: "string" }
      },
      additionalProperties: false
    },
    handler: async (input) => {
      const result = await createContract(input);
      return {
        projectPath: result.projectPath,
        contract: result.contract,
        contractMarkdown: result.markdown
      };
    }
  },
  {
    name: "harness_update_state",
    description: "Update durable harness state with focus, status, active contract, notes, or decisions.",
    inputSchema: {
      type: "object",
      properties: {
        ...projectPathProperty,
        focus: { type: "string" },
        status: {
          type: "string",
          enum: ["idle", "planning", "executing", "blocked", "verifying", "done"]
        },
        active_contract_id: { type: "string" },
        note: { type: "string" },
        decision: { type: "string" }
      },
      additionalProperties: false
    },
    handler: updateState
  },
  {
    name: "harness_record_trace",
    description: "Record a raw attempt, failure, success, verification, or decision trace.",
    inputSchema: {
      type: "object",
      required: ["kind", "summary", "raw"],
      properties: {
        ...projectPathProperty,
        contract_id: { type: "string" },
        kind: {
          type: "string",
          enum: ["attempt", "failure", "success", "verification", "decision"]
        },
        summary: { type: "string", minLength: 3 },
        raw: { type: "string", minLength: 1 },
        evidence_paths: stringArray,
        follow_up: { type: "string" }
      },
      additionalProperties: false
    },
    handler: recordTrace
  },
  {
    name: "harness_next_step",
    description: "Inspect active contract, state, output paths, and recent traces; return the smallest useful next step.",
    inputSchema: {
      type: "object",
      properties: {
        ...projectPathProperty,
        contract_id: { type: "string" },
        max_traces: { type: "integer", minimum: 1, default: 6 }
      },
      additionalProperties: false
    },
    handler: nextStep
  },
  {
    name: "harness_eval_gate",
    description: "Evaluate a contract completion gate using checked conditions, evidence, and required output paths.",
    inputSchema: {
      type: "object",
      properties: {
        ...projectPathProperty,
        contract_id: { type: "string" },
        checked_conditions: stringArray,
        evidence: stringArray,
        verdict: { type: "string", enum: ["pass", "fail", "unknown"] },
        notes: { type: "string" }
      },
      additionalProperties: false
    },
    handler: async (input) => {
      const result = await evalGate(input);
      return {
        projectPath: result.projectPath,
        gate: result.gate,
        gateMarkdown: result.markdown
      };
    }
  },
  {
    name: "harness_compact_context",
    description: "Generate a compact handoff context block from state, active contract, decisions, and recent traces.",
    inputSchema: {
      type: "object",
      properties: {
        ...projectPathProperty,
        contract_id: { type: "string" },
        max_traces: { type: "integer", minimum: 1, default: 6 }
      },
      additionalProperties: false
    },
    handler: async (input) => (await compactContext(input)).text
  },
  {
    name: "harness_list",
    description: "List harness state, contracts, and recent traces for the current project.",
    inputSchema: {
      type: "object",
      properties: {
        ...projectPathProperty,
        max_traces: { type: "integer", minimum: 1, default: 5 }
      },
      additionalProperties: false
    },
    handler: listHarness
  }
];

const toolMap = new Map(tools.map((tool) => [tool.name, tool]));
let readBuffer = "";

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  readBuffer += chunk;
  drainReadBuffer();
});

process.stdin.on("end", () => process.exit(0));

function drainReadBuffer() {
  while (readBuffer.includes("\n")) {
    const index = readBuffer.indexOf("\n");
    const line = readBuffer.slice(0, index).trim();
    readBuffer = readBuffer.slice(index + 1);
    if (!line) continue;

    let message;
    try {
      message = JSON.parse(line);
    } catch (error) {
      sendError(null, -32700, `Invalid JSON: ${error.message}`);
      continue;
    }

    handleMessage(message).catch((error) => {
      sendError(message.id ?? null, -32603, error.message || "Internal error");
    });
  }
}

async function handleMessage(message) {
  if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    sendError(message?.id ?? null, -32600, "Invalid JSON-RPC request.");
    return;
  }

  if (message.id === undefined) {
    return;
  }

  switch (message.method) {
    case "initialize":
      sendResult(message.id, {
        protocolVersion: message.params?.protocolVersion || "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO
      });
      return;

    case "ping":
      sendResult(message.id, {});
      return;

    case "tools/list":
      sendResult(message.id, {
        tools: tools.map(({ handler, ...tool }) => tool)
      });
      return;

    case "tools/call":
      await handleToolCall(message);
      return;

    default:
      sendError(message.id, -32601, `Unknown method: ${message.method}`);
  }
}

async function handleToolCall(message) {
  const name = message.params?.name;
  const args = message.params?.arguments || {};
  const tool = toolMap.get(name);

  if (!tool) {
    sendError(message.id, -32602, `Unknown tool: ${name || "missing name"}`);
    return;
  }

  try {
    const value = await tool.handler(args);
    sendResult(message.id, textResult(value));
  } catch (error) {
    sendResult(message.id, {
      isError: true,
      content: [
        {
          type: "text",
          text: error.message || String(error)
        }
      ]
    });
  }
}

function textResult(value) {
  return {
    content: [
      {
        type: "text",
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2)
      }
    ]
  };
}

function sendResult(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function sendError(id, code, message) {
  send({
    jsonrpc: "2.0",
    id,
    error: { code, message }
  });
}

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}
