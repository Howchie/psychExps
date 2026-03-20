/**
 * MATB Scenario Generator.
 *
 * Generates a reproducible ScenarioEvent array from high-level timing
 * parameters. Useful for creating difficulty variants or custom sessions
 * without hand-authoring hundreds of timed events.
 *
 * Usage:
 *   import { generateMatbScenario } from "@experiments/task-matb";
 *   const events = generateMatbScenario({ durationMs: 300000, seed: 42 });
 *   // Paste events into a config's "scenario.events" array, or pass directly.
 */

import type { ScenarioEvent } from "@experiments/core";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface MatbScenarioConfig {
  /** Total session duration in ms. */
  durationMs: number;

  // ── Sysmon ──────────────────────────────────────────────────────────────
  /** Ids of sysmon scale gauges available for failure injection. */
  sysmonScaleIds?: string[];
  /** Ids of sysmon light gauges available for failure injection. */
  sysmonLightIds?: string[];
  /**
   * Mean interval between sysmon failure events (ms).
   * Jitter of ±30% is applied randomly.
   */
  sysmonIntervalMs?: number;
  /** Minimum gap after a failure before the next can fire (ms). */
  sysmonMinGapMs?: number;

  // ── Comms ────────────────────────────────────────────────────────────────
  ownCallsign?: string;
  otherCallsigns?: string[];
  /** Radio ids to use as prompt targets. */
  radioIds?: string[];
  frequencyRange?: { minMhz: number; maxMhz: number; stepMhz: number };
  /**
   * Mean interval between comms prompts (ms).
   */
  commsIntervalMs?: number;
  /** Fraction of prompts that use the participant's own callsign (0–1). */
  commsOwnRatio?: number;
  /** Minimum gap between prompts (ms). */
  commsMinGapMs?: number;
  /**
   * Minimum frequency variation from a radio's current frequency (MHz).
   * Target frequency is offset by a random amount in [min, max] variation,
   * matching the OpenMATB communications plugin behaviour. Default 5.0.
   */
  commsMinVariationMhz?: number;
  /**
   * Maximum frequency variation from a radio's current frequency (MHz).
   * Default 6.0.
   */
  commsMaxVariationMhz?: number;
  /**
   * Starting frequencies for each radio (keyed by radio id, e.g. "nav1").
   * Radios not listed here default to the midpoint of frequencyRange.
   */
  radioDefaultFreqsMhz?: Record<string, number>;

  // ── Resman ───────────────────────────────────────────────────────────────
  /** Pump ids available for failure injection (numeric strings, e.g. "1"–"8"). */
  resmanPumpIds?: string[];
  /** Mean interval between pump failure events (ms). */
  resmanIntervalMs?: number;
  /** How long a pump stays failed before being restored (ms). */
  resmanFailureDurationMs?: number;
  /** Minimum gap between pump failure start events (ms). */
  resmanMinGapMs?: number;

  // ── RNG ──────────────────────────────────────────────────────────────────
  /** Integer seed for the RNG (default 1). Same seed → same output. */
  seed?: number;

  /**
   * Quiet period at the start of the session before any events fire (ms).
   * Gives participants a moment to orient. Default 20000.
   */
  warmupMs?: number;

  /**
   * Quiet period at the end of the session where no new events start (ms).
   * Prevents events firing right before the session ends. Default 15000.
   */
  cooldownMs?: number;
}

// ---------------------------------------------------------------------------
// Seeded RNG (xorshift32 — same pattern used in sysmon)
// ---------------------------------------------------------------------------

function makePrng(seed: number): () => number {
  let state = (seed >>> 0) || 1;
  return function (): number {
    state += 0x6d2b79f5;
    let v = state;
    v = Math.imul(v ^ (v >>> 15), v | 1);
    v ^= v + Math.imul(v ^ (v >>> 7), v | 61);
    return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jitter(base: number, factor: number, rng: () => number): number {
  return Math.round(base * (1 + (rng() * 2 - 1) * factor));
}

function pickRandom<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

function roundToStep(value: number, step: number): number {
  return Math.round(value / step) * step;
}

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

export function generateMatbScenario(cfg: MatbScenarioConfig): ScenarioEvent[] {
  const rng = makePrng(cfg.seed ?? 1);

  const durationMs     = cfg.durationMs;
  const warmupMs       = cfg.warmupMs   ?? 20000;
  const cooldownMs     = cfg.cooldownMs ?? 15000;
  const activeStart    = warmupMs;
  const activeEnd      = durationMs - cooldownMs;

  const events: ScenarioEvent[] = [];

  // ── Sysmon ───────────────────────────────────────────────────────────────

  const scaleIds  = cfg.sysmonScaleIds ?? ["scale1", "scale2", "scale3", "scale4"];
  const lightIds  = cfg.sysmonLightIds ?? ["light1", "light2"];
  const allGauges = [...scaleIds, ...lightIds];

  const sysmonInterval = cfg.sysmonIntervalMs ?? 30000;
  const sysmonMinGap   = cfg.sysmonMinGapMs   ?? 8000;

  {
    let t = activeStart + jitter(sysmonInterval * 0.5, 0.4, rng);
    while (t < activeEnd) {
      const gauge = pickRandom(allGauges, rng);
      events.push({
        timeMs:   Math.round(t),
        targetId: "sysmon",
        command:  "set",
        path:     `${gauge}.failure`,
        value:    true,
      });
      t += Math.max(sysmonMinGap, jitter(sysmonInterval, 0.3, rng));
    }
  }

  // ── Comms ────────────────────────────────────────────────────────────────

  const ownCallsign     = cfg.ownCallsign     ?? "NASA504";
  const otherCallsigns  = cfg.otherCallsigns  ?? ["DELTA221", "ECHO775", "BRAVO312"];
  const radioIds        = cfg.radioIds        ?? ["nav1", "nav2", "com1", "com2"];
  const freqRange       = cfg.frequencyRange  ?? { minMhz: 108.0, maxMhz: 137.0, stepMhz: 0.1 };
  const commsInterval   = cfg.commsIntervalMs ?? 40000;
  const commsOwnRatio   = cfg.commsOwnRatio   ?? 0.5;
  const commsMinGap     = cfg.commsMinGapMs   ?? 15000;
  const commsMinVar     = cfg.commsMinVariationMhz ?? 5.0;
  const commsMaxVar     = cfg.commsMaxVariationMhz ?? 6.0;

  // Initialise per-radio current frequencies (simulated state used to pick
  // a target that is a realistic distance away — matching OpenMATB comms.py).
  const midFreq = roundToStep(
    (freqRange.minMhz + freqRange.maxMhz) / 2,
    freqRange.stepMhz,
  );
  const radioCurrentFreq: Record<string, number> = {};
  for (const id of radioIds) {
    radioCurrentFreq[id] = cfg.radioDefaultFreqsMhz?.[id] ?? midFreq;
  }

  {
    let t = activeStart + jitter(commsInterval * 0.6, 0.3, rng);
    while (t < activeEnd) {
      const isOwn    = rng() < commsOwnRatio;
      const callsign = isOwn ? ownCallsign : pickRandom(otherCallsigns, rng);
      const radio    = pickRandom(radioIds, rng);

      // Pick a target frequency that differs from the radio's current
      // frequency by a random amount in [commsMinVar, commsMaxVar] MHz,
      // with a randomly chosen sign, clamped to the legal range.
      const variation = commsMinVar + rng() * (commsMaxVar - commsMinVar);
      const sign      = rng() < 0.5 ? 1 : -1;
      const raw       = radioCurrentFreq[radio] + sign * variation;
      const clamped   = Math.max(freqRange.minMhz, Math.min(freqRange.maxMhz, raw));
      const freqMhz   = roundToStep(clamped, freqRange.stepMhz);

      events.push({
        timeMs:   Math.round(t),
        targetId: "comms",
        command:  "prompt",
        value:    { callsign, radio, frequency: +freqMhz.toFixed(3) },
      });

      // Update simulated current frequency so the next prompt for this radio
      // starts from a realistic position (the participant just tuned to freqMhz).
      radioCurrentFreq[radio] = freqMhz;

      t += Math.max(commsMinGap, jitter(commsInterval, 0.3, rng));
    }
  }

  // ── Resman ───────────────────────────────────────────────────────────────

  const pumpIds             = cfg.resmanPumpIds            ?? ["1", "2", "3", "4", "5", "6"];
  const resmanInterval      = cfg.resmanIntervalMs         ?? 60000;
  const resmanFailureDur    = cfg.resmanFailureDurationMs  ?? 30000;
  const resmanMinGap        = cfg.resmanMinGapMs           ?? 15000;

  {
    let t = activeStart + jitter(resmanInterval * 0.8, 0.3, rng);
    while (t < activeEnd) {
      const pump   = pickRandom(pumpIds, rng);
      const restoreT = t + resmanFailureDur;
      events.push({
        timeMs:   Math.round(t),
        targetId: "resman",
        command:  "set",
        path:     `pump.${pump}.state`,
        value:    "failed",
      });
      if (restoreT < activeEnd) {
        events.push({
          timeMs:   Math.round(restoreT),
          targetId: "resman",
          command:  "set",
          path:     `pump.${pump}.state`,
          value:    "off",
        });
      }
      t += Math.max(resmanMinGap, jitter(resmanInterval, 0.3, rng));
    }
  }

  // Sort all events by time.
  events.sort((a, b) => a.timeMs - b.timeMs);

  return events;
}
