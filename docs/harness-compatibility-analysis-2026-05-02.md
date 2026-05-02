# Harness compatibility analysis - 2026-05-02

This note evaluates `codex-harness-mcp` against recent harness engineering research and industry practice, especially Natural-Language Agent Harnesses, Meta-Harness, AutoHarness, AgentSpec, Anthropic long-running harnesses, OpenAI Codex harness engineering, and LangChain Deep Agents harness work.

## Verdict

`codex-harness-mcp` is compatible with the core harness-engineering direction, but it is not yet a full benchmark optimizer or Meta-Harness implementation.

It is best described as a small, local, dependency-free control plane for Codex CLI:

- Strong fit for contracts, durable state, local knowledge, traces, verification evidence, completion gates, and handoff context.
- Partial fit for natural-language harness representation because the user-facing skill and prompts are natural-language artifacts, while much of the actual orchestration is still encoded in JavaScript tools and schemas.
- Partial fit for safety enforcement because the MCP itself avoids shell execution and remote dependencies, but it does not enforce all Codex CLI actions at runtime.
- Now has a local evaluation record layer for harness profiles, eval cases, eval runs, and run comparisons.
- Now exports the current harness as a natural-language spec with roles, stages, adapters, state semantics, failure taxonomy, and stop rules.
- Now has a safe Meta-Harness-lite layer for recording harness-change proposals and promotion decisions with baseline, candidate, holdout, regression, risk, and follow-up evidence.
- Still missing the automated runner/optimizer layer required for full ablations, cross-model transfer tests, and autonomous harness search.

Short version: the skill is a good foundation for harness engineering, but it should not claim parity with NLAH/IHR or Meta-Harness until ablation runners, telemetry, cross-model transfer checks, and harness-version search features exist.

## Compatibility scorecard

| Dimension | Status | Evidence in this repo | Gap |
| --- | --- | --- | --- |
| Harness as a first-class asset | Strong foundation | `SKILL.md`, MCP prompts, resources, local `.codex-harness/` artifacts, `harness_export_nl_harness`, `harness://harness/spec` | Export is deterministic and local; not yet executed by an independent IHR-style runtime. |
| Explicit execution contracts | Strong | `harness_create_contract` stores goals, budgets, permissions, outputs, verification commands, completion conditions, failure taxonomy | Contracts are per-task, not yet composed into benchmark/eval cases. |
| File-backed durable state | Strong | `.codex-harness/state.json`, contracts, traces, gates, decisions, knowledge | No task graph, feature list, or sprint/task queue yet. |
| Compaction and handoff support | Strong | `harness_compact_context`, recent traces, state summaries | No automatic stale-state or post-gate drift detection. |
| Local project RAG and implementation learning | Strong | `harness_record_research`, `harness_record_lesson`, `harness_query_knowledge`, knowledge resources | Lexical retrieval only; no eval-driven quality curation or holdout split. |
| Raw trace preservation | Strong | `harness_record_trace`, `harness_record_verification`, recent trace resources | No trace clustering, failure mining, regression generation, or harness-change diagnosis. |
| Completion gates | Strong as audit trail, partial as optimizer | `harness_eval_gate` records checked/unchecked conditions and evidence | No ablation to prove whether verifier/gate cost helps or hurts a task family. |
| Natural-language harness representation | Partial-to-strong | Skill instructions, prompts, and `harness://harness/spec` expose roles, stages, adapters, state semantics, failure taxonomy, and stop rules | The spec is portable/readable, but not yet executable by a shared IHR-style runtime. |
| Intelligent Harness Runtime style execution | Partial | MCP exposes tools/resources/prompts and persistent artifacts | No in-loop child-agent lifecycle, adapter registry, or runtime charter comparable to IHR. |
| Meta-Harness style optimization | Partial-to-strong local evidence layer | Full-history files, traces, knowledge, harness profiles, eval cases, eval runs, compare-runs records, `harness_record_harness_proposal`, and `harness_record_promotion_decision` | No automated proposer loop, benchmark runner, source snapshotting, or generated-harness execution. |
| AutoHarness style generated harness/code policy | Missing | Current MCP intentionally does not synthesize or execute harness code | Could add proposal records, but should not auto-run generated code inside the MCP. |
| AgentSpec style runtime enforcement | Partial | Server has strict no-shell/no-remote behavior and untrusted data boundaries | No policy DSL for Codex actions, sensitive path globs, or enforceable action blocking outside MCP writes. |
| Anthropic long-running agent pattern | Strong core, partial workflow | Bootstrap, contracts, progress traces, handoff context, verification evidence | No structured feature list, one-feature queue, git-progress integration, or initializer/coding role split. |
| LangChain harness engineering pattern | Partial-to-strong local record layer | Traces, verification, environment/context notes via contracts and RAG, token/cost/time/tool-call metrics in eval runs, holdout/proposal records | No automatic trace analysis, runner integration, or loop detection yet. |
| OpenAI agent-legible repo pattern | Strong direction | Local docs, no runtime dependencies, inspectable MCP implementation | No docs freshness lint, architecture lint, or doc-gardening workflow. |

## Fit against the user's key claims

### Same model, same benchmark, 6x performance gap

Compatible in local-record form. The repo accepts the central idea that the harness layer matters, gives Codex a stable working loop, and now stores eval cases, eval runs, harness profiles, scores, token/cost/time metrics, and regressions. It still does not run benchmarks itself.

Remaining improvement: add an external benchmark runner workflow or export format so these records can be produced repeatably.

### LangChain jumped by changing only harness infrastructure

Partially compatible. The skill already has the raw ingredients LangChain emphasizes: traces, self-verification evidence, local context, repeatable skill instructions, tagged eval cases, baseline/candidate run records, run comparisons, and targeted harness-change proposal records. It lacks automated sourcing and holdout execution.

Remaining improvement: add trace mining that turns failures into curated eval cases automatically.

### Full vs stripped harness achieved similar pass rate with much different compute

Partially compatible. The skill now supports named harness profiles and eval-run comparisons, so a user can record "full" and "stripped" runs and compare score, token, cost, time, tool-call, and LLM-call deltas. It does not execute those variants automatically.

Remaining improvement: add a profile export/runner contract so external Codex sessions can run the same eval case under each profile consistently.

### Verifier modules can hurt performance

Partially compatible but needs an instruction fix. The current skill correctly records verification evidence and completion gates, but it can read as if verification should always be added. The research shows verifier stages must be treated as measurable modules, not automatic virtues.

Required improvement: make verification evidence-first and task-fit-based. A verifier should be mandatory only when it aligns with the real acceptance condition or when the user/risk profile requires it.

### Natural-language harnesses outperform brittle code harnesses

Mostly compatible at the representation layer. `SKILL.md`, MCP prompts, stored contract/handoff files, and `harness://harness/spec` expose the operating loop as natural language. The JavaScript runtime still owns deterministic tool semantics and next-step logic.

Remaining improvement: make the exported spec executable by a shared runtime and add profile-specific exports.

### Meta-Harness can optimize harness code end-to-end

Partial foundation with a useful local promotion layer. The repo persists traces, knowledge, harness profiles, eval cases, eval runs, benchmark scores, costs, regressions, harness-change proposals, and promotion decisions. It does not yet store source snapshots or run an optimizer.

Remaining improvement: add optional source snapshot paths, trace-mined proposal candidates, and external runner export/import. Keep execution outside the MCP to preserve the no-command-execution security posture.

### Harness transfers across models

Not yet proven. The MCP is model-agnostic because it is local and does not call models, and eval runs now store model/provider/reasoning metadata. There is still no cross-model test suite or model-specific profile runner.

Remaining improvement: add model-specific profile notes and cross-model comparison reports.

### Remove structure rather than always adding it

Partially compatible. The skill says to keep contracts small, but it should be more explicit that every extra module is a hypothesis that can be removed. This matters because the NLAH and Anthropic results both show that added structure can become overhead or drift as models improve.

Required improvement: add a default rule: if structure does not improve acceptance evidence or recovery, simplify the next contract/profile.

## Recommended implementation roadmap

### P0 - Documentation and behavior alignment

1. Add a "minimal useful harness" rule to `SKILL.md`.
2. Clarify that verification is evidence, not ritual.
3. Clarify that heavy stages, verifier agents, and multi-candidate search should be added only when their acceptance signal justifies the cost.
4. Add this compatibility note to `README.md`.

### P1 - Evaluation data model

Status: implemented in v0.1.5 as local records and comparisons.

Added tools and local files for:

- `harness_record_eval_case`
- `harness_record_eval_run`
- `harness_compare_eval_runs`
- `harness_record_harness_profile`
- `harness_list_harness_profiles`

Suggested fields:

- task id, task family, tags
- model, provider, reasoning effort
- harness profile/version
- score or verdict
- token/cost/wall-clock/tool-call metrics, if available
- trace ids and verification evidence
- regressions and holdout status

Remaining P1 follow-up:

- add trace mining into eval-case proposals
- add holdout/promotion reports
- add export/import for external benchmark runners

### P2 - Natural-language harness export

Status: implemented in v0.1.6 as a deterministic local export.

Added:

- `harness://harness/spec`
- `harness_export_nl_harness`

The exported spec should include:

- contracts
- roles
- stage structure
- adapters/scripts as named hooks
- state semantics
- failure taxonomy
- retry and stop rules
- verification/gate policy

Remaining P2 follow-up:

- add role/profile-specific exports
- add adapter registry records if external runtimes need custom tool mappings
- add export comparison between harness profiles

### P3 - Meta-Harness-lite improvement loop

Status: implemented in v0.1.7 as local proposal and promotion-decision records.

Added tools and resources:

- `harness_record_harness_proposal`
- `harness_list_harness_proposals`
- `harness_record_promotion_decision`
- `harness_list_promotion_decisions`
- `harness://harness-proposals`
- `harness://harness-proposal/{id}`
- `harness://promotion-decisions`
- `harness://promotion-decision/{id}`

The implemented loop is deliberately non-executing:

1. Mine traces and eval results.
2. Record a proposed harness change.
3. Ask Codex/user to run the eval externally.
4. Record score and regressions.
5. Compare against baseline and holdout.
6. Promote only if evidence improves.

The MCP should store and compare evidence, not run arbitrary generated code.

### P4 - AgentSpec-lite policy

Add `.codex-harness/policy.json` with:

- allowed output roots
- sensitive path globs
- required verification classes
- maximum recommended budgets
- allowed/blocked action categories
- risk labels

The first version can be advisory. A later version can integrate with clients that can enforce action boundaries.

## Important non-goals

To keep the scanner and safety profile clean, the MCP should continue to avoid:

- runtime dependency downloads
- shell command execution inside the MCP
- hidden web calls
- credential handling
- remote telemetry
- auto-execution of generated harness code

## Source links

- Natural-Language Agent Harnesses: https://arxiv.org/abs/2603.25723
- Meta-Harness: https://arxiv.org/abs/2603.28052
- AutoHarness: https://arxiv.org/abs/2603.03329
- AgentSpec: https://arxiv.org/abs/2503.18666
- OpenAI Harness Engineering: https://openai.com/index/harness-engineering/
- Anthropic Building Effective Agents: https://www.anthropic.com/engineering/building-effective-agents
- Anthropic Effective Harnesses for Long-Running Agents: https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
- Anthropic Harness Design for Long-Running Application Development: https://www.anthropic.com/engineering/harness-design-long-running-apps
- LangChain Improving Deep Agents with Harness Engineering: https://www.langchain.com/blog/improving-deep-agents-with-harness-engineering
- LangChain Better Harness: https://www.langchain.com/blog/better-harness-a-recipe-for-harness-hill-climbing-with-evals
- LangChain Deep Agents harness profiles: https://docs.langchain.com/oss/python/deepagents/profiles
