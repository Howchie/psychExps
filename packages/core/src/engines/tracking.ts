export interface TrackingPoint {
  x: number;
  y: number;
}

export interface TrackingCircleTarget {
  shape: "circle";
  centerX: number;
  centerY: number;
  radiusPx: number;
}

export interface TrackingSquareTarget {
  shape: "square";
  centerX: number;
  centerY: number;
  sizePx: number;
}

export type TrackingTargetGeometry = TrackingCircleTarget | TrackingSquareTarget;

export interface TrackingDistanceResult {
  inside: boolean;
  boundaryDistancePx: number;
}

export function computeTrackingDistance(point: TrackingPoint, target: TrackingTargetGeometry): TrackingDistanceResult {
  if (target.shape === "circle") {
    const dx = point.x - target.centerX;
    const dy = point.y - target.centerY;
    const centerDistance = Math.hypot(dx, dy);
    const boundaryDistancePx = Math.max(0, centerDistance - Math.max(0, target.radiusPx));
    return {
      inside: centerDistance <= Math.max(0, target.radiusPx),
      boundaryDistancePx,
    };
  }

  const half = Math.max(0, target.sizePx) / 2;
  const dx = Math.abs(point.x - target.centerX) - half;
  const dy = Math.abs(point.y - target.centerY) - half;
  const outsideDx = Math.max(0, dx);
  const outsideDy = Math.max(0, dy);
  const inside = dx <= 0 && dy <= 0;
  const boundaryDistancePx = inside ? 0 : Math.hypot(outsideDx, outsideDy);
  return { inside, boundaryDistancePx };
}

export interface TrackingSample {
  timeMs: number;
  inside: boolean;
  boundaryDistancePx: number | null;
}

export interface TrackingBinSummary {
  binIndex: number;
  startMs: number;
  endMs: number;
  sampleCount: number;
  insideCount: number;
  outsideCount: number;
  distanceSampleCount: number;
  meanBoundaryDistancePx: number | null;
}

interface MutableTrackingBin {
  sampleCount: number;
  insideCount: number;
  outsideCount: number;
  distanceSampleCount: number;
  distanceSum: number;
}

export interface TrackingBinSummarizerOptions {
  binMs: number;
  includeEmptyBins?: boolean;
}

/**
 * Generic per-window accumulator for continuous tracking streams.
 * Stores counts plus distance moments so downstream code can aggregate with
 * proper sample weighting instead of averaging per-bin proportions.
 */
export class TrackingBinSummarizer {
  private readonly binMs: number;
  private readonly includeEmptyBins: boolean;
  private readonly bins = new Map<number, MutableTrackingBin>();
  private latestTimeMs = 0;

  constructor(options: TrackingBinSummarizerOptions) {
    this.binMs = Math.max(1, Math.round(Number(options.binMs) || 1));
    this.includeEmptyBins = options.includeEmptyBins === true;
  }

  add(sample: TrackingSample): void {
    const timeMs = Math.max(0, Number(sample.timeMs) || 0);
    const binIndex = Math.floor(timeMs / this.binMs);
    const bin = this.ensureBin(binIndex);
    bin.sampleCount += 1;
    if (sample.inside) {
      bin.insideCount += 1;
    } else {
      bin.outsideCount += 1;
    }
    if (Number.isFinite(sample.boundaryDistancePx)) {
      bin.distanceSampleCount += 1;
      bin.distanceSum += Number(sample.boundaryDistancePx);
    }
    if (timeMs > this.latestTimeMs) this.latestTimeMs = timeMs;
  }

  export(totalDurationMs?: number): TrackingBinSummary[] {
    const explicitDuration = Number(totalDurationMs);
    const maxTimeMs = Number.isFinite(explicitDuration)
      ? Math.max(0, explicitDuration)
      : this.latestTimeMs;
    const maxBin = Math.floor(maxTimeMs / this.binMs);
    const out: TrackingBinSummary[] = [];
    const binIndexes = this.includeEmptyBins
      ? Array.from({ length: maxBin + 1 }, (_, index) => index)
      : Array.from(this.bins.keys()).sort((a, b) => a - b);

    for (const binIndex of binIndexes) {
      const bin = this.bins.get(binIndex) ?? {
        sampleCount: 0,
        insideCount: 0,
        outsideCount: 0,
        distanceSampleCount: 0,
        distanceSum: 0,
      };
      const meanBoundaryDistancePx = bin.distanceSampleCount > 0 ? bin.distanceSum / bin.distanceSampleCount : null;
      out.push({
        binIndex,
        startMs: binIndex * this.binMs,
        endMs: (binIndex + 1) * this.binMs,
        sampleCount: bin.sampleCount,
        insideCount: bin.insideCount,
        outsideCount: bin.outsideCount,
        distanceSampleCount: bin.distanceSampleCount,
        meanBoundaryDistancePx,
      });
    }
    return out;
  }

  private ensureBin(binIndex: number): MutableTrackingBin {
    const existing = this.bins.get(binIndex);
    if (existing) return existing;
    const created: MutableTrackingBin = {
      sampleCount: 0,
      insideCount: 0,
      outsideCount: 0,
      distanceSampleCount: 0,
      distanceSum: 0,
    };
    this.bins.set(binIndex, created);
    return created;
  }
}

export interface TrackingRandom {
  next: () => number;
}

export interface TrackingMotionBounds {
  widthPx: number;
  heightPx: number;
  marginPx?: number;
}

export interface TrackingWaypointMotionConfig {
  mode: "waypoint";
  speedPxPerSec: number;
  minSegmentPx?: number;
  arriveThresholdPx?: number;
}

export interface TrackingChaoticMotionConfig {
  mode: "chaotic";
  speedPxPerSec: number;
  directionJitterRadPerSec?: number;
}

export type TrackingMotionConfig = TrackingWaypointMotionConfig | TrackingChaoticMotionConfig;

export interface TrackingMotionState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  targetX: number | null;
  targetY: number | null;
}

/**
 * Runtime motion generator for tracking targets.
 * - `waypoint`: linear segments between sampled waypoints.
 * - `chaotic`: bounded heading random-walk with wall reflections.
 */
export class TrackingMotionController {
  private readonly config: TrackingMotionConfig;
  private readonly rng: TrackingRandom;
  private readonly bounds: Required<TrackingMotionBounds>;
  private state: TrackingMotionState;
  private chaoticHeadingRad = 0;

  constructor(args: {
    config: TrackingMotionConfig;
    rng: TrackingRandom;
    bounds: TrackingMotionBounds;
    initial?: Partial<TrackingMotionState> | null;
  }) {
    this.config = args.config;
    this.rng = args.rng;
    this.bounds = normalizeBounds(args.bounds);
    const start = this.sampleRandomPosition();
    this.state = {
      x: clamp(start.x, this.bounds.marginPx, this.bounds.widthPx - this.bounds.marginPx),
      y: clamp(start.y, this.bounds.marginPx, this.bounds.heightPx - this.bounds.marginPx),
      vx: 0,
      vy: 0,
      targetX: null,
      targetY: null,
    };
    if (args.initial) {
      this.state = {
        ...this.state,
        ...{
          x: Number.isFinite(Number(args.initial.x)) ? Number(args.initial.x) : this.state.x,
          y: Number.isFinite(Number(args.initial.y)) ? Number(args.initial.y) : this.state.y,
        },
      };
    }
    this.state.x = clamp(this.state.x, this.bounds.marginPx, this.bounds.widthPx - this.bounds.marginPx);
    this.state.y = clamp(this.state.y, this.bounds.marginPx, this.bounds.heightPx - this.bounds.marginPx);
    this.chaoticHeadingRad = this.rng.next() * Math.PI * 2;
  }

  getState(): TrackingMotionState {
    return { ...this.state };
  }

  step(dtMs: number): TrackingMotionState {
    const dtSec = Math.max(0, Number(dtMs) || 0) / 1000;
    if (dtSec <= 0) return this.getState();
    if (this.config.mode === "chaotic") {
      this.stepChaotic(dtSec);
    } else {
      this.stepWaypoint(dtSec);
    }
    return this.getState();
  }

  private stepWaypoint(dtSec: number): void {
    const config = this.config as TrackingWaypointMotionConfig;
    const speed = Math.max(1, Number(this.config.speedPxPerSec) || 1);
    const threshold = Math.max(0.5, Number(config.arriveThresholdPx) || 1.5);
    const minSegment = Math.max(0, Number(config.minSegmentPx) || 0);
    const maxTravel = speed * dtSec;

    if (this.state.targetX == null || this.state.targetY == null) {
      const next = this.sampleWaypoint(minSegment);
      this.state.targetX = next.x;
      this.state.targetY = next.y;
    }

    const dx = this.state.targetX - this.state.x;
    const dy = this.state.targetY - this.state.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= threshold || distance <= maxTravel) {
      this.state.x = this.state.targetX;
      this.state.y = this.state.targetY;
      const next = this.sampleWaypoint(minSegment);
      this.state.targetX = next.x;
      this.state.targetY = next.y;
      this.state.vx = 0;
      this.state.vy = 0;
      return;
    }
    const ux = dx / distance;
    const uy = dy / distance;
    this.state.x += ux * maxTravel;
    this.state.y += uy * maxTravel;
    this.state.vx = ux * speed;
    this.state.vy = uy * speed;
  }

  private stepChaotic(dtSec: number): void {
    const config = this.config as TrackingChaoticMotionConfig;
    const speed = Math.max(1, Number(this.config.speedPxPerSec) || 1);
    const jitter = Math.max(0, Number(config.directionJitterRadPerSec) || 0);
    const randomDelta = (this.rng.next() * 2 - 1) * jitter * dtSec;
    this.chaoticHeadingRad += randomDelta;
    this.state.vx = Math.cos(this.chaoticHeadingRad) * speed;
    this.state.vy = Math.sin(this.chaoticHeadingRad) * speed;
    this.state.x += this.state.vx * dtSec;
    this.state.y += this.state.vy * dtSec;
    this.state.targetX = null;
    this.state.targetY = null;

    const minX = this.bounds.marginPx;
    const maxX = this.bounds.widthPx - this.bounds.marginPx;
    const minY = this.bounds.marginPx;
    const maxY = this.bounds.heightPx - this.bounds.marginPx;

    let bouncedX = false;
    let bouncedY = false;
    if (this.state.x < minX) {
      this.state.x = minX;
      bouncedX = true;
    } else if (this.state.x > maxX) {
      this.state.x = maxX;
      bouncedX = true;
    }
    if (this.state.y < minY) {
      this.state.y = minY;
      bouncedY = true;
    } else if (this.state.y > maxY) {
      this.state.y = maxY;
      bouncedY = true;
    }

    if (bouncedX) {
      this.chaoticHeadingRad = Math.PI - this.chaoticHeadingRad;
      this.state.vx *= -1;
    }
    if (bouncedY) {
      this.chaoticHeadingRad = -this.chaoticHeadingRad;
      this.state.vy *= -1;
    }
  }

  private sampleWaypoint(minDistancePx: number): { x: number; y: number } {
    const maxAttempts = 30;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const point = this.sampleRandomPosition();
      if (Math.hypot(point.x - this.state.x, point.y - this.state.y) >= minDistancePx) {
        return point;
      }
    }
    return this.sampleRandomPosition();
  }

  private sampleRandomPosition(): { x: number; y: number } {
    const minX = this.bounds.marginPx;
    const maxX = Math.max(minX, this.bounds.widthPx - this.bounds.marginPx);
    const minY = this.bounds.marginPx;
    const maxY = Math.max(minY, this.bounds.heightPx - this.bounds.marginPx);
    return {
      x: minX + this.rng.next() * (maxX - minX),
      y: minY + this.rng.next() * (maxY - minY),
    };
  }
}

function normalizeBounds(bounds: TrackingMotionBounds): Required<TrackingMotionBounds> {
  const widthPx = Math.max(1, Number(bounds.widthPx) || 1);
  const heightPx = Math.max(1, Number(bounds.heightPx) || 1);
  const maxMargin = Math.min(widthPx, heightPx) / 2;
  const marginPx = clamp(Number(bounds.marginPx ?? 0) || 0, 0, maxMargin);
  return { widthPx, heightPx, marginPx };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
