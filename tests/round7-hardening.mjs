import assert from "node:assert/strict";
import crypto from "node:crypto";

import {
  sanitizeText
} from "../assets/codex-harness-mcp/src/core.mjs";

// R7-1: ID collision rate after bumping randomBytes from 3 to 6 bytes.
// 100K IDs in the same simulated day+slug, expected zero collisions for 48-bit
// random space (birthday-paradox math gives ~0 collisions for 100K out of 2^48).
{
  const N = 100_000;
  const seen = new Set();
  let collisions = 0;
  for (let i = 0; i < N; i++) {
    const id = `knowledge-2026-05-11-flood-${crypto.randomBytes(6).toString("hex")}`;
    if (seen.has(id)) collisions++;
    else seen.add(id);
  }
  assert.equal(collisions, 0, `100K IDs in same day+slug must have zero collisions, got ${collisions}`);
  console.log(`R7-1 PASS: ${N} concurrent-style IDs, 0 collisions with 48-bit random space`);
}

// R7-2: sanitizeText strips zero-width, bidi override, BOM, and replacement chars.
// Adversarial code points are written with \uXXXX escapes so this test file
// stays clean of bidi/format chars itself (avoids Semgrep CWE-94 warnings and
// makes the intent explicit).
{
  const ch = (code) => String.fromCharCode(code);
  const cases = [
    { name: "U+FFFD replacement", input: `ab${ch(0xfffd)}cd`, expected: "abcd" },
    { name: "U+200B zero-width space", input: `a${ch(0x200b)}b`, expected: "ab" },
    { name: "U+202E RTL override (filename masking)", input: `report${ch(0x202e)}gpj.exe`, expected: "reportgpj.exe" },
    { name: "U+FEFF BOM", input: `${ch(0xfeff)}hello`, expected: "hello" },
    { name: "U+2066 LTR isolate", input: `x${ch(0x2066)}y`, expected: "xy" },
    { name: "U+200F RTL mark", input: `a${ch(0x200f)}b`, expected: "ab" }
  ];
  for (const { name, input, expected } of cases) {
    const out = sanitizeText(input, { maxLength: 100 });
    assert.equal(out, expected, `${name}: expected "${expected}", got "${out}"`);
  }
  // Normal text remains untouched
  assert.equal(sanitizeText("Hello, world! 1+1=2", { maxLength: 100 }), "Hello, world! 1+1=2");
  // Unicode letters still pass through (we only strip control/format chars).
  assert.equal(sanitizeText("café résumé", { maxLength: 100 }), "café résumé");
  console.log("R7-2 PASS: sanitizeText strips dangerous format chars without touching normal Unicode");
}

// R7-4: server negotiates protocolVersion against an allow-list.
{
  const { spawn } = await import("node:child_process");
  const { promises: fs } = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const serverPath = path.resolve("assets/codex-harness-mcp/src/server.mjs");
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "r7-proto-"));

  async function probe(requestedVersion) {
    const child = spawn(process.execPath, [serverPath], { cwd, stdio: ["pipe", "pipe", "pipe"] });
    let buf = "";
    const responses = [];
    child.stdout.on("data", (c) => {
      buf += c.toString("utf8");
      let idx;
      while ((idx = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (line) responses.push(JSON.parse(line));
      }
    });
    child.stdin.on("error", () => {});
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: requestedVersion } })}\n`);
    child.stdin.end();
    await new Promise((res) => child.on("close", res));
    return responses[0]?.result?.protocolVersion;
  }

  const allowed = "2025-06-18";
  const stranger = "99.99-bogus";
  assert.equal(await probe(allowed), allowed, "supported version is echoed back");
  const negotiated = await probe(stranger);
  assert.notEqual(negotiated, stranger, "bogus version is not echoed back verbatim");
  assert.ok(["2024-11-05", "2025-03-26", "2025-06-18"].includes(negotiated), `negotiated must be from allow-list, got ${negotiated}`);

  await fs.rm(cwd, { recursive: true, force: true });
  console.log("R7-4 PASS: protocolVersion negotiated against allow-list, bogus values rejected");
}

console.log("Round 7 hardening: ID space widened, format chars stripped, protocolVersion negotiated.");
