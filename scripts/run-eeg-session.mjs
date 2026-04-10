#!/usr/bin/env node
import { spawn } from "node:child_process";

const bridgeCommand = ["node", ["scripts/eeg-bridge.mjs"]];
const webCommand = ["npm", ["run", "dev", "-w", "@experiments/web"]];
const bridgeHost = process.env.EEG_BRIDGE_HOST || "127.0.0.1";
const bridgePort = Number(process.env.EEG_BRIDGE_PORT || 8787);

let bridgeProc = null;
let webProc = null;
let shuttingDown = false;

function spawnChild(command, args, name) {
  const child = spawn(command, args, {
    stdio: "inherit",
    env: process.env,
  });
  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    const reason = signal ? `signal ${signal}` : `code ${code}`;
    console.error(`[eeg-session] ${name} exited with ${reason}`);
    shutdown(1);
  });
  return child;
}

async function waitForBridgeReady(timeoutMs = 5000) {
  const started = Date.now();
  const healthUrl = `http://${bridgeHost}:${bridgePort}/health`;
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(healthUrl, { cache: "no-store" });
      if (response.ok) {
        const health = await response.json().catch(() => ({}));
        console.log("[eeg-session] Bridge healthy", health?.lsl ? `| LSL active: ${Boolean(health.lsl.active)}` : "");
        return true;
      }
    } catch {
      // bridge not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

function stopChild(child) {
  if (!child || child.killed) return;
  child.kill("SIGTERM");
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  stopChild(webProc);
  stopChild(bridgeProc);

  setTimeout(() => {
    stopChild(webProc);
    stopChild(bridgeProc);
    process.exit(exitCode);
  }, 500);
}

async function main() {
  console.log("[eeg-session] Starting EEG bridge...");
  bridgeProc = spawnChild(bridgeCommand[0], bridgeCommand[1], "bridge");

  const ready = await waitForBridgeReady();
  if (!ready) {
    console.warn("[eeg-session] Bridge health check timed out; continuing to start Vite anyway.");
  }

  console.log("[eeg-session] Starting web dev server...");
  webProc = spawnChild(webCommand[0], webCommand[1], "web");
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

void main().catch((error) => {
  console.error("[eeg-session] Failed to start:", error);
  shutdown(1);
});
