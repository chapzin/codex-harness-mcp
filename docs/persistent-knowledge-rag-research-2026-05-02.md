# Persistent knowledge/RAG research - 2026-05-02

This note records the research decision behind `codex-harness-mcp` version `0.1.4`.

## Question

Should the harness learn from implementation work and deep research, and should it include a persistent RAG layer similar in spirit to the user's global `llm-wiki` workflow?

## Finding

Version `0.1.3` did not include persistent RAG. It had durable state, contracts, traces, verification records, resources, prompts, and migrations. It could preserve evidence, but it could not store research/implementation lessons as searchable reusable knowledge.

## Design Chosen

Implement a local, dependency-free, file-backed knowledge layer:

- store knowledge under `.codex-harness/knowledge/`
- store canonical JSON in `knowledge/items/`
- store human-readable Markdown companions in `knowledge/research/` and `knowledge/lessons/`
- maintain `knowledge/index.json`
- support deterministic lexical retrieval with local token scoring
- expose knowledge through MCP tools, resources, and prompts
- keep all stored source/user content inside `untrusted-data` boundaries
- avoid embeddings, vector databases, registry packages, remote APIs, or internet access inside the MCP server

## Why this route

Public memory/RAG examples cluster around two patterns:

- Knowledge-graph or vector-backed MCP memory servers with richer semantic retrieval.
- Local-first markdown/file stores that are easier to audit and less risky for coding-agent workflows.

For this repo, the second pattern fits better. The skills.sh warnings made it important to avoid runtime downloads, remote services, and command execution in the MCP server. The resulting feature is closer to `llm-wiki` as a local knowledge workflow than to a hosted semantic RAG service.

## Implemented Surface

Tools:

- `harness_record_knowledge`
- `harness_record_research`
- `harness_record_lesson`
- `harness_query_knowledge`
- `harness_rebuild_knowledge_index`
- `harness_list_knowledge`

Resources:

- `harness://knowledge/index`
- `harness://knowledge/recent`
- `harness://knowledge/item/{id}`

Prompts:

- `harness_deep_research`
- `harness_learn_from_implementation`
- `harness_query_knowledge`

State:

- `CURRENT_STATE_VERSION = 3`
- migration marker: `state-v3-knowledge-counters`
- counters: `knowledgeItems`, `knowledgeQueries`

## Source Links

- MCP Directory RAG Memory: https://mcp.directory/servers/rag-memory
- MCP memory server overview: https://www.mcpgee.com/servers/memory
- Memory Plus local RAG memory store: https://mcp.directory/servers/memory-plus
- Amazon Bedrock AgentCore memory harness docs: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-memory.html
- MemoryGraft paper: https://arxiv.org/abs/2512.16962
- Continuum Memory Architectures: https://arxiv.org/abs/2601.09913
- Codebase-Memory paper: https://arxiv.org/abs/2603.27277
- Hindsight persistent memory guide: https://hindsight.vectorize.io/guides/2026/04/23/guide-beginners-guide-to-persistent-memory-for-ai-agents
- Persistent memory architecture overview: https://zylos.ai/en/research/2026-04-05-ai-agent-memory-architectures-persistent-knowledge
