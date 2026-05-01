import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverPath = path.join(repoRoot, "assets", "codex-harness-mcp", "src", "server.mjs");
const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "codex-harness-mcp-smoke-"));
const child = spawn(process.execPath, [serverPath], {
  stdio: ["pipe", "pipe", "pipe"]
});

let buffer = "";
const pending = new Map();
let nextId = 1;

child.stdout.setEncoding("utf8");
child.stdout.on("data", (chunk) => {
  buffer += chunk;
  while (buffer.includes("\n")) {
    const index = buffer.indexOf("\n");
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (!line) continue;
    const message = JSON.parse(line);
    const resolver = pending.get(message.id);
    if (resolver) {
      pending.delete(message.id);
      resolver(message);
    }
  }
});

function request(method, params = {}) {
  const id = nextId++;
  const payload = { jsonrpc: "2.0", id, method, params };
  child.stdin.write(`${JSON.stringify(payload)}\n`);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Timed out waiting for ${method}`));
    }, 5000);
    pending.set(id, (message) => {
      clearTimeout(timer);
      if (message.error) {
        reject(new Error(`${method} failed: ${message.error.message}`));
      } else {
        resolve(message.result);
      }
    });
  });
}

try {
  const init = await request("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "codex-harness-smoke", version: "0.1.0" }
  });
  if (!init.capabilities?.tools) {
    throw new Error("initialize response did not advertise tools capability.");
  }

  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);

  const listed = await request("tools/list");
  const toolNames = listed.tools.map((tool) => tool.name);
  if (!toolNames.includes("harness_bootstrap") || !toolNames.includes("harness_eval_gate")) {
    throw new Error(`Expected harness tools were not listed: ${toolNames.join(", ")}`);
  }

  const bootstrap = await request("tools/call", {
    name: "harness_bootstrap",
    arguments: { project_path: projectPath, project_name: "smoke" }
  });
  const text = bootstrap.content?.[0]?.text || "";
  if (!text.includes(".codex-harness")) {
    throw new Error("harness_bootstrap did not return harness path content.");
  }

  console.log("MCP stdio smoke test passed.");
} finally {
  child.kill();
  await fs.rm(projectPath, { recursive: true, force: true });
}
