# Harness quality control - 2026-05-02

This note turns the consolidated "Analyze Harness Engineering" document into concrete controls for `codex-harness-mcp`.

The goal is not to make the MCP bigger for its own sake. The goal is to keep every new feature, file, resource, prompt, and installer behavior measurable, reviewable, and easy to prune when it stops paying rent.

## Source-backed control principles

The current research and official guidance converge on seven controls:

| Control | Why it matters | Implemented in this repo |
| --- | --- | --- |
| Explicit contracts | Natural-language harness work emphasizes explicit contracts, durable artifacts, and lightweight adapters. | `harness_create_contract`, `.codex-harness/contracts/`, completion conditions, output paths. |
| Raw traces | Meta-Harness shows that richer access to traces enables better harness optimization than compressed feedback alone. | `harness_record_trace`, `harness_record_verification`, `harness://traces/recent`. |
| Mechanical rules in code | AutoHarness argues that repeated illegal or invalid actions should be prevented by harness/code, not just by asking the model to remember. | No-shell/no-remote runtime, schemas, dependency-free server, tests for runtime dependency markers. |
| Runtime policy | AgentSpec frames safety as runtime constraints with triggers, predicates, and enforcement. | v0.1.10 adds `.codex-harness/policy.json` and governance audit as an AgentSpec-lite advisory gate. |
| Test isolation and coverage | Node's built-in test runner supports process-level execution and coverage reporting without third-party test packages. | All repo tests are dependency-free `.mjs` scripts run by Node. |
| CI matrix and timeouts | GitHub Actions supports matrix strategies and job timeouts for repeatable checks across environments. | Documented as recommended project CI, not bundled as a runtime dependency. |
| Supply-chain posture | SLSA and OpenSSF Scorecard emphasize provenance, reviewability, and security posture for open-source artifacts. | No runtime dependencies, no package-lock registry URLs, no installer package download, scanner-oriented tests. |

Primary sources:

- Natural-Language Agent Harnesses: https://arxiv.org/abs/2603.25723
- Meta-Harness: https://arxiv.org/abs/2603.28052
- AutoHarness: https://arxiv.org/abs/2603.03329
- AgentSpec: https://arxiv.org/abs/2503.18666
- Node.js test runner: https://nodejs.org/api/test.html
- GitHub Actions workflow syntax: https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax
- SLSA specification: https://slsa.dev/spec/latest/
- OpenSSF Scorecard: https://openssf.org/scorecard/
- MCP security best practices: https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices
- OWASP Top 10 for LLM Applications: https://owasp.org/www-project-top-10-for-large-language-model-applications/

## What v0.1.10 adds

v0.1.10 implements the first AgentSpec-lite quality layer:

- `.codex-harness/policy.json` is created by `harness_bootstrap`.
- `harness_write_governance_policy` persists local policy.
- `harness_audit_governance` returns structured `PASS/FLAG/BLOCK`.
- `harness_export_governance_report` renders the audit as markdown.
- `harness://governance/policy` exposes the policy resource.
- `harness://governance/report` exposes the markdown report.
- `harness_governance_review` gives clients a prompt for closeout review.
- `tests/governance-audit.mjs` proves the audit blocks missing contracts and passes when contract, outputs, raw trace, verification, policy, and completion gate evidence exist.
- `tests/release-quality-gates.mjs` keeps README/SKILL/version documentation aligned with public MCP surface.

## PASS/FLAG/BLOCK policy

`PASS` means the audit found the expected evidence.

Current PASS checks include:

- policy file exists;
- network and package installation are disabled by default;
- contract exists;
- completion conditions exist;
- required output paths exist;
- raw trace exists;
- passing verification trace exists;
- completion gate passed.

`FLAG` means a risk is explicit but not automatically fatal.

Examples:

- network access or package installation is allowed in policy;
- output paths are not declared for a task that may create artifacts.

`BLOCK` means the agent should not claim completion.

Examples:

- no contract;
- missing completion conditions;
- missing required output path;
- missing raw trace;
- missing passing verification;
- missing passing completion gate.

## Test strategy

The repo should keep tests in five layers:

| Layer | Purpose | Current examples |
| --- | --- | --- |
| Core behavior | Proves contracts, traces, verification, gates, knowledge, evals, profiles, proposals, and governance records work. | `core-smoke.mjs`, `verification-record.mjs`, `knowledge-rag.mjs`, `eval-runs.mjs`, `governance-audit.mjs`. |
| MCP surface | Proves tools/resources/prompts are discoverable and structured. | `mcp-resources-prompts.mjs`, `mcp-structured-output.mjs`. |
| Security/scanner posture | Proves no runtime dependency downloads, command execution, or prompt-injection boundary regressions. | `no-runtime-deps.mjs`, `security-command-execution.mjs`, `security-prompt-injection.mjs`. |
| Release consistency | Proves public docs match the implemented API and version. | `release-quality-gates.mjs`. |
| Harness compatibility | Proves advanced harness artifacts export safely and remain bounded. | `natural-language-harness.mjs`, `observability-report.mjs`, `meta-harness-lite.mjs`, `multi-client-configs.mjs`. |

Run the full local gate:

```powershell
Get-ChildItem .\tests -Filter *.mjs | Sort-Object Name | ForEach-Object { node $_.FullName; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }
```

Recommended optional coverage gate for local development:

```powershell
node --experimental-test-coverage --test ".\tests\*.mjs"
```

Keep coverage advisory unless the project migrates tests to native `node:test` suites. The current scripts are intentionally direct executable checks because they keep scanner surface small and work without packages.

## Change control for future features

Every new MCP feature should answer these questions before merge:

1. What contract or user workflow does it improve?
2. What artifact does it create under `.codex-harness/`?
3. What resource/prompt/tool exposes it?
4. What test proves the artifact and MCP surface?
5. What security test proves it does not add command execution, package downloads, hidden web calls, credential handling, or prompt-injection leakage?
6. What documentation marker tells users how to use it?
7. What condition would justify removing or shrinking it later?

Default rule: if a feature does not improve acceptance evidence, recovery quality, safety, portability, or measurable optimization, do not promote it as default harness behavior.

## Mapping from the user's consolidated document

| Document theme | Repo response |
| --- | --- |
| Contract before execution | Already core behavior; governance now blocks missing contract. |
| Durable state beats chat memory | `.codex-harness/` stores state, contracts, traces, gates, knowledge, evals, proposals, decisions, and policy. |
| Raw trace is strategic asset | Trace records remain raw and prompt-injection bounded. |
| Verification must align with real target | Verification is recorded outside the MCP; governance requires evidence but does not execute a verifier. |
| Subagent without contract leaks budget | Policy stores a subagent policy so clients can review role/scope/budget/stop-rule expectations. |
| Mechanical rules should become code | Tests enforce no runtime deps, no installer command execution markers, structured outputs, and governance policy shape. |
| More structure is not always better | Meta-Harness-lite proposals and promotion decisions require evidence before promoting harness changes. |
| AgentSpec-style runtime constraints | v0.1.10 implements advisory policy and report; hard enforcement remains a client/runtime responsibility. |
| Quality control as project grows | Added governance test plus release documentation/version quality gate. |

## Remaining hardening ideas

These should be added only if they improve measured safety or maintenance:

- trace-mined eval-case proposals;
- failure taxonomy counters in governance reports;
- optional generated SBOM/provenance notes for releases;
- native `node:test` migration if coverage thresholds become useful;
- client-side enforcement integration for clients that can block writes or tool calls;
- cross-platform CI matrix in GitHub, with pinned actions and restricted permissions, if scanner policy accepts workflow dependencies.

Keep the MCP itself dependency-free and non-executing unless the user intentionally chooses a different threat model.
