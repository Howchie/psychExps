/**
 * Adaptive Controller for MATB Dynamic Scenario Source.
 *
 * Maps Wald transform drift rate estimates from the DRT module to
 * adjustments in event generation parameters (failure rates, automation
 * reliability, etc.) on the DynamicScenarioSource.
 *
 * The controller defines drift rate bands:
 *   - High drift rate (low cognitive load) → increase demand
 *   - Low drift rate (high cognitive load) → decrease demand
 *   - Within target band → no adjustment
 *
 * Adjustments are applied by modifying the DynamicScenarioSource's
 * runtime parameters (intervals, reliability, max concurrent failures).
 * All adjustments are logged for analysis.
 */

import type {
  OnlineParameterTransformEstimate,
  DynamicScenarioSource,
} from "@experiments/core";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface AdaptiveControllerConfig {
  /** Whether adaptive control is active. Default false. */
  enabled?: boolean;

  /**
   * Target drift rate band [lower, upper]. When drift rate is within
   * this range, no adjustments are made. Default [2.0, 4.0].
   */
  targetDriftRateBand?: [number, number];

  /**
   * Minimum number of Wald samples before adaptive adjustments begin.
   * Prevents acting on noisy early estimates. Default 15.
   */
  minSampleSize?: number;

  /**
   * Minimum interval (ms) between adaptive adjustments.
   * Prevents oscillation from rapid consecutive adjustments. Default 30000.
   */
  adjustmentCooldownMs?: number;

  /**
   * Step size for interval adjustments: fraction to increase/decrease
   * event intervals on each adjustment. Default 0.15 (15%).
   */
  intervalStepFraction?: number;

  /**
   * Step size for reliability adjustments: absolute change per step.
   * Default 0.1.
   */
  reliabilityStep?: number;

  /**
   * Clamp bounds for adjusted intervals (ms). Prevents intervals from
   * becoming unreasonably short or long.
   */
  intervalClamp?: { min: number; max: number };

  /**
   * Which parameters to adjust. Default: all enabled.
   */
  adjustableParams?: {
    sysmonInterval?: boolean;
    commsInterval?: boolean;
    resmanInterval?: boolean;
    sysmonReliability?: boolean;
    resmanReliability?: boolean;
    maxConcurrentFailures?: boolean;
  };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AdaptiveAdjustment {
  timestampMs: number;
  driftRate: number;
  driftRateLower: number;
  driftRateUpper: number;
  sampleSize: number;
  direction: "increase_demand" | "decrease_demand" | "none";
  adjustedParams: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

export class AdaptiveController {
  private readonly config: Required<AdaptiveControllerConfig>;
  private readonly adjustments: AdaptiveAdjustment[] = [];
  private lastAdjustmentMs = 0;
  private source: DynamicScenarioSource | null = null;
  private onAdjustment: ((adj: AdaptiveAdjustment) => void) | null = null;

  constructor(config: AdaptiveControllerConfig = {}) {
    this.config = {
      enabled:                config.enabled ?? false,
      targetDriftRateBand:    config.targetDriftRateBand ?? [2.0, 4.0],
      minSampleSize:          config.minSampleSize ?? 15,
      adjustmentCooldownMs:   config.adjustmentCooldownMs ?? 30000,
      intervalStepFraction:   config.intervalStepFraction ?? 0.15,
      reliabilityStep:        config.reliabilityStep ?? 0.1,
      intervalClamp:          config.intervalClamp ?? { min: 10000, max: 120000 },
      adjustableParams:       config.adjustableParams ?? {
        sysmonInterval: true,
        commsInterval: true,
        resmanInterval: true,
        sysmonReliability: true,
        resmanReliability: true,
        maxConcurrentFailures: false,
      },
    };
  }

  /** Attach to a DynamicScenarioSource. */
  attach(source: DynamicScenarioSource, onAdjustment?: (adj: AdaptiveAdjustment) => void): void {
    this.source = source;
    this.onAdjustment = onAdjustment ?? null;
  }

  /** Detach from the source. */
  detach(): void {
    this.source = null;
    this.onAdjustment = null;
  }

  /** Whether the controller is enabled and attached. */
  isActive(): boolean {
    return this.config.enabled && this.source != null;
  }

  /**
   * Process a new Wald transform estimate. Call this each time
   * the DRT module produces a new estimate.
   */
  onEstimate(estimate: OnlineParameterTransformEstimate, elapsedMs: number): void {
    if (!this.config.enabled || !this.source) return;

    // Wait for sufficient samples.
    if (estimate.sampleSize < this.config.minSampleSize) return;

    // Cooldown between adjustments.
    if (elapsedMs - this.lastAdjustmentMs < this.config.adjustmentCooldownMs) return;

    const v = estimate.values?.drift_rate;
    if (v == null) return;

    const [lo, hi] = this.config.targetDriftRateBand;
    let direction: AdaptiveAdjustment["direction"] = "none";

    if (v > hi) {
      // High drift rate → participant has spare capacity → increase demand.
      direction = "increase_demand";
    } else if (v < lo) {
      // Low drift rate → participant is overloaded → decrease demand.
      direction = "decrease_demand";
    }

    if (direction === "none") return;

    const currentParams = this.source.getParams();
    const adjustedParams: Record<string, number> = {};
    const step = this.config.intervalStepFraction;
    const reliStep = this.config.reliabilityStep;
    const clamp = this.config.intervalClamp;
    const adj = this.config.adjustableParams;

    if (direction === "increase_demand") {
      // Shorten intervals (more frequent events), reduce reliability.
      if (adj.sysmonInterval) {
        const newVal = Math.max(clamp.min, Math.round(currentParams.sysmon.intervalMs * (1 - step)));
        adjustedParams["sysmon.intervalMs"] = newVal;
        this.source.adjustParams({ sysmon: { intervalMs: newVal } });
      }
      if (adj.commsInterval) {
        const newVal = Math.max(clamp.min, Math.round(currentParams.comms.intervalMs * (1 - step)));
        adjustedParams["comms.intervalMs"] = newVal;
        this.source.adjustParams({ comms: { intervalMs: newVal } });
      }
      if (adj.resmanInterval) {
        const newVal = Math.max(clamp.min, Math.round(currentParams.resman.intervalMs * (1 - step)));
        adjustedParams["resman.intervalMs"] = newVal;
        this.source.adjustParams({ resman: { intervalMs: newVal } });
      }
      if (adj.sysmonReliability) {
        const newVal = Math.max(0, currentParams.sysmon.reliability - reliStep);
        adjustedParams["sysmon.reliability"] = newVal;
        this.source.adjustParams({ sysmon: { reliability: newVal } });
      }
      if (adj.resmanReliability) {
        const newVal = Math.max(0, currentParams.resman.reliability - reliStep);
        adjustedParams["resman.reliability"] = newVal;
        this.source.adjustParams({ resman: { reliability: newVal } });
      }
    } else {
      // Lengthen intervals (less frequent events), increase reliability.
      if (adj.sysmonInterval) {
        const newVal = Math.min(clamp.max, Math.round(currentParams.sysmon.intervalMs * (1 + step)));
        adjustedParams["sysmon.intervalMs"] = newVal;
        this.source.adjustParams({ sysmon: { intervalMs: newVal } });
      }
      if (adj.commsInterval) {
        const newVal = Math.min(clamp.max, Math.round(currentParams.comms.intervalMs * (1 + step)));
        adjustedParams["comms.intervalMs"] = newVal;
        this.source.adjustParams({ comms: { intervalMs: newVal } });
      }
      if (adj.resmanInterval) {
        const newVal = Math.min(clamp.max, Math.round(currentParams.resman.intervalMs * (1 + step)));
        adjustedParams["resman.intervalMs"] = newVal;
        this.source.adjustParams({ resman: { intervalMs: newVal } });
      }
      if (adj.sysmonReliability) {
        const newVal = Math.min(1, currentParams.sysmon.reliability + reliStep);
        adjustedParams["sysmon.reliability"] = newVal;
        this.source.adjustParams({ sysmon: { reliability: newVal } });
      }
      if (adj.resmanReliability) {
        const newVal = Math.min(1, currentParams.resman.reliability + reliStep);
        adjustedParams["resman.reliability"] = newVal;
        this.source.adjustParams({ resman: { reliability: newVal } });
      }
    }

    const adjustment: AdaptiveAdjustment = {
      timestampMs: elapsedMs,
      driftRate: v,
      driftRateLower: estimate.intervals?.drift_rate?.lower ?? v,
      driftRateUpper: estimate.intervals?.drift_rate?.upper ?? v,
      sampleSize: estimate.sampleSize,
      direction,
      adjustedParams,
    };

    this.adjustments.push(adjustment);
    this.lastAdjustmentMs = elapsedMs;
    this.onAdjustment?.(adjustment);
  }

  /** All adjustments made during this session. */
  getAdjustments(): AdaptiveAdjustment[] {
    return [...this.adjustments];
  }
}
