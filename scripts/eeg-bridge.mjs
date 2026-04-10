#!/usr/bin/env node
import http from "node:http";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";

const HOST = process.env.EEG_BRIDGE_HOST || "127.0.0.1";
const PORT = Number(process.env.EEG_BRIDGE_PORT || 8787);
const LOG_DIR = process.env.EEG_LOG_DIR || path.join(process.cwd(), "temp", "eeg-marker-logs");
const ENABLE_LSL = (process.env.EEG_ENABLE_LSL || "1") !== "0";
const LSL_STREAM_NAME = process.env.EEG_LSL_STREAM_NAME || "ExperimentsMarkers";
const LSL_STREAM_TYPE = process.env.EEG_LSL_STREAM_TYPE || "Markers";
const LSL_SOURCE_ID = process.env.EEG_LSL_SOURCE_ID || `experiments-markers-${process.pid}`;
const ENABLE_LABRECORDER_RC = (process.env.EEG_ENABLE_LABRECORDER_RC || "0") === "1";
const LABRECORDER_HOST = process.env.EEG_LABRECORDER_HOST || "127.0.0.1";
const LABRECORDER_PORT = Number(process.env.EEG_LABRECORDER_PORT || 22345);
const LABRECORDER_ROOT = process.env.EEG_LABRECORDER_ROOT || "";
const LABRECORDER_TEMPLATE = process.env.EEG_LABRECORDER_TEMPLATE || "%p_%s_%b.xdf";

fs.mkdirSync(LOG_DIR, { recursive: true });

const state = {
  startedAt: new Date().toISOString(),
  eventsReceived: 0,
  eventsForwardedToLsl: 0,
  lastEventAt: null,
  currentSessionFile: null,
  currentSessionMeta: null,
  lsl: {
    enabled: ENABLE_LSL,
    active: false,
    error: null,
  },
  labRecorder: {
    enabled: ENABLE_LABRECORDER_RC,
    lastError: null,
    started: false,
  },
};

let lslOutlet = null;
let logStream = null;
let lslInitAttempted = false;

function sanitizeFilePart(value, fallback = "na") {
  const normalized = String(value ?? "").trim();
  if (!normalized) return fallback;
  return normalized.replace(/[^a-zA-Z0-9_.-]/g, "_");
}

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function closeLogStream() {
  if (logStream) {
    logStream.end();
    logStream = null;
  }
}

function openSessionLog(meta = {}) {
  closeLogStream();
  const participant = sanitizeFilePart(meta.participantId, "participant");
  const session = sanitizeFilePart(meta.sessionId, "session");
  const task = sanitizeFilePart(meta.taskId, "task");
  const variant = sanitizeFilePart(meta.variantId, "variant");
  const fileName = `${nowStamp()}_${participant}_${session}_${task}_${variant}_markers.ndjson`;
  const filePath = path.join(LOG_DIR, fileName);
  logStream = fs.createWriteStream(filePath, { flags: "a" });
  state.currentSessionFile = filePath;
  state.currentSessionMeta = {
    participantId: meta.participantId ?? null,
    sessionId: meta.sessionId ?? null,
    studyId: meta.studyId ?? null,
    taskId: meta.taskId ?? null,
    variantId: meta.variantId ?? null,
  };
}

function writeEventLine(event) {
  if (!logStream) {
    openSessionLog(event);
  }
  logStream.write(`${JSON.stringify(event)}\n`);
}

function buildMarkerString(event) {
  const parts = [
    event.kind || "event",
    event.eventType || "",
    typeof event.blockIndex === "number" ? `B${event.blockIndex}` : "",
    typeof event.trialIndex === "number" ? `T${event.trialIndex}` : "",
  ].filter(Boolean);
  return parts.join("|");
}

async function ensureLslOutlet() {
  if (!ENABLE_LSL || lslOutlet || lslInitAttempted) return;
  lslInitAttempted = true;
  try {
    const lsl = await import("node-labstreaminglayer");
    const info = new lsl.StreamInfo(
      LSL_STREAM_NAME,
      LSL_STREAM_TYPE,
      1,
      lsl.IRREGULAR_RATE ?? 0,
      "string",
      LSL_SOURCE_ID,
    );
    lslOutlet = new lsl.StreamOutlet(info);
    state.lsl.active = true;
    state.lsl.error = null;
    console.log(`[eeg-bridge] LSL outlet active: ${LSL_STREAM_NAME} (${LSL_STREAM_TYPE})`);
  } catch (error) {
    state.lsl.active = false;
    state.lsl.error = error instanceof Error ? error.message : String(error);
    console.warn("[eeg-bridge] LSL disabled (node-labstreaminglayer unavailable or failed to initialize):", state.lsl.error);
  }
}

function sendLabRecorderCommands(commands) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: LABRECORDER_HOST, port: LABRECORDER_PORT }, () => {
      socket.write(`${commands.join("\n")}\n`);
      socket.end();
      resolve();
    });
    socket.on("error", reject);
  });
}

async function maybeStartLabRecorder(event) {
  if (!ENABLE_LABRECORDER_RC || state.labRecorder.started) return;
  const commandParts = [];
  if (LABRECORDER_ROOT) commandParts.push(`{root:${LABRECORDER_ROOT}}`);
  commandParts.push(`{template:${LABRECORDER_TEMPLATE}}`);
  if (event.taskId) commandParts.push(`{task:${event.taskId}}`);
  if (event.participantId) commandParts.push(`{participant:${event.participantId}}`);
  if (event.sessionId) commandParts.push(`{session:${event.sessionId}}`);
  try {
    await sendLabRecorderCommands([
      "select all",
      `filename ${commandParts.join(" ")}`,
      "start",
    ]);
    state.labRecorder.started = true;
    state.labRecorder.lastError = null;
    console.log("[eeg-bridge] LabRecorder remote start command sent");
  } catch (error) {
    state.labRecorder.lastError = error instanceof Error ? error.message : String(error);
    console.warn("[eeg-bridge] LabRecorder start command failed:", state.labRecorder.lastError);
  }
}

async function maybeStopLabRecorder() {
  if (!ENABLE_LABRECORDER_RC || !state.labRecorder.started) return;
  try {
    await sendLabRecorderCommands(["stop"]);
    console.log("[eeg-bridge] LabRecorder remote stop command sent");
  } catch (error) {
    state.labRecorder.lastError = error instanceof Error ? error.message : String(error);
    console.warn("[eeg-bridge] LabRecorder stop command failed:", state.labRecorder.lastError);
  } finally {
    state.labRecorder.started = false;
  }
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.end(JSON.stringify(payload));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > 1024 * 1024) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve(text ? JSON.parse(text) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

async function handleEvent(event) {
  state.eventsReceived += 1;
  state.lastEventAt = new Date().toISOString();

  if (event.kind === "session_start") {
    openSessionLog(event);
    await maybeStartLabRecorder(event);
  }

  writeEventLine(event);

  await ensureLslOutlet();
  if (lslOutlet) {
    try {
      lslOutlet.pushSample([buildMarkerString(event)]);
      state.eventsForwardedToLsl += 1;
    } catch (error) {
      state.lsl.error = error instanceof Error ? error.message : String(error);
    }
  }

  if (event.kind === "session_end") {
    await maybeStopLabRecorder();
    closeLogStream();
  }
}

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    sendJson(res, 400, { ok: false, error: "Missing URL" });
    return;
  }

  if (req.method === "OPTIONS") {
    sendJson(res, 204, { ok: true });
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    sendJson(res, 200, {
      ok: true,
      bridge: {
        host: HOST,
        port: PORT,
        startedAt: state.startedAt,
        eventsReceived: state.eventsReceived,
        eventsForwardedToLsl: state.eventsForwardedToLsl,
        lastEventAt: state.lastEventAt,
        currentSessionFile: state.currentSessionFile,
      },
      lsl: state.lsl,
      labRecorder: state.labRecorder,
    });
    return;
  }

  if (req.method === "POST" && req.url === "/event") {
    try {
      const body = await parseBody(req);
      const event = body && typeof body === "object" ? body : {};
      await handleEvent(event);
      sendJson(res, 200, { ok: true });
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }

  sendJson(res, 404, { ok: false, error: "Not found" });
});

server.listen(PORT, HOST, async () => {
  await ensureLslOutlet();
  console.log(`[eeg-bridge] Listening on http://${HOST}:${PORT}`);
  console.log(`[eeg-bridge] Marker logs: ${LOG_DIR}`);
  if (ENABLE_LABRECORDER_RC) {
    console.log(`[eeg-bridge] LabRecorder RC enabled at ${LABRECORDER_HOST}:${LABRECORDER_PORT}`);
  }
});

async function shutdown() {
  await maybeStopLabRecorder();
  closeLogStream();
  server.close(() => process.exit(0));
}

process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});
