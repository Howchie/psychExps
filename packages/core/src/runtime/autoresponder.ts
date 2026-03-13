import { createMulberry32, hashSeed } from "../infrastructure/random";
import type { AutoResponderConfig, CoreConfig, JSONObject, SelectionContext } from "../api/types";

export interface ResolvedAutoResponderProfile {
  enabled: boolean;
  seed: string | number;
  continueDelayMs: { minMs: number; maxMs: number };
  responseRtMs: { meanMs: number; sdMs: number; minMs: number; maxMs: number };
  timeoutRate: number;
  errorRate: number;
  interActionDelayMs: { minMs: number; maxMs: number };
  holdDurationMs: { minMs: number; maxMs: number };
  maxTrialDurationMs: number;
}

const DEFAULT_PROFILE: ResolvedAutoResponderProfile = {
  enabled: false,
  seed: "auto",
  continueDelayMs: { minMs: 800, maxMs: 2600 },
  responseRtMs: { meanMs: 720, sdMs: 210, minMs: 180, maxMs: 3200 },
  timeoutRate: 0.08,
  errorRate: 0.12,
  interActionDelayMs: { minMs: 450, maxMs: 1200 },
  holdDurationMs: { minMs: 220, maxMs: 860 },
  maxTrialDurationMs: 90_000,
};

let activeProfile: ResolvedAutoResponderProfile | null = null;
let rng: (() => number) | null = null;

function clampUnit(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(1, value));
}

function toFiniteNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (["1", "true", "yes", "on", "y"].includes(normalized)) return true;
  if (["0", "false", "no", "off", "n"].includes(normalized)) return false;
  return null;
}

function asObject(value: unknown): JSONObject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JSONObject;
}

function resolveRange(value: unknown, fallback: { minMs: number; maxMs: number }): { minMs: number; maxMs: number } {
  const input = asObject(value);
  if (!input) return fallback;
  const minMs = Math.max(0, Math.round(toFiniteNumber(input.minMs, fallback.minMs)));
  const maxMsRaw = Math.max(0, Math.round(toFiniteNumber(input.maxMs, fallback.maxMs)));
  const maxMs = Math.max(minMs, maxMsRaw);
  return { minMs, maxMs };
}

function resolveResponseRt(value: unknown, fallback: ResolvedAutoResponderProfile["responseRtMs"]): ResolvedAutoResponderProfile["responseRtMs"] {
  const input = asObject(value);
  if (!input) return fallback;
  const minMs = Math.max(0, Math.round(toFiniteNumber(input.minMs, fallback.minMs)));
  const maxMsRaw = Math.max(0, Math.round(toFiniteNumber(input.maxMs, fallback.maxMs)));
  const maxMs = Math.max(minMs, maxMsRaw);
  const meanMs = Math.max(minMs, Math.min(maxMs, Math.round(toFiniteNumber(input.meanMs, fallback.meanMs))));
  const sdMs = Math.max(1, Math.round(toFiniteNumber(input.sdMs, fallback.sdMs)));
  return { meanMs, sdMs, minMs, maxMs };
}

function sampleNormal(random: () => number): number {
  const u1 = Math.max(Number.EPSILON, random());
  const u2 = Math.max(Number.EPSILON, random());
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function sampleTruncatedNormal(
  mean: number,
  sd: number,
  min: number,
  max: number,
  random: () => number,
): number {
  for (let i = 0; i < 8; i += 1) {
    const candidate = mean + sampleNormal(random) * sd;
    if (candidate >= min && candidate <= max) return candidate;
  }
  return Math.max(min, Math.min(max, mean));
}

function sampleUniformMs(range: { minMs: number; maxMs: number }, random: () => number): number {
  if (range.maxMs <= range.minMs) return range.minMs;
  return Math.round(range.minMs + (range.maxMs - range.minMs) * random());
}

function parseUrlAutoOverride(): boolean | null {
  const params = new URLSearchParams(window.location.search);
  return parseBoolean(params.get("auto"));
}

export function resolveAutoResponderProfile(args: {
  coreConfig: CoreConfig;
  taskConfig?: JSONObject | null;
  selection: SelectionContext;
}): ResolvedAutoResponderProfile {
  const taskAuto = asObject(args.taskConfig?.autoresponder);
  const coreAuto = args.coreConfig.autoresponder ?? null;
  const source: AutoResponderConfig = {
    ...(coreAuto ?? {}),
    ...(taskAuto ?? {}),
  };
  const enabledByUrl = parseUrlAutoOverride();
  const enabled = enabledByUrl ?? args.selection.auto ?? parseBoolean(source.enabled) ?? false;
  return {
    enabled,
    seed: source.seed ?? `${args.selection.participant.participantId}:${args.selection.participant.sessionId}:${args.selection.taskId}:${args.selection.variantId}:auto`,
    continueDelayMs: resolveRange(source.continueDelayMs, DEFAULT_PROFILE.continueDelayMs),
    responseRtMs: resolveResponseRt(source.responseRtMs, DEFAULT_PROFILE.responseRtMs),
    timeoutRate: clampUnit(toFiniteNumber(source.timeoutRate, DEFAULT_PROFILE.timeoutRate), DEFAULT_PROFILE.timeoutRate),
    errorRate: clampUnit(toFiniteNumber(source.errorRate, DEFAULT_PROFILE.errorRate), DEFAULT_PROFILE.errorRate),
    interActionDelayMs: resolveRange(source.interActionDelayMs, DEFAULT_PROFILE.interActionDelayMs),
    holdDurationMs: resolveRange(source.holdDurationMs, DEFAULT_PROFILE.holdDurationMs),
    maxTrialDurationMs: Math.max(1_000, Math.round(toFiniteNumber(source.maxTrialDurationMs, DEFAULT_PROFILE.maxTrialDurationMs))),
  };
}

export function configureAutoResponder(profile: ResolvedAutoResponderProfile): void {
  if (!profile.enabled) {
    activeProfile = null;
    rng = null;
    return;
  }
  activeProfile = profile;
  rng = createMulberry32(hashSeed("autoresponder", String(profile.seed)));
}

function random(): number {
  if (!rng) return Math.random();
  return rng();
}

export function isAutoResponderEnabled(): boolean {
  return !!activeProfile?.enabled;
}

export function getAutoResponderProfile(): ResolvedAutoResponderProfile | null {
  return activeProfile;
}

export function sampleAutoContinueDelayMs(): number | null {
  if (!activeProfile) return null;
  return sampleUniformMs(activeProfile.continueDelayMs, random);
}

export function sampleAutoResponse(args: {
  validResponses: string[];
  expectedResponse?: string | null;
  trialDurationMs?: number | null;
}): { response: string | null; rtMs: number | null } | null {
  if (!activeProfile) return null;
  const validResponses = (args.validResponses ?? []).filter((entry) => typeof entry === "string" && entry.length > 0);
  if (validResponses.length === 0) return { response: null, rtMs: null };
  if (random() < activeProfile.timeoutRate) return { response: null, rtMs: null };

  const expected = args.expectedResponse ?? null;
  const canUseExpected = expected != null && validResponses.includes(expected);
  let response = validResponses[Math.floor(random() * validResponses.length)] ?? validResponses[0];

  if (canUseExpected) {
    const shouldBeCorrect = random() >= activeProfile.errorRate;
    if (shouldBeCorrect) {
      response = expected as string;
    } else {
      const alternatives = validResponses.filter((entry) => entry !== expected);
      if (alternatives.length > 0) {
        response = alternatives[Math.floor(random() * alternatives.length)] ?? alternatives[0];
      }
    }
  }

  const sampledRt = sampleTruncatedNormal(
    activeProfile.responseRtMs.meanMs,
    activeProfile.responseRtMs.sdMs,
    activeProfile.responseRtMs.minMs,
    activeProfile.responseRtMs.maxMs,
    random,
  );
  const trialDurationMs = Math.max(0, Math.round(toFiniteNumber(args.trialDurationMs, activeProfile.responseRtMs.maxMs + 50)));
  const maxRt = Math.max(0, trialDurationMs - 8);
  const rtMs = maxRt > 0 ? Math.min(Math.round(sampledRt), maxRt) : 0;
  return { response, rtMs };
}

export function sampleAutoInteractionDelayMs(): number | null {
  if (!activeProfile) return null;
  return sampleUniformMs(activeProfile.interActionDelayMs, random);
}

export function sampleAutoHoldDurationMs(): number | null {
  if (!activeProfile) return null;
  return sampleUniformMs(activeProfile.holdDurationMs, random);
}

export async function runJsPsychTimeline(jsPsych: any, timeline: any[]): Promise<void> {
  if (activeProfile && typeof jsPsych?.simulate === "function") {
    await jsPsych.simulate(timeline, "visual", {});
    return;
  }
  if (typeof jsPsych?.run === "function") {
    const runResult = jsPsych.run(timeline);
    if (runResult && typeof runResult.then === "function") {
      await runResult;
    }
    return;
  }
  throw new Error("Invalid jsPsych instance: missing run/simulate methods.");
}
