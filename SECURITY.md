# Security Policy

## Threat model

`codex-harness-mcp` is a **local, dependency-free, stdio-based MCP server**. It runs as the user's own process, with no network listener, no shell execution, no remote calls, and no credential handling. Its entire attack surface is the JSON-RPC messages the MCP client sends and the files inside `.codex-harness/` it writes.

### In scope

- **Path safety**: tool inputs must not be able to read or write outside the project's `.codex-harness/` directory.
- **State integrity**: `state.json` must survive crashes, concurrent writers (even from two MCP clients on the same project), and partial writes.
- **Input sanitization**: untrusted text from MCP clients must not corrupt files, escape via Unicode trickery, or unbound storage.
- **Denial of service via inputs**: malformed JSON-RPC, oversized payloads, or pathological parameters must not crash or wedge the server.
- **ID safety**: identifiers used as filename components must be free of path traversal sequences and collision-resistant within a project lifetime.
- **Surface separation**: tool responses and MCP resources expose sanitized shapes; untrusted text is wrapped in `<untrusted-data>` markers so a downstream LLM cannot mistake stored content for instructions.

### Out of scope

- **The MCP client itself**: this server cannot defend against a compromised host process (Claude Code, Codex CLI, etc.). The client controls stdin/stdout.
- **Attackers with write access to the project's filesystem**: TOCTOU between `fs.lstat` and `fs.writeFile` is real but requires the attacker to already control the FS, which violates pre-conditions.
- **The user's own input via the installer CLI**: `scripts/install-codex-harness-mcp.mjs --project <path>` writes wherever the user tells it to. That is the intended interface.
- **Network attacks**: there is no network surface.
- **Supply chain**: the server has zero runtime dependencies (`tests/no-runtime-deps.mjs` enforces this); the only attack surface is the Node.js runtime itself.

## Defenses

This list is the result of nine audit rounds (see `docs/` for context, `git log` for commits). Each defense was validated with a PoC before being landed.

### Path traversal

- `harnessPath()` uses `path.resolve()` and asserts the resolved path is the harness root or starts with it (`assets/codex-harness-mcp/src/core.mjs`).
- `safeFileId()` allows only `[A-Za-z0-9._-]+`, rejects `..`, `/`, `\`, and applies the same `sanitizeText` truncation as all stored text.
- `loadContract()` filters `contractId` through `safeFileId` before any file system operation; even if a bad contract reference is stored in a trace, it cannot be turned into a path read.
- Resource URIs (`harness://contract/<id>`, `harness://knowledge/<id>`) go through `safeFileId` decode.
- `resources/list` cursor accepts only `^offset:(\d+)$`, clamped to `[0, length]`.

### Atomic writes

- `writeJson()` writes a `.tmp.PID.HEX` file then `fs.rename()` — atomic on POSIX.
- `refuseSymlinkAt()` checks via `fs.lstat` and rejects writes that would follow a symlink (defense against pre-planted symlink → arbitrary-file overwrite).
- On `ensureHarness()`, a reaper walks `.codex-harness/` (depth 3) and removes `.tmp.PID.HEX` files older than 5 minutes — closes the orphan window if a previous process was `SIGKILL`'d between `writeFile` and `rename`.

### Concurrency

- In-process mutex (`chainPerProjectLock`) serializes writes per `projectPath` within a single server instance; map entries are dropped via `.finally()` so the map cannot grow without bound.
- Cross-process file lock via `fs.open(path, "wx")` (`.state.lock`, `.knowledge-index.lock`) — staleness detection at 30s, 8s acquisition timeout. Two MCP clients on the same project (e.g. Claude Code + Codex CLI) now serialize correctly.
- `mutateState` is the only write path; all 13 state writers go through it.
- `loadKnowledgeIndex` recovers from corrupt index by rebuilding from `knowledge/items/*` without re-entering the lock.

### State corruption

- `readStateRaw()` distinguishes "missing" from "corrupt" and triggers `recoverCorruptState()` with a backup of the bad file.
- `migrateHarness()` copies `state.json` to `state.v<from>.backup.<ts>.json` before any migration; `pruneMigrationBackups()` keeps the 5 most recent.
- All migrations are wrapped in `withStateLock`, so a concurrent migration becomes a no-op.

### Input sanitization

- `sanitizeText()` strips C0 control codes, zero-width characters (U+200B–U+200F), bidi overrides (U+202A–U+202E, U+2066–U+2069), BOM (U+FEFF), and replacement char (U+FFFD).
- `<untrusted-data>` markers are wrapped on output so the LLM client sees structured untrusted blocks rather than naked text.
- Default `MAX_TEXT_LENGTH` is 12,000 chars; longer inputs are truncated with `[truncated N characters]` suffix.
- Knowledge index `termCounts` is capped at 40 tokens per item, token length ≤ 80; protects against unbounded growth.

### JSON-RPC surface

- Server enforces `MAX_LINE_BYTES = 1,000,000` per request line and `MAX_BUFFER_BYTES = 4,000,000` total buffer; oversize line returns `-32600 Invalid Request`, oversize buffer terminates the connection.
- `validateAgainstSchema` runs against each tool's declared JSON Schema before the handler executes.
- `protocolVersion` is negotiated against an allow-list (`2024-11-05`, `2025-03-26`, `2025-06-18`); unknown versions get the default rather than being echoed back verbatim.
- Error messages are redacted via `redactProjectPaths` before being returned to the client.

### IDs and randomness

- All generated IDs use `crypto.randomBytes(6)` (48 bits = 2⁴⁸ space); birthday-paradox math gives effectively zero collisions for >100K records per day.

## Reporting a vulnerability

If you find a security issue:

1. **Do not open a public issue.**
2. Email the maintainer with details, reproduction steps, and any PoC.
3. You will receive an acknowledgement within 72 hours.
4. Expect a fix or detailed status update within 14 days for confirmed issues.

The project is small and the maintainer is one person; please give realistic timelines for non-critical issues.

## Audit history

Nine sequential gap-hunt rounds were executed between 2026-05-10 and 2026-05-11. Each round defined explicit hypotheses with concrete failure modes, validated each with a PoC, and either fixed the underlying issue or pinned the design decision with a test. Reports are kept locally in `.codex-harness/knowledge/research/round{2..10}-gaps.md` (gitignored — they are operational notes, not public artifacts).

The hardening series ended at Round 10 when five new hypotheses all resolved to refutations or documented design choices, indicating decreasing returns. The current state is `0.2.0` with 37 tests passing.

## What this server will never do

- Make outbound network requests.
- Execute shell commands.
- Read or write outside the `.codex-harness/` directory of the configured project.
- Store secrets, credentials, or user authentication data.
- Phone home with telemetry.

These are not configurable — they are architectural choices enforced by the absence of the corresponding code paths.
