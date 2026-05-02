# Codex Harness MCP Marketing Launch Kit

This document is a ready-to-use launch pack for promoting `codex-harness-mcp` in forums, YouTube comments, LinkedIn, X, Discord, Hacker News, and developer communities.

Tone: high-energy Brazilian creator-tech direct response. Do not impersonate any specific creator. Keep the urgency, contrast, and curiosity, but keep claims honest.

Primary CTA:

```text
Install: npx skills add chapzin/codex-harness-mcp -g -a codex -y --copy
Repo: https://github.com/chapzin/codex-harness-mcp
Skill: https://skills.sh/chapzin/codex-harness-mcp/codex-harness-mcp
```

## Source context

Use these as the campaign's credibility base:

- OpenAI's harness-engineering article frames the codebase and surrounding system as agent-legible infrastructure, not just prompt text: https://openai.com/index/harness-engineering/
- LangChain reports a jump from outside the Top 30 to Top 5 on Terminal-Bench 2.0 by changing the harness, not the model: https://www.langchain.com/blog/improving-deep-agents-with-harness-engineering
- LangChain's Better Harness article argues that evals are the learning signal for improving harnesses: https://www.langchain.com/blog/better-harness-a-recipe-for-harness-hill-climbing-with-evals
- Natural-Language Agent Harnesses argues that harness behavior should be inspectable and transferable, not buried in controller code: https://arxiv.org/abs/2603.25723
- Meta-Harness explores optimizing harnesses end to end with prior experience and scores: https://arxiv.org/abs/2603.28052
- Gradient Flow's AgentOps/observability writing argues that trace-level visibility, eval separation, operational memory, and governance are production prerequisites for agent systems: https://gradientflow.substack.com/p/are-your-ai-agents-flying-blind-in
- Gradient Flow's harness-engineering coverage frames the winning move as fixing the environment around the model: context, constraints, validation loops, and governance: https://gradientflow.substack.com/p/your-ai-model-isnt-the-problem-its
- Gradient Flow's operational-memory piece is the clean "context is not memory" proof point: https://gradientflow.substack.com/p/the-missing-layer-in-todays-agent
- Reddit discussions around Codex, MCP, AGENTS.md, and agent engineering show demand for practical, inspectable agent workflows: https://www.reddit.com/r/codex/

## Core positioning

### One-line pitch

Codex Harness MCP gives Codex CLI a local operating system for serious work: contracts, memory, traces, observability reports, evals, promotion evidence, and completion gates.

### Short pitch

Prompt engineering gets the agent started. Harness engineering keeps it from drifting.

`codex-harness-mcp` is a dependency-free local MCP server for Codex CLI that stores the work around the model: contracts, local RAG memory, traces, verification evidence, observability reports, eval runs, harness proposals, promotion decisions, natural-language harness specs, and completion gates.

It does not run commands. It records proof.

### Big idea

The next productivity jump will not come from asking the same model with prettier prompts.

It comes from wrapping the model in a system that remembers, measures, observes, verifies, and refuses to call work "done" without evidence.

That is the harness.

## Main audience

Target people who already feel pain from coding agents:

- Codex CLI users
- Claude Code / Cursor / Gemini CLI power users
- MCP builders
- AI agent developers
- DevTools founders
- engineering managers experimenting with long-running agents
- people posting about context bloat, agent drift, repeated research, lost verification, or "AI slop"

## Where to post

Post manually and adapt to community rules. Do not spam the same copy everywhere.

| Channel | Best angle | Recommended format |
| --- | --- | --- |
| Reddit r/codex | "Codex needs a durable harness, not more prompt glue" | Show-and-tell post with technical details |
| Reddit r/OpenaiCodex | Codex-specific installation and workflow | Practical walkthrough |
| Reddit r/mcp | Local dependency-free MCP, no shell execution | Security-first MCP post |
| Reddit r/LocalLLaMA | Harness patterns and local state, model-agnostic idea | Technical discussion |
| Reddit r/AgentsOfAI | Agent orchestration, evals, memory, gates | Concept + tool |
| Hacker News | Show HN: local MCP harness for Codex CLI | Low-hype technical launch |
| LinkedIn | Harness engineering is the new team infrastructure | Story + business value |
| X/Twitter | Punchy thread | 8-10 posts |
| YouTube comments | Reply under videos about Codex, MCP, AI agents, harness engineering | Short, helpful comment |
| Discord/Slack communities | "Built a thing; looking for feedback" | Polite builder note |
| GitHub awesome lists | Add as "Codex harness MCP" | PR with concise description |

## Campaign hooks

- Your AI agent does not need a bigger prompt. It needs a harness.
- Same model. Different harness. Completely different outcome.
- The agent did the work. But where is the proof?
- If your Codex session forgets what it learned yesterday, you do not have a harness.
- Stop letting your coding agent end work with vibes.
- Context is not memory. Chat history is not a system of record.
- Your agent needs a flight recorder before it needs another prompt.
- The new agent stack is not prompt engineering. It is contracts, memory, traces, evals, and gates.
- Every serious AI coding workflow needs a black box recorder.

## PT-BR flagship post

Title:

```text
Eu criei um MCP para dar um "sistema operacional" ao Codex CLI
```

Body:

```text
A maioria das pessoas ainda está tentando melhorar agente com prompt maior.

Só que o jogo mudou.

O problema não é só o modelo.
O problema é o harness em volta do modelo.

Quando o Codex começa uma tarefa longa, algumas coisas quebram silenciosamente:

- ele esquece pesquisa feita antes
- perde o motivo de uma decisão
- resume erro cedo demais
- repete tentativa que já falhou
- diz "feito" sem prova
- muda o próprio fluxo sem medir se melhorou

Então eu criei o Codex Harness MCP.

É um MCP local, sem dependências externas, que dá ao Codex CLI uma camada de engenharia de harness:

- contratos de execução antes de implementar
- memória local/RAG por projeto
- traces brutos de tentativa, erro, decisão e sucesso
- registro de verificação sem o MCP executar shell
- eval cases e eval runs para medir mudanças no harness
- perfis de harness
- proposal + promotion decision estilo Meta-Harness-lite
- export do harness em linguagem natural
- completion gate antes de declarar pronto

A ideia é simples:

Prompt faz o agente começar.
Harness faz o agente trabalhar como engenharia.

Instalação:

npx skills add chapzin/codex-harness-mcp -g -a codex -y --copy

Repo:
https://github.com/chapzin/codex-harness-mcp

Skill:
https://skills.sh/chapzin/codex-harness-mcp/codex-harness-mcp

Se você usa Codex CLI para trabalho real, teste isso em uma tarefa longa e veja a diferença: o agente começa a deixar rastro, memória e prova.
```

## English flagship post

Title:

```text
I built a local MCP harness for Codex CLI: contracts, memory, evals, traces, and gates
```

Body:

```text
Most people are still trying to improve coding agents with bigger prompts.

I think the real leverage is moving down a layer: the harness.

When a Codex session gets long, the failures are quiet:

- research gets repeated
- decisions lose their evidence
- failures get summarized too early
- verification output disappears
- the agent says "done" before the work is actually gated
- harness changes get promoted without holdout evidence

So I built Codex Harness MCP.

It is a dependency-free local MCP server for Codex CLI that gives the agent a project-local system of record:

- execution contracts
- local RAG knowledge
- raw traces
- structured verification records
- local observability reports
- harness profiles
- eval cases and eval runs
- Meta-Harness-lite proposal and promotion decisions
- natural-language harness spec export
- completion gates

It does not run shell commands.
It records the evidence from commands you run outside the MCP.

Prompt engineering starts the agent.
Harness engineering keeps the work measurable.

Install:

npx skills add chapzin/codex-harness-mcp -g -a codex -y --copy

GitHub:
https://github.com/chapzin/codex-harness-mcp

skills.sh:
https://skills.sh/chapzin/codex-harness-mcp/codex-harness-mcp
```

## Hacker News / Show HN

Title options:

```text
Show HN: Codex Harness MCP - a local harness layer for Codex CLI
Show HN: I built a dependency-free MCP server for Codex harness engineering
Show HN: Local contracts, memory, evals, and gates for Codex CLI
```

Body:

```text
I built a small local MCP server for Codex CLI that focuses on harness engineering rather than command execution.

The goal is to make long-running agent work more inspectable:

- create execution contracts before implementation
- store project-local knowledge/RAG
- record raw traces and verification evidence
- export a local observability report for blind-spot review
- store harness profiles, eval cases, eval runs, and comparisons
- record Meta-Harness-lite proposals and promotion decisions
- export the current loop as a natural-language harness spec
- run a completion gate before claiming the task is done

It uses only Node.js built-ins, stores state under `.codex-harness/`, does not download runtime packages, does not call remote services, and does not run shell commands. It records evidence produced outside the MCP.

Repo: https://github.com/chapzin/codex-harness-mcp
Skill: https://skills.sh/chapzin/codex-harness-mcp/codex-harness-mcp
```

## Reddit r/codex post

Title:

```text
I built a local harness MCP for Codex CLI so long tasks keep contracts, memory, traces, evals, and gates
```

Body:

```text
I've been using Codex for longer tasks, and the same failure pattern keeps showing up:

The model can do the work, but the surrounding workflow forgets too much.

So I built `codex-harness-mcp`, a local MCP server that gives Codex CLI a durable project-local harness.

What it does:

- `harness_create_contract` before implementation
- local knowledge/RAG under `.codex-harness/knowledge`
- raw attempt/failure/success traces
- structured verification records
- eval cases/runs for harness profile changes
- Meta-Harness-lite proposal + promotion decision records
- `harness://harness/spec` export as natural-language harness logic
- completion gates before "done"

What it does not do:

- no shell execution inside MCP
- no remote calls
- no runtime package downloads
- no credentials

Install:

npx skills add chapzin/codex-harness-mcp -g -a codex -y --copy

Repo:
https://github.com/chapzin/codex-harness-mcp

I'm interested in feedback from people running Codex on real multi-step repo work: what other harness artifacts should become first-class?
```

## Reddit r/mcp security-first post

Title:

```text
Built a dependency-free local MCP for Codex harness engineering - no shell execution, no remote calls
```

Body:

```text
I built a local MCP server for Codex CLI focused on harness state rather than tool execution.

The security posture was the main design constraint:

- Node.js built-ins only
- no npm runtime dependencies
- no shell execution inside the MCP
- no external URLs in runtime/installer files
- no remote services
- no credentials
- all project state under `.codex-harness/`
- stored source/user text returned inside `<untrusted-data>` boundaries

The MCP records contracts, local knowledge, traces, verification evidence, eval runs, harness proposals, promotion decisions, and completion gates.

It is basically a black-box recorder and control plane for Codex CLI work.

Repo:
https://github.com/chapzin/codex-harness-mcp

Skill:
https://skills.sh/chapzin/codex-harness-mcp/codex-harness-mcp
```

## LinkedIn post

```text
The next wave of AI coding productivity will not come from "better prompts".

It will come from better harnesses.

A coding agent does not fail only because the model is weak.
It fails because the work around the model is not engineered:

No durable memory.
No explicit contract.
No trace of why something failed.
No proof record.
No eval record when the harness changes.
No gate before "done".

That is why I built Codex Harness MCP.

It is a local, dependency-free MCP server for Codex CLI that turns long-running agent work into an auditable loop:

- contracts before implementation
- local project RAG
- raw traces
- verification records
- harness profiles
- eval cases and eval runs
- Meta-Harness-lite proposal and promotion decisions
- natural-language harness spec export
- completion gates

It does not run shell commands.
It records evidence.

This is the layer I think serious AI engineering teams will standardize next:
not just "which model did you use?"
but "what harness did you put around it?"

GitHub:
https://github.com/chapzin/codex-harness-mcp

skills.sh:
https://skills.sh/chapzin/codex-harness-mcp/codex-harness-mcp
```

## X / Twitter thread

```text
1/ Most people are still trying to improve AI coding agents with bigger prompts.

Wrong layer.

The leverage is the harness.

2/ Same model. Different harness. Different outcome.

A serious coding agent needs contracts, memory, traces, evals, proof, and gates.

3/ So I built Codex Harness MCP.

A local MCP server that gives Codex CLI a project-local harness for long-running work.

4/ What it stores:

- contracts
- local RAG knowledge
- raw traces
- verification records
- harness profiles
- eval cases/runs
- proposals
- promotion decisions
- natural-language harness specs
- completion gates

5/ The best part:

It does not run shell commands.
It does not call remote services.
It does not download runtime packages.

It records evidence.

6/ This matters because "done" from an agent is cheap.

Proof is expensive.

The harness makes proof part of the workflow.

7/ It also has Meta-Harness-lite:

If you change the harness, record the hypothesis, eval evidence, holdout behavior, regressions, risks, and promotion decision.

8/ Prompt engineering starts the agent.

Harness engineering keeps the work measurable.

9/ Install:

npx skills add chapzin/codex-harness-mcp -g -a codex -y --copy

10/ GitHub:
https://github.com/chapzin/codex-harness-mcp

Skill:
https://skills.sh/chapzin/codex-harness-mcp/codex-harness-mcp
```

## YouTube comment templates

Use under videos about Codex, MCP, AI coding agents, harness engineering, agent workflows, or context engineering.

### Comment 1 - Codex-focused

```text
This is exactly the layer most Codex workflows are missing: not a bigger prompt, but a durable harness.

I built a local MCP for Codex CLI that stores contracts, project memory/RAG, raw traces, verification records, eval runs, harness proposals, promotion decisions, and completion gates.

It does not run shell commands or call remote services. It just gives Codex a local system of record under `.codex-harness/`.

Repo: https://github.com/chapzin/codex-harness-mcp
Skill: https://skills.sh/chapzin/codex-harness-mcp/codex-harness-mcp
```

### Comment 2 - Harness-engineering angle

```text
The big shift is from "prompt engineering" to "harness engineering".

Same model, but a better loop around it:

- contract before work
- local memory before repeated research
- trace every failure
- record verification evidence
- compare harness profiles with evals
- promote harness changes only with holdout evidence
- gate completion

I packaged this as a local Codex MCP:
https://github.com/chapzin/codex-harness-mcp
```

### Comment 3 - MCP safety angle

```text
One thing I think MCP builders need to take seriously: the MCP should not become a random command runner.

I built a Codex harness MCP with the opposite posture:

- no runtime dependencies
- no shell execution
- no remote calls
- no credentials
- all state local under `.codex-harness/`
- stored content wrapped as untrusted evidence

It records contracts, traces, verification evidence, evals, proposals, and gates.

Repo:
https://github.com/chapzin/codex-harness-mcp
```

## YouTube Shorts / Reels script

```text
Hook:
Your AI coding agent does not need a bigger prompt.
It needs a harness.

Problem:
When Codex works for a long time, it forgets research, loses proof, repeats failed paths, and sometimes says "done" before anything was actually gated.

Shift:
That is why serious AI engineering is moving from prompt engineering to harness engineering.

Solution:
I built Codex Harness MCP.

It gives Codex CLI:
contracts,
local memory,
raw traces,
verification records,
eval runs,
harness proposals,
promotion decisions,
and completion gates.

Safety:
It is local. No shell execution inside the MCP. No runtime dependencies. No remote calls.

CTA:
Search Codex Harness MCP on GitHub or install it from skills.sh.
```

## 3-minute YouTube video outline

Title options:

```text
Your Codex Agent Needs a Harness, Not Another Prompt
I Built a Local MCP That Turns Codex CLI Into an Auditable Agent Workflow
Prompt Engineering Is Not Enough: Codex Harness MCP Demo
```

Outline:

1. Hook: same model, different harness, different result.
2. Pain: long Codex tasks lose context, evidence, and verification.
3. Principle: prompt starts the agent; harness controls the work.
4. Demo: `.codex-harness/` folders and README diagram.
5. Tools: contract, knowledge, trace, verification, eval, proposal, gate.
6. Safety: no shell execution, no remote calls, Node built-ins only.
7. Install command.
8. CTA: try it on one long task and inspect the evidence it leaves behind.

## Discord / Slack community message

```text
I built a small local MCP for Codex CLI that might be useful for people doing longer agentic coding runs.

It is called Codex Harness MCP.

Instead of giving the agent more prompt text, it gives it a local system of record:

- execution contracts
- project memory/RAG
- raw traces
- verification records
- eval runs
- harness proposals
- promotion decisions
- natural-language harness spec export
- completion gates

It uses Node built-ins only and does not execute shell commands or call remote services.

Would love feedback from people building with Codex/MCP:
https://github.com/chapzin/codex-harness-mcp
```

## Reply bank for objections

### "Why MCP? CLI is enough."

```text
I agree CLI is great for execution. This MCP is not trying to replace CLI commands.

It deliberately does not run shell commands.

The point is to store harness state: contracts, traces, local knowledge, verification evidence, eval runs, and gates. CLI does the work; the MCP records the operating context and proof.
```

### "Is this just prompt engineering?"

```text
No. Prompt engineering changes the instruction.

Harness engineering changes the system around the model: what state exists, what evidence is recorded, how failures are traced, how evals are compared, and when completion is allowed.
```

### "Does it auto-run evals?"

```text
No. That is intentional.

The MCP records externally run eval results and comparisons. It does not execute benchmark commands or generated harness code. That keeps the safety profile simple and inspectable.
```

### "Why local RAG instead of a vector DB?"

```text
Because the first goal is inspectability and zero setup.

It uses dependency-free lexical retrieval over local JSON/Markdown. That is enough to stop repeated research and preserve implementation lessons without adding a hosted memory service.
```

### "What makes it safe?"

```text
No runtime dependencies, no shell execution, no remote calls, no credentials, project-local writes only under `.codex-harness/`, and stored source/user content returned inside `<untrusted-data>` boundaries.
```

## Posting cadence

Day 1:

- GitHub README already updated
- skills.sh page already linked
- Reddit r/codex post
- X thread

Day 2:

- LinkedIn post
- YouTube comments under 5 relevant Codex/MCP/harness videos
- Discord/Slack builder communities

Day 3:

- Hacker News Show HN
- Reddit r/mcp security-first version
- Submit PRs to relevant MCP / Codex awesome lists

Day 4-7:

- Short demo video
- Reply to all comments with technical clarity
- Ask for one concrete kind of feedback: "What harness artifact should be first-class next?"

## Do not say

Avoid these claims:

- "guarantees better performance"
- "makes Codex autonomous"
- "replaces engineering review"
- "runs benchmarks automatically"
- "secure by default for every environment"
- "same results as Meta-Harness"

Use these instead:

- "makes agent work more auditable"
- "records evidence"
- "keeps state local"
- "supports harness eval records"
- "implements a safe Meta-Harness-lite evidence layer"
- "does not execute commands inside the MCP"

## Best final CTA

```text
Try it on one task where Codex usually loses context.

If, after the run, you can inspect the contract, memory, traces, verification evidence, and gate, you will feel why harness engineering matters.
```
