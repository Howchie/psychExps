/**
 * MATB Tracking sub-task handle for composite (concurrent) mode.
 *
 * Wraps the PerturbationController + CompensatoryRenderer as a
 * SubTaskHandle that the ConcurrentTaskRunner can tick each frame.
 * Unlike the standalone adapter, there is no block/trial loop --
 * the sub-task runs continuously until stopped, with difficulty
 * changes injected via scenario events.
 */

import {
  PerturbationController,
  TrackingBinSummarizer,
  asArray,
  asObject,
  asString,
  toPositiveNumber,
  toPositiveFloat,
  toNonNegativeNumber,
  type PerturbationComponent,
  type TrackingCircleTarget,
  type SubTaskHandle,
  type SubTaskPerformance,
  type ScenarioEvent,
} from "@experiments/core";

// ---------------------------------------------------------------------------
// Config types (subset of standalone config, without block/trial structure)
// ---------------------------------------------------------------------------

export interface TrackingSubTaskConfig {
  display?: {
    aperturePx?: number;
    canvasBackground?: string;
    showCrosshair?: boolean;
  };
  reticle?: {
    radiusPx?: number;
    strokeColor?: string;
    strokeWidthPx?: number;
    fillColor?: string;
  };
  cursor?: {
    radiusPx?: number;
    colorInside?: string;
    colorOutside?: string;
  };
  perturbation?: {
    components?: PerturbationComponent[];
    inputGain?: number;
    maxDisplacementPx?: number;
  };
  sampleIntervalMs?: number;
  binMs?: number;
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

/** One bin of tracking data. centerDistancePx is Euclidean distance from reticle center. */
export interface TrackingBin {
  binIndex: number;
  startMs: number;
  endMs: number;
  sampleCount: number;
  /** Frames where cursor was inside the reticle target. */
  insideCount: number;
  /** Frames where cursor was outside the reticle target. */
  outsideCount: number;
  centerDistanceSampleCount: number;
  /**
   * Mean Euclidean distance from the reticle center (px).
   * Matches OpenMATB track.py return_deviation() — sqrt(x² + y²).
   * Null if no samples in this bin.
   */
  meanCenterDistancePx: number | null;
}

/**
 * One cursor excursion (period outside the target), matching OpenMATB's
 * per-excursion response_time log entry.
 */
export interface TrackingExcursionRecord {
  excursionIdx: number;
  /** Session time (ms) when cursor left the target. */
  startMs: number;
  /** Session time (ms) when cursor returned to target. null if still outside at session end. */
  endMs: number | null;
  /** Duration of the excursion in ms. null if still outside at session end. */
  durationMs: number | null;
}

export interface TrackingSubTaskResult {
  elapsedMs: number;
  sampleCount: number;
  insideCount: number;
  outsideCount: number;
  centerDistanceSampleCount: number;
  meanCenterDistancePx: number | null;
  bins: TrackingBin[];
  /** Per-excursion records: one entry each time the cursor returns to the target. */
  excursionRecords: TrackingExcursionRecord[];
}

// ---------------------------------------------------------------------------
// Resolved internal config
// ---------------------------------------------------------------------------

interface ResolvedConfig {
  aperturePx: number;
  canvasBackground: string;
  showCrosshair: boolean;
  reticleRadiusPx: number;
  reticleStrokeColor: string;
  reticleStrokeWidthPx: number;
  reticleFillColor: string;
  cursorRadiusPx: number;
  cursorColorInside: string;
  cursorColorOutside: string;
  perturbationComponents: PerturbationComponent[];
  inputGain: number;
  maxDisplacementPx: number;
  sampleIntervalMs: number;
  binMs: number;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createTrackingSubTaskHandle(): SubTaskHandle<TrackingSubTaskResult> {
  // Mutable runtime state.
  let config: ResolvedConfig | null = null;
  let perturbation: PerturbationController | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  let container: HTMLElement | null = null;
  let binner: TrackingBinSummarizer | null = null;
  let reticleTarget: TrackingCircleTarget | null = null;

  // Mouse delta accumulation.
  let accDx = 0;
  let accDy = 0;
  const onMouseMove = (e: MouseEvent): void => { accDx += e.movementX; accDy += e.movementY; };
  const onCanvasClick = (): void => {
    if (canvas && document.pointerLockElement !== canvas) {
      canvas.requestPointerLock();
    }
  };

  // Sampling counters.
  let startMs = 0;
  let lastSampleElapsed = -Infinity;
  let sampleCount = 0;
  let insideCount = 0;
  let outsideCount = 0;
  let centerDistanceSampleCount = 0;
  let centerDistanceSum = 0;

  // Excursion tracking — matches OpenMATB track.py per-excursion response_time logging.
  let wasInsidePrev: boolean | null = null;
  let excursionStartMs: number | null = null;
  let excursionIdx = 0;
  const excursionRecords: TrackingExcursionRecord[] = [];

  // Rolling window for live performance score.
  const PERF_WINDOW = 150; // last N samples
  const perfRing: boolean[] = [];
  let perfRingIndex = 0;

  function resolveConfig(raw: Record<string, unknown>): ResolvedConfig {
    const displayRaw = asObject(raw.display) ?? {};
    const reticleRaw = asObject(raw.reticle) ?? {};
    const cursorRaw = asObject(raw.cursor) ?? {};
    const pertRaw = asObject(raw.perturbation) ?? {};
    const aperturePx = toPositiveNumber(displayRaw.aperturePx, 400);

    return {
      aperturePx,
      canvasBackground: asString(displayRaw.canvasBackground) ?? "#e2e8f0",
      showCrosshair: displayRaw.showCrosshair !== false,
      reticleRadiusPx: toPositiveNumber(reticleRaw.radiusPx, 50),
      reticleStrokeColor: asString(reticleRaw.strokeColor) ?? "#334155",
      reticleStrokeWidthPx: toPositiveNumber(reticleRaw.strokeWidthPx, 2),
      reticleFillColor: asString(reticleRaw.fillColor) ?? "rgba(22, 163, 74, 0.15)",
      cursorRadiusPx: toPositiveNumber(cursorRaw.radiusPx, 4),
      cursorColorInside: asString(cursorRaw.colorInside) ?? "#000000",
      cursorColorOutside: asString(cursorRaw.colorOutside) ?? "#ef4444",
      perturbationComponents: parsePerturbationComponents(asArray(pertRaw.components)),
      inputGain: toPositiveFloat(pertRaw.inputGain ?? pertRaw.gainRatio, 1),
      maxDisplacementPx: toPositiveNumber(pertRaw.maxDisplacementPx, aperturePx / 2),
      sampleIntervalMs: toPositiveNumber(raw.sampleIntervalMs, 16),
      binMs: toPositiveNumber(raw.binMs, 2000),
    };
  }

  return {
    id: "tracking",

    start(hostContainer: HTMLElement, rawConfig: Record<string, unknown>): void {
      config = resolveConfig(rawConfig);
      container = hostContainer;
      container.innerHTML = "";

      // Create canvas.
      canvas = document.createElement("canvas");
      canvas.width = config.aperturePx;
      canvas.height = config.aperturePx;
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      canvas.style.objectFit = "contain";
      canvas.style.cursor = "none";
      container.appendChild(canvas);

      ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas 2D context unavailable for MATB tracking subtask.");

      document.addEventListener("mousemove", onMouseMove);
      canvas.addEventListener("click", onCanvasClick);

      // Init perturbation.
      perturbation = new PerturbationController({
        components: config.perturbationComponents,
        inputGain: config.inputGain,
        maxDisplacementPx: config.maxDisplacementPx,
      });

      // Init sampling.
      const halfAperture = config.aperturePx / 2;
      reticleTarget = {
        shape: "circle",
        centerX: halfAperture,
        centerY: halfAperture,
        radiusPx: config.reticleRadiusPx,
      };
      binner = new TrackingBinSummarizer({ binMs: config.binMs, includeEmptyBins: true });
      startMs = performance.now();
      lastSampleElapsed = -Infinity;
      sampleCount = 0;
      insideCount = 0;
      outsideCount = 0;
      centerDistanceSampleCount = 0;
      centerDistanceSum = 0;
      wasInsidePrev = null;
      excursionStartMs = null;
      excursionIdx = 0;
      excursionRecords.length = 0;
      accDx = 0;
      accDy = 0;
      perfRing.length = 0;
      perfRingIndex = 0;
    },

    step(now: number, dt: number): void {
      if (!config || !perturbation || !ctx || !canvas || !reticleTarget || !binner) return;

      // Consume mouse delta and advance perturbation.
      const dx = accDx;
      const dy = accDy;
      accDx = 0;
      accDy = 0;
      const state = perturbation.step(dt, dx, dy);

      const halfAperture = config.aperturePx / 2;
      const absCursorX = halfAperture + state.cursorX;
      const absCursorY = halfAperture + state.cursorY;

      // Euclidean distance from reticle center — matches OpenMATB track.py return_deviation().
      const offX = absCursorX - halfAperture;
      const offY = absCursorY - halfAperture;
      const centerDistancePx = Math.sqrt(offX * offX + offY * offY);
      const inside = centerDistancePx <= config.reticleRadiusPx;

      // Sample at configured interval.
      const elapsed = now - startMs;
      if (elapsed - lastSampleElapsed >= config.sampleIntervalMs) {
        sampleCount += 1;
        if (inside) insideCount += 1;
        else outsideCount += 1;

        centerDistanceSampleCount += 1;
        centerDistanceSum += centerDistancePx;

        const timeMs = Math.max(0, Math.round(elapsed));
        // Pass centerDistancePx as the binner's distance metric (renamed to
        // meanCenterDistancePx on export — matching OpenMATB's center_deviation).
        binner.add({ timeMs, inside, boundaryDistancePx: centerDistancePx });
        lastSampleElapsed = elapsed;

        // Excursion detection — matches OpenMATB per-excursion response_time logging.
        if (wasInsidePrev !== null) {
          if (wasInsidePrev && !inside) {
            // Transition inside → outside: start excursion.
            excursionStartMs = elapsed;
            excursionIdx++;
          } else if (!wasInsidePrev && inside && excursionStartMs !== null) {
            // Transition outside → inside: close and record excursion.
            excursionRecords.push({
              excursionIdx,
              startMs:   Math.round(excursionStartMs),
              endMs:     Math.round(elapsed),
              durationMs: Math.round(elapsed - excursionStartMs),
            });
            excursionStartMs = null;
          }
        }
        wasInsidePrev = inside;

        // Rolling performance window.
        if (perfRing.length < PERF_WINDOW) {
          perfRing.push(inside);
        } else {
          perfRing[perfRingIndex % PERF_WINDOW] = inside;
        }
        perfRingIndex += 1;
      }

      // Render.
      const w = config.aperturePx;
      const h = config.aperturePx;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = config.canvasBackground;
      ctx.fillRect(0, 0, w, h);

      if (config.showCrosshair) {
        ctx.strokeStyle = "rgba(148, 163, 184, 0.35)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(halfAperture, 0);
        ctx.lineTo(halfAperture, h);
        ctx.moveTo(0, halfAperture);
        ctx.lineTo(w, halfAperture);
        ctx.stroke();
      }

      // Reticle.
      ctx.fillStyle = config.reticleFillColor;
      ctx.strokeStyle = config.reticleStrokeColor;
      ctx.lineWidth = config.reticleStrokeWidthPx;
      ctx.beginPath();
      ctx.arc(halfAperture, halfAperture, Math.max(1, config.reticleRadiusPx), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Cursor dot.
      ctx.fillStyle = inside ? config.cursorColorInside : config.cursorColorOutside;
      ctx.beginPath();
      ctx.arc(absCursorX, absCursorY, Math.max(1, config.cursorRadiusPx), 0, Math.PI * 2);
      ctx.fill();
    },

    handleScenarioEvent(event: ScenarioEvent): void {
      if (!config || !perturbation) return;

      // Support runtime parameter changes via "set" commands.
      if (event.command === "set" && event.path) {
        if (event.path.startsWith("perturbation.")) {
          applyPerturbationOverride(config, event.path, event.value);
          perturbation = new PerturbationController({
            components: config.perturbationComponents,
            inputGain: config.inputGain,
            maxDisplacementPx: config.maxDisplacementPx,
          });
        }
      }
    },

    stop(): TrackingSubTaskResult {
      // Clean up.
      if (canvas) {
        document.removeEventListener("mousemove", onMouseMove);
        canvas.removeEventListener("click", onCanvasClick);
        if (document.pointerLockElement === canvas) {
          document.exitPointerLock();
        }
      }
      if (container) {
        container.innerHTML = "";
      }

      const elapsed = performance.now() - startMs;

      // Close any open excursion at session end.
      if (excursionStartMs !== null) {
        excursionRecords.push({
          excursionIdx,
          startMs:   Math.round(excursionStartMs),
          endMs:     Math.round(elapsed),
          durationMs: Math.round(elapsed - excursionStartMs),
        });
      }

      // Export bins, renaming the binner's boundaryDistancePx → meanCenterDistancePx.
      const rawBins = binner ? binner.export(elapsed) : [];
      const bins: TrackingBin[] = rawBins.map((b) => ({
        binIndex:                  b.binIndex,
        startMs:                   b.startMs,
        endMs:                     b.endMs,
        sampleCount:               b.sampleCount,
        insideCount:               b.insideCount,
        outsideCount:              b.outsideCount,
        centerDistanceSampleCount: b.distanceSampleCount,
        meanCenterDistancePx:      b.meanBoundaryDistancePx,
      }));

      const result: TrackingSubTaskResult = {
        elapsedMs: Math.round(elapsed),
        sampleCount,
        insideCount,
        outsideCount,
        centerDistanceSampleCount,
        meanCenterDistancePx: centerDistanceSampleCount > 0
          ? centerDistanceSum / centerDistanceSampleCount
          : null,
        bins,
        excursionRecords: [...excursionRecords],
      };

      // Reset state.
      config = null;
      perturbation = null;
      canvas = null;
      ctx = null;
      container = null;
      binner = null;
      reticleTarget = null;
      wasInsidePrev = null;
      excursionStartMs = null;
      excursionIdx = 0;
      excursionRecords.length = 0;

      return result;
    },

    getPerformance(): SubTaskPerformance {
      if (perfRing.length === 0) return { score: 1, metrics: { insideRate: 1 } };
      const count = Math.min(perfRing.length, PERF_WINDOW);
      let insideInWindow = 0;
      for (let i = 0; i < count; i++) {
        if (perfRing[i]) insideInWindow += 1;
      }
      const insideRate = insideInWindow / count;
      return { score: insideRate, metrics: { insideRate } };
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parsePerturbationComponents(raw: unknown[]): PerturbationComponent[] {
  const out: PerturbationComponent[] = [];
  for (const entry of raw) {
    const obj = asObject(entry);
    if (!obj) continue;
    const axis = asString(obj.axis);
    if (axis !== "x" && axis !== "y") continue;
    out.push({
      axis,
      frequencyHz: toPositiveFloat(obj.frequencyHz, 0.05),
      amplitude: toPositiveFloat(obj.amplitude, 40),
      phaseRad: toNonNegativeNumber(obj.phaseRad, 0),
    });
  }
  if (out.length === 0) {
    // Default perturbation components.
    out.push(
      { axis: "x", frequencyHz: 0.03, amplitude: 40, phaseRad: 0 },
      { axis: "x", frequencyHz: 0.07, amplitude: 28, phaseRad: 0 },
      { axis: "y", frequencyHz: 0.05, amplitude: 40, phaseRad: 0 },
      { axis: "y", frequencyHz: 0.11, amplitude: 20, phaseRad: 0 },
    );
  }
  return out;
}

function applyPerturbationOverride(config: ResolvedConfig, path: string, value: unknown): void {
  const parts = path.split(".");
  // Strip leading "perturbation."
  if (parts[0] === "perturbation") parts.shift();

  if (parts[0] === "inputGain" && typeof value === "number") {
    config.inputGain = value;
    return;
  }
  if (parts[0] === "maxDisplacementPx" && typeof value === "number") {
    config.maxDisplacementPx = value;
    return;
  }
  // components.INDEX.FIELD
  if (parts[0] === "components" && parts.length === 3) {
    const idx = parseInt(parts[1], 10);
    if (idx >= 0 && idx < config.perturbationComponents.length) {
      const field = parts[2];
      if (field === "amplitude" && typeof value === "number") {
        config.perturbationComponents[idx].amplitude = value;
      } else if (field === "frequencyHz" && typeof value === "number") {
        config.perturbationComponents[idx].frequencyHz = value;
      } else if (field === "phaseRad" && typeof value === "number") {
        config.perturbationComponents[idx].phaseRad = value;
      }
    }
  }
}
