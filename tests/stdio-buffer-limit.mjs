import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const serverPath = path.resolve("assets/codex-harness-mcp/src/server.mjs");
const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "codex-harness-stdio-"));

const child = spawn(process.execPath, [serverPath], {
  cwd,
  stdio: ["pipe", "pipe", "pipe"]
});

let stdoutBuffer = "";
const responses = [];
child.stdout.on("data", (chunk) => {
  stdoutBuffer += chunk.toString("utf8");
  let idx;
  while ((idx = stdoutBuffer.indexOf("\n")) !== -1) {
    const line = stdoutBuffer.slice(0, idx).trim();
    stdoutBuffer = stdoutBuffer.slice(idx + 1);
    if (!line) continue;
    try { responses.push(JSON.parse(line)); } catch { /* ignore */ }
  }
});

// Server may close stdin after overflow; swallow EPIPE so the test focuses on
// whether a JSON-RPC error was emitted before shutdown.
child.stdin.on("error", () => {});

const giant = "x".repeat(5_000_000);
child.stdin.write(`${giant}\n`, () => {});
child.stdin.end();

await new Promise((resolve, reject) => {
  child.on("close", resolve);
  child.on("error", reject);
});

const overflowError = responses.find((r) => r.error && /buffer overflow|maximum allowed size/i.test(r.error.message));
assert.ok(overflowError, "Server emits JSON-RPC error for oversized input");
assert.equal(overflowError.error.code, -32700, "Overflow uses parse-error code -32700");

await fs.rm(cwd, { recursive: true, force: true });
console.log("Stdio buffer limit rejects oversized input safely.");
