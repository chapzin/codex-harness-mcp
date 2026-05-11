import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export function isOtelEnabled() {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  return typeof endpoint === "string" && endpoint.trim().length > 0;
}

export function newTraceId() {
  return crypto.randomBytes(16).toString("hex");
}

export function newSpanId() {
  return crypto.randomBytes(8).toString("hex");
}

function nowUnixNano() {
  return (BigInt(Date.now()) * 1_000_000n).toString();
}

function parseResourceAttributes() {
  const raw = process.env.OTEL_RESOURCE_ATTRIBUTES;
  if (typeof raw !== "string" || raw.length === 0) return {};
  const out = {};
  for (const segment of raw.split(",")) {
    const idx = segment.indexOf("=");
    if (idx <= 0) continue;
    const key = segment.slice(0, idx).trim();
    const value = segment.slice(idx + 1).trim();
    if (key) out[key] = value;
  }
  return out;
}

function buildResource() {
  return {
    "service.name": process.env.OTEL_SERVICE_NAME || "codex-harness-mcp",
    ...parseResourceAttributes()
  };
}

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

function sanitizeIdInput(value, hexLength) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  if (!/^[0-9a-f]+$/.test(trimmed)) return null;
  if (trimmed.length !== hexLength) return null;
  return trimmed;
}

function sanitizeUnixNano(value) {
  if (typeof value !== "string") return null;
  if (!/^\d{1,20}$/.test(value)) return null;
  // Pad short strings to 19 digits (millisecond → nano)
  return value.padStart(19, "0");
}

function sanitizeAttributes(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out = {};
  for (const [rawKey, rawValue] of Object.entries(input)) {
    if (typeof rawKey !== "string" || rawKey.length === 0 || rawKey.length > 200) continue;
    if (rawValue === undefined || rawValue === null) continue;
    if (typeof rawValue === "string" || typeof rawValue === "number" || typeof rawValue === "boolean") {
      out[rawKey] = rawValue;
    } else if (Array.isArray(rawValue) && rawValue.every((v) => typeof v === "string")) {
      out[rawKey] = rawValue;
    } else {
      try {
        out[rawKey] = JSON.stringify(rawValue);
      } catch {
        out[rawKey] = String(rawValue);
      }
    }
  }
  return out;
}

export async function emitOtelSpanRecord(harnessRoot, input) {
  if (!isOtelEnabled()) {
    return { emitted: false, span: null };
  }
  const name = typeof input.name === "string" && input.name.length > 0 ? input.name : "span";
  const traceId = sanitizeIdInput(input.traceId, 32) || newTraceId();
  const spanId = sanitizeIdInput(input.spanId, 16) || newSpanId();
  const parentSpanId = sanitizeIdInput(input.parentSpanId, 16);
  const startNano =
    sanitizeUnixNano(input.startTimeUnixNano) || nowUnixNano();
  let endNano = sanitizeUnixNano(input.endTimeUnixNano);
  if (!endNano) endNano = startNano;
  if (BigInt(endNano) < BigInt(startNano)) endNano = startNano;
  const span = {
    traceId,
    spanId,
    parentSpanId: parentSpanId || null,
    name,
    kind: input.kind || "SPAN_KIND_INTERNAL",
    startTimeUnixNano: startNano,
    endTimeUnixNano: endNano,
    attributes: sanitizeAttributes(input.attributes),
    resource: buildResource()
  };
  const dir = path.join(harnessRoot, "otel");
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `spans-${todayStamp()}.jsonl`);
  await fs.appendFile(filePath, `${JSON.stringify(span)}\n`, "utf8");
  return { emitted: true, span };
}
