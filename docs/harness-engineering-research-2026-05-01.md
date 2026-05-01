# Harness engineering research - 2026-05-01

This note compares the current `codex-harness-mcp` with public harness engineering examples, GitHub projects, MCP patterns, and agent benchmark harnesses. The goal is to identify improvements that fit this repo without reintroducing runtime dependency downloads or command execution in the installer.

## Current MCP baseline

The current server exposes these 8 tools:

- `harness_bootstrap`
- `harness_create_contract`
- `harness_update_state`
- `harness_record_trace`
- `harness_next_step`
- `harness_eval_gate`
- `harness_compact_context`
- `harness_list`

Strengths already present:

- Local, dependency-free Node stdio MCP server.
- File-backed state under `.codex-harness/`.
- Execution contracts with budgets, permissions, completion conditions, output paths, and verification commands.
- Raw trace recording.
- Next-step recovery.
- Completion gates.
- Prompt injection boundaries using `untrusted-data` blocks.

Main gaps compared with stronger harness patterns:

- No MCP resources or prompts yet.
- No task graph, dependency model, or actor attribution.
- No structured verification/result schema beyond free-form trace text.
- No template library for common task types.
- No trace analysis, failure clustering, or regression asset generation.
- No explicit risk/permission model beyond contract text.
- No schema migrations or versioned harness state format beyond `state.version`.
- No dashboards or export reports.
- No project knowledge map generation.

## Examples reviewed

| # | Example | Relevant idea | Possible lesson for this MCP |
|---|---|---|---|
| 1 | OpenAI - Harness engineering in Codex | Repository-local docs, execution plans, observability, CI/lints, agent-legible system of record | Add project knowledge resources, execution-plan templates, and enforceable gates |
| 2 | OpenAI - Codex ExecPlans | Living plans with progress, decisions, milestones, and restartability | Add `harness_create_plan` or plan template export |
| 3 | Anthropic - Building effective agents | Prompt chaining, routing, parallelization, orchestrator-workers, evaluator-optimizer | Add workflow templates and explicit mode selection |
| 4 | LangChain - Improving Deep Agents | Trace analysis, self-verification, environment context injection, loop detection | Add trace analyzer and stuck-loop signals |
| 5 | LangChain Deep Agents | Planning tool, filesystem backend, subagents, context management | Add task decomposition and subagent handoff metadata, but avoid shell execution |
| 6 | Natural-Language Agent Harnesses | Harness behavior as portable natural-language artifact with durable artifacts and adapters | Store machine-readable plus markdown harness specs |
| 7 | AutoHarness paper | Synthesizing harness code from environment feedback | Add retrospective suggestions from repeated failures |
| 8 | Meta-Harness paper | Outer loop searches over harness code using prior traces and scores | Add scorecards and harness improvement proposals |
| 9 | SemaClaw paper | DAG orchestration, permission bridge, layered context, wiki skill | Add DAG, permission notes, and context tiers |
| 10 | HarnessAgent fuzzing paper | Retrieval tool pool, compile-error minimization, validation pipeline | Add structured failure taxonomy and evidence requirements |
| 11 | Terminal-Bench | Tasks include instructions, tests, reference solution, execution harness | Add benchmark-style contract template with verifier and expected artifacts |
| 12 | SWE-bench | Reproducible evaluation harness, run ids, logs, prediction outputs | Add run ids, verification logs, and result directories |
| 13 | OSWorld | Executable environment setup plus execution-based eval functions | Add environment snapshot and setup checklist resources |
| 14 | jpicklyk/task-orchestrator | Server-enforced workflow, dependency graph, actor attribution, required notes | Add task graph/gate enforcement as optional layer |
| 15 | AutoHarness GitHub | Governance pipeline, risk patterns, YAML constitution, audit logs | Add local `constitution.json` or `policy.json` and risk linting |
| 16 | Harness Regression Copilot | Turns real failures into regression cases and PR gates | Add `harness_record_regression` and export cases |
| 17 | Agentic Context Engine | Persistent learning loop from trace experience | Add durable lessons separate from untrusted raw traces |
| 18 | MCP resources spec | Resources expose application context via URIs and annotations | Add `harness://state`, `harness://contract/{id}`, `harness://trace/recent` |
| 19 | MCP prompts spec | Reusable prompt templates exposed by server | Add prompts for bootstrap, contract creation, verification, handoff |
| 20 | MCP tools spec | Tool outputs can include structured content and output schemas | Add output schemas for every tool and structuredContent responses |
| 21 | Agents Cookbook harness guide | Harness includes tool dispatch, context compression, session persistence, retry logic | Keep MCP focused on control plane, not model calls |
| 22 | agent-engineering.dev guide | Constraints, feedback loops, documentation, verification systems | Make constraints and verification first-class data |
| 23 | InfoQ coverage of OpenAI harness | Machine-readable docs, telemetry, layered architecture rules | Add report export that shows docs/gates/traces together |
| 24 | MCP task orchestrator variants | Hierarchical goals/tasks and context-efficient templates | Add composable templates and context-efficient list/read split |
| 25 | Awesome harness engineering repos | Memory, evals, permissions, observability, orchestration | Use as roadmap categories, not as runtime dependencies |
| 26 | Agent harness repos such as OpenHarness, Hive, Trellis, Dexto, mini-coding-agent | Different tradeoffs between full runtime and lightweight harness | Keep this MCP as a small control layer for Codex CLI, not a competing agent runtime |

## Recommended improvements

### P0 - Highest impact and low scanner risk

1. Add MCP resources.
   - `harness://state`
   - `harness://contracts`
   - `harness://contract/{id}`
   - `harness://traces/recent`
   - `harness://gates/recent`
   - Benefit: Codex can read current harness state as context without calling a mutating tool.

2. Add MCP prompts.
   - `harness_bootstrap_project`
   - `harness_contract_from_request`
   - `harness_failure_recovery`
   - `harness_verify_and_close`
   - `harness_handoff_context`
   - Benefit: the skill becomes easier to use from MCP clients that surface prompts/slash commands.

3. Add structured output schemas and `structuredContent`.
   - Current tools return JSON-like objects, but no output schema is advertised.
   - Benefit: less ambiguity, better client validation, stronger scanner story.

4. Split trusted metadata from untrusted evidence more strongly.
   - Store typed fields such as ids, timestamps, verdicts, status, counters as trusted metadata.
   - Keep user-supplied summaries/raw text inside explicit untrusted blocks.
   - Benefit: safer context assembly and cleaner prompt-injection posture.

5. Add versioned state migration.
   - `state.version` exists, but no migration path.
   - Add `harness_migrate` or automatic migrations with a `migrations.jsonl` audit file.
   - Benefit: future schema changes become safe.

### P1 - Make it a stronger harness

6. Add task graph support.
   - Tools: `harness_create_task`, `harness_update_task`, `harness_next_task`, `harness_link_tasks`.
   - Fields: parent, dependencies, status, actor, required notes, output paths.
   - Benefit: supports multi-step work without turning the MCP into a full agent runtime.

7. Add actor attribution.
   - Fields: `actor_id`, `actor_kind`, `parent_actor_id` on traces, tasks, decisions, and gates.
   - Benefit: useful when Codex uses subagents or multiple CLI sessions.

8. Add explicit verification records.
   - Tool: `harness_record_verification`.
   - Fields: command_or_check, status, exit_code, evidence_paths, started_at, finished_at, summary, raw_output.
   - Important: the MCP should record results, not execute commands itself.
   - Benefit: preserves security hardening and improves completion gates.

9. Add regression asset workflow.
   - Tools: `harness_record_regression`, `harness_list_regressions`, `harness_export_regressions`.
   - Benefit: repeated failures can become permanent local checks or review checklist items.

10. Add trace analysis summaries.
   - Tool: `harness_analyze_traces`.
   - Should be deterministic/statistical first: count repeated failure kinds, missing outputs, repeated file paths, stale gates.
   - Benefit: useful without requiring an LLM inside the MCP.

11. Add loop/stall detection.
   - Detect repeated failure summaries, repeated contract ids without verification, same output missing across N traces.
   - Benefit: mirrors LangChain loop-detection ideas without shell hooks.

12. Add contract templates.
   - Templates: coding fix, research report, security audit, frontend change, MCP/server change, docs-only change, release/publish.
   - Benefit: faster use and more consistent contracts.

13. Add local policy file.
   - `.codex-harness/policy.json` with allowed output roots, default budgets, sensitive path globs, required verification types.
   - Benefit: a lightweight "constitution" without risky command execution.

14. Add exportable reports.
   - Tool: `harness_export_report`.
   - Output: markdown summary with contract, decisions, traces, verification, gate verdict.
   - Benefit: creates shareable evidence for PRs, skills.sh audits, and handoffs.

### P2 - Nice follow-up

15. Add context tiers.
   - Tier 1: trusted metadata.
   - Tier 2: selected project docs/resources.
   - Tier 3: untrusted raw evidence.
   - Benefit: better compact context and safer resumption.

16. Add project knowledge map.
   - Tool: `harness_register_knowledge_source`.
   - Resources point to AGENTS.md, README, docs, architecture notes.
   - Benefit: aligns with OpenAI's "map, not encyclopedia" lesson.

17. Add benchmark-style task export.
   - Export contract as Terminal-Bench/SWE-bench-inspired task shape: instruction, setup notes, expected outputs, verification.
   - Benefit: makes local tasks reusable and measurable.

18. Add template composition.
   - A contract can apply multiple templates: e.g. `security-audit` + `docs-report` + `completion-gate`.
   - Benefit: less duplication, better consistency.

19. Add checks for stale state.
   - Warn if active contract is old, outputs changed after last gate, or traces exist after a pass gate.
   - Benefit: avoids premature "done" claims.

20. Add import from existing notes.
   - Import AGENTS.md/PLANS.md/README snippets as knowledge resources with trust labels.
   - Benefit: progressive disclosure without loading everything.

## Things to avoid

- Do not add package-manager registry downloads back into the installer.
- Do not execute shell commands inside the MCP server. Let Codex CLI/shell do execution and let the MCP record evidence.
- Do not depend on remote services for core operation.
- Do not remove `untrusted-data` boundaries when returning stored user content.
- Do not create a full autonomous agent runtime; the useful product here is a small control plane for Codex CLI.

## Suggested next implementation slice

The best next slice is:

1. Implement MCP resources for state/contracts/traces/gates.
2. Implement MCP prompts for the core operating loop.
3. Add output schemas/structuredContent for current tools.
4. Add `harness_record_verification`.
5. Add tests proving no runtime dependencies, no command execution, resources work, prompts work, and untrusted boundaries remain.

This slice improves usability and MCP completeness while keeping the skills.sh/Snyk risk profile low.

Implementation status:

- 2026-05-01: Implemented the slice above in server version `0.1.3`: MCP resources, MCP prompts, structured tool results, `harness_record_verification`, and state migration via `harness_migrate`.

## Source links

- OpenAI harness engineering: https://openai.com/index/harness-engineering/
- OpenAI ExecPlans: https://developers.openai.com/cookbook/articles/codex_exec_plans
- Anthropic building effective agents: https://www.anthropic.com/engineering/building-effective-agents
- LangChain harness engineering: https://www.langchain.com/blog/improving-deep-agents-with-harness-engineering
- LangChain Deep Agents: https://github.com/langchain-ai/deepagents
- Natural-Language Agent Harnesses: https://arxiv.org/abs/2603.25723
- AutoHarness paper: https://arxiv.org/abs/2603.03329
- Meta-Harness paper: https://arxiv.org/abs/2603.28052
- SemaClaw paper: https://arxiv.org/abs/2604.11548
- HarnessAgent paper: https://arxiv.org/abs/2512.03420
- Terminal-Bench: https://www.tbench.ai/
- Terminal-Bench GitHub: https://github.com/harbor-framework/terminal-bench
- SWE-bench: https://www.swebench.com/
- SWE-bench GitHub: https://github.com/SWE-bench/SWE-bench
- OSWorld: https://os-world.github.io/
- MCP tools spec: https://modelcontextprotocol.io/specification/2025-06-18/server/tools
- MCP resources spec: https://modelcontextprotocol.io/specification/2025-06-18/server/resources
- MCP prompts spec: https://modelcontextprotocol.io/specification/2025-06-18/server/prompts
- Task Orchestrator MCP: https://github.com/jpicklyk/task-orchestrator
- AutoHarness GitHub: https://github.com/aiming-lab/AutoHarness
- Harness Regression Copilot: https://github.com/Horace-Maxwell/Harness_Engineering_Regression_Copilot
- Agentic Context Engine: https://github.com/kayba-ai/agentic-context-engine
- Agents Cookbook harness guide: https://agentscookbook.com/docs/learn/harness/what-is-harness-engineering/
- Agent Engineering guide: https://www.agent-engineering.dev/article/harness-engineering-in-2026-the-discipline-that-makes-ai-agents-production-ready
- InfoQ OpenAI harness coverage: https://www.infoq.com/news/2026/02/openai-harness-engineering-codex/
