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
export declare function computeTrackingDistance(point: TrackingPoint, target: TrackingTargetGeometry): TrackingDistanceResult;
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
export interface TrackingBinSummarizerOptions {
    binMs: number;
    includeEmptyBins?: boolean;
}
/**
 * Generic per-window accumulator for continuous tracking streams.
 * Stores counts plus distance moments so downstream code can aggregate with
 * proper sample weighting instead of averaging per-bin proportions.
 */
export declare class TrackingBinSummarizer {
    private readonly binMs;
    private readonly includeEmptyBins;
    private readonly bins;
    private latestTimeMs;
    constructor(options: TrackingBinSummarizerOptions);
    add(sample: TrackingSample): void;
    export(totalDurationMs?: number): TrackingBinSummary[];
    private ensureBin;
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
export declare class TrackingMotionController {
    private readonly config;
    private readonly rng;
    private readonly bounds;
    private state;
    private chaoticHeadingRad;
    constructor(args: {
        config: TrackingMotionConfig;
        rng: TrackingRandom;
        bounds: TrackingMotionBounds;
        initial?: Partial<TrackingMotionState> | null;
    });
    getState(): TrackingMotionState;
    step(dtMs: number): TrackingMotionState;
    private stepWaypoint;
    private stepChaotic;
    private sampleWaypoint;
    private sampleRandomPosition;
}
