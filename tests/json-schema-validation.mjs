import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { validateAgainstSchema } from "../assets/codex-harness-mcp/src/schema-validate.mjs";

// Unit-level coverage of the validator
{
  // required missing
  const sObj = {
    type: "object",
    required: ["title"],
    properties: { title: { type: "string", minLength: 3 } },
    additionalProperties: false
  };
  assert.match(validateAgainstSchema(sObj, {}), /missing required property "title"/);
  // minLength
  assert.match(validateAgainstSchema(sObj, { title: "ab" }), /minLength=3/);
  // ok
  assert.equal(validateAgainstSchema(sObj, { title: "abc" }), null);
  // additionalProperties false
  assert.match(validateAgainstSchema(sObj, { title: "abc", junk: 1 }), /unexpected property "junk"/);

  // type mismatches
  assert.match(validateAgainstSchema({ type: "string" }, 5), /expected string, got number/);
  assert.match(validateAgainstSchema({ type: "integer" }, 1.5), /expected integer.*non-integer/);
  assert.match(validateAgainstSchema({ type: "integer", minimum: 1 }, 0), /below minimum=1/);
  assert.match(validateAgainstSchema({ type: "number" }, "x"), /expected number/);
  assert.match(validateAgainstSchema({ type: "boolean" }, 1), /expected boolean/);
  assert.match(validateAgainstSchema({ type: "array" }, "x"), /expected array/);

  // enum
  const sEnum = { type: "string", enum: ["a", "b", "c"] };
  assert.equal(validateAgainstSchema(sEnum, "a"), null);
  assert.match(validateAgainstSchema(sEnum, "d"), /not in enum/);

  // array items
  const sArr = { type: "array", items: { type: "string", minLength: 2 } };
  assert.equal(validateAgainstSchema(sArr, ["ab", "cd"]), null);
  assert.match(validateAgainstSchema(sArr, ["a", "bc"]), /args\[0\]: string shorter than minLength/);
  assert.match(validateAgainstSchema(sArr, ["ab", 3]), /args\[1\]: expected string, got number/);

  // nested
  const sNested = {
    type: "object",
    required: ["data"],
    properties: { data: { type: "object", required: ["x"], properties: { x: { type: "integer", minimum: 0 } }, additionalProperties: false } },
    additionalProperties: false
  };
  assert.match(validateAgainstSchema(sNested, { data: { x: -1 } }), /data\.x: integer below minimum/);
  assert.match(validateAgainstSchema(sNested, { data: { y: 1 } }), /data: missing required property "x"/);
  assert.equal(validateAgainstSchema(sNested, { data: { x: 0 } }), null);

  console.log("validator unit: all assertions pass");
}

// End-to-end through the MCP server
{
  const serverPath = path.resolve("assets/codex-harness-mcp/src/server.mjs");
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "codex-harness-schema-"));

  const child = spawn(process.execPath, [serverPath], { cwd, stdio: ["pipe", "pipe", "pipe"] });
  let buf = "";
  const responses = [];
  child.stdout.on("data", (chunk) => {
    buf += chunk.toString("utf8");
    let idx;
    while ((idx = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (line) responses.push(JSON.parse(line));
    }
  });
  child.stdin.on("error", () => {});

  const writes = [
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } },
    // missing required title for create_contract
    { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "harness_create_contract", arguments: { goal: "Something" } } },
    // title too short (minLength 3)
    { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "harness_create_contract", arguments: { title: "ab", goal: "Something useful" } } },
    // wrong enum on update_state.status
    { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "harness_update_state", arguments: { status: "bogus" } } },
    // additionalProperties: extra arg
    { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "harness_bootstrap", arguments: { junk: 1 } } },
    // integer expected, fractional given
    { jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "harness_create_contract", arguments: { title: "abc", goal: "Something useful", max_steps: 1.5 } } },
    // array items wrong type
    { jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "harness_create_contract", arguments: { title: "abc", goal: "Something useful", permissions: [1, 2] } } },
    // legitimate call still works
    { jsonrpc: "2.0", id: 8, method: "tools/call", params: { name: "harness_bootstrap", arguments: {} } }
  ];

  for (const m of writes) child.stdin.write(`${JSON.stringify(m)}\n`);
  child.stdin.end();
  await new Promise((res, rej) => { child.on("close", res); child.on("error", rej); });

  const by = new Map(responses.map((r) => [r.id, r]));

  const cases = [
    [2, /missing required property "title"/],
    [3, /string shorter than minLength=3/],
    [4, /not in enum/],
    [5, /unexpected property "junk"/],
    [6, /expected integer.*non-integer/],
    [7, /permissions\[0\]: expected string, got number/]
  ];
  for (const [id, regex] of cases) {
    const r = by.get(id);
    assert.ok(r?.error, `id ${id}: error expected`);
    assert.equal(r.error.code, -32602, `id ${id}: code -32602 expected`);
    assert.match(r.error.message, regex, `id ${id}: message must match ${regex}`);
  }

  // bootstrap with no args must succeed (project_path falls back to cwd)
  const ok = by.get(8);
  assert.ok(ok?.result, "legitimate bootstrap succeeds");

  await fs.rm(cwd, { recursive: true, force: true });
  console.log("validator e2e through server: all cases rejected with -32602");
}

console.log("JSON Schema runtime validation: all checks passed.");
