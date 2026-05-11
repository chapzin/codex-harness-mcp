import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { emitOtelSpan } from "../assets/codex-harness-mcp/src/core.mjs";

let passed = 0;
let failed = 0;

function check(name, condition, detail) {
  if (condition) {
    console.log(`PASS: ${name}`);
    passed++;
  } else {
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

async function readSpans(projectPath) {
  const otelDir = path.join(projectPath, ".codex-harness", "otel");
  try {
    const entries = await fs.readdir(otelDir);
    const spanFiles = entries.filter((e) => e.startsWith("spans-") && e.endsWith(".jsonl"));
    const lines = [];
    for (const file of spanFiles) {
      const raw = await fs.readFile(path.join(otelDir, file), "utf8");
      for (const line of raw.split(/\r?\n/)) {
        if (line.trim()) lines.push(JSON.parse(line));
      }
    }
    return lines;
  } catch {
    return [];
  }
}

const HEX_32 = /^[0-9a-f]{32}$/;
const HEX_16 = /^[0-9a-f]{16}$/;

// === Scenario 1: env unset — no jsonl ===
const path1 = await fs.mkdtemp(path.join(os.tmpdir(), "codex-harness-c5a-"));
try {
  const prior = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  try {
    const result = await emitOtelSpan({
      project_path: path1,
      name: "mcp.tool.invoke",
      attributes: { "mcp.tool.name": "harness_record_trace" }
    });
    check(
      "no-env.emit-returns-disabled",
      result && result.emitted === false,
      JSON.stringify(result)
    );
    const spans = await readSpans(path1);
    check(
      "no-env.no-jsonl-written",
      spans.length === 0,
      `found ${spans.length} spans on disk`
    );
  } finally {
    if (prior !== undefined) process.env.OTEL_EXPORTER_OTLP_ENDPOINT = prior;
  }
} finally {
  await fs.rm(path1, { recursive: true, force: true });
}

// === Scenario 2: env set — full jsonl shape ===
const path2 = await fs.mkdtemp(path.join(os.tmpdir(), "codex-harness-c5b-"));
try {
  const prior = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://localhost:4318/v1/traces";
  try {
    const r = await emitOtelSpan({
      project_path: path2,
      name: "gen_ai.chat",
      attributes: {
        "gen_ai.request.model": "claude-opus-4-7",
        "gen_ai.operation.name": "chat",
        "gen_ai.usage.input_tokens": 1024,
        "gen_ai.usage.output_tokens": 256,
        "gen_ai.response.finish_reason": "endTurn",
        "mcp.tool.name": "harness_record_sampling_interaction"
      }
    });
    check(
      "with-env.emit-returns-shape",
      r &&
        r.emitted === true &&
        typeof r.span === "object" &&
        HEX_32.test(r.span.traceId) &&
        HEX_16.test(r.span.spanId),
      JSON.stringify(r)
    );

    const spans = await readSpans(path2);
    check(
      "with-env.jsonl-written-once",
      spans.length === 1,
      `count=${spans.length}`
    );

    const s = spans[0];
    check(
      "with-env.span-has-required-fields",
      HEX_32.test(s.traceId) &&
        HEX_16.test(s.spanId) &&
        typeof s.name === "string" &&
        typeof s.startTimeUnixNano === "string" &&
        typeof s.endTimeUnixNano === "string" &&
        typeof s.attributes === "object",
      JSON.stringify(s).slice(0, 300)
    );

    check(
      "with-env.attributes-preserved",
      s.attributes["gen_ai.request.model"] === "claude-opus-4-7" &&
        s.attributes["gen_ai.usage.input_tokens"] === 1024 &&
        s.attributes["mcp.tool.name"] === "harness_record_sampling_interaction",
      JSON.stringify(s.attributes)
    );

    check(
      "with-env.time-unix-nano-format",
      /^\d{19}$/.test(s.startTimeUnixNano) &&
        /^\d{19}$/.test(s.endTimeUnixNano) &&
        BigInt(s.endTimeUnixNano) >= BigInt(s.startTimeUnixNano),
      `start=${s.startTimeUnixNano}, end=${s.endTimeUnixNano}`
    );

    // Parent span linkage
    const child = await emitOtelSpan({
      project_path: path2,
      name: "gen_ai.tool.call",
      parent_span_id: r.span.spanId,
      trace_id: r.span.traceId,
      attributes: { "mcp.tool.name": "harness_record_trace" }
    });
    check(
      "with-env.parent-link-preserved",
      child &&
        child.span.parentSpanId === r.span.spanId &&
        child.span.traceId === r.span.traceId,
      JSON.stringify(child.span)
    );

    // Custom start/end times honored
    const explicit = await emitOtelSpan({
      project_path: path2,
      name: "gen_ai.eval",
      start_time_unix_nano: "1700000000000000000",
      end_time_unix_nano: "1700000000123456789",
      attributes: { "gen_ai.operation.name": "evaluate" }
    });
    check(
      "with-env.explicit-times-respected",
      explicit.span.startTimeUnixNano === "1700000000000000000" &&
        explicit.span.endTimeUnixNano === "1700000000123456789",
      JSON.stringify(explicit.span)
    );

    const allSpans = await readSpans(path2);
    check(
      "with-env.jsonl-accumulates",
      allSpans.length === 3,
      `expected 3, got ${allSpans.length}`
    );

    // trace_id stays distinct across unrelated spans (no shared trace by default)
    const traceIds = new Set(allSpans.map((sp) => sp.traceId));
    check(
      "with-env.distinct-traces-without-explicit-trace-id",
      traceIds.size === 2, // root + explicit have own; child inherits parent
      `traceIds: ${[...traceIds].join(",")}`
    );

    // Service name from env, default falls back
    const priorService = process.env.OTEL_SERVICE_NAME;
    process.env.OTEL_SERVICE_NAME = "codex-harness-test";
    try {
      const withService = await emitOtelSpan({
        project_path: path2,
        name: "test"
      });
      check(
        "with-env.service-name-attached",
        withService.span.resource &&
          withService.span.resource["service.name"] === "codex-harness-test",
        JSON.stringify(withService.span.resource)
      );
    } finally {
      if (priorService !== undefined) {
        process.env.OTEL_SERVICE_NAME = priorService;
      } else {
        delete process.env.OTEL_SERVICE_NAME;
      }
    }
  } finally {
    if (prior !== undefined) {
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = prior;
    } else {
      delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    }
  }
} finally {
  await fs.rm(path2, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
