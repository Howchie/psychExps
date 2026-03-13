// @ts-nocheck
const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
const finiteOr = (value, fallback) => {
    if (value === null || value === undefined || value === '') {
        return fallback;
    }
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
};
const holdDurationDemand = (brick, config) => {
    const params = config?.bricks?.completionParams || {};
    const display = config?.display || {};
    const width = Math.max(1, finiteOr(brick?.width, finiteOr(display.brickWidth, 160)));
    const targetHoldMs = Math.max(50, finiteOr(brick?.targetHoldMs, finiteOr(params.target_hold_ms, 700)));
    const progressCurve = Math.max(0.1, finiteOr(params.progress_curve, 1));
    const widthScalingEnabled = params.width_scaling !== false;
    const widthReferencePx = Math.max(1, finiteOr(params.width_reference_px, finiteOr(display.brickWidth, 160)));
    const widthScalingExponent = Math.max(0, finiteOr(params.width_scaling_exponent, 1));
    const progressPerPerfectBase = Math.max(0.01, Math.min(1, finiteOr(brick?.progressPerPerfect, finiteOr(params.progress_per_perfect, 0.35))));
    const widthFactorRaw = widthScalingEnabled ? (width / widthReferencePx) : 1;
    const widthFactor = Math.max(0.2, Math.pow(Math.max(0.01, widthFactorRaw), widthScalingExponent));
    const perfectGain = progressPerPerfectBase / widthFactor;
    // user-level assumption: expected relative hold quality in [0, 1]
    const holdQualityMean = clamp01(finiteOr(config?.difficultyModel?.holdQualityMean, 0.5));
    const expectedGain = Math.max(1e-4, perfectGain * Math.pow(holdQualityMean, progressCurve));
    const holdsToClear = 1 / expectedGain;
    const expectedClearMs = holdsToClear * targetHoldMs;
    return {
        mode: 'hold_duration',
        width_px: width,
        target_hold_ms: targetHoldMs,
        hold_quality_mean: holdQualityMean,
        width_factor: widthFactor,
        progress_per_perfect_effective: perfectGain,
        expected_progress_per_hold: expectedGain,
        expected_holds_to_clear: holdsToClear,
        expected_clear_ms: expectedClearMs
    };
};
const hoverToClearDemand = (brick, conveyor, config) => {
    const width = Math.max(1, finiteOr(brick?.width, finiteOr(config?.display?.brickWidth, 160)));
    const speed = Math.max(1e-6, finiteOr(conveyor?.speed, finiteOr(brick?.speed, 1)));
    const processRatePxPerSec = Math.max(0, finiteOr(config?.bricks?.completionParams?.hover_process_rate_px_s, speed)) || speed;
    const expectedClearMs = (width / processRatePxPerSec) * 1000;
    return {
        mode: 'hover_to_clear',
        width_px: width,
        speed_px_per_sec: speed,
        hover_process_rate_px_s: processRatePxPerSec,
        expected_clear_ms: expectedClearMs
    };
};
const clickDemand = (brick, config) => {
    const mode = config?.bricks?.completionMode;
    const params = config?.bricks?.completionParams || {};
    const difficultyModel = config?.difficultyModel || {};
    const avgClickIntervalMs = Math.max(40, finiteOr(difficultyModel.avgClickIntervalMs, 240));
    const clickAcquireMs = Math.max(0, finiteOr(difficultyModel.clickAcquireMs, 110));
    const clicksRequired = mode === 'multi_click'
        ? Math.max(1, Math.floor(finiteOr(params.clicks_required, 2)))
        : 1;
    const expectedClearMs = clickAcquireMs + (clicksRequired * avgClickIntervalMs);
    return {
        mode,
        clicks_required: clicksRequired,
        avg_click_interval_ms: avgClickIntervalMs,
        click_acquire_ms: clickAcquireMs,
        expected_clear_ms: expectedClearMs,
        width_px: Math.max(1, finiteOr(brick?.width, finiteOr(config?.display?.brickWidth, 160)))
    };
};
const brickDemandEstimate = (brick, conveyor, config) => {
    const mode = config?.bricks?.completionMode;
    if (mode === 'hold_duration') {
        return holdDurationDemand(brick, config);
    }
    if (mode === 'hover_to_clear') {
        return hoverToClearDemand(brick, conveyor, config);
    }
    if (mode === 'single_click' || mode === 'multi_click') {
        return clickDemand(brick, config);
    }
    // Unknown mode fallback to a conservative click-like estimate.
    return clickDemand(brick, {
        ...config,
        bricks: {
            ...(config?.bricks || {}),
            completionMode: 'single_click'
        }
    });
};
const hoverToClearAvailableMs = (brick, conveyor, config) => {
    const speed = Math.max(1e-6, finiteOr(conveyor?.speed, finiteOr(brick?.speed, 1)));
    const length = Math.max(0, finiteOr(conveyor?.length, 0));
    const x = Math.max(0, finiteOr(brick?.x, 0));
    const width = Math.max(1, finiteOr(brick?.width, 1));
    const rightEdgeDistance = length - (x + width);
    const processRatePxPerSec = Math.max(0, finiteOr(config?.bricks?.completionParams?.hover_process_rate_px_s, speed)) || speed;
    const edgeVelocityPxPerSec = speed - processRatePxPerSec;
    if (rightEdgeDistance <= 0) {
        return 0;
    }
    if (edgeVelocityPxPerSec <= 0) {
        return Number.POSITIVE_INFINITY;
    }
    return (rightEdgeDistance / edgeVelocityPxPerSec) * 1000;
};
const brickSupplyEstimate = (brick, conveyor, config) => {
    const speed = Math.max(1e-6, finiteOr(conveyor?.speed, finiteOr(brick?.speed, 1)));
    const length = Math.max(0, finiteOr(conveyor?.length, 0));
    const x = Math.max(0, finiteOr(brick?.x, 0));
    const width = Math.max(1, finiteOr(brick?.width, 1));
    const remainingDistancePx = Math.max(0, length - (x + width));
    const completionMode = config?.bricks?.completionMode;
    const availableMs = completionMode === 'hover_to_clear'
        ? hoverToClearAvailableMs(brick, conveyor, config)
        : (remainingDistancePx / speed) * 1000;
    return {
        speed_px_per_sec: speed,
        conveyor_length_px: length,
        start_x_px: x,
        remaining_distance_px: remainingDistancePx,
        available_ms: availableMs
    };
};
export const estimateTrialDifficulty = (gameState, config) => {
    const bricks = Array.from(gameState?.bricks?.values?.() || []);
    const conveyorById = new Map((gameState?.conveyors || []).map((c) => [c.id, c]));
    const perBrick = bricks.map((brick) => {
        const conveyor = conveyorById.get(brick.conveyorId);
        const demand = brickDemandEstimate(brick, conveyor, config);
        const supply = brickSupplyEstimate(brick, conveyor, config);
        const localLoad = demand.expected_clear_ms / Math.max(1e-6, supply.available_ms);
        return {
            brick_id: brick.id,
            conveyor_id: brick.conveyorId,
            ...demand,
            ...supply,
            local_load_ratio: localLoad,
            local_load_pct: localLoad * 100
        };
    });
    const byEarliestDeadline = perBrick
        .slice()
        .sort((a, b) => a.available_ms - b.available_ms);
    let cumulativeDemand = 0;
    let peakCumulativeLoad = 0;
    byEarliestDeadline.forEach((row) => {
        cumulativeDemand += row.expected_clear_ms;
        const denominator = Math.max(1e-6, row.available_ms);
        const load = cumulativeDemand / denominator;
        peakCumulativeLoad = Math.max(peakCumulativeLoad, load);
    });
    const feasibilityRatio = peakCumulativeLoad > 0 ? (1 / peakCumulativeLoad) : 0;
    return {
        model: {
            completion_mode: config?.bricks?.completionMode,
            interpretation: 'trial_feasibility_pct > 100 means expected slack; < 100 means expected overload.'
        },
        trial_feasibility_ratio: feasibilityRatio,
        trial_feasibility_pct: feasibilityRatio * 100,
        trial_load_ratio: peakCumulativeLoad,
        trial_load_pct: peakCumulativeLoad * 100
    };
};
//# sourceMappingURL=difficulty_estimator.js.map