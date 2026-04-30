import type { CoreConfig, JSONObject } from "../api/types";
import { asArray, asObject, asString } from "../utils/coerce";

const DEFAULT_EEG_BRIDGE_URL = "http://127.0.0.1:8787";
const DEFAULT_EVENT_TYPES = ["task_start", "task_end", "trial_start", "trial_end"];

export interface ResolvedEegBridgeConfig {
  enabled: boolean;
  bridgeUrl: string;
  requireBridge: boolean;
  eventTypes: Set<string>;
  includeEventPayload: boolean;
}

export interface EegBridgeHealthResult {
  ok: boolean;
  status?: number;
  error?: string;
  details?: unknown;
}

export interface EegBridgeEventEnvelope {
  kind: string;
  ts: string;
  taskId?: string;
  configPath?: string;
  participantId?: string;
  studyId?: string;
  sessionId?: string;
  blockIndex?: number;
  blockAttempt?: number;
  trialIndex?: number;
  eventType?: string;
  eventData?: unknown;
  data?: unknown;
}

function normalizeEventTypes(value: unknown): Set<string> {
  const raw = asArray(value)?.map((entry) => asString(entry)).filter(Boolean) as string[] | undefined;
  const list = raw && raw.length > 0 ? raw : DEFAULT_EVENT_TYPES;
  return new Set(list.map((entry) => entry.toLowerCase()));
}

export function resolveEegBridgeConfig(coreConfig: CoreConfig, taskConfig?: JSONObject): ResolvedEegBridgeConfig {
  const coreNode = asObject(coreConfig.eeg) ?? {};
  const taskNode = asObject(taskConfig?.eeg) ?? {};

  const enabled = (taskNode.enabled ?? coreNode.enabled) === true;
  const bridgeUrlRaw = asString(taskNode.bridgeUrl) ?? asString(coreNode.bridgeUrl) ?? DEFAULT_EEG_BRIDGE_URL;
  const bridgeUrl = bridgeUrlRaw.replace(/\/+$/, "");
  const requireBridge = (taskNode.requireBridge ?? coreNode.requireBridge) === true;
  const eventTypes = normalizeEventTypes(taskNode.eventTypes ?? coreNode.eventTypes);
  const includeEventPayload = (taskNode.includeEventPayload ?? coreNode.includeEventPayload) === true;

  return {
    enabled,
    bridgeUrl,
    requireBridge,
    eventTypes,
    includeEventPayload,
  };
}

export async function checkEegBridgeHealth(
  config: ResolvedEegBridgeConfig,
  timeoutMs = 1500,
): Promise<EegBridgeHealthResult> {
  if (!config.enabled) return { ok: true };

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${config.bridgeUrl}/health`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      return { ok: false, status: response.status, details: body };
    }
    return { ok: true, status: response.status, details: body };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function ensureEegBridgeReady(coreConfig: CoreConfig, taskConfig?: JSONObject): Promise<void> {
  const config = resolveEegBridgeConfig(coreConfig, taskConfig);
  if (!config.enabled || !config.requireBridge) return;
  const health = await checkEegBridgeHealth(config);
  if (health.ok) return;
  const detail = health.status
    ? `status=${health.status}`
    : health.error
      ? `error=${health.error}`
      : "unknown bridge error";
  throw new Error(
    `EEG bridge is required but unavailable (${detail}). Start bridge with 'npm run eeg:session' or 'npm run eeg:bridge'.`,
  );
}

export async function postEegBridgeEvent(
  config: ResolvedEegBridgeConfig,
  event: EegBridgeEventEnvelope,
): Promise<boolean> {
  if (!config.enabled) return false;
  try {
    const response = await fetch(`${config.bridgeUrl}/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
      keepalive: true,
    });
    return response.ok;
  } catch {
    return false;
  }
}
