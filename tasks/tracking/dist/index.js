import { TrackingBinSummarizer, TrackingMotionController, asArray, asObject, asString, coerceScopedDrtConfig, computeTrackingDistance, createMulberry32, createManipulationOverrideMap, createManipulationPoolAllocator, resolveBlockManipulationIds, applyManipulationOverridesToBlock, hashSeed, normalizeKey, buildTaskInstructionConfig, applyTaskInstructionConfig, resolveScopedModuleConfig, TaskOrchestrator, runTrialWithEnvelope, sleep, toNonNegativeNumber, toPositiveNumber, toStringScreens, createTaskAdapter, } from "@experiments/core";
import { createTrackingRenderer } from "./renderer";
export const trackingAdapter = createTaskAdapter({
    manifest: {
        taskId: "tracking",
        label: "Tracking",
        variants: [
            { id: "default", label: "Tracking Default", configPath: "tracking/default" },
            { id: "drt_demo", label: "Tracking DRT Demo", configPath: "tracking/drt_demo" },
            { id: "mot_demo", label: "Tracking MOT Demo", configPath: "tracking/mot_demo" },
        ],
    },
    run: (context) => runTrackingTask(context),
    terminate: async () => { },
});
async function runTrackingTask(context) {
    const runner = context.moduleRunner;
    const parsed = parseTrackingConfig(context.taskConfig, context.selection);
    const participantId = context.selection.participant.participantId;
    const variantId = context.selection.variantId;
    const eventLogger = context.eventLogger;
    const seed = hashSeed(participantId, context.selection.participant.sessionId, variantId, "tracking");
    const rng = createMulberry32(seed);
    const root = context.container;
    root.style.fontFamily = "system-ui";
    const stageShell = document.createElement("div");
    stageShell.style.display = "flex";
    stageShell.style.justifyContent = "center";
    stageShell.style.alignItems = "center";
    stageShell.style.width = `${parsed.display.aperturePx + 8}px`;
    stageShell.style.height = `${parsed.display.aperturePx + 8}px`;
    const resolveTrackingDisplayFrameRect = () => {
        const frame = stageShell.firstElementChild;
        if (!(frame instanceof HTMLElement))
            return null;
        const rect = frame.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0)
            return null;
        return rect;
    };
    root.innerHTML = "";
    root.appendChild(stageShell);
    const trialRecords = [];
    const trialBins = [];
    const rawSamples = [];
    runner.setOptions({
        onEvent: (event) => {
            const address = event.address;
            eventLogger.emit("tracking_drt", event, {
                blockIndex: address?.blockIndex ?? -1,
                ...(address?.trialIndex == null ? {} : { trialIndex: address.trialIndex }),
            });
        }
    });
    const orchestrator = new TaskOrchestrator(context);
    applyTaskInstructionConfig(context.taskConfig, parsed.instructions);
    return await orchestrator.run({
        buttonIdPrefix: "tracking-continue",
        stimulusExport: {
            rows: buildTrackingStimulusRows(parsed),
            suffix: "tracking_stimulus_list",
        },
        getBlocks: () => parsed.blocks.map((block) => ({
            ...block,
            modules: {
                drt: block.drt,
            },
        })),
        resolveModuleContext: () => ({
            displayElement: stageShell,
            borderTargetElement: stageShell,
            borderTargetRect: resolveTrackingDisplayFrameRect,
        }),
        getTrials: ({ block }) => Array.from({ length: block.trials }, (_, trialIndex) => trialIndex),
        runTrial: async ({ block, blockIndex, trial, trialIndex }) => runTrialWithEnvelope({
            context: { block, blockIndex, trial, trialIndex },
            before: ({ block, blockIndex, trialIndex }) => {
                eventLogger.emit("trial_start", { label: block.label, phase: block.phase, mode: block.trialTemplate.mode }, { blockIndex, trialIndex });
            },
            execute: ({ block, blockIndex, trialIndex }) => block.trialTemplate.mode === "mot"
                ? runMotTrial({
                    blockIndex,
                    trialIndex,
                    blockLabel: block.label,
                    stageHost: stageShell,
                    display: parsed.display,
                    trialTemplate: block.trialTemplate,
                    rng,
                })
                : runPursuitTrial({
                    blockIndex,
                    trialIndex,
                    blockLabel: block.label,
                    stageHost: stageShell,
                    display: parsed.display,
                    trialTemplate: block.trialTemplate,
                    rng,
                }),
            after: async ({ block, blockIndex, trialIndex }, result) => {
                if (result.kind === "pursuit") {
                    trialRecords.push({
                        participantId,
                        variantId,
                        blockIndex,
                        blockLabel: block.label,
                        manipulationId: block.manipulationId,
                        trialIndex,
                        phase: block.phase,
                        trialMode: "pursuit",
                        durationMs: result.elapsedMs,
                        sampleCount: result.sampleCount,
                        insideCount: result.insideCount,
                        outsideCount: result.outsideCount,
                        distanceSampleCount: result.distanceSampleCount,
                        meanBoundaryDistancePx: result.meanBoundaryDistancePx,
                        targetShape: block.trialTemplate.target.shape,
                        targetSizePx: block.trialTemplate.target.sizePx,
                        motionMode: block.trialTemplate.motion.mode,
                        motionSpeedPxPerSec: Number(block.trialTemplate.motion.speedPxPerSec),
                        motObjectCount: null,
                        motTargetCount: null,
                        motHits: null,
                        motMisses: null,
                        motFalseAlarms: null,
                        motCorrectRejections: null,
                        motAccuracy: null,
                        motTargetIndices: null,
                        motSelectedIndices: null,
                    });
                    trialBins.push(...result.bins);
                    if (block.trialTemplate.storeRawSamples) {
                        rawSamples.push(...result.rawSamples);
                    }
                }
                else {
                    trialRecords.push({
                        participantId,
                        variantId,
                        blockIndex,
                        blockLabel: block.label,
                        manipulationId: block.manipulationId,
                        trialIndex,
                        phase: block.phase,
                        trialMode: "mot",
                        durationMs: result.elapsedMs,
                        sampleCount: null,
                        insideCount: null,
                        outsideCount: null,
                        distanceSampleCount: null,
                        meanBoundaryDistancePx: null,
                        targetShape: null,
                        targetSizePx: null,
                        motionMode: block.trialTemplate.motion.mode,
                        motionSpeedPxPerSec: Number(block.trialTemplate.motion.speedPxPerSec),
                        motObjectCount: result.objectCount,
                        motTargetCount: result.targetCount,
                        motHits: result.hits,
                        motMisses: result.misses,
                        motFalseAlarms: result.falseAlarms,
                        motCorrectRejections: result.correctRejections,
                        motAccuracy: result.accuracy,
                        motTargetIndices: JSON.stringify(result.targetIndices),
                        motSelectedIndices: JSON.stringify(result.selectedIndices),
                    });
                }
                eventLogger.emit("trial_end", {
                    durationMs: result.elapsedMs,
                    mode: result.kind,
                    ...(result.kind === "pursuit"
                        ? {
                            sampleCount: result.sampleCount,
                            insideCount: result.insideCount,
                            outsideCount: result.outsideCount,
                            meanBoundaryDistancePx: result.meanBoundaryDistancePx,
                        }
                        : {
                            hits: result.hits,
                            misses: result.misses,
                            falseAlarms: result.falseAlarms,
                            correctRejections: result.correctRejections,
                            accuracy: result.accuracy,
                        }),
                }, { blockIndex, trialIndex });
                if (parsed.interTrialIntervalMs > 0 && trialIndex < block.trials - 1) {
                    await sleep(parsed.interTrialIntervalMs);
                }
            },
        }),
        onTaskStart: () => {
            eventLogger.emit("task_start", { task: "tracking", runner: "native_tracking" });
        },
        onBlockStart: async ({ block, blockIndex }) => {
            root.innerHTML = "";
            root.appendChild(stageShell);
            eventLogger.emit("block_start", { label: block.label, phase: block.phase, trials: block.trials, manipulationId: block.manipulationId }, { blockIndex });
        },
        onBlockEnd: async ({ block, blockIndex }) => {
            eventLogger.emit("block_end", {
                label: block.label,
                phase: block.phase,
                manipulationId: block.manipulationId,
                meanInsideRate: computeBlockInsideRate(trialRecords, blockIndex),
            }, { blockIndex });
            root.innerHTML = "";
            root.appendChild(stageShell);
        },
        onTaskEnd: () => {
            eventLogger.emit("task_complete", { task: "tracking", nTrials: trialRecords.length });
        },
        csvOptions: {
            suffix: "tracking_trials",
            getRecords: () => trialRecords,
        },
        getTaskMetadata: () => ({
            config: parsed,
            records: trialRecords,
            trialBins,
            rawSamples,
            drt: {
                scopeRecords: runner.getResults().map((res) => ({
                    address: res.address ?? { scope: res.scope, blockIndex: res.blockIndex, trialIndex: res.trialIndex },
                    data: res.data,
                    transforms: res.data?.transforms,
                    responseRows: res.data?.responseRows,
                })),
            },
            drtTransformEstimates: eventLogger.events
                .filter((entry) => entry.eventType === "drt_transform_estimate")
                .map((entry) => entry.eventData),
            eventLog: eventLogger.events,
        }),
    });
}
function buildTrackingStimulusRows(parsed) {
    const rows = [];
    parsed.blocks.forEach((block, blockIndex) => {
        for (let trialIndex = 0; trialIndex < block.trials; trialIndex += 1) {
            rows.push({
                block_index: blockIndex,
                block_label: block.label,
                manipulation_id: block.manipulationId,
                trial_index: trialIndex,
                phase: block.phase,
                trial_mode: block.trialTemplate.mode,
                trial_code: block.trialTemplate.mode,
                duration_ms: block.trialTemplate.durationMs,
                sample_interval_ms: block.trialTemplate.sampleIntervalMs,
                bin_ms: block.trialTemplate.binMs,
                motion_mode: block.trialTemplate.motion.mode,
                motion_speed_px_per_sec: Number(block.trialTemplate.motion.speedPxPerSec),
                target_shape: block.trialTemplate.target.shape,
                target_size_px: block.trialTemplate.target.sizePx,
                mot_object_count: block.trialTemplate.mot.objectCount,
                mot_target_count: block.trialTemplate.mot.targetCount,
            });
        }
    });
    return rows;
}
async function runPursuitTrial(args) {
    args.stageHost.innerHTML = "";
    const frame = createDisplayFrame(args.stageHost, args.display);
    const renderer = await createTrackingRenderer(frame, {
        backend: args.display.rendererBackend,
        width: args.display.aperturePx,
        height: args.display.aperturePx,
        backgroundColor: args.display.canvasBackground,
        showCrosshair: args.display.showCrosshair,
    });
    renderer.setCursorStyle("crosshair");
    const halfTarget = Math.max(1, args.trialTemplate.target.sizePx / 2);
    const motion = new TrackingMotionController({
        config: args.trialTemplate.motion,
        rng: { next: args.rng },
        bounds: {
            widthPx: args.display.aperturePx,
            heightPx: args.display.aperturePx,
            marginPx: halfTarget,
        },
    });
    const rawSamples = [];
    const binner = new TrackingBinSummarizer({ binMs: args.trialTemplate.binMs, includeEmptyBins: true });
    let sampleCount = 0;
    let insideCount = 0;
    let outsideCount = 0;
    let distanceSampleCount = 0;
    let distanceSum = 0;
    const startMs = performance.now();
    let previousMs = startMs;
    let lastSampleElapsed = -Infinity;
    await new Promise((resolve) => {
        let rafId = null;
        const tick = (now) => {
            const elapsed = now - startMs;
            const dtMs = now - previousMs;
            previousMs = now;
            const state = motion.step(dtMs);
            const target = toTargetGeometry(args.trialTemplate.target.shape, state.x, state.y, args.trialTemplate.target.sizePx);
            const insideAndDistance = computeSampleDistance(renderer.pointer, target);
            const inside = insideAndDistance.inside;
            const boundaryDistancePx = insideAndDistance.boundaryDistancePx;
            if (elapsed - lastSampleElapsed >= args.trialTemplate.sampleIntervalMs) {
                sampleCount += 1;
                if (inside)
                    insideCount += 1;
                else
                    outsideCount += 1;
                if (Number.isFinite(boundaryDistancePx)) {
                    distanceSampleCount += 1;
                    distanceSum += Number(boundaryDistancePx);
                }
                const timeMs = Math.max(0, Math.round(elapsed));
                binner.add({
                    timeMs,
                    inside,
                    boundaryDistancePx: Number.isFinite(boundaryDistancePx) ? Number(boundaryDistancePx) : null,
                });
                if (args.trialTemplate.storeRawSamples) {
                    rawSamples.push({
                        blockIndex: args.blockIndex,
                        trialIndex: args.trialIndex,
                        timeMs,
                        cursorX: Number.isFinite(renderer.pointer.x) ? Number(renderer.pointer.x) : null,
                        cursorY: Number.isFinite(renderer.pointer.y) ? Number(renderer.pointer.y) : null,
                        targetX: state.x,
                        targetY: state.y,
                        inside,
                        boundaryDistancePx: Number.isFinite(boundaryDistancePx) ? Number(boundaryDistancePx) : null,
                    });
                }
                lastSampleElapsed = elapsed;
            }
            renderer.renderPursuit({
                target,
                fillColor: inside ? args.trialTemplate.target.colorOn : args.trialTemplate.target.colorOff,
                strokeColor: args.trialTemplate.target.borderColor,
                strokeWidthPx: args.trialTemplate.target.borderWidthPx,
            });
            if (elapsed >= args.trialTemplate.durationMs) {
                if (rafId != null)
                    cancelAnimationFrame(rafId);
                resolve();
                return;
            }
            rafId = requestAnimationFrame(tick);
        };
        rafId = requestAnimationFrame(tick);
    });
    renderer.destroy();
    const elapsedMs = args.trialTemplate.durationMs;
    const bins = binner.export(elapsedMs).map((bin) => ({
        blockIndex: args.blockIndex,
        blockLabel: args.blockLabel,
        trialIndex: args.trialIndex,
        ...bin,
    }));
    return {
        kind: "pursuit",
        elapsedMs,
        sampleCount,
        insideCount,
        outsideCount,
        distanceSampleCount,
        meanBoundaryDistancePx: distanceSampleCount > 0 ? distanceSum / distanceSampleCount : null,
        bins,
        rawSamples,
    };
}
async function runMotTrial(args) {
    args.stageHost.innerHTML = "";
    const frame = createDisplayFrame(args.stageHost, args.display);
    const renderer = await createTrackingRenderer(frame, {
        backend: args.display.rendererBackend,
        width: args.display.aperturePx,
        height: args.display.aperturePx,
        backgroundColor: args.display.canvasBackground,
        showCrosshair: args.display.showCrosshair,
    });
    const mot = args.trialTemplate.mot;
    const objectCount = Math.max(2, Math.round(mot.objectCount));
    const targetCount = Math.max(1, Math.min(objectCount - 1, Math.round(mot.targetCount)));
    const radiusPx = Math.max(3, mot.objectRadiusPx);
    const initialPoints = sampleInitialPoints({
        widthPx: args.display.aperturePx,
        heightPx: args.display.aperturePx,
        radiusPx,
        count: objectCount,
        rng: args.rng,
    });
    const targetIndices = sampleUniqueIndices(objectCount, targetCount, args.rng).sort((a, b) => a - b);
    const targetSet = new Set(targetIndices);
    const controllers = initialPoints.map((point) => new TrackingMotionController({
        config: args.trialTemplate.motion,
        rng: { next: args.rng },
        bounds: {
            widthPx: args.display.aperturePx,
            heightPx: args.display.aperturePx,
            marginPx: radiusPx,
        },
        initial: {
            x: point.x,
            y: point.y,
        },
    }));
    const selected = new Set();
    const cueDurationMs = Math.max(0, mot.cueDurationMs);
    const trackingDurationMs = Math.max(250, args.trialTemplate.durationMs);
    const responseMaxMs = Math.max(0, mot.responseMaxDurationMs);
    const finishKey = normalizeKey(mot.responseFinishKey);
    let phase = cueDurationMs > 0 ? "cue" : "tracking";
    let responseStartedAtMs = 0;
    let responseComplete = false;
    renderer.setCursorStyle("none");
    const onKeyDown = (event) => {
        if (phase !== "response")
            return;
        if (normalizeKey(event.key) === finishKey) {
            responseComplete = true;
        }
    };
    window.addEventListener("keydown", onKeyDown);
    const startMs = performance.now();
    let previousMs = startMs;
    await new Promise((resolve) => {
        let rafId = null;
        const tick = (now) => {
            const elapsedMs = now - startMs;
            const dtMs = now - previousMs;
            previousMs = now;
            if (phase !== "response") {
                for (const controller of controllers) {
                    controller.step(dtMs);
                }
            }
            if (phase === "cue" && elapsedMs >= cueDurationMs) {
                phase = "tracking";
            }
            if (phase === "tracking" && elapsedMs >= cueDurationMs + trackingDurationMs) {
                phase = "response";
                responseStartedAtMs = elapsedMs;
                renderer.setCursorStyle("crosshair");
            }
            if (phase === "response") {
                const clicks = renderer.consumeClicks();
                for (const click of clicks) {
                    const clickedIndex = findClickedDotIndex(click.x, click.y, controllers, radiusPx);
                    if (clickedIndex == null)
                        continue;
                    if (selected.has(clickedIndex))
                        selected.delete(clickedIndex);
                    else
                        selected.add(clickedIndex);
                }
            }
            const dots = controllers.map((controller, index) => {
                const state = controller.getState();
                const isTarget = targetSet.has(index);
                const isSelected = selected.has(index);
                let fillColor = mot.trackingColor;
                if (phase === "cue") {
                    fillColor = isTarget ? mot.cueTargetColor : mot.cueDistractorColor;
                }
                else if (phase === "response") {
                    fillColor = isSelected ? mot.responseSelectedColor : mot.responseUnselectedColor;
                }
                return {
                    x: state.x,
                    y: state.y,
                    radiusPx,
                    fillColor,
                    strokeColor: mot.objectBorderColor,
                    strokeWidthPx: mot.objectBorderWidthPx,
                };
            });
            renderer.renderMot({
                dots,
                promptText: phase === "response" ? mot.responsePromptText : undefined,
                promptColor: "#f8fafc",
                promptFontPx: 22,
            });
            if (phase === "response") {
                const responseElapsed = elapsedMs - responseStartedAtMs;
                if (responseComplete || (responseMaxMs > 0 && responseElapsed >= responseMaxMs)) {
                    if (rafId != null)
                        cancelAnimationFrame(rafId);
                    resolve();
                    return;
                }
            }
            rafId = requestAnimationFrame(tick);
        };
        rafId = requestAnimationFrame(tick);
    });
    window.removeEventListener("keydown", onKeyDown);
    renderer.destroy();
    const selectedIndices = Array.from(selected).sort((a, b) => a - b);
    let hits = 0;
    let falseAlarms = 0;
    for (const index of selectedIndices) {
        if (targetSet.has(index))
            hits += 1;
        else
            falseAlarms += 1;
    }
    const misses = targetCount - hits;
    const distractorCount = objectCount - targetCount;
    const correctRejections = Math.max(0, distractorCount - falseAlarms);
    const accuracy = objectCount > 0 ? (hits + correctRejections) / objectCount : 0;
    return {
        kind: "mot",
        elapsedMs: Math.max(0, Math.round(performance.now() - startMs)),
        hits,
        misses,
        falseAlarms,
        correctRejections,
        accuracy,
        objectCount,
        targetCount,
        targetIndices,
        selectedIndices,
    };
}
function createDisplayFrame(host, display) {
    const frame = document.createElement("div");
    frame.style.width = `${display.aperturePx}px`;
    frame.style.height = `${display.aperturePx}px`;
    frame.style.background = display.frameBackground;
    frame.style.border = `2px solid ${display.frameBorder}`;
    frame.style.display = "flex";
    frame.style.alignItems = "center";
    frame.style.justifyContent = "center";
    host.appendChild(frame);
    return frame;
}
function sampleInitialPoints(args) {
    const points = [];
    const minX = args.radiusPx;
    const maxX = args.widthPx - args.radiusPx;
    const minY = args.radiusPx;
    const maxY = args.heightPx - args.radiusPx;
    for (let i = 0; i < args.count; i += 1) {
        let chosen = null;
        for (let attempt = 0; attempt < 100; attempt += 1) {
            const x = minX + args.rng() * Math.max(1, maxX - minX);
            const y = minY + args.rng() * Math.max(1, maxY - minY);
            const tooClose = points.some((p) => Math.hypot(p.x - x, p.y - y) < args.radiusPx * 2.4);
            if (tooClose)
                continue;
            chosen = { x, y };
            break;
        }
        if (!chosen) {
            chosen = {
                x: minX + args.rng() * Math.max(1, maxX - minX),
                y: minY + args.rng() * Math.max(1, maxY - minY),
            };
        }
        points.push(chosen);
    }
    return points;
}
function sampleUniqueIndices(total, count, rng) {
    const indexes = Array.from({ length: total }, (_, index) => index);
    for (let i = indexes.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rng() * (i + 1));
        const tmp = indexes[i];
        indexes[i] = indexes[j];
        indexes[j] = tmp;
    }
    return indexes.slice(0, Math.max(0, Math.min(count, total)));
}
function findClickedDotIndex(x, y, controllers, radiusPx) {
    for (let i = 0; i < controllers.length; i += 1) {
        const state = controllers[i].getState();
        if (Math.hypot(state.x - x, state.y - y) <= radiusPx) {
            return i;
        }
    }
    return null;
}
function toTargetGeometry(shape, centerX, centerY, sizePx) {
    if (shape === "square") {
        return { shape: "square", centerX, centerY, sizePx };
    }
    return { shape: "circle", centerX, centerY, radiusPx: sizePx / 2 };
}
function computeSampleDistance(pointer, target) {
    const x = Number(pointer.x);
    const y = Number(pointer.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return { inside: false, boundaryDistancePx: null };
    }
    const result = computeTrackingDistance({ x, y }, target);
    return { inside: result.inside, boundaryDistancePx: result.boundaryDistancePx };
}
function parseTrackingConfig(taskConfig, selection) {
    const taskRaw = asObject(taskConfig.task) ?? {};
    const title = asString(taskRaw.title) ?? "Continuous Tracking";
    const instructionsRaw = asObject(taskConfig.instructions) ?? {};
    const instructionConfig = buildTaskInstructionConfig({
        title,
        instructions: instructionsRaw,
        defaults: {
            intro: [
                "Track the moving target continuously with your mouse cursor.",
                "Performance is computed from continuous samples in 2-second bins (inside vs outside, plus boundary distance).",
            ],
        },
        blockIntroTemplateDefault: "Block with {nTrials} tracking trials. Phase: {phase}.",
    });
    const displayRaw = asObject(taskConfig.display) ?? {};
    const display = {
        aperturePx: toPositiveNumber(displayRaw.aperturePx, 500),
        frameBackground: asString(displayRaw.frameBackground) ?? "#0f172a",
        frameBorder: asString(displayRaw.frameBorder) ?? "#334155",
        canvasBackground: asString(displayRaw.canvasBackground) ?? "#e2e8f0",
        showCrosshair: displayRaw.showCrosshair !== false,
        rendererBackend: (asString(displayRaw.rendererBackend) ?? "canvas") === "pixi" ? "pixi" : "canvas",
    };
    const trialDefaultsRaw = asObject(taskConfig.trialDefaults) ?? {};
    const motionDefaultsRaw = asObject(trialDefaultsRaw.motion) ?? {};
    const targetDefaultsRaw = asObject(trialDefaultsRaw.target) ?? {};
    const motDefaultsRaw = asObject(trialDefaultsRaw.mot) ?? {};
    const drtTaskRaw = resolveScopedModuleConfig(taskRaw, "drt") ?? resolveScopedModuleConfig(taskConfig, "drt");
    const drtDefault = resolveTrackingDrtConfig({
        enabled: false,
        scope: "block",
        key: "space",
        responseWindowMs: 2500,
        displayDurationMs: 1000,
        responseTerminatesStimulus: true,
        isiSampler: { type: "uniform", min: 3000, max: 5000 },
        transformPersistence: "scope",
    }, drtTaskRaw);
    const planRaw = asObject(taskConfig.plan) ?? {};
    const planManipulations = createManipulationOverrideMap(planRaw.manipulations);
    const planPoolAllocator = createManipulationPoolAllocator(planRaw.manipulationPools, [
        selection.participant.participantId,
        selection.participant.sessionId,
        selection.variantId,
        "tracking_plan_manipulation_pools",
    ]);
    const blocksRaw = asArray(planRaw.blocks);
    const blocks = (blocksRaw.length > 0 ? blocksRaw : [{}]).map((entry, index) => {
        const manipulationIds = resolveBlockManipulationIds(entry, planPoolAllocator);
        const mergedEntry = applyManipulationOverridesToBlock(entry, manipulationIds, planManipulations, `Invalid Tracking plan: block ${index + 1}`);
        const raw = asObject(mergedEntry) ?? {};
        const motionRaw = asObject(raw.motion) ?? motionDefaultsRaw;
        const targetRaw = asObject(raw.target) ?? targetDefaultsRaw;
        const motRaw = asObject(raw.mot) ?? motDefaultsRaw;
        const mode = resolveTrialMode(raw.mode ?? trialDefaultsRaw.mode);
        const trialTemplate = {
            mode,
            durationMs: toPositiveNumber(raw.trialDurationMs ?? trialDefaultsRaw.durationMs, 30000),
            sampleIntervalMs: toPositiveNumber(raw.sampleIntervalMs ?? trialDefaultsRaw.sampleIntervalMs, 16),
            binMs: toPositiveNumber(raw.binMs ?? trialDefaultsRaw.binMs, 2000),
            storeRawSamples: raw.storeRawSamples === true || trialDefaultsRaw.storeRawSamples === true,
            motion: resolveMotionConfig(motionRaw),
            target: {
                shape: (asString(targetRaw.shape) ?? "circle") === "square" ? "square" : "circle",
                sizePx: toPositiveNumber(targetRaw.sizePx, 56),
                colorOn: asString(targetRaw.colorOn) ?? "#16a34a",
                colorOff: asString(targetRaw.colorOff) ?? "#dc2626",
                borderColor: asString(targetRaw.borderColor) ?? "#0f172a",
                borderWidthPx: toPositiveNumber(targetRaw.borderWidthPx, 2),
            },
            mot: {
                objectCount: toPositiveNumber(motRaw.objectCount, 10),
                targetCount: toPositiveNumber(motRaw.targetCount, 3),
                objectRadiusPx: toPositiveNumber(motRaw.objectRadiusPx, 14),
                cueDurationMs: toNonNegativeNumber(motRaw.cueDurationMs, 2000),
                responseMaxDurationMs: toNonNegativeNumber(motRaw.responseMaxDurationMs, 0),
                responseFinishKey: normalizeKey(asString(motRaw.responseFinishKey) ?? "space"),
                cueTargetColor: asString(motRaw.cueTargetColor) ?? "#ef4444",
                cueDistractorColor: asString(motRaw.cueDistractorColor) ?? "#3b82f6",
                trackingColor: asString(motRaw.trackingColor) ?? "#3b82f6",
                responseSelectedColor: asString(motRaw.responseSelectedColor) ?? "#f8fafc",
                responseUnselectedColor: asString(motRaw.responseUnselectedColor) ?? "#3b82f6",
                objectBorderColor: asString(motRaw.objectBorderColor) ?? "#0f172a",
                objectBorderWidthPx: toPositiveNumber(motRaw.objectBorderWidthPx, 2),
                responsePromptText: asString(motRaw.responsePromptText)
                    ?? "Select targets, then press SPACE to confirm.",
            },
        };
        return {
            label: asString(raw.label) ?? `Block ${index + 1}`,
            phase: asString(raw.phase) ?? "main",
            trials: toPositiveNumber(raw.trials, 8),
            manipulationId: manipulationIds.length > 0 ? manipulationIds.join("+") : null,
            beforeBlockScreens: toStringScreens(raw.beforeBlockScreens ?? raw.preBlockInstructions),
            afterBlockScreens: toStringScreens(raw.afterBlockScreens ?? raw.postBlockInstructions),
            trialTemplate,
            drt: resolveTrackingDrtConfig(drtDefault, resolveScopedModuleConfig(raw, "drt")),
        };
    });
    return {
        title,
        instructions: instructionConfig,
        display,
        interTrialIntervalMs: toNonNegativeNumber(taskConfig.interTrialIntervalMs, 300),
        blocks,
    };
}
function resolveTrialMode(value) {
    return (asString(value) ?? "pursuit") === "mot" ? "mot" : "pursuit";
}
function resolveMotionConfig(raw) {
    const mode = asString(raw.mode) === "chaotic" ? "chaotic" : "waypoint";
    if (mode === "chaotic") {
        return {
            mode,
            speedPxPerSec: toFinitePositive(raw.speedPxPerSec, 180),
            directionJitterRadPerSec: toFinitePositive(raw.directionJitterRadPerSec, 2),
        };
    }
    return {
        mode,
        speedPxPerSec: toFinitePositive(raw.speedPxPerSec, 220),
        minSegmentPx: toFinitePositive(raw.minSegmentPx, 100),
        arriveThresholdPx: toFinitePositive(raw.arriveThresholdPx, 2),
    };
}
function resolveTrackingDrtConfig(base, overrideRaw) {
    return coerceScopedDrtConfig(base, overrideRaw);
}
function computeBlockInsideRate(records, blockIndex) {
    const rows = records.filter((entry) => entry.blockIndex === blockIndex && entry.trialMode === "pursuit");
    if (rows.length === 0)
        return 0;
    const totals = rows.reduce((acc, row) => {
        acc.inside += row.insideCount ?? 0;
        acc.total += row.sampleCount ?? 0;
        return acc;
    }, { inside: 0, total: 0 });
    if (totals.total <= 0)
        return 0;
    return totals.inside / totals.total;
}
function toFinitePositive(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : fallback;
}
//# sourceMappingURL=index.js.map