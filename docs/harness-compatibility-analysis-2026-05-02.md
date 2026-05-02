# Harness compatibility analysis - 2026-05-02

This note evaluates `codex-harness-mcp` against recent harness engineering research and industry practice, especially Natural-Language Agent Harnesses, Meta-Harness, AutoHarness, AgentSpec, Anthropic long-running harnesses, OpenAI Codex harness engineering, and LangChain Deep Agents harness work.

## Verdict

`codex-harness-mcp` is compatible with the core harness-engineering direction, but it is not yet a full benchmark optimizer or Meta-Harness implementation.

It is best described as a small, local, dependency-free control plane for Codex CLI:

- Strong fit for contracts, durable state, local knowledge, traces, verification evidence, completion gates, and handoff context.
- Partial fit for natural-language harness representation because the user-facing skill and prompts are natural-language artifacts, while much of the actual orchestration is still encoded in JavaScript tools and schemas.
- Partial fit for safety enforcement because the MCP itself avoids shell execution and remote dependencies, but it does not enforce all Codex CLI actions at runtime.
- Missing the evaluation and optimization layer required for ablations, compute comparisons, cross-model transfer tests, and automated harness search.

Short version: the skill is a good foundation for harness engineering, but it should not claim parity with NLAH/IHR or Meta-Harness until eval-run, ablation, telemetry, and harness-version search features exist.

## Compatibility scorecard

| Dimension | Status | Evidence in this repo | Gap |
| --- | --- | --- | --- |
| Harness as a first-class asset | Partial | `SKILL.md`, MCP prompts, resources, local `.codex-harness/` artifacts | No single exported natural-language harness spec with roles, stages, adapters, state semantics, and failure taxonomy. |
| Explicit execution contracts | Strong | `harness_create_contract` stores goals, budgets, permissions, outputs, verification commands, completion conditions, failure taxonomy | Contracts are per-task, not yet composed into benchmark/eval cases. |
| File-backed durable state | Strong | `.codex-harness/state.json`, contracts, traces, gates, decisions, knowledge | No task graph, feature list, or sprint/task queue yet. |
| Compaction and handoff support | Strong | `harness_compact_context`, recent traces, state summaries | No automatic stale-state or post-gate drift detection. |
| Local project RAG and implementation learning | Strong | `harness_record_research`, `harness_record_lesson`, `harness_query_knowledge`, knowledge resources | Lexical retrieval only; no eval-driven quality curation or holdout split. |
| Raw trace preservation | Strong | `harness_record_trace`, `harness_record_verification`, recent trace resources | No trace clustering, failure mining, regression generation, or harness-change diagnosis. |
| Completion gates | Strong as audit trail, partial as optimizer | `harness_eval_gate` records checked/unchecked conditions and evidence | No ablation to prove whether verifier/gate cost helps or hurts a task family. |
| Natural-language harness representation | Partial | Skill instructions and MCP prompts express the loop in natural language | Runtime logic is not exported as a portable, executable NLAH-style artifact. |
| Intelligent Harness Runtime style execution | Partial | MCP exposes tools/resources/prompts and persistent artifacts | No in-loop child-agent lifecycle, adapter registry, or runtime charter comparable to IHR. |
| Meta-Harness style optimization | Foundational only | Full-history files, traces, scores could be added, knowledge can persist lessons | No eval runs, score storage, candidate harness versions, proposer loop, or compare-runs tool. |
| AutoHarness style generated harness/code policy | Missing | Current MCP intentionally does not synthesize or execute harness code | Could add proposal records, but should not auto-run generated code inside the MCP. |
| AgentSpec style runtime enforcement | Partial | Server has strict no-shell/no-remote behavior and untrusted data boundaries | No policy DSL for Codex actions, sensitive path globs, or enforceable action blocking outside MCP writes. |
| Anthropic long-running agent pattern | Strong core, partial workflow | Bootstrap, contracts, progress traces, handoff context, verification evidence | No structured feature list, one-feature queue, git-progress integration, or initializer/coding role split. |
| LangChain harness engineering pattern | Partial | Traces, verification, environment/context notes via contracts and RAG | Missing metrics for tokens, latency, cost, tool calls, eval cases, holdouts, and model profiles. |
| OpenAI agent-legible repo pattern | Strong direction | Local docs, no runtime dependencies, inspectable MCP implementation | No docs freshness lint, architecture lint, or doc-gardening workflow. |

## Fit against the user's key claims

### Same model, same benchmark, 6x performance gap

Compatible in principle. The repo accepts the central idea that the harness layer matters, and it gives Codex a stable working loop. It does not yet measure performance gaps because it has no eval case model, no benchmark runner, and no per-run score/cost ledger.

Required improvement: add eval-run records with model, harness version, task id, score, tokens, wall-clock time, tool calls, and cost estimates.

### LangChain jumped by changing only harness infrastructure

Partially compatible. The skill already has the raw ingredients LangChain emphasizes: traces, self-verification evidence, local context, and repeatable skill instructions. It lacks the experiment loop: tagged evals, baseline runs, holdout runs, and targeted harness changes.

Required improvement: add `harness_record_eval_case`, `harness_record_eval_run`, and `harness_compare_eval_runs`.

### Full vs stripped harness achieved similar pass rate with much different compute

Not yet compatible. The skill currently has one default operating loop. It encourages small contracts, but it cannot compare "full" and "stripped" harness variants or quantify overhead.

Required improvement: add harness profiles or modes such as `minimal`, `standard`, `verification-heavy`, and record compute/cost for each run.

### Verifier modules can hurt performance

Partially compatible but needs an instruction fix. The current skill correctly records verification evidence and completion gates, but it can read as if verification should always be added. The research shows verifier stages must be treated as measurable modules, not automatic virtues.

Required improvement: make verification evidence-first and task-fit-based. A verifier should be mandatory only when it aligns with the real acceptance condition or when the user/risk profile requires it.

### Natural-language harnesses outperform brittle code harnesses

Partially compatible. `SKILL.md` and MCP prompts already expose the operating loop as natural language, and stored contract/handoff files are agent-readable. However, the full harness is not yet externalized as a portable NLAH object. The JavaScript runtime still owns the real tool semantics and next-step logic.

Required improvement: expose `harness://harness/spec` and a prompt/tool that exports the current harness as a natural-language spec with contracts, roles, stages, adapters, state semantics, and failure taxonomy.

### Meta-Harness can optimize harness code end-to-end

Foundational only. The repo persists traces and knowledge, which are prerequisites for a Meta-Harness-like loop. It does not yet store candidate harness versions, benchmark scores, source snapshots, or proposer decisions.

Required improvement: add "Meta-Harness-lite" records first: candidate name, changed harness instructions/config, task set, score, regressions, and lessons. Keep execution outside the MCP to preserve the no-command-execution security posture.

### Harness transfers across models

Not yet proven. The MCP is model-agnostic because it is local and does not call models, but there is no cross-model test suite or model profile layer.

Required improvement: record model/provider/reasoning metadata on eval runs and support model-specific harness notes without changing the core server.

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

Add tools and local files for:

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

### P2 - Natural-language harness export

Add:

- `harness://harness/spec`
- `harness_export_nl_harness`
- `harness_record_adapter`
- `harness_record_role`

The exported spec should include:

- contracts
- roles
- stage structure
- adapters/scripts as named hooks
- state semantics
- failure taxonomy
- retry and stop rules
- verification/gate policy

### P3 - Meta-Harness-lite improvement loop

Add a safe, non-executing loop:

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
