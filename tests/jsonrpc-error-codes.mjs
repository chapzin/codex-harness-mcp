import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const serverPath = path.resolve(
  "assets/codex-harness-mcp/src/server.mjs"
);

async function rpcRoundTrip(messages) {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "codex-harness-rpc-"));
  const child = spawn(process.execPath, [serverPath], {
    cwd,
    stdio: ["pipe", "pipe", "pipe"]
  });

  let buffer = "";
  const responses = [];
  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    let idx;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      if (line.trim().length === 0) continue;
      responses.push(JSON.parse(line));
    }
  });

  for (const message of messages) {
    child.stdin.write(`${JSON.stringify(message)}\n`);
  }
  child.stdin.end();

  await new Promise((resolve, reject) => {
    child.on("close", resolve);
    child.on("error", reject);
  });

  await fs.rm(cwd, { recursive: true, force: true });
  return responses;
}

const responses = await rpcRoundTrip([
  { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } },
  {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: { name: "harness_does_not_exist" }
  },
  {
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "harness_bootstrap", arguments: "not-an-object" }
  },
  {
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: { name: "harness_bootstrap", arguments: [1, 2, 3] }
  },
  {
    jsonrpc: "2.0",
    id: 5,
    method: "ping"
  }
]);

const byId = new Map(responses.map((r) => [r.id, r]));

const unknownTool = byId.get(2);
assert.ok(unknownTool?.error, "unknown tool returns RPC error");
assert.equal(unknownTool.error.code, -32602, "unknown tool maps to -32602 invalid params");

const stringArgs = byId.get(3);
assert.ok(stringArgs?.error, "string arguments return RPC error");
assert.equal(stringArgs.error.code, -32602, "string arguments map to -32602");
assert.match(stringArgs.error.message, /must be an object/i);

const arrayArgs = byId.get(4);
assert.ok(arrayArgs?.error, "array arguments return RPC error");
assert.equal(arrayArgs.error.code, -32602, "array arguments map to -32602");

const ping = byId.get(5);
assert.ok(ping?.result, "ping still succeeds");
assert.deepEqual(ping.result, {}, "ping result is empty object");

console.log("JSON-RPC error codes distinguish invalid params from internal errors.");
