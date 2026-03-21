/**
 * MATB Resource Management sub-task.
 *
 * Six tanks (A–F) connected by eight pumps. Tanks A and B are target
 * tanks that continuously lose fluid. The participant toggles pumps
 * on/off (numpad 1–8) to maintain target levels. Pump failures are
 * injected via scenario events.
 *
 * Tank topology (OpenMATB standard):
 *   C→(1)→A  E→(2)→A  D→(3)→B  F→(4)→B
 *   E→(5)→C  F→(6)→D  A→(7)→B  B→(8)→A
 *
 * Tanks E and F are non-depletable (infinite supply).
 *
 * This file contains:
 *  - The resman state machine (usable by both standalone and composite)
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
  renderTank,
  type TankConfig,
  type TankState,
} from "../widgets/tanks";
import {
  renderPump,
  renderConnector,
  type PumpConfig,
  type PumpState,
} from "../widgets/pumps";

// ---------------------------------------------------------------------------
// Config types
// ---------------------------------------------------------------------------

export interface ResmanTankDef {
  id: string;
  label: string;
  startLevel: number;
  maxLevel: number;
  targetLevel?: number;
  toleranceRadius?: number;
  depletable: boolean;
  leakPerMinute: number;
  /** "left" or "right" side in the display layout. */
  side: "left" | "right";
}

export interface ResmanPumpDef {
  id: string;
  label: string;
  source: string;
  dest: string;
  flowPerMinute: number;
  key: string;
  initialState?: PumpState;
}

export interface ResmanSubTaskConfig {
  tanks?: ResmanTankDef[];
  pumps?: ResmanPumpDef[];
  toleranceRadius?: number;
  /** Physics update interval in ms (default 2000 to match OpenMATB). */
  updateIntervalMs?: number;
  /**
   * When true, pump failures auto-resolve after `autoResolveDelayMs` and
   * the system automatically toggles pumps to maintain target levels.
   * Keyboard input for pump toggling is ignored.
   */
  automated?: boolean;
  /**
   * Time (ms) before a pump failure auto-resolves in automated mode.
   * Default 5000.
   */
  autoResolveDelayMs?: number;
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

interface TankRuntime {
  def: ResmanTankDef;
  config: TankConfig;
  level: number;
  inTolerance: boolean;
  /** Accumulated time (ms) spent out of tolerance. */
  outOfToleranceMs: number;
  /** Current out-of-tolerance episode duration (ms). Resets when back in tolerance. */
  currentEpisodeMs: number;
}

interface PumpRuntime {
  def: ResmanPumpDef;
  config: PumpConfig;
  state: PumpState;
  key: string;
  sourceId: string;
  destId: string;
  flowPerMinute: number;
  /** Elapsed time (ms) since this pump entered failure state. Used for auto-resolve. */
  failureElapsedMs: number;
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface ResmanTankRecord {
  tankId: string;
  /** Signed mean deviation (level − target). Positive = overfull, negative = underfull. Matches OpenMATB resman.py. */
  meanDeviation: number;
  proportionInTolerance: number;
  totalOutOfToleranceMs: number;
}

/**
 * Per-physics-tick record for a target tank, matching OpenMATB's per-update
 * {tank}_in_tolerance and {tank}_deviation log entries (emitted every 2 s).
 */
export interface ResmanTickRecord {
  /** Session elapsed time at the tick (ms). */
  timeMs: number;
  tankId: string;
  /** Tank level at this tick (integer, matching OpenMATB's int arithmetic). */
  level: number;
  /** Signed deviation: level − target (integer). */
  deviation: number;
  inTolerance: boolean;
}

export interface ResmanSubTaskResult {
  elapsedMs: number;
  tankRecords: ResmanTankRecord[];
  pumpToggles: number;
  /** Raw per-tick data for each target tank (one row per tank per 2 s). */
  tickRecords: ResmanTickRecord[];
}

// ---------------------------------------------------------------------------
// Defaults (matches OpenMATB standard configuration)
// ---------------------------------------------------------------------------

const DEFAULT_TANKS: ResmanTankDef[] = [
  { id: "a", label: "A", startLevel: 2500, maxLevel: 4000, targetLevel: 2500, depletable: true, leakPerMinute: 800, side: "left" },
  { id: "b", label: "B", startLevel: 2500, maxLevel: 4000, targetLevel: 2500, depletable: true, leakPerMinute: 800, side: "right" },
  { id: "c", label: "C", startLevel: 1000, maxLevel: 2000, depletable: true, leakPerMinute: 0, side: "left" },
  { id: "d", label: "D", startLevel: 1000, maxLevel: 2000, depletable: true, leakPerMinute: 0, side: "right" },
  { id: "e", label: "E", startLevel: 3000, maxLevel: 4000, depletable: false, leakPerMinute: 0, side: "left" },
  { id: "f", label: "F", startLevel: 3000, maxLevel: 4000, depletable: false, leakPerMinute: 0, side: "right" },
];

const DEFAULT_PUMPS: ResmanPumpDef[] = [
  { id: "1", label: "1", source: "c", dest: "a", flowPerMinute: 800, key: "1" },
  { id: "2", label: "2", source: "e", dest: "a", flowPerMinute: 600, key: "2" },
  { id: "3", label: "3", source: "d", dest: "b", flowPerMinute: 800, key: "3" },
  { id: "4", label: "4", source: "f", dest: "b", flowPerMinute: 600, key: "4" },
  { id: "5", label: "5", source: "e", dest: "c", flowPerMinute: 600, key: "5" },
  { id: "6", label: "6", source: "f", dest: "d", flowPerMinute: 600, key: "6" },
  { id: "7", label: "7", source: "a", dest: "b", flowPerMinute: 400, key: "7" },
  { id: "8", label: "8", source: "b", dest: "a", flowPerMinute: 400, key: "8" },
];

const DEFAULT_TOLERANCE_RADIUS = 250;
const DEFAULT_UPDATE_INTERVAL_MS = 2000;

// ---------------------------------------------------------------------------
// Config resolution
// ---------------------------------------------------------------------------

interface ResolvedResmanConfig {
  tanks: ResmanTankDef[];
  pumps: ResmanPumpDef[];
  toleranceRadius: number;
  updateIntervalMs: number;
  automated: boolean;
  autoResolveDelayMs: number;
}

function resolveConfig(raw: Record<string, unknown>): ResolvedResmanConfig {
  const toleranceRadius = toPositiveNumber(raw.toleranceRadius, DEFAULT_TOLERANCE_RADIUS);
  const updateIntervalMs = toPositiveNumber(raw.updateIntervalMs, DEFAULT_UPDATE_INTERVAL_MS);

  // Parse tanks.
  const tanksRaw = asArray(raw.tanks);
  let tanks: ResmanTankDef[];
  if (tanksRaw.length > 0) {
    tanks = [];
    for (const entry of tanksRaw) {
      const o = asObject(entry);
      if (!o) continue;
      const id = asString(o.id);
      if (!id) continue;
      tanks.push({
        id,
        label: asString(o.label) ?? id.toUpperCase(),
        startLevel: toNonNegativeNumber(o.startLevel, 0),
        maxLevel: toPositiveNumber(o.maxLevel, 4000),
        targetLevel: o.targetLevel != null ? toNonNegativeNumber(o.targetLevel, 0) : undefined,
        toleranceRadius: o.toleranceRadius != null ? toPositiveNumber(o.toleranceRadius, toleranceRadius) : toleranceRadius,
        depletable: o.depletable !== false,
        leakPerMinute: toNonNegativeNumber(o.leakPerMinute, 0),
        side: asString(o.side) === "right" ? "right" : "left",
      });
    }
  } else {
    tanks = DEFAULT_TANKS.map((t) => ({ ...t, toleranceRadius }));
  }

  // Parse pumps.
  const pumpsRaw = asArray(raw.pumps);
  let pumps: ResmanPumpDef[];
  if (pumpsRaw.length > 0) {
    pumps = [];
    for (const entry of pumpsRaw) {
      const o = asObject(entry);
      if (!o) continue;
      const id = asString(o.id) ?? String(o.id);
      if (!id) continue;
      pumps.push({
        id,
        label: asString(o.label) ?? id,
        source: asString(o.source) ?? "",
        dest: asString(o.dest) ?? "",
        flowPerMinute: toPositiveNumber(o.flowPerMinute, 600),
        key: asString(o.key) ?? id,
        initialState: parsePumpState(asString(o.initialState)),
      });
    }
  } else {
    pumps = DEFAULT_PUMPS;
  }

  const automated = raw.automated === true || raw.automated === "true";
  const autoResolveDelayMs = toNonNegativeNumber(raw.autoResolveDelayMs, 5000);

  return { tanks, pumps, toleranceRadius, updateIntervalMs, automated, autoResolveDelayMs };
}

function parsePumpState(s: string | null): PumpState {
  const normalized = (s ?? "").trim().toLowerCase();
  if (normalized === "on") return "on";
  if (normalized === "failure" || normalized === "failed") return "failure";
  return "off";
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createResmanSubTaskHandle(): SubTaskHandle<ResmanSubTaskResult> {
  let cfg: ResolvedResmanConfig | null = null;
  let tankMap = new Map<string, TankRuntime>();
  let pumpList: PumpRuntime[] = [];
  let keyToPump = new Map<string, PumpRuntime>();
  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  let container: HTMLElement | null = null;
  let startMs = 0;
  let physicsAccMs = 0;
  let totalElapsedMs = 0;
  let pumpToggles = 0;
  let deviationSamples: Map<string, number[]> = new Map();
  let tickRecords: ResmanTickRecord[] = [];
  /**
   * Matches OpenMATB resman.py wait_before_leak = 1: skip depletion and pump
   * flow on the very first physics tick to let the system stabilise.
   */
  let physicsFirstStep = true;

  function initState(config: ResolvedResmanConfig): void {
    tankMap = new Map();
    for (const td of config.tanks) {
      const inTol = td.targetLevel != null
        ? Math.abs(td.startLevel - td.targetLevel) <= (td.toleranceRadius ?? config.toleranceRadius)
        : true;
      tankMap.set(td.id, {
        def: td,
        config: {
          id: td.id,
          label: td.label,
          maxLevel: td.maxLevel,
          targetLevel: td.targetLevel,
          toleranceRadius: td.toleranceRadius ?? config.toleranceRadius,
          depletable: td.depletable,
        },
        level: td.startLevel,
        inTolerance: inTol,
        outOfToleranceMs: 0,
        currentEpisodeMs: 0,
      });
    }

    pumpList = [];
    keyToPump = new Map();
    for (const pd of config.pumps) {
      const pr: PumpRuntime = {
        def: pd,
        config: { id: pd.id, label: pd.label },
        state: pd.initialState ?? "off",
        key: pd.key.toLowerCase(),
        sourceId: pd.source,
        destId: pd.dest,
        flowPerMinute: pd.flowPerMinute,
        failureElapsedMs: 0,
      };
      pumpList.push(pr);
      keyToPump.set(pr.key, pr);
    }

    deviationSamples = new Map();
    for (const td of config.tanks) {
      if (td.targetLevel != null) {
        deviationSamples.set(td.id, []);
      }
    }
    tickRecords = [];
    physicsFirstStep = true;
  }

  /**
   * Core physics: depletion and pump flow.
   * Skipped on the first tick (wait_before_leak), matching OpenMATB resman.py.
   * Uses Math.trunc() to match Python's int() truncation behaviour.
   */
  function updateDepletionAndFlow(dtMinutes: number): void {
    if (!cfg) return;

    // Step 1: Target tank depletion (leak).
    for (const [, tank] of tankMap) {
      if (tank.def.leakPerMinute > 0 && tank.def.depletable) {
        const loss = Math.min(
          Math.trunc(tank.def.leakPerMinute * dtMinutes),
          Math.trunc(tank.level),
        );
        tank.level -= loss;
      }
    }

    // Step 2: Pump flow transfer.
    for (const pump of pumpList) {
      if (pump.state !== "on") continue;
      const src = tankMap.get(pump.sourceId);
      const dst = tankMap.get(pump.destId);
      if (!src || !dst) continue;

      const rawVolume = pump.flowPerMinute * dtMinutes;
      const volume = Math.trunc(
        src.def.depletable ? Math.min(rawVolume, src.level) : rawVolume,
      );

      if (src.def.depletable) {
        src.level = Math.max(0, src.level - volume);
      }
      dst.level = Math.min(dst.def.maxLevel, dst.level + volume);
    }
  }

  /**
   * Auto-shutoff: turn off pumps when source is empty or destination is full.
   * Always runs (even on first tick), matching OpenMATB resman.py step 3.
   */
  function updateAutoShutoff(): void {
    for (const pump of pumpList) {
      if (pump.state === "failure" || pump.state !== "on") continue;

      const src = tankMap.get(pump.sourceId);
      const dst = tankMap.get(pump.destId);
      if (src && src.def.depletable && src.level <= 0) {
        pump.state = "off";
      }
      if (dst && dst.level >= dst.def.maxLevel) {
        pump.state = "off";
      }
    }
  }

  /**
   * Tolerance check: update inTolerance for each target tank.
   * Always runs (even on first tick).
   */
  function updateToleranceCheck(): void {
    if (!cfg) return;
    for (const [, tank] of tankMap) {
      if (tank.def.targetLevel == null) {
        tank.inTolerance = true;
        continue;
      }
      const radius = tank.def.toleranceRadius ?? cfg.toleranceRadius;
      const lo = tank.def.targetLevel - radius;
      const hi = tank.def.targetLevel + radius;
      tank.inTolerance = tank.level >= lo && tank.level <= hi;
    }
  }

  function sampleDeviations(): void {
    for (const [, tank] of tankMap) {
      if (tank.def.targetLevel == null) continue;
      const samples = deviationSamples.get(tank.def.id);
      if (samples) {
        samples.push(tank.level - tank.def.targetLevel);
      }
    }
  }

  function updateToleranceTiming(dtMs: number): void {
    for (const [, tank] of tankMap) {
      if (tank.def.targetLevel == null) continue;
      if (!tank.inTolerance) {
        tank.outOfToleranceMs += dtMs;
        tank.currentEpisodeMs += dtMs;
      } else {
        tank.currentEpisodeMs = 0;
      }
    }
  }

  /**
   * Per-tick record for each target tank, matching OpenMATB's per-update
   * {tank}_in_tolerance and {tank}_deviation log entries.
   */
  function recordTick(elapsedMs: number): void {
    for (const [, tank] of tankMap) {
      if (tank.def.targetLevel == null) continue;
      tickRecords.push({
        timeMs:      Math.round(elapsedMs),
        tankId:      tank.def.id,
        level:       Math.trunc(tank.level),
        deviation:   Math.trunc(tank.level - tank.def.targetLevel),
        inTolerance: tank.inTolerance,
      });
    }
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  let handoverBanner: { text: string; isAuto: boolean; startMs: number } | null = null;
  const BANNER_MS = 2500;

  function drawHandoverBanner(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    if (!handoverBanner) return;
    const elapsed = performance.now() - handoverBanner.startMs;
    if (elapsed >= BANNER_MS) { handoverBanner = null; return; }
    const alpha = Math.max(0, 1 - elapsed / BANNER_MS);
    const color = handoverBanner.isAuto ? "rgba(56, 189, 248, 0.9)" : "rgba(251, 146, 60, 0.9)";
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
    ctx.fillRect(0, Math.round(h * 0.38), w, Math.round(h * 0.24));
    ctx.fillStyle = color;
    ctx.font = `bold ${Math.round(h * 0.1)}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(handoverBanner.text, w / 2, Math.round(h / 2));
    ctx.restore();
  }

  function render(): void {
    if (!ctx || !canvas || !cfg) return;
    const W = canvas.width;
    const H = canvas.height;

    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, W, H);

    // Automation accent: subtle left-edge bar when automated.
    if (cfg!.automated) {
      ctx.fillStyle = "rgba(56, 189, 248, 0.35)";  // sky-400 at 35%
      ctx.fillRect(0, 0, 4, H);
    }

    const tankA = tankMap.get("a");
    const tankB = tankMap.get("b");
    const tankC = tankMap.get("c");
    const tankD = tankMap.get("d");
    const tankE = tankMap.get("e");
    const tankF = tankMap.get("f");

    // Tank dimensions.
    const margin = 10;
    const bigTankW = 50;
    const bigTankH = 130;
    const smallTankW = 40;
    const smallTankH = 90;

    const leftCenter = W * 0.28;
    const rightCenter = W * 0.72;
    const topY = margin + 5;
    const bottomY = topY + bigTankH + 40;

    // Render target tanks (A, B) -- top row.
    if (tankA) {
      renderTank(tankA.config, { level: tankA.level, inTolerance: tankA.inTolerance }, {
        ctx, x: leftCenter - bigTankW / 2, y: topY, width: bigTankW, height: bigTankH, labelSide: "left",
      });
    }
    if (tankB) {
      renderTank(tankB.config, { level: tankB.level, inTolerance: tankB.inTolerance }, {
        ctx, x: rightCenter - bigTankW / 2, y: topY, width: bigTankW, height: bigTankH, labelSide: "right",
      });
    }

    // Supply tanks -- bottom row.
    const leftSmallSpacing = 55;
    if (tankC) {
      renderTank(tankC.config, { level: tankC.level, inTolerance: tankC.inTolerance }, {
        ctx, x: leftCenter - leftSmallSpacing - smallTankW / 2, y: bottomY, width: smallTankW, height: smallTankH,
      });
    }
    if (tankE) {
      renderTank(tankE.config, { level: tankE.level, inTolerance: tankE.inTolerance }, {
        ctx, x: leftCenter + leftSmallSpacing - smallTankW / 2, y: bottomY, width: smallTankW, height: smallTankH,
      });
    }
    if (tankD) {
      renderTank(tankD.config, { level: tankD.level, inTolerance: tankD.inTolerance }, {
        ctx, x: rightCenter - leftSmallSpacing - smallTankW / 2, y: bottomY, width: smallTankW, height: smallTankH,
      });
    }
    if (tankF) {
      renderTank(tankF.config, { level: tankF.level, inTolerance: tankF.inTolerance }, {
        ctx, x: rightCenter + leftSmallSpacing - smallTankW / 2, y: bottomY, width: smallTankW, height: smallTankH,
      });
    }

    // Render pumps along their connections.
    for (const pump of pumpList) {
      const pumpPos = getPumpPosition(pump, W, H, leftCenter, rightCenter, topY, bottomY, bigTankW, bigTankH, smallTankW, smallTankH, leftSmallSpacing);
      if (!pumpPos) continue;

      renderPump(pump.config, pump.state, {
        ctx, cx: pumpPos.cx, cy: pumpPos.cy, size: 8, direction: pumpPos.direction,
      });

      const srcPos = getTankEdge(pump.sourceId, pumpPos, W, leftCenter, rightCenter, topY, bottomY, bigTankW, bigTankH, smallTankW, smallTankH, leftSmallSpacing);
      const dstPos = getTankEdge(pump.destId, pumpPos, W, leftCenter, rightCenter, topY, bottomY, bigTankW, bigTankH, smallTankW, smallTankH, leftSmallSpacing);
      if (srcPos) renderConnector(ctx, srcPos.x, srcPos.y, pumpPos.cx, pumpPos.cy, pump.state === "on");
      if (dstPos) renderConnector(ctx, pumpPos.cx, pumpPos.cy, dstPos.x, dstPos.y, pump.state === "on");
    }

    // Pump status panel at bottom.
    const statusY = bottomY + smallTankH + 20;
    ctx.fillStyle = "#aaa";
    ctx.font = "9px monospace";
    ctx.textAlign = "left";
    for (let i = 0; i < pumpList.length; i++) {
      const p = pumpList[i];
      const flow = p.state === "on" ? p.flowPerMinute : 0;
      const col = i < 4 ? 0 : 1;
      const row = i % 4;
      const px = margin + col * (W / 2);
      const py = statusY + row * 12;
      ctx.fillText(`P${p.config.label}: ${flow}`, px, py);
    }

    drawHandoverBanner(ctx, W, H);
  }

  // Helper: compute pump position and direction between source and dest tanks.
  function getPumpPosition(
    pump: PumpRuntime,
    _W: number, _H: number,
    leftCenter: number, rightCenter: number,
    topY: number, bottomY: number,
    bigTankW: number, bigTankH: number,
    smallTankW: number, smallTankH: number,
    smallSpacing: number,
  ): { cx: number; cy: number; direction: "up" | "down" | "left" | "right" } | null {
    const src = getTankCenter(pump.sourceId, leftCenter, rightCenter, topY, bottomY, bigTankW, bigTankH, smallTankW, smallTankH, smallSpacing);
    const dst = getTankCenter(pump.destId, leftCenter, rightCenter, topY, bottomY, bigTankW, bigTankH, smallTankW, smallTankH, smallSpacing);
    if (!src || !dst) return null;

    const cx = (src.x + dst.x) / 2;
    const cy = (src.y + dst.y) / 2;
    const dx = dst.x - src.x;
    const dy = dst.y - src.y;

    let direction: "up" | "down" | "left" | "right";
    if (Math.abs(dy) > Math.abs(dx)) {
      direction = dy < 0 ? "up" : "down";
    } else {
      direction = dx > 0 ? "right" : "left";
    }

    return { cx, cy, direction };
  }

  function getTankCenter(
    tankId: string,
    leftCenter: number, rightCenter: number,
    topY: number, bottomY: number,
    bigTankW: number, bigTankH: number,
    smallTankW: number, smallTankH: number,
    smallSpacing: number,
  ): { x: number; y: number } | null {
    const labelSpace = 18;
    switch (tankId) {
      case "a": return { x: leftCenter, y: topY + labelSpace + bigTankH / 2 };
      case "b": return { x: rightCenter, y: topY + labelSpace + bigTankH / 2 };
      case "c": return { x: leftCenter - smallSpacing, y: bottomY + labelSpace + smallTankH / 2 };
      case "d": return { x: rightCenter - smallSpacing, y: bottomY + labelSpace + smallTankH / 2 };
      case "e": return { x: leftCenter + smallSpacing, y: bottomY + labelSpace + smallTankH / 2 };
      case "f": return { x: rightCenter + smallSpacing, y: bottomY + labelSpace + smallTankH / 2 };
      default: return null;
    }
  }

  function getTankEdge(
    tankId: string,
    pumpPos: { cx: number; cy: number },
    _W: number,
    leftCenter: number, rightCenter: number,
    topY: number, bottomY: number,
    bigTankW: number, bigTankH: number,
    smallTankW: number, smallTankH: number,
    smallSpacing: number,
  ): { x: number; y: number } | null {
    const center = getTankCenter(tankId, leftCenter, rightCenter, topY, bottomY, bigTankW, bigTankH, smallTankW, smallTankH, smallSpacing);
    if (!center) return null;

    const isSmall = tankId === "c" || tankId === "d" || tankId === "e" || tankId === "f";
    const hw = (isSmall ? smallTankW : bigTankW) / 2;
    const hh = (isSmall ? smallTankH : bigTankH) / 2;

    const dx = pumpPos.cx - center.x;
    const dy = pumpPos.cy - center.y;

    if (Math.abs(dx) * hh > Math.abs(dy) * hw) {
      return { x: center.x + (dx > 0 ? hw : -hw), y: center.y };
    } else {
      return { x: center.x, y: center.y + (dy > 0 ? hh : -hh) };
    }
  }

  // -------------------------------------------------------------------------
  // SubTaskHandle implementation
  // -------------------------------------------------------------------------

  return {
    id: "resman",

    start(host: HTMLElement, rawConfig?: Record<string, unknown>): void {
      container = host;
      cfg = resolveConfig(rawConfig ?? {});
      initState(cfg);

      canvas = document.createElement("canvas");
      canvas.width = host.clientWidth || 360;
      canvas.height = host.clientHeight || 420;
      ctx = canvas.getContext("2d");
      host.innerHTML = "";
      host.appendChild(canvas);
      startMs = performance.now();
      physicsAccMs = 0;
      totalElapsedMs = 0;
      pumpToggles = 0;

      render();
    },

    step(_now: number, dt: number): void {
      if (!cfg) return;
      totalElapsedMs += dt;
      physicsAccMs += dt;

      // Automated mode: track pump failure durations and auto-resolve.
      if (cfg.automated) {
        for (const pump of pumpList) {
          if (pump.state === "failure") {
            pump.failureElapsedMs += dt;
            if (pump.failureElapsedMs >= cfg.autoResolveDelayMs) {
              pump.state = "off";
              pump.failureElapsedMs = 0;
            }
          }
        }
      }

      // Fixed-step physics at the configured interval.
      while (physicsAccMs >= cfg.updateIntervalMs) {
        const dtMinutes = cfg.updateIntervalMs / 60000;

        if (!physicsFirstStep) {
          // Normal tick: depletion + pump flow.
          updateDepletionAndFlow(dtMinutes);
        } else {
          // First tick: skip depletion/flow (wait_before_leak = 1), matching
          // OpenMATB resman.py. Auto-shutoff and tolerance checks still run.
          physicsFirstStep = false;
        }

        updateAutoShutoff();
        updateToleranceCheck();
        updateToleranceTiming(cfg.updateIntervalMs);
        sampleDeviations();
        recordTick(totalElapsedMs);

        physicsAccMs -= cfg.updateIntervalMs;
      }

      render();
    },

    handleKeyDown(key: string, _timestamp: number): boolean {
      if (cfg?.automated) return false;
      const pump = keyToPump.get(key.toLowerCase());
      if (!pump) return false;
      if (pump.state === "failure") return true; // consumed but no effect
      pump.state = pump.state === "on" ? "off" : "on";
      pumpToggles++;
      return true;
    },

    handleScenarioEvent(event: ScenarioEvent): void {
      if (!cfg) return;
      if (event.command === "set" && event.path) {
        const parts = event.path.split(".");
        if (parts[0] === "pump" && parts.length >= 3) {
          const pumpId = parts[1];
          const prop = parts[2];
          const pump = pumpList.find((p) => p.def.id === pumpId);
          if (pump && prop === "state") {
            const newState = parsePumpState(String(event.value));
            if (newState === "failure") pump.failureElapsedMs = 0;
            pump.state = newState;
          }
        }
        if (parts[0] === "tank" && parts.length >= 3) {
          const tankId = parts[1];
          const prop = parts[2];
          const tank = tankMap.get(tankId);
          if (tank && prop === "level") {
            tank.level = Math.max(0, Math.min(tank.def.maxLevel, Number(event.value) || 0));
          }
        }
        if (parts[0] === "automated" || event.path === "automated") {
          const newAutomated = event.value === true || event.value === "true";
          if (cfg && newAutomated !== cfg.automated) {
            cfg.automated = newAutomated;
            handoverBanner = { text: newAutomated ? "→ AUTO" : "→ MANUAL", isAuto: newAutomated, startMs: performance.now() };
          }
        }
      }
    },

    stop(): ResmanSubTaskResult {
      const tankRecords: ResmanTankRecord[] = [];
      for (const [, tank] of tankMap) {
        if (tank.def.targetLevel == null) continue;
        const samples = deviationSamples.get(tank.def.id) ?? [];
        const meanDeviation = samples.length > 0
          ? samples.reduce((a, b) => a + b, 0) / samples.length
          : 0;
        const proportionInTolerance = totalElapsedMs > 0
          ? Math.max(0, 1 - tank.outOfToleranceMs / totalElapsedMs)
          : 1;
        tankRecords.push({
          tankId: tank.def.id,
          meanDeviation,
          proportionInTolerance,
          totalOutOfToleranceMs: tank.outOfToleranceMs,
        });
      }

      if (canvas && container) {
        container.removeChild(canvas);
        canvas = null;
        ctx = null;
      }

      return {
        elapsedMs: totalElapsedMs,
        tankRecords,
        pumpToggles,
        tickRecords: [...tickRecords],
      };
    },

    getPerformance(): SubTaskPerformance {
      let total = 0;
      let count = 0;
      for (const [, tank] of tankMap) {
        if (tank.def.targetLevel == null) continue;
        const propIn = totalElapsedMs > 0
          ? Math.max(0, 1 - tank.outOfToleranceMs / totalElapsedMs)
          : 1;
        total += propIn;
        count++;
      }
      return { score: count > 0 ? total / count : 1 };
    },
  };
}
