#!/usr/bin/env node
import { readFileSync } from "node:fs";
import {
  agentSafeContract,
  agentSafeEvalCase,
  agentSafeEvalRun,
  agentSafeGate,
  agentSafeHarnessProfile,
  agentSafeState,
  agentSafeTrace,
  auditGovernance,
  compactContext,
  compareEvalRuns,
  createContract,
  ensureHarness,
  evalGate,
  exportAgentCard,
  exportObservabilityReport,
  exportNaturalLanguageHarness,
  listEvalCases,
  listEvalRuns,
  listHarness,
  listHarnessProfiles,
  listHarnessProposals,
  listKnowledge,
  listPromotionDecisions,
  migrateHarness,
  nextStep,
  queryKnowledge,
  rebuildKnowledgeIndex,
  recordEvalCase,
  recordEvalRun,
  recordHarnessProfile,
  recordHarnessProposal,
  recordImplementationLesson,
  recordKnowledge,
  recordPromotionDecision,
  recordResearchSource,
  recordVerification,
  recordTrace,
  emitOtelSpan,
  queryEvents,
  queryKnowledgeFts,
  rebuildFtsIndex,
  recordA2ADelegation,
  recordElicitationInteraction,
  recordEvent,
  recordOrchestrationPlan,
  recordSamplingInteraction,
  recordSubagentCompletion,
  recordSubagentDispatch,
  recordSubagentHandoff,
  renderGovernanceReport,
  writeGovernancePolicy,
  updateState,
  checkStorageIntegrity,
  migrateToSqlite
} from "./core.mjs";
import {
  getHarnessPrompt,
  listHarnessPrompts,
  listHarnessResources,
  readHarnessResource
} from "./mcp-features.mjs";
import { validateAgainstSchema } from "./schema-validate.mjs";

const PACKAGE_JSON = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8")
);
const SERVER_INFO = {
  name: PACKAGE_JSON.name,
  version: PACKAGE_JSON.version
};

const MAX_LINE_BYTES = 1_000_000;
const MAX_BUFFER_BYTES = 4_000_000;

const stringArray = {
  type: "array",
  items: { type: "string" },
  default: []
};

const objectOutputSchema = {
  type: "object",
  additionalProperties: true
};

const textOutputSchema = {
  type: "object",
  required: ["text"],
  properties: {
    text: { type: "string" }
  },
  additionalProperties: false
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
    outputSchema: objectOutputSchema,
    handler: ensureHarness
  },
  {
    name: "harness_migrate",
    description: "Migrate the local .codex-harness state format to the current server version and write an audit log.",
    inputSchema: {
      type: "object",
      properties: {
        ...projectPathProperty
      },
      additionalProperties: false
    },
    outputSchema: objectOutputSchema,
    handler: async (input) => {
      const result = await migrateHarness(input);
      return {
        projectPath: result.projectPath,
        fromVersion: result.fromVersion,
        toVersion: result.toVersion,
        applied: result.applied,
        state: agentSafeState(result.state)
      };
    }
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
        parent_contract_id: { type: "string", description: "Optional id of a parent contract this one continues or follows up." },
        notes: { type: "string" }
      },
      additionalProperties: false
    },
    outputSchema: objectOutputSchema,
    handler: async (input) => {
      const result = await createContract(input);
      return {
        projectPath: result.projectPath,
        contract: agentSafeContract(result.contract),
        contractMarkdown: result.markdown
      };
    }
  },
  {
    name: "harness_update_state",
    description: "Update durable harness state with focus, status, active contract, notes, decisions, open questions, or question resolutions. Open questions act as anchored fields across compactions.",
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
        decision: { type: "string" },
        open_question: { type: "string", description: "Question to anchor across compactions." },
        resolve_question_id: { type: "string", description: "ID of an open question to remove." }
      },
      additionalProperties: false
    },
    outputSchema: objectOutputSchema,
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
    outputSchema: objectOutputSchema,
    handler: async (input) => {
      const result = await recordTrace(input);
      return {
        projectPath: result.projectPath,
        entry: agentSafeTrace(result.entry)
      };
    }
  },
  {
    name: "harness_record_verification",
    description: "Record structured verification evidence that was run outside the MCP server.",
    inputSchema: {
      type: "object",
      required: ["command_or_check", "status", "raw_output"],
      properties: {
        ...projectPathProperty,
        contract_id: { type: "string" },
        command_or_check: {
          type: "string",
          minLength: 1,
          description: "The command, manual check, or verifier name whose result is being recorded."
        },
        status: { type: "string", enum: ["pass", "fail", "unknown"] },
        exit_code: { type: "integer" },
        summary: { type: "string" },
        raw_output: { type: "string" },
        evidence_paths: stringArray,
        started_at: { type: "string" },
        finished_at: { type: "string" },
        follow_up: { type: "string" }
      },
      additionalProperties: false
    },
    outputSchema: objectOutputSchema,
    handler: async (input) => {
      const result = await recordVerification(input);
      return {
        projectPath: result.projectPath,
        entry: agentSafeTrace(result.entry)
      };
    }
  },
  {
    name: "harness_record_elicitation_interaction",
    description: "Record an MCP elicitation/create interaction as evidence (message, requested schema, client action, optional content). Storage-only; does not perform the protocol-level request.",
    inputSchema: {
      type: "object",
      required: ["message", "client_action"],
      properties: {
        ...projectPathProperty,
        contract_id: { type: "string" },
        message: { type: "string", minLength: 1, description: "Prompt shown to the user." },
        requested_schema: { description: "Optional JSON schema that defined the expected response shape." },
        client_action: { type: "string", enum: ["accept", "decline", "cancel"] },
        content: { description: "User's response content if client_action is 'accept'." },
        notes: { type: "string" }
      },
      additionalProperties: false
    },
    outputSchema: objectOutputSchema,
    handler: async (input) => {
      const result = await recordElicitationInteraction(input);
      return {
        projectPath: result.projectPath,
        entry: agentSafeTrace(result.entry)
      };
    }
  },
  {
    name: "harness_record_sampling_interaction",
    description: "Record an MCP sampling/createMessage interaction as evidence (prompt summary, model hint, response summary, stop reason). Storage-only; does not perform the protocol-level request.",
    inputSchema: {
      type: "object",
      required: ["prompt_summary"],
      properties: {
        ...projectPathProperty,
        contract_id: { type: "string" },
        prompt_summary: { type: "string", minLength: 1 },
        system_prompt: { type: "string" },
        model_hint: { type: "string" },
        max_tokens: { type: "integer", minimum: 1 },
        response_summary: { type: "string" },
        stop_reason: {
          type: "string",
          enum: ["endTurn", "maxTokens", "stopSequence", "tool_use", "content_filter"]
        },
        notes: { type: "string" }
      },
      additionalProperties: false
    },
    outputSchema: objectOutputSchema,
    handler: async (input) => {
      const result = await recordSamplingInteraction(input);
      return {
        projectPath: result.projectPath,
        entry: agentSafeTrace(result.entry)
      };
    }
  },
  {
    name: "harness_record_subagent_dispatch",
    description: "Record a subagent invocation as evidence (subagent_id, task_description, worktree_path, branch, parent_contract_id, dispatch_method). Storage-only; does not spawn subagents. Dispatch method enum: parallel|sequential|background.",
    inputSchema: {
      type: "object",
      required: ["subagent_id", "task_description", "dispatch_method"],
      properties: {
        ...projectPathProperty,
        contract_id: { type: "string" },
        subagent_id: { type: "string", minLength: 1 },
        task_description: { type: "string", minLength: 1 },
        worktree_path: { type: "string" },
        branch: { type: "string" },
        parent_contract_id: { type: "string" },
        dispatch_method: {
          type: "string",
          enum: ["parallel", "sequential", "background"]
        },
        notes: { type: "string" }
      },
      additionalProperties: false
    },
    outputSchema: objectOutputSchema,
    handler: async (input) => {
      const result = await recordSubagentDispatch(input);
      return {
        projectPath: result.projectPath,
        entry: agentSafeTrace(result.entry)
      };
    }
  },
  {
    name: "harness_record_subagent_completion",
    description: "Record a subagent outcome as evidence (dispatch_trace_id link, status, duration_ms, summary, files_changed). Storage-only; does not kill subagents. Status enum: success|failure|cancelled|timeout.",
    inputSchema: {
      type: "object",
      required: ["status"],
      properties: {
        ...projectPathProperty,
        contract_id: { type: "string" },
        dispatch_trace_id: { type: "string" },
        status: {
          type: "string",
          enum: ["success", "failure", "cancelled", "timeout"]
        },
        duration_ms: { type: "integer", minimum: 0 },
        summary: { type: "string" },
        files_changed: stringArray,
        notes: { type: "string" }
      },
      additionalProperties: false
    },
    outputSchema: objectOutputSchema,
    handler: async (input) => {
      const result = await recordSubagentCompletion(input);
      return {
        projectPath: result.projectPath,
        entry: agentSafeTrace(result.entry)
      };
    }
  },
  {
    name: "harness_record_orchestration_plan",
    description: "Record a multi-agent orchestration plan as evidence (pattern, subagents, isolation strategy, DAG edges). Storage-only; does not execute orchestration. Pattern enum: supervisor|swarm|mesh|hierarchical|pipeline. Isolation enum: worktree|process|none|container.",
    inputSchema: {
      type: "object",
      required: ["pattern", "subagents"],
      properties: {
        ...projectPathProperty,
        contract_id: { type: "string" },
        title: { type: "string" },
        pattern: {
          type: "string",
          enum: ["supervisor", "swarm", "mesh", "hierarchical", "pipeline"]
        },
        subagents: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            required: ["id"],
            properties: {
              id: { type: "string", minLength: 1 },
              role: { type: "string" },
              model: { type: "string" }
            },
            additionalProperties: false
          }
        },
        edges: {
          type: "array",
          items: {
            type: "object",
            required: ["from", "to"],
            properties: {
              from: { type: "string", minLength: 1 },
              to: { type: "string", minLength: 1 }
            },
            additionalProperties: false
          },
          default: []
        },
        isolation: {
          type: "string",
          enum: ["worktree", "process", "none", "container"],
          default: "none"
        },
        notes: { type: "string" }
      },
      additionalProperties: false
    },
    outputSchema: objectOutputSchema,
    handler: async (input) => {
      const result = await recordOrchestrationPlan(input);
      return {
        projectPath: result.projectPath,
        entry: agentSafeTrace(result.entry)
      };
    }
  },
  {
    name: "harness_record_subagent_handoff",
    description: "Record a control transfer between subagents as evidence (from_agent, to_agent, reason, handoff_payload, status). Storage-only; does not transfer control. Status enum: initiated|accepted|rejected|completed|failed.",
    inputSchema: {
      type: "object",
      required: ["from_agent", "to_agent", "status"],
      properties: {
        ...projectPathProperty,
        contract_id: { type: "string" },
        from_agent: { type: "string", minLength: 1 },
        to_agent: { type: "string", minLength: 1 },
        reason: { type: "string" },
        handoff_payload: {},
        status: {
          type: "string",
          enum: ["initiated", "accepted", "rejected", "completed", "failed"]
        },
        correlation_id: { type: "string" },
        notes: { type: "string" }
      },
      additionalProperties: false
    },
    outputSchema: objectOutputSchema,
    handler: async (input) => {
      const result = await recordSubagentHandoff(input);
      return {
        projectPath: result.projectPath,
        entry: agentSafeTrace(result.entry)
      };
    }
  },
  {
    name: "harness_emit_otel_span",
    description: "Emit an OpenTelemetry GenAI-shaped span to .codex-harness/otel/spans-{date}.jsonl when OTEL_EXPORTER_OTLP_ENDPOINT is set; no-op otherwise. Attributes should follow OTel GenAI semantic conventions (gen_ai.* prefix, mcp.tool.name).",
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: {
        ...projectPathProperty,
        name: { type: "string", minLength: 1, description: "Span name, e.g. gen_ai.chat or mcp.tool.invoke." },
        trace_id: { type: "string", description: "32-char lowercase hex trace id; auto-generated if absent." },
        span_id: { type: "string", description: "16-char lowercase hex span id; auto-generated if absent." },
        parent_span_id: { type: "string", description: "16-char lowercase hex parent span id." },
        kind: { type: "string", description: "Span kind (e.g. SPAN_KIND_INTERNAL, SPAN_KIND_CLIENT)." },
        start_time_unix_nano: { type: "string", description: "Unix nanoseconds as string; defaults to current time." },
        end_time_unix_nano: { type: "string", description: "Unix nanoseconds as string; defaults to start." },
        attributes: { type: "object", description: "Key-value attributes; values must be string/number/boolean/array-of-strings." }
      },
      additionalProperties: false
    },
    outputSchema: objectOutputSchema,
    handler: emitOtelSpan
  },
  {
    name: "harness_check_storage_integrity",
    description: "Audit consistency between .codex-harness/ JSON files and the SQLite mirror in .codex-harness/harness.db. Returns per-table {jsonCount, sqliteCount, countDelta, missingInJson, missingInSqlite, contentMismatch} plus PRAGMA quick_check (or integrity_check when deep=true). Read-only; does not write or repair. Requires Node.js >= 22.5.",
    inputSchema: {
      type: "object",
      properties: {
        ...projectPathProperty,
        deep: {
          type: "boolean",
          default: false,
          description: "When true, run full PRAGMA integrity_check and compare every overlapping row's payload (slower; suitable for ad-hoc audits)."
        }
      },
      additionalProperties: false
    },
    outputSchema: objectOutputSchema,
    handler: checkStorageIntegrity
  },
  {
    name: "harness_migrate_to_sqlite",
    description: "One-shot batch import of all existing .codex-harness/ JSON entities into the SQLite mirror at .codex-harness/harness.db. Idempotent: re-running uses INSERT OR REPLACE on natural primary keys (contract_id, trace_id, etc) so row counts stay stable. Audit-only mirror — JSON remains source-of-truth in this phase. Requires Node.js >= 22.5.",
    inputSchema: {
      type: "object",
      properties: {
        ...projectPathProperty
      },
      additionalProperties: false
    },
    outputSchema: objectOutputSchema,
    handler: migrateToSqlite
  },
  {
    name: "harness_query_knowledge_fts",
    description: "Query the knowledge base using SQLite FTS5 full-text search (alternative to BM25+RRF backend). Faster on large corpora. Results ranked by FTS5 bm25() ascending (more negative = better). Optional memory_type filter narrows by cognitive taxonomy (episodic/semantic/procedural). Requires Node.js >= 22.5.",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: {
        ...projectPathProperty,
        query: { type: "string", minLength: 1 },
        limit: { type: "integer", minimum: 1, maximum: 50, default: 5 },
        memory_type: { type: "string", enum: ["episodic", "semantic", "procedural"] }
      },
      additionalProperties: false
    },
    outputSchema: objectOutputSchema,
    handler: queryKnowledgeFts
  },
  {
    name: "harness_rebuild_fts_index",
    description: "Rebuild the SQLite FTS5 knowledge index from .codex-harness/knowledge/items/*.json. Use after recovery, schema change, or bulk import. Requires Node.js >= 22.5.",
    inputSchema: {
      type: "object",
      properties: {
        ...projectPathProperty
      },
      additionalProperties: false
    },
    outputSchema: objectOutputSchema,
    handler: rebuildFtsIndex
  },
  {
    name: "harness_record_event",
    description: "Append an event to the SQLite WAL event-sourcing log (.codex-harness/events.db). Append-only audit log enabling replay and recovery. Requires Node.js >= 22.5 (node:sqlite built-in).",
    inputSchema: {
      type: "object",
      required: ["kind"],
      properties: {
        ...projectPathProperty,
        contract_id: { type: "string" },
        kind: { type: "string", minLength: 1, description: "Event taxonomy label (e.g. tool.invoked, gate.evaluated)." },
        summary: { type: "string" },
        payload: { description: "Arbitrary structured payload serialized to JSON." },
        parent_event_id: { type: "integer", minimum: 1, description: "Optional link to a prior event." }
      },
      additionalProperties: false
    },
    outputSchema: objectOutputSchema,
    handler: recordEvent
  },
  {
    name: "harness_query_events",
    description: "Query the SQLite WAL event-sourcing log with optional filters (contract_id, kind, since_id, since_ts, limit). Results ordered by event_id ascending for deterministic replay. Requires Node.js >= 22.5.",
    inputSchema: {
      type: "object",
      properties: {
        ...projectPathProperty,
        contract_id: { type: "string" },
        kind: { type: "string" },
        since_id: { type: "integer", minimum: 1 },
        since_ts: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 1000, default: 100 }
      },
      additionalProperties: false
    },
    outputSchema: objectOutputSchema,
    handler: queryEvents
  },
  {
    name: "harness_record_a2a_delegation",
    description: "Record an A2A (Agent-to-Agent) delegation as evidence (source agent, target agent, target Agent Card URL, task summary, status). Storage-only; does not execute outgoing A2A calls.",
    inputSchema: {
      type: "object",
      required: ["source_agent", "target_agent", "task_summary", "status"],
      properties: {
        ...projectPathProperty,
        contract_id: { type: "string" },
        source_agent: { type: "string", minLength: 1 },
        target_agent: { type: "string", minLength: 1 },
        target_agent_card_url: { type: "string" },
        task_summary: { type: "string", minLength: 1 },
        correlation_id: { type: "string" },
        request_payload: {},
        response_summary: { type: "string" },
        status: {
          type: "string",
          enum: ["requested", "in_progress", "completed", "failed", "cancelled"]
        },
        notes: { type: "string" }
      },
      additionalProperties: false
    },
    outputSchema: objectOutputSchema,
    handler: async (input) => {
      const result = await recordA2ADelegation(input);
      return {
        projectPath: result.projectPath,
        entry: agentSafeTrace(result.entry)
      };
    }
  },
  {
    name: "harness_record_harness_profile",
    description: "Persist a named harness profile/mode so eval runs can compare minimal, standard, verifier-heavy, or custom harness behavior.",
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: {
        ...projectPathProperty,
        name: { type: "string", minLength: 3 },
        mode: {
          type: "string",
          enum: ["minimal", "standard", "verification_heavy", "research_heavy", "meta_harness_lite", "custom"]
        },
        summary: { type: "string" },
        description: { type: "string" },
        enabled_stages: stringArray,
        disabled_stages: stringArray,
        verifier_policy: { type: "string" },
        budget_notes: { type: "string" },
        tags: stringArray,
        source_type: { type: "string" },
        source_path: { type: "string" }
      },
      additionalProperties: false
    },
    outputSchema: objectOutputSchema,
    handler: recordHarnessProfile
  },
  {
    name: "harness_list_harness_profiles",
    description: "List recent stored harness profiles for eval comparisons and harness simplification decisions.",
    inputSchema: {
      type: "object",
      properties: {
        ...projectPathProperty,
        limit: { type: "integer", minimum: 1, default: 20 }
      },
      additionalProperties: false
    },
    outputSchema: objectOutputSchema,
    handler: listHarnessProfiles
  },
  {
    name: "harness_record_eval_case",
    description: "Persist a tagged eval case that can be used to measure harness profiles, regressions, and holdout behavior.",
    inputSchema: {
      type: "object",
      required: ["title"],
      properties: {
        ...projectPathProperty,
        title: { type: "string", minLength: 3 },
        task_family: { type: "string" },
        split: { type: "string", enum: ["optimization", "holdout", "regression", "production", "unknown"] },
        prompt: { type: "string" },
        task: { type: "string" },
        acceptance_criteria: stringArray,
        expected_artifacts: stringArray,
        verification_checks: stringArray,
        tags: stringArray,
        source_type: { type: "string" },
        source_path: { type: "string" }
      },
      additionalProperties: false
    },
    outputSchema: objectOutputSchema,
    handler: recordEvalCase
  },
  {
    name: "harness_record_eval_run",
    description: "Persist an externally-run eval result with model, harness profile, score, verdict, metrics, traces, and regressions.",
    inputSchema: {
      type: "object",
      required: ["eval_case_id"],
      properties: {
        ...projectPathProperty,
        eval_case_id: { type: "string", minLength: 1 },
        harness_profile_id: { type: "string" },
        model: { type: "string" },
        provider: { type: "string" },
        reasoning_effort: { type: "string" },
        verdict: { type: "string", enum: ["pass", "fail", "unknown"] },
        score: { type: "number" },
        prompt_tokens: { type: "integer", minimum: 0 },
        completion_tokens: { type: "integer", minimum: 0 },
        total_tokens: { type: "integer", minimum: 0 },
        cost_usd: { type: "number", minimum: 0 },
        wall_clock_seconds: { type: "number", minimum: 0 },
        tool_calls: { type: "integer", minimum: 0 },
        llm_calls: { type: "integer", minimum: 0 },
        trace_ids: stringArray,
        verification_ids: stringArray,
        regressions: stringArray,
        notes: { type: "string" },
        k_shot_n: { type: "integer", minimum: 1, description: "Number of independent attempts for consistency measurement." },
        k_shot_variance: { type: "number", minimum: 0, maximum: 1, description: "Variance across k-shot attempts; 0=identical, 1=uncorrelated." },
        k_shot_p95: { type: "number", description: "95th percentile metric across k-shot attempts." },
        holdout_split: {
          type: "string",
          enum: ["train", "validation", "holdout", "production"],
          description: "Eval-case split this run was scored against (for contamination tracking)."
        },
        contamination_check: { type: "boolean", description: "Whether contamination detection was applied." },
        reward_hack_flags: {
          type: "array",
          items: { type: "string" },
          description: "Suspicious patterns detected (e.g., test_file_read, gold_answer_leak, config_file_access)."
        }
      },
      additionalProperties: false
    },
    outputSchema: objectOutputSchema,
    handler: recordEvalRun
  },
  {
    name: "harness_compare_eval_runs",
    description: "Compare two stored eval runs and report score, verdict, token, cost, time, and call deltas.",
    inputSchema: {
      type: "object",
      required: ["baseline_run_id", "candidate_run_id"],
      properties: {
        ...projectPathProperty,
        baseline_run_id: { type: "string", minLength: 1 },
        candidate_run_id: { type: "string", minLength: 1 }
      },
      additionalProperties: false
    },
    outputSchema: objectOutputSchema,
    handler: compareEvalRuns
  },
  {
    name: "harness_list_eval_cases",
    description: "List recent stored eval cases (id, title, split, acceptance criteria, tags) sorted by timestamp desc.",
    inputSchema: {
      type: "object",
      properties: {
        ...projectPathProperty,
        limit: { type: "integer", minimum: 1, default: 10 }
      },
      additionalProperties: false
    },
    outputSchema: objectOutputSchema,
    handler: listEvalCases
  },
  {
    name: "harness_list_eval_runs",
    description: "List recent stored eval runs (id, eval_case_id, verdict, score, metrics) sorted by timestamp desc.",
    inputSchema: {
      type: "object",
      properties: {
        ...projectPathProperty,
        limit: { type: "integer", minimum: 1, default: 10 }
      },
      additionalProperties: false
    },
    outputSchema: objectOutputSchema,
    handler: listEvalRuns
  },
  {
    name: "harness_record_harness_proposal",
    description: "Persist a Meta-Harness-lite proposal for a measured harness change before promotion.",
    inputSchema: {
      type: "object",
      required: ["title", "proposed_change"],
      properties: {
        ...projectPathProperty,
        title: { type: "string", minLength: 3 },
        hypothesis: { type: "string" },
        proposed_change: { type: "string", minLength: 3 },
        status: {
          type: "string",
          enum: ["proposed", "testing", "accepted", "rejected", "superseded", "unknown"]
        },
        risk_level: { type: "string", enum: ["low", "medium", "high", "unknown"] },
        target_profile_id: { type: "string" },
        baseline_run_ids: stringArray,
        candidate_run_ids: stringArray,
        holdout_run_ids: stringArray,
        regression_run_ids: stringArray,
        expected_gain: { type: "string" },
        affected_stages: stringArray,
        evidence: stringArray,
        source_trace_ids: stringArray,
        tags: stringArray
      },
      additionalProperties: false
    },
    outputSchema: objectOutputSchema,
    handler: recordHarnessProposal
  },
  {
    name: "harness_list_harness_proposals",
    description: "List recent Meta-Harness-lite proposals for measured harness changes.",
    inputSchema: {
      type: "object",
      properties: {
        ...projectPathProperty,
        limit: { type: "integer", minimum: 1, default: 20 }
      },
      additionalProperties: false
    },
    outputSchema: objectOutputSchema,
    handler: listHarnessProposals
  },
  {
    name: "harness_record_promotion_decision",
    description: "Persist a promote/reject/hold decision for a harness proposal with holdout, regression, risk, and follow-up evidence.",
    inputSchema: {
      type: "object",
      required: ["proposal_id", "decision", "rationale"],
      properties: {
        ...projectPathProperty,
        proposal_id: { type: "string", minLength: 1 },
        decision: { type: "string", enum: ["promote", "reject", "hold", "needs_more_evidence"] },
        rationale: { type: "string", minLength: 3 },
        optimization_run_ids: stringArray,
        holdout_run_ids: stringArray,
        regression_run_ids: stringArray,
        accepted_risks: stringArray,
        follow_up: { type: "string" },
        evidence: stringArray
      },
      additionalProperties: false
    },
    outputSchema: objectOutputSchema,
    handler: recordPromotionDecision
  },
  {
    name: "harness_list_promotion_decisions",
    description: "List recent harness promotion decisions for audit, regression review, and rollback planning.",
    inputSchema: {
      type: "object",
      properties: {
        ...projectPathProperty,
        limit: { type: "integer", minimum: 1, default: 20 }
      },
      additionalProperties: false
    },
    outputSchema: objectOutputSchema,
    handler: listPromotionDecisions
  },
  {
    name: "harness_export_agent_card",
    description: "Export an A2A-compatible Agent Card (2025 spec) describing this harness server. Skills are derived from registered MCP tools; capabilities reflect stdio MCP transport (no streaming/pushNotifications). Use base_url to populate supportedInterfaces.",
    inputSchema: {
      type: "object",
      properties: {
        ...projectPathProperty,
        base_url: { type: "string" },
        name: { type: "string" },
        description: { type: "string" },
        version: { type: "string" },
        protocol_binding: { type: "string" },
        protocol_version: { type: "string" }
      },
      additionalProperties: false
    },
    outputSchema: objectOutputSchema,
    handler: async (input) =>
      exportAgentCard({
        ...input,
        tools: tools.map((t) => ({ name: t.name, description: t.description }))
      })
  },
  {
    name: "harness_export_nl_harness",
    description: "Export the current harness as a portable natural-language spec with roles, stages, adapters, state semantics, failure taxonomy, and stop rules.",
    inputSchema: {
      type: "object",
      properties: {
        ...projectPathProperty,
        max_traces: { type: "integer", minimum: 1, default: 5 }
      },
      additionalProperties: false
    },
    outputSchema: textOutputSchema,
    handler: async (input) => (await exportNaturalLanguageHarness(input)).spec
  },
  {
    name: "harness_export_observability_report",
    description: "Export a trace-level observability report covering active contract, eval posture, operational memory, governance, safety, and blind spots.",
    inputSchema: {
      type: "object",
      properties: {
        ...projectPathProperty,
        contract_id: { type: "string" },
        max_traces: { type: "integer", minimum: 1, default: 10 },
        max_knowledge: { type: "integer", minimum: 1, default: 8 }
      },
      additionalProperties: false
    },
    outputSchema: textOutputSchema,
    handler: async (input) => (await exportObservabilityReport(input)).report
  },
  {
    name: "harness_write_governance_policy",
    description: "Persist the project-local governance policy for write scope, forbidden paths, verification, traces, completion gates, network, packages, and subagent bounds.",
    inputSchema: {
      type: "object",
      properties: {
        ...projectPathProperty,
        allowed_write_roots: stringArray,
        forbidden_paths: stringArray,
        required_verification: stringArray,
        require_trace_raw: { type: "boolean", default: true },
        require_completion_gate: { type: "boolean", default: true },
        network_allowed: { type: "boolean", default: false },
        install_packages_allowed: { type: "boolean", default: false },
        subagent_policy: { type: "string" },
        notes: { type: "string" }
      },
      additionalProperties: false
    },
    outputSchema: objectOutputSchema,
    handler: writeGovernancePolicy
  },
  {
    name: "harness_audit_governance",
    description: "Return a PASS/FLAG/BLOCK audit for contract quality, output artifacts, raw traces, verification evidence, policy bounds, and completion gates.",
    inputSchema: {
      type: "object",
      properties: {
        ...projectPathProperty,
        contract_id: { type: "string" },
        max_traces: { type: "integer", minimum: 1, default: 20 },
        max_gates: { type: "integer", minimum: 1, default: 12 }
      },
      additionalProperties: false
    },
    outputSchema: objectOutputSchema,
    handler: auditGovernance
  },
  {
    name: "harness_export_governance_report",
    description: "Export the current governance audit as Markdown so an agent can stop on BLOCK, call out FLAG, and close only on PASS.",
    inputSchema: {
      type: "object",
      properties: {
        ...projectPathProperty,
        contract_id: { type: "string" },
        max_traces: { type: "integer", minimum: 1, default: 20 },
        max_gates: { type: "integer", minimum: 1, default: 12 }
      },
      additionalProperties: false
    },
    outputSchema: textOutputSchema,
    handler: async (input) => renderGovernanceReport(await auditGovernance(input))
  },
  {
    name: "harness_record_knowledge",
    description: "Persist a generic local knowledge item for future retrieval by the harness RAG index. Optional memory_type overrides the kind→taxonomy inference (episodic/semantic/procedural).",
    inputSchema: {
      type: "object",
      required: ["title"],
      properties: {
        ...projectPathProperty,
        contract_id: { type: "string" },
        kind: {
          type: "string",
          enum: ["knowledge", "research", "implementation_lesson", "decision", "source", "pattern", "project_note"]
        },
        memory_type: { type: "string", enum: ["episodic", "semantic", "procedural"] },
        title: { type: "string", minLength: 3 },
        summary: { type: "string" },
        content: { type: "string" },
        tags: stringArray,
        key_findings: stringArray,
        files_changed: stringArray,
        evidence: stringArray,
        confidence: { type: "string", enum: ["low", "medium", "high", "unknown"] },
        source_type: { type: "string" },
        source_url: { type: "string" },
        source_path: { type: "string" }
      },
      additionalProperties: false
    },
    outputSchema: objectOutputSchema,
    handler: recordKnowledge
  },
  {
    name: "harness_record_research",
    description: "Persist a research source or web finding in the local harness knowledge index.",
    inputSchema: {
      type: "object",
      required: ["title"],
      properties: {
        ...projectPathProperty,
        contract_id: { type: "string" },
        title: { type: "string", minLength: 3 },
        source_url: { type: "string" },
        source_path: { type: "string" },
        source_type: { type: "string" },
        summary: { type: "string" },
        key_findings: stringArray,
        content: { type: "string" },
        tags: stringArray,
        confidence: { type: "string", enum: ["low", "medium", "high", "unknown"] },
        evidence: stringArray
      },
      additionalProperties: false
    },
    outputSchema: objectOutputSchema,
    handler: recordResearchSource
  },
  {
    name: "harness_record_lesson",
    description: "Persist an implementation lesson learned from a completed attempt, failure, or fix.",
    inputSchema: {
      type: "object",
      required: ["title", "problem", "solution"],
      properties: {
        ...projectPathProperty,
        contract_id: { type: "string" },
        title: { type: "string", minLength: 3 },
        problem: { type: "string", minLength: 3 },
        solution: { type: "string", minLength: 3 },
        summary: { type: "string" },
        key_findings: stringArray,
        files_changed: stringArray,
        evidence: stringArray,
        tags: stringArray,
        confidence: { type: "string", enum: ["low", "medium", "high", "unknown"] }
      },
      additionalProperties: false
    },
    outputSchema: objectOutputSchema,
    handler: recordImplementationLesson
  },
  {
    name: "harness_query_knowledge",
    description: "Query the local persistent harness knowledge index for relevant research, lessons, and notes. Optional memory_type filter narrows by cognitive taxonomy (episodic/semantic/procedural).",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: {
        ...projectPathProperty,
        query: { type: "string", minLength: 1 },
        tags: stringArray,
        max_results: { type: "integer", minimum: 1, default: 5 },
        memory_type: { type: "string", enum: ["episodic", "semantic", "procedural"] }
      },
      additionalProperties: false
    },
    outputSchema: objectOutputSchema,
    handler: queryKnowledge
  },
  {
    name: "harness_rebuild_knowledge_index",
    description: "Rebuild the local knowledge index from persisted knowledge item files.",
    inputSchema: {
      type: "object",
      properties: {
        ...projectPathProperty
      },
      additionalProperties: false
    },
    outputSchema: objectOutputSchema,
    handler: rebuildKnowledgeIndex
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
    outputSchema: objectOutputSchema,
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
    outputSchema: objectOutputSchema,
    handler: async (input) => {
      const result = await evalGate(input);
      return {
        projectPath: result.projectPath,
        contract: agentSafeContract(result.contract),
        gate: agentSafeGate(result.gate),
        gateMarkdown: result.markdown,
        autoEvalRuns: result.autoEvalRuns || [],
        coverageWarning: result.coverageWarning ?? null
      };
    }
  },
  {
    name: "harness_compact_context",
    description: "Generate a compact handoff context block from state, active contract, decisions, open questions, and recent traces. Returns driftScore (Jaccard similarity between contract.goal tokens and recent trace summary tokens; 0=high drift, 1=aligned) and a budget suggestion (ok|compact_now|block) when budget_used_pct is supplied (thresholds: 70% suggests compact_now, 85% suggests block).",
    inputSchema: {
      type: "object",
      properties: {
        ...projectPathProperty,
        contract_id: { type: "string" },
        max_traces: { type: "integer", minimum: 1, default: 6 },
        budget_used_pct: { type: "number", minimum: 0, maximum: 100 }
      },
      additionalProperties: false
    },
    outputSchema: {
      type: "object",
      required: ["text", "driftScore", "suggestion"],
      properties: {
        text: { type: "string" },
        driftScore: { type: "number", minimum: 0, maximum: 1 },
        suggestion: { type: "string", enum: ["ok", "compact_now", "block"] },
        budgetUsedPct: { type: ["number", "null"] }
      },
      additionalProperties: true
    },
    handler: async (input) => {
      const result = await compactContext(input);
      return {
        text: result.text,
        driftScore: result.driftScore,
        suggestion: result.suggestion,
        budgetUsedPct: result.budgetUsedPct
      };
    }
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
    outputSchema: objectOutputSchema,
    handler: listHarness
  },
  {
    name: "harness_list_knowledge",
    description: "List recent local harness knowledge items.",
    inputSchema: {
      type: "object",
      properties: {
        ...projectPathProperty,
        limit: { type: "integer", minimum: 1, default: 10 }
      },
      additionalProperties: false
    },
    outputSchema: objectOutputSchema,
    handler: listKnowledge
  }
];

const toolMap = new Map(tools.map((tool) => [tool.name, tool]));
let readBuffer = "";
let pendingMessages = 0;
let inputEnded = false;

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  readBuffer += chunk;
  if (readBuffer.length > MAX_BUFFER_BYTES) {
    sendError(null, -32700, "Input buffer overflow: line exceeds maximum allowed size.");
    readBuffer = "";
    process.stdin.pause();
    inputEnded = true;
    maybeExit();
    return;
  }
  drainReadBuffer();
});

process.stdin.on("end", () => {
  inputEnded = true;
  drainReadBuffer({ flushFinal: true });
  maybeExit();
});

function drainReadBuffer(options = {}) {
  while (readBuffer.includes("\n")) {
    const index = readBuffer.indexOf("\n");
    const line = readBuffer.slice(0, index).trim();
    readBuffer = readBuffer.slice(index + 1);
    if (line.length > MAX_LINE_BYTES) {
      sendError(null, -32700, "JSON-RPC line exceeds maximum allowed size.");
      continue;
    }
    processLine(line);
  }

  if (options.flushFinal && readBuffer.trim()) {
    const line = readBuffer.trim();
    readBuffer = "";
    if (line.length > MAX_LINE_BYTES) {
      sendError(null, -32700, "JSON-RPC line exceeds maximum allowed size.");
      return;
    }
    processLine(line);
  }
}

function processLine(line) {
  if (!line) return;

  let message;
  try {
    message = JSON.parse(line);
  } catch (error) {
    sendError(null, -32700, `Invalid JSON: ${error.message}`);
    return;
  }

  pendingMessages += 1;
  handleMessage(message)
    .catch((error) => {
      sendError(message.id ?? null, -32603, error.message || "Internal error");
    })
    .finally(() => {
      pendingMessages -= 1;
      maybeExit();
    });
}

function maybeExit() {
  if (inputEnded && pendingMessages === 0) {
    process.exit(0);
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
    case "initialize": {
      const supportedProtocolVersions = ["2024-11-05", "2025-03-26", "2025-06-18"];
      const requested = message.params?.protocolVersion;
      const negotiated = supportedProtocolVersions.includes(requested)
        ? requested
        : supportedProtocolVersions[supportedProtocolVersions.length - 1];
      sendResult(message.id, {
        protocolVersion: negotiated,
        capabilities: { tools: {}, resources: {}, prompts: {} },
        serverInfo: SERVER_INFO
      });
      return;
    }

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

    case "resources/list":
      sendResult(message.id, await listHarnessResources(message.params || {}));
      return;

    case "resources/read":
      sendResult(message.id, await readHarnessResource(message.params?.uri, message.params || {}));
      return;

    case "prompts/list":
      sendResult(message.id, listHarnessPrompts());
      return;

    case "prompts/get":
      sendResult(message.id, getHarnessPrompt(message.params?.name, message.params?.arguments || {}));
      return;

    default:
      sendError(message.id, -32601, `Unknown method: ${message.method}`);
  }
}

async function handleToolCall(message) {
  const name = message.params?.name;
  const rawArgs = message.params?.arguments;
  const tool = toolMap.get(name);

  if (!tool) {
    sendError(message.id, -32602, `Unknown tool: ${name || "missing name"}`);
    return;
  }

  if (rawArgs !== undefined && (typeof rawArgs !== "object" || rawArgs === null || Array.isArray(rawArgs))) {
    sendError(message.id, -32602, `Tool arguments for "${name}" must be an object.`);
    return;
  }

  const args = rawArgs || {};

  const validationError = validateAgainstSchema(tool.inputSchema, args, "args");
  if (validationError) {
    sendError(message.id, -32602, `Invalid params for "${name}": ${validationError}`);
    return;
  }

  try {
    const value = await tool.handler(args);
    sendResult(message.id, toolResult(value));
  } catch (error) {
    sendResult(message.id, {
      isError: true,
      content: [
        {
          type: "text",
          text: redactProjectPaths(error.message || String(error))
        }
      ]
    });
  }
}

function toolResult(value) {
  const result = {
    content: [
      {
        type: "text",
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2)
      }
    ]
  };

  if (typeof value === "string") {
    result.structuredContent = { text: value };
  } else if (value && typeof value === "object") {
    result.structuredContent = value;
  }

  return result;
}

function sendResult(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function redactProjectPaths(text) {
  let out = String(text == null ? "" : text);
  for (const candidate of [process.env.CODEX_WORKDIR, process.env.PWD, process.cwd()]) {
    if (candidate && candidate.length > 1) {
      out = out.split(candidate).join("<project>");
    }
  }
  return out;
}

function sendError(id, code, message) {
  send({
    jsonrpc: "2.0",
    id,
    error: { code, message: redactProjectPaths(message) }
  });
}

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}
