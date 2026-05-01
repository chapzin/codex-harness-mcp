#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
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

const server = new McpServer({
  name: "codex-harness-mcp",
  version: "0.1.0"
});

const projectPathShape = {
  project_path: z.string().optional().describe("Project root. Defaults to the Codex process cwd.")
};

function textResult(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return {
    content: [
      {
        type: "text",
        text
      }
    ]
  };
}

server.tool(
  "harness_bootstrap",
  "Create the local .codex-harness workspace for contracts, traces, gates, decisions, and compact context.",
  {
    ...projectPathShape,
    project_name: z.string().optional(),
    force: z.boolean().default(false).optional()
  },
  async (input) => textResult(await ensureHarness(input))
);

server.tool(
  "harness_create_contract",
  "Create a bounded execution contract before implementation: goal, inputs, budget, permissions, completion conditions, outputs, and verification.",
  {
    ...projectPathShape,
    title: z.string().min(3),
    goal: z.string().min(5),
    required_inputs: z.array(z.string()).default([]).optional(),
    max_steps: z.number().int().positive().default(8).optional(),
    max_minutes: z.number().int().positive().default(45).optional(),
    max_tool_calls: z.number().int().positive().default(30).optional(),
    permissions: z.array(z.string()).default([]).optional(),
    completion_conditions: z.array(z.string()).default([]).optional(),
    output_paths: z.array(z.string()).default([]).optional(),
    verification_commands: z.array(z.string()).default([]).optional(),
    failure_taxonomy: z.array(z.string()).default([]).optional(),
    notes: z.string().optional()
  },
  async (input) => {
    const result = await createContract(input);
    return textResult({
      projectPath: result.projectPath,
      contract: result.contract,
      contractMarkdown: result.markdown
    });
  }
);

server.tool(
  "harness_update_state",
  "Update durable harness state with focus, status, active contract, notes, or decisions.",
  {
    ...projectPathShape,
    focus: z.string().optional(),
    status: z.enum(["idle", "planning", "executing", "blocked", "verifying", "done"]).optional(),
    active_contract_id: z.string().optional(),
    note: z.string().optional(),
    decision: z.string().optional()
  },
  async (input) => textResult(await updateState(input))
);

server.tool(
  "harness_record_trace",
  "Record a raw attempt, failure, success, verification, or decision trace. Prefer raw details over summaries when debugging.",
  {
    ...projectPathShape,
    contract_id: z.string().optional(),
    kind: z.enum(["attempt", "failure", "success", "verification", "decision"]),
    summary: z.string().min(3),
    raw: z.string().min(1),
    evidence_paths: z.array(z.string()).default([]).optional(),
    follow_up: z.string().optional()
  },
  async (input) => textResult(await recordTrace(input))
);

server.tool(
  "harness_next_step",
  "Inspect active contract, state, output paths, and recent traces; return the smallest useful next step.",
  {
    ...projectPathShape,
    contract_id: z.string().optional(),
    max_traces: z.number().int().positive().default(6).optional()
  },
  async (input) => textResult(await nextStep(input))
);

server.tool(
  "harness_eval_gate",
  "Evaluate a contract completion gate using checked conditions, evidence, and required output paths. Does not execute commands.",
  {
    ...projectPathShape,
    contract_id: z.string().optional(),
    checked_conditions: z.array(z.string()).default([]).optional(),
    evidence: z.array(z.string()).default([]).optional(),
    verdict: z.enum(["pass", "fail", "unknown"]).optional(),
    notes: z.string().optional()
  },
  async (input) => {
    const result = await evalGate(input);
    return textResult({
      projectPath: result.projectPath,
      gate: result.gate,
      gateMarkdown: result.markdown
    });
  }
);

server.tool(
  "harness_compact_context",
  "Generate a compact handoff context block from state, active contract, decisions, and recent traces.",
  {
    ...projectPathShape,
    contract_id: z.string().optional(),
    max_traces: z.number().int().positive().default(6).optional()
  },
  async (input) => textResult((await compactContext(input)).text)
);

server.tool(
  "harness_list",
  "List harness state, contracts, and recent traces for the current project.",
  {
    ...projectPathShape,
    max_traces: z.number().int().positive().default(5).optional()
  },
  async (input) => textResult(await listHarness(input))
);

const transport = new StdioServerTransport();
await server.connect(transport);
