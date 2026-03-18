/**
 * MATB System Monitoring sub-task.
 *
 * Two indicator lights and four drifting scales. Failures are injected
 * on schedule. The participant presses designated keys to acknowledge
 * (lights) or correct (scales) failures. Signal detection scoring:
 *   HIT  = responded to active failure before timeout
 *   MISS = failure timed out without response
 *   FA   = key pressed when no failure is active on that gauge
 *   CR   = implicit (not logged)
 *
 * This file contains:
 *  - The sysmon state machine (usable by both standalone and composite)
 *  - A SubTaskHandle factory for composite mode
 */

import {
  asArray,
  asObject,
  asString,
  toPositiveNumber,
  toNonNegativeNumber,
  type SubTaskHandle,
  type SubTaskPerformance,
  type ScenarioEvent,
} from "@experiments/core";

import {
  renderLight,
  type LightConfig,
  type LightState,
} from "../widgets/lights";
import {
  renderScale,
  type ScaleConfig,
  type ScaleState,
  type FeedbackType,
} from "../widgets/scales";

// ---------------------------------------------------------------------------
// Config types
// ---------------------------------------------------------------------------

export interface SysmonLightDef {
  id: string;
  label: string;
  onColor: string;
  offColor: string;
  defaultOn: boolean;
  key: string;
}

export interface SysmonScaleDef {
  id: string;
  label: string;
  key: string;
  /** Drift speed factor (1 = default). Higher = faster random drift. */
  driftSpeed: number;
}

export interface SysmonSubTaskConfig {
  lights?: SysmonLightDef[];
  scales?: SysmonScaleDef[];
  /** Time (ms) participant has to respond before failure auto-resolves. */
  alertTimeoutMs?: number;
  /** Duration (ms) of feedback indicator after a response. */
  feedbackDurationMs?: number;
  /** Update interval for scale arrow drift (ms). */
  driftIntervalMs?: number;
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

interface GaugeRuntime {
  kind: "light" | "scale";
  id: string;
  key: string;
  failure: boolean;
  failureTimerMs: number;
  responseTimeMs: number;
  feedbackType: FeedbackType;
  feedbackTimerMs: number;
}

interface LightRuntime extends GaugeRuntime {
  kind: "light";
  config: LightConfig;
  state: LightState;
  defaultOn: boolean;
}

interface ScaleRuntime extends GaugeRuntime {
  kind: "scale";
  config: ScaleConfig;
  state: ScaleState;
  driftSpeed: number;
  /** Current drift zone: -1 (left, positions 8-10), 0 (center, 3-7), 1 (right, 0-2). */
  zone: -1 | 0 | 1;
  /** Failure side. 0 = not assigned, -1 or 1 = forced zone. */
  failureSide: -1 | 0 | 1;
}

type GaugeRuntimeAny = LightRuntime | ScaleRuntime;

// SDT record for a single failure event.
export interface SysmonSdtRecord {
  gaugeId: string;
  gaugeKind: "light" | "scale";
  outcome: "HIT" | "MISS" | "FA";
  responseTimeMs: number | null;
  timestampMs: number;
}

// Result produced on stop().
export interface SysmonSubTaskResult {
  elapsedMs: number;
  sdtRecords: SysmonSdtRecord[];
  hitCount: number;
  missCount: number;
  faCount: number;
}

// ---------------------------------------------------------------------------
// Resolved config
// ---------------------------------------------------------------------------

interface ResolvedSysmonConfig {
  lights: SysmonLightDef[];
  scales: SysmonScaleDef[];
  alertTimeoutMs: number;
  feedbackDurationMs: number;
  driftIntervalMs: number;
}

function resolveConfig(raw: Record<string, unknown>): ResolvedSysmonConfig {
  const lightsRaw = asArray(raw.lights);
  const lights: SysmonLightDef[] = lightsRaw.length > 0
    ? lightsRaw.map((entry, i) => {
        const o = asObject(entry) ?? {};
        return {
          id: asString(o.id) ?? `light${i + 1}`,
          label: asString(o.label) ?? `F${5 + i}`,
          onColor: asString(o.onColor) ?? (i === 0 ? "#22c55e" : "#ef4444"),
          offColor: asString(o.offColor) ?? "#555",
          defaultOn: i === 0 ? o.defaultOn !== false : o.defaultOn === true,
          key: asString(o.key) ?? `f${5 + i}`,
        };
      })
    : [
        { id: "light1", label: "F5", onColor: "#22c55e", offColor: "#555", defaultOn: true, key: "f5" },
        { id: "light2", label: "F6", onColor: "#ef4444", offColor: "#555", defaultOn: false, key: "f6" },
      ];

  const scalesRaw = asArray(raw.scales);
  const scales: SysmonScaleDef[] = scalesRaw.length > 0
    ? scalesRaw.map((entry, i) => {
        const o = asObject(entry) ?? {};
        return {
          id: asString(o.id) ?? `scale${i + 1}`,
          label: asString(o.label) ?? `F${i + 1}`,
          key: asString(o.key) ?? `f${i + 1}`,
          driftSpeed: toPositiveNumber(o.driftSpeed, 1),
        };
      })
    : [
        { id: "scale1", label: "F1", key: "f1", driftSpeed: 1 },
        { id: "scale2", label: "F2", key: "f2", driftSpeed: 1 },
        { id: "scale3", label: "F3", key: "f3", driftSpeed: 1 },
        { id: "scale4", label: "F4", key: "f4", driftSpeed: 1 },
      ];

  return {
    lights,
    scales,
    alertTimeoutMs: toPositiveNumber(raw.alertTimeoutMs, 10000),
    feedbackDurationMs: toPositiveNumber(raw.feedbackDurationMs, 1500),
    driftIntervalMs: toPositiveNumber(raw.driftIntervalMs, 200),
  };
}

// ---------------------------------------------------------------------------
// Scale drift logic
// ---------------------------------------------------------------------------

/** Zone boundaries: zone 1 (right) = 0-2, zone 0 (center) = 3-7, zone -1 (left) = 8-10 */
function positionToZone(position: number): -1 | 0 | 1 {
  if (position <= 2) return 1;
  if (position >= 8) return -1;
  return 0;
}

function zoneMin(zone: -1 | 0 | 1): number {
  if (zone === 1) return 0;
  if (zone === -1) return 8;
  return 3;
}

function zoneMax(zone: -1 | 0 | 1): number {
  if (zone === 1) return 2;
  if (zone === -1) return 10;
  return 7;
}

function driftArrow(scale: ScaleRuntime, rng: () => number): void {
  if (scale.state.frozen) return;

  const zone = scale.failure ? scale.failureSide : 0 as -1 | 0 | 1;
  const lo = zoneMin(zone);
  const hi = zoneMax(zone);

  // Random step: -1 or +1 (weighted by drift speed for more movement).
  const step = rng() < 0.5 ? -1 : 1;
  let next = scale.state.position + step;

  // Clamp within zone.
  if (next < lo) next = lo;
  if (next > hi) next = hi;

  scale.state.position = next;
  scale.zone = positionToZone(next);
}

// ---------------------------------------------------------------------------
// SubTaskHandle factory
// ---------------------------------------------------------------------------

export function createSysmonSubTaskHandle(): SubTaskHandle<SysmonSubTaskResult> {
  let config: ResolvedSysmonConfig | null = null;
  let gauges: GaugeRuntimeAny[] = [];
  let keyToGauge = new Map<string, GaugeRuntimeAny>();
  let sdtRecords: SysmonSdtRecord[] = [];
  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  let container: HTMLElement | null = null;
  let startMs = 0;
  let driftAccMs = 0;

  // Simple seeded RNG for drift (doesn't need to be reproducible across sessions).
  let rngState = Date.now() >>> 0;
  function rng(): number {
    rngState += 0x6d2b79f5;
    let v = rngState;
    v = Math.imul(v ^ (v >>> 15), v | 1);
    v ^= v + Math.imul(v ^ (v >>> 7), v | 61);
    return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
  }

  function initGauges(cfg: ResolvedSysmonConfig): void {
    gauges = [];
    keyToGauge = new Map();

    for (const ld of cfg.lights) {
      const g: LightRuntime = {
        kind: "light",
        id: ld.id,
        key: ld.key.toLowerCase(),
        failure: false,
        failureTimerMs: 0,
        responseTimeMs: 0,
        feedbackType: null,
        feedbackTimerMs: 0,
        config: {
          id: ld.id,
          label: ld.label,
          onColor: ld.onColor,
          offColor: ld.offColor,
          defaultOn: ld.defaultOn,
        },
        state: { on: ld.defaultOn },
        defaultOn: ld.defaultOn,
      };
      gauges.push(g);
      keyToGauge.set(g.key, g);
    }

    for (const sd of cfg.scales) {
      const g: ScaleRuntime = {
        kind: "scale",
        id: sd.id,
        key: sd.key.toLowerCase(),
        failure: false,
        failureTimerMs: 0,
        responseTimeMs: 0,
        feedbackType: null,
        feedbackTimerMs: 0,
        config: { id: sd.id, label: sd.label },
        state: { position: 5, frozen: false },
        driftSpeed: sd.driftSpeed,
        zone: 0,
        failureSide: 0,
      };
      gauges.push(g);
      keyToGauge.set(g.key, g);
    }
  }

  function startFailure(gauge: GaugeRuntimeAny): void {
    if (gauge.failure) return;
    gauge.failure = true;
    gauge.failureTimerMs = config!.alertTimeoutMs;
    gauge.responseTimeMs = 0;

    if (gauge.kind === "light") {
      const lg = gauge as LightRuntime;
      // Toggle: default-on → off, default-off → on.
      lg.state.on = !lg.defaultOn;
    } else {
      const sg = gauge as ScaleRuntime;
      // Assign a random failure side if not already assigned.
      if (sg.failureSide === 0) {
        sg.failureSide = rng() < 0.5 ? -1 : 1;
      }
    }
  }

  function stopFailure(gauge: GaugeRuntimeAny, success: boolean): void {
    if (!gauge.failure) return;
    const now = performance.now() - startMs;

    gauge.failure = false;
    gauge.failureTimerMs = 0;

    if (success) {
      sdtRecords.push({
        gaugeId: gauge.id,
        gaugeKind: gauge.kind,
        outcome: "HIT",
        responseTimeMs: gauge.responseTimeMs,
        timestampMs: now,
      });
      gauge.feedbackType = "positive";
    } else {
      sdtRecords.push({
        gaugeId: gauge.id,
        gaugeKind: gauge.kind,
        outcome: "MISS",
        responseTimeMs: null,
        timestampMs: now,
      });
      gauge.feedbackType = "negative";
    }
    gauge.feedbackTimerMs = config!.feedbackDurationMs;

    // Reset gauge to default state.
    if (gauge.kind === "light") {
      const lg = gauge as LightRuntime;
      lg.state.on = lg.defaultOn;
    } else {
      const sg = gauge as ScaleRuntime;
      sg.failureSide = 0;
      sg.state.frozen = success; // Freeze arrow on success.
    }
  }

  function handleKey(key: string): boolean {
    const gauge = keyToGauge.get(key);
    if (!gauge) return false;

    if (gauge.failure) {
      stopFailure(gauge, true);
    } else {
      // False alarm.
      const now = performance.now() - startMs;
      sdtRecords.push({
        gaugeId: gauge.id,
        gaugeKind: gauge.kind,
        outcome: "FA",
        responseTimeMs: null,
        timestampMs: now,
      });
      gauge.feedbackType = "negative";
      gauge.feedbackTimerMs = config!.feedbackDurationMs;
    }
    return true;
  }

  function updateTimers(dt: number): void {
    for (const g of gauges) {
      // Failure timeout countdown.
      if (g.failure) {
        g.failureTimerMs -= dt;
        g.responseTimeMs += dt;
        if (g.failureTimerMs <= 0) {
          stopFailure(g, false); // MISS
        }
      }

      // Feedback timer countdown.
      if (g.feedbackTimerMs > 0) {
        g.feedbackTimerMs -= dt;
        if (g.feedbackTimerMs <= 0) {
          g.feedbackTimerMs = 0;
          g.feedbackType = null;
          // Unfreeze scale arrow after feedback ends.
          if (g.kind === "scale") {
            (g as ScaleRuntime).state.frozen = false;
          }
        }
      }
    }
  }

  function updateDrift(dt: number): void {
    if (!config) return;
    driftAccMs += dt;
    while (driftAccMs >= config.driftIntervalMs) {
      driftAccMs -= config.driftIntervalMs;
      for (const g of gauges) {
        if (g.kind === "scale") {
          driftArrow(g as ScaleRuntime, rng);
        }
      }
    }
  }

  function renderAll(): void {
    if (!ctx || !canvas || !config) return;
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(0, 0, w, h);

    // Layout regions.
    const scaleTop = Math.round(h * 0.05);
    const scaleHeight = Math.round(h * 0.55);
    const lightTop = Math.round(h * 0.72);
    const lightHeight = Math.round(h * 0.18);

    // Render scales.
    const scaleCount = gauges.filter((g) => g.kind === "scale").length;
    const scaleGauges = gauges.filter((g): g is ScaleRuntime => g.kind === "scale");
    const scaleColWidth = scaleCount > 0 ? Math.round(w / scaleCount) : w;
    for (let i = 0; i < scaleGauges.length; i++) {
      const sg = scaleGauges[i];
      renderScale(
        sg.config,
        sg.state,
        {
          ctx,
          x: i * scaleColWidth,
          y: scaleTop,
          width: scaleColWidth,
          height: scaleHeight,
          feedback: sg.feedbackType,
        },
      );
    }

    // Render lights.
    const lightGauges = gauges.filter((g): g is LightRuntime => g.kind === "light");
    const lightCount = lightGauges.length;
    if (lightCount > 0) {
      const lightW = Math.round(w * 0.35);
      const gap = lightCount > 1 ? (w - lightCount * lightW) / (lightCount + 1) : (w - lightW) / 2;
      for (let i = 0; i < lightGauges.length; i++) {
        const lg = lightGauges[i];
        const lx = Math.round(gap + i * (lightW + gap));
        renderLight(lg.config, lg.state, {
          ctx,
          x: lx,
          y: lightTop,
          width: lightW,
          height: lightHeight,
        });
      }
    }
  }

  return {
    id: "sysmon",

    start(hostContainer: HTMLElement, rawConfig: Record<string, unknown>): void {
      config = resolveConfig(rawConfig);
      container = hostContainer;
      container.innerHTML = "";

      canvas = document.createElement("canvas");
      // Use container's dimensions or sensible defaults.
      canvas.width = 300;
      canvas.height = 400;
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      canvas.style.objectFit = "contain";
      container.appendChild(canvas);

      ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas 2D context unavailable for sysmon.");

      initGauges(config);
      startMs = performance.now();
      driftAccMs = 0;
    },

    step(_now: number, dt: number): void {
      updateTimers(dt);
      updateDrift(dt);
      renderAll();
    },

    handleKeyDown(key: string, _now: number): boolean {
      return handleKey(key);
    },

    handleScenarioEvent(event: ScenarioEvent): void {
      if (event.command === "set" && event.path) {
        // Trigger a failure: e.g. path="light1.failure" value=true
        // Or path="scale1.failure" value=true
        const parts = event.path.split(".");
        const gaugeId = parts[0];
        const field = parts[1];

        const gauge = gauges.find((g) => g.id === gaugeId);
        if (!gauge) return;

        if (field === "failure") {
          if (event.value === true || event.value === "true") {
            startFailure(gauge);
          } else if (event.value === "up" && gauge.kind === "scale") {
            // OpenMATB-style: "up" means arrow drifts right (positive side).
            (gauge as ScaleRuntime).failureSide = 1;
            startFailure(gauge);
          } else if (event.value === "down" && gauge.kind === "scale") {
            // OpenMATB-style: "down" means arrow drifts left (negative side).
            (gauge as ScaleRuntime).failureSide = -1;
            startFailure(gauge);
          } else if (event.value === false || event.value === "false") {
            stopFailure(gauge, false);
          }
        }
        // Scale-specific: force a failure side.
        if (field === "failureSide" && gauge.kind === "scale") {
          const side = Number(event.value);
          if (side === -1 || side === 1) {
            (gauge as ScaleRuntime).failureSide = side;
          }
        }
        // Light-specific: set on/off state directly (e.g. auto-solver indicator).
        if (field === "on" && gauge.kind === "light") {
          const lg = gauge as LightRuntime;
          lg.state.on = event.value === true || event.value === "true" || event.value === "True";
        }
      }
    },

    stop(): SysmonSubTaskResult {
      // Stop any active failures as misses.
      for (const g of gauges) {
        if (g.failure) stopFailure(g, false);
      }

      if (container) container.innerHTML = "";

      const elapsed = performance.now() - startMs;
      const result: SysmonSubTaskResult = {
        elapsedMs: Math.round(elapsed),
        sdtRecords: [...sdtRecords],
        hitCount: sdtRecords.filter((r) => r.outcome === "HIT").length,
        missCount: sdtRecords.filter((r) => r.outcome === "MISS").length,
        faCount: sdtRecords.filter((r) => r.outcome === "FA").length,
      };

      // Reset.
      config = null;
      gauges = [];
      keyToGauge = new Map();
      sdtRecords = [];
      canvas = null;
      ctx = null;
      container = null;

      return result;
    },

    getPerformance(): SubTaskPerformance {
      const total = sdtRecords.length;
      if (total === 0) return { score: 1, metrics: { hitRate: 1, faRate: 0 } };
      // Score based on last N events.
      const window = 8;
      const recent = sdtRecords.slice(-window);
      const hits = recent.filter((r) => r.outcome === "HIT").length;
      const failures = recent.filter((r) => r.outcome === "HIT" || r.outcome === "MISS").length;
      const hitRate = failures > 0 ? hits / failures : 1;
      const fas = recent.filter((r) => r.outcome === "FA").length;
      const faRate = recent.length > 0 ? fas / recent.length : 0;
      // Composite score: penalise both misses and false alarms.
      const score = Math.max(0, Math.min(1, hitRate - faRate * 0.5));
      return { score, metrics: { hitRate, faRate } };
    },
  };
}
