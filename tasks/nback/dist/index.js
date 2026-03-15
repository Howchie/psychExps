import { SeededRandom, createEventLogger, drawTrialFeedbackOnCanvas, evaluateTrialOutcome, hashSeed, normalizeKey, computeCanvasFrameLayout, drawCanvasFramedScene, drawCanvasCenteredText, ensureJsPsychCanvasCentered, TaskEnvironmentGuard, resolveJsPsychContentHost, resolveTrialFeedbackView, runJsPsychTimeline, setCursorHidden, computeAccuracy, shouldHideCursorForPhase, toJsPsychChoices, createResponseSemantics, computeRtPhaseDurations, resolveRtTaskConfig, mergeRtTaskConfig, coerceCsvStimulusConfig, coercePoolDrawConfig, collectPoolCandidates, createPoolDrawer, loadCategorizedStimulusPools, loadImageIfLikelyVisualStimulus, resolveAssetPath, createManipulationOverrideMap, createManipulationPoolAllocator, resolveBlockManipulationIds, applyManipulationOverridesToBlock, coerceScopedDrtConfig, createInstructionRenderer, buildTaskInstructionConfig, applyTaskInstructionConfig, maybeExportStimulusRows, resolveScopedModuleConfig, asObject, asArray, asString, asStringArray, asPositiveNumberArray, toStringScreens, toPositiveNumber, toNonNegativeNumber, parseTrialFeedbackConfig, TaskOrchestrator, createTaskAdapter, } from "@experiments/core";
import { initJsPsych } from "jspsych";
import CanvasKeyboardResponsePlugin from "@jspsych/plugin-canvas-keyboard-response";
let nbackContext = null;
let nbackRuntime = null;
const nbackEnvironment = new TaskEnvironmentGuard();
let nbackRootPresentationState = null;
async function runNbackTask(context) {
    const runtime = nbackRuntime;
    if (!runtime) {
        throw new Error("NBack runtime not initialized");
    }
    const stimulusExport = await exportNbackStimulusList(context, runtime);
    if (stimulusExport)
        return stimulusExport;
    const { parsed, eventLogger } = runtime;
    applyTaskInstructionConfig(context.taskConfig, {
        ...parsed.instructions,
        blockSummary: {
            enabled: true,
            metrics: { correctField: "responseCorrect" },
        },
    });
    const root = context.container;
    let jsPsych = null;
    const orchestrator = new TaskOrchestrator(context);
    return orchestrator.run({
        buttonIdPrefix: "nback",
        resolveUiContainer: () => resolveJsPsychContentHost(root),
        getBlocks: () => runtime.plan.map((block) => ({
            ...block,
            modules: {
                drt: block.drt,
            },
        })),
        getTrials: ({ block }) => block.trials,
        csvOptions: {
            suffix: "nback_trials",
        },
        renderInstruction: createInstructionRenderer({
            showBlockLabel: true,
            summarySectionPattern: /^blockEnd(Before|After)Post_/,
        }),
        getTaskMetadata: () => ({
            jsPsychData: jsPsych?.data.get().values() ?? [],
        }),
        getEvents: () => eventLogger.events,
        onTaskStart: () => {
            nbackEnvironment.installKeyScrollBlocker(parsed.allowedKeys);
            nbackEnvironment.installPageScrollLock();
            nbackRootPresentationState = applyNbackRootPresentation(root);
            jsPsych = initJsPsych({
                display_element: root,
                on_trial_start: (trial) => {
                    window.scrollTo(0, 0);
                    root.scrollTop = 0;
                    const data = asObject(trial?.data);
                    setCursorHidden(shouldHideCursorForPhase(data?.phase));
                },
                on_finish: () => {
                    setCursorHidden(false);
                },
            });
            eventLogger.emit("task_start", { task: "nback", runner: "jspsych" });
        },
        onBlockStart: (ctx) => {
            primeUpcomingBlockStimuli(parsed, ctx.block, 0, runtime.variableResolver, 10);
            eventLogger.emit("block_start", { label: ctx.block.label, nLevel: ctx.block.nLevel }, { blockIndex: ctx.blockIndex });
        },
        runTrial: async (ctx) => {
            if (!jsPsych)
                throw new Error("jsPsych not initialized");
            const { block, trial } = ctx;
            const timeline = [];
            primeUpcomingBlockStimuli(parsed, block, trial.trialIndex + 1, runtime.variableResolver, 10);
            const resolvedStimulus = resolveStimulusPath(parsed, block, trial.item, trial.trialIndex, runtime.variableResolver);
            const preloaded = await preloadNbackStimulus(resolvedStimulus);
            const timelineCapture = appendJsPsychNbackTrial({
                timeline,
                parsed,
                block,
                trial,
                resolvedStimulus,
                runtime,
                preloaded,
                eventLogger,
            });
            await runJsPsychTimeline(jsPsych, timeline);
            const trialData = readNbackTrialResponseRow(timelineCapture, block.blockIndex, trial.trialIndex);
            const records = collectNbackRecords([trialData], runtime.participantId, runtime.variantId);
            return records[0];
        },
        onBlockEnd: (ctx) => {
            const blockCorrect = ctx.trialResults.reduce((acc, row) => acc + (row?.responseCorrect ?? 0), 0);
            const blockResponded = ctx.trialResults.reduce((acc, row) => acc + (row?.responseKey ? 1 : 0), 0);
            const accuracy = computeAccuracy(blockCorrect, ctx.trialResults.length);
            eventLogger.emit("block_end", { label: ctx.block.label, nLevel: ctx.block.nLevel, accuracy, responded: blockResponded }, { blockIndex: ctx.blockIndex });
        }
    });
}
export const nbackAdapter = createTaskAdapter({
    manifest: {
        taskId: "nback",
        label: "NBack",
        variants: [
            { id: "default", label: "NBack Default", configPath: "nback/default" },
            { id: "drt_block_demo", label: "NBack DRT Block Demo", configPath: "nback/drt_block_demo" },
            { id: "pm_module_demo", label: "NBack PM Module Demo", configPath: "nback/pm_module_demo" },
            { id: "pm_module_export_demo", label: "NBack PM Module Export Demo", configPath: "nback/pm_module_export_demo" },
            { id: "annikaHons", label: "NBack AnnikaHons", configPath: "nback/annikaHons" },
            { id: "nirvanaExp1", label: "NBack Nirvana Exp1", configPath: "nback/nirvanaExp1" },
            { id: "modern", label: "NBack Modern", configPath: "nback/nirvanaExp1" },
        ],
    },
    initialize: async (context) => {
        nbackContext = context;
        nbackRuntime = await prepareNbackRuntime(context);
    },
    run: runNbackTask,
    terminate: async () => {
        if (nbackContext?.container) {
            restoreNbackRootPresentation(nbackContext.container, nbackRootPresentationState);
            nbackRootPresentationState = null;
        }
        nbackEnvironment.cleanup();
        nbackRuntime = null;
        nbackContext = null;
    },
});
async function exportNbackStimulusList(context, runtime) {
    const exportBlockType = (block) => {
        if (block.isPractice)
            return "practice";
        const hasPmTrials = block.trials.some((trial) => trial.trialType === "PM");
        return hasPmTrials ? "pm" : "control";
    };
    const rows = runtime.plan.flatMap((block) => block.trials.map((trial) => ({
        block_label: block.label,
        block_index: block.blockIndex,
        block_phase: block.isPractice ? "practice" : "main",
        block_type: exportBlockType(block),
        n_level: block.nLevel,
        trial_index: trial.trialIndex,
        trial_type: trial.trialType,
        trial_code: trial.trialType.startsWith("L") ? `lure_${trial.trialType.substring(1)}` : trial.trialType,
        item: trial.item,
        source_category: trial.sourceCategory,
        correct_response: trial.correctResponse,
    })));
    return maybeExportStimulusRows({
        context,
        rows,
        suffix: "nback_stimulus_list",
    });
}
function parseOptionalResponseKey(value) {
    const parsed = asString(value);
    if (!parsed)
        return null;
    const normalized = normalizeKey(parsed);
    if (!normalized)
        return null;
    if (normalized === "none" || normalized === "null" || normalized === "no_response" || normalized === "withhold") {
        return null;
    }
    return normalized;
}
function resolveNbackDrtConfig(base, overrideRaw) {
    return coerceScopedDrtConfig(base, overrideRaw);
}
const NBACK_IMAGE_CACHE = new Map();
async function prepareNbackRuntime(context) {
    const config = context.taskConfig;
    const resolvedInlinePools = asObject(context.resolver.resolveInValue(config.stimuli));
    const stimuliByCategory = await loadCategorizedStimulusPools({
        inlinePools: coerceInlinePools(resolvedInlinePools),
        csvConfig: coerceCsvStimulusConfig(asObject(context.resolver.resolveInValue(config.stimuliCsv))),
        resolver: context.resolver,
    });
    const parsed = parseNbackConfig(config, context.selection, context.resolver, stimuliByCategory, context.moduleRunner, context.rawTaskConfig);
    const rng = new SeededRandom(hashSeed(context.selection.participant.participantId, context.selection.participant.sessionId, context.selection.variantId));
    let moduleConfigs = asObject(asObject(context.rawTaskConfig.task)?.modules) ?? {};
    const mappingRaw = asObject(context.rawTaskConfig.mapping);
    if (asString(asObject(context.rawTaskConfig.task)?.implementation) === "jspsych_pm" && !moduleConfigs.pm) {
        moduleConfigs = {
            ...moduleConfigs,
            pm: {
                enabled: true,
                key: asString(mappingRaw?.pmKey) || "space",
            },
        };
    }
    let plan = buildExperimentPlan(parsed, rng, context.moduleRunner, moduleConfigs, context.resolver);
    const eventLogger = createEventLogger(context.selection);
    return {
        parsed,
        plan,
        variableResolver: context.resolver,
        moduleRunner: context.moduleRunner,
        moduleConfigs,
        eventLogger,
        participantId: context.selection.participant.participantId,
        variantId: context.selection.variantId,
    };
}
function appendJsPsychNbackTrial(args) {
    const { timeline, parsed, block, trial, resolvedStimulus, runtime, preloaded, eventLogger } = args;
    const { timing } = parsed;
    const layout = computeCanvasFrameLayout({
        aperturePx: parsed.display.aperturePx,
        paddingYPx: parsed.display.paddingYPx,
        cueHeightPx: parsed.display.cueHeightPx,
        cueMarginBottomPx: parsed.display.cueMarginBottomPx,
    });
    const jsPsychAllowedKeys = toJsPsychChoices(resolveAllowedKeysForNback(parsed.responseSemantics, block));
    const rtTiming = block.rtTask.enabled
        ? block.rtTask.timing
        : {
            trialDurationMs: timing.trialDurationMs,
            fixationOnsetMs: 0,
            fixationDurationMs: timing.fixationDurationMs,
            stimulusOnsetMs: timing.stimulusOnsetMs,
            stimulusDurationMs: timing.trialDurationMs - timing.stimulusOnsetMs,
            responseWindowStartMs: timing.responseWindowStartMs,
            responseWindowEndMs: timing.responseWindowEndMs,
        };
    const phaseTiming = computeRtPhaseDurations(rtTiming, {
        responseTerminatesTrial: block.rtTask.enabled ? block.rtTask.responseTerminatesTrial : false,
    });
    const preFixationBlankMs = Math.max(0, Math.round(phaseTiming.preFixationBlankMs));
    const fixationMs = Math.max(0, Math.round(phaseTiming.fixationMs));
    const blankMs = Math.max(0, Math.round(phaseTiming.blankMs));
    const preResponseMs = Math.max(0, Math.round(phaseTiming.preResponseStimulusMs));
    const responseMs = Math.max(0, Math.round(phaseTiming.responseMs));
    const responsePreStimBlankMs = Math.max(0, Math.round(phaseTiming.responsePreStimulusBlankMs));
    const responseStimulusMs = Math.max(0, Math.round(phaseTiming.responseStimulusMs));
    const responsePostStimBlankMs = Math.max(0, Math.round(phaseTiming.responsePostStimulusBlankMs));
    const postResponseStimulusMs = Math.max(0, Math.round(phaseTiming.postResponseStimulusMs));
    const postResponseBlankMs = Math.max(0, Math.round(phaseTiming.postResponseBlankMs));
    let feedbackView = null;
    const capture = {
        responseWindowRow: null,
    };
    const baseData = {
        participantId: runtime.participantId,
        variantId: runtime.variantId,
        blockLabel: block.label,
        blockIndex: block.blockIndex,
        blockType: block.blockType,
        nLevel: block.nLevel,
        trialIndex: trial.trialIndex,
        trialType: trial.trialType,
        item: trial.item,
        stimulusPath: resolvedStimulus,
        sourceCategory: trial.sourceCategory,
        itemCategory: trial.itemCategory,
        correctResponse: trial.correctResponse,
    };
    if (preFixationBlankMs > 0) {
        timeline.push({
            type: CanvasKeyboardResponsePlugin,
            stimulus: (canvas) => {
                drawNbackPhase(canvas, layout, parsed, preloaded, trial, { showFixation: false, showStimulus: false });
            },
            canvas_size: [layout.totalHeightPx, layout.aperturePx],
            choices: "NO_KEYS",
            response_ends_trial: false,
            trial_duration: preFixationBlankMs,
            data: { ...baseData, phase: "nback_pre_fixation_blank" },
        });
    }
    if (fixationMs > 0) {
        timeline.push({
            type: CanvasKeyboardResponsePlugin,
            stimulus: (canvas) => {
                drawNbackPhase(canvas, layout, parsed, preloaded, trial, { showFixation: true, showStimulus: false });
            },
            canvas_size: [layout.totalHeightPx, layout.aperturePx],
            choices: "NO_KEYS",
            response_ends_trial: false,
            trial_duration: fixationMs,
            data: { ...baseData, phase: "nback_fixation" },
        });
    }
    if (blankMs > 0) {
        timeline.push({
            type: CanvasKeyboardResponsePlugin,
            stimulus: (canvas) => {
                drawNbackPhase(canvas, layout, parsed, preloaded, trial, { showFixation: false, showStimulus: false });
            },
            canvas_size: [layout.totalHeightPx, layout.aperturePx],
            choices: "NO_KEYS",
            response_ends_trial: false,
            trial_duration: blankMs,
            data: { ...baseData, phase: "nback_blank" },
        });
    }
    if (preResponseMs > 0) {
        timeline.push({
            type: CanvasKeyboardResponsePlugin,
            stimulus: (canvas) => {
                drawNbackPhase(canvas, layout, parsed, preloaded, trial, { showFixation: false, showStimulus: true });
            },
            canvas_size: [layout.totalHeightPx, layout.aperturePx],
            choices: "NO_KEYS",
            response_ends_trial: false,
            trial_duration: preResponseMs,
            data: { ...baseData, phase: "nback_stimulus_pre_response" },
        });
    }
    const responseSegments = [];
    if (!block.rtTask.responseTerminatesTrial && block.rtTask.enabled) {
        if (responsePreStimBlankMs > 0) {
            responseSegments.push({ phase: "nback_response_window_pre_stim_blank", durationMs: responsePreStimBlankMs, showStimulus: false, isFinal: false });
        }
        if (responseStimulusMs > 0) {
            responseSegments.push({ phase: "nback_response_window_stimulus", durationMs: responseStimulusMs, showStimulus: true, isFinal: false });
        }
        if (responsePostStimBlankMs > 0) {
            responseSegments.push({ phase: "nback_response_window_post_stim_blank", durationMs: responsePostStimBlankMs, showStimulus: false, isFinal: false });
        }
    }
    if (responseSegments.length === 0) {
        responseSegments.push({ phase: "nback_response_window", durationMs: responseMs, showStimulus: true, isFinal: true });
    }
    else {
        responseSegments[responseSegments.length - 1].phase = "nback_response_window";
        responseSegments[responseSegments.length - 1].isFinal = true;
    }
    let capturedKey = null;
    let capturedRt = null;
    let captured = false;
    for (const segment of responseSegments) {
        timeline.push({
            type: CanvasKeyboardResponsePlugin,
            stimulus: (canvas) => {
                drawNbackPhase(canvas, layout, parsed, preloaded, trial, { showFixation: false, showStimulus: segment.showStimulus });
            },
            canvas_size: [layout.totalHeightPx, layout.aperturePx],
            choices: segment.durationMs > 0 ? jsPsychAllowedKeys : "NO_KEYS",
            response_ends_trial: block.rtTask.responseTerminatesTrial,
            trial_duration: segment.durationMs,
            data: { ...baseData, phase: segment.phase },
            on_finish: (data) => {
                if (!captured) {
                    const key = typeof data.response === "string" ? normalizeKey(data.response) : null;
                    const rt = typeof data.rt === "number" && Number.isFinite(data.rt) ? data.rt : null;
                    if (key || rt != null) {
                        capturedKey = key;
                        capturedRt = rt;
                        captured = true;
                    }
                }
                if (!segment.isFinal)
                    return;
                const evaluated = evaluateNbackOutcome(parsed, block, trial, capturedKey, capturedRt);
                const clockTimeUnixMs = Date.now();
                feedbackView = resolveTrialFeedbackView({
                    feedback: block.feedback,
                    responseCategory: evaluated.responseCategory,
                    correct: evaluated.correct,
                    vars: {
                        item: trial.item,
                        trialType: trial.trialType,
                        blockLabel: block.label,
                        expectedCategory: evaluated.expectedCategory,
                        responseCategory: evaluated.responseCategory,
                    },
                    resolver: runtime.variableResolver,
                    resolverContext: {
                        blockIndex: block.blockIndex,
                        trialIndex: trial.trialIndex,
                    },
                });
                Object.assign(data, {
                    response: capturedKey ?? null,
                    rt: capturedRt,
                    responseKey: capturedKey ?? "",
                    responseRtMs: evaluated.rtMs,
                    responseCorrect: evaluated.correct,
                    responseCategory: evaluated.responseCategory,
                    expectedCategory: evaluated.expectedCategory,
                    clockTime: new Date(clockTimeUnixMs).toISOString(),
                    clockTimeUnixMs,
                });
                capture.responseWindowRow = { ...data };
                eventLogger.emit("trial_complete", {
                    trialType: trial.trialType,
                    correct: evaluated.correct,
                    responded: evaluated.responded,
                    responseKey: capturedKey ?? "",
                    rtMs: evaluated.rtMs,
                    responseCategory: evaluated.responseCategory,
                }, { blockIndex: block.blockIndex, trialIndex: trial.trialIndex });
            },
        });
    }
    if (postResponseStimulusMs > 0) {
        timeline.push({
            type: CanvasKeyboardResponsePlugin,
            stimulus: (canvas) => {
                drawNbackPhase(canvas, layout, parsed, preloaded, trial, { showFixation: false, showStimulus: true });
            },
            canvas_size: [layout.totalHeightPx, layout.aperturePx],
            choices: "NO_KEYS",
            response_ends_trial: false,
            trial_duration: postResponseStimulusMs,
            data: { ...baseData, phase: "nback_post_response" },
        });
    }
    if (postResponseBlankMs > 0) {
        timeline.push({
            type: CanvasKeyboardResponsePlugin,
            stimulus: (canvas) => {
                drawNbackPhase(canvas, layout, parsed, preloaded, trial, { showFixation: false, showStimulus: false });
            },
            canvas_size: [layout.totalHeightPx, layout.aperturePx],
            choices: "NO_KEYS",
            response_ends_trial: false,
            trial_duration: postResponseBlankMs,
            data: { ...baseData, phase: "nback_post_response_blank" },
        });
    }
    if (block.feedback.enabled && block.feedback.durationMs > 0) {
        timeline.push({
            type: CanvasKeyboardResponsePlugin,
            stimulus: (canvas) => {
                const ctx = canvas.getContext("2d");
                if (!ctx)
                    return;
                drawTrialFeedbackOnCanvas(ctx, layout, block.feedback, feedbackView);
            },
            canvas_size: [layout.totalHeightPx, layout.aperturePx],
            choices: "NO_KEYS",
            response_ends_trial: false,
            trial_duration: block.feedback.durationMs,
            data: { ...baseData, phase: "nback_feedback" },
        });
    }
    return capture;
}
function drawNbackPhase(canvas, layout, parsed, preloaded, trial, flags) {
    const ctx = canvas.getContext("2d");
    if (!ctx)
        return;
    drawCanvasFramedScene(ctx, layout, {
        cueText: "",
        frameBackground: parsed.display.frameBackground,
        frameBorder: parsed.display.frameBorder,
    }, ({ centerX, centerY, frameSize }) => {
        if (flags.showFixation) {
            drawCanvasCenteredText(ctx, centerX, centerY, "+", {
                color: parsed.display.textColor,
                fontSizePx: parsed.display.fixationFontSizePx,
                fontWeight: parsed.display.fixationFontWeight,
            });
            return;
        }
        if (!flags.showStimulus)
            return;
        if (preloaded.image) {
            drawSizedImage(ctx, preloaded.image, centerX, centerY, parsed.display.imageWidthPx, parsed.display.imageHeightPx, frameSize * parsed.display.stimulusScale, frameSize * parsed.display.stimulusScale, parsed.display.imageUpscale);
            return;
        }
        drawCanvasCenteredText(ctx, centerX, centerY, trial.item, {
            color: parsed.display.textColor,
            fontSizePx: parsed.display.stimulusFontSizePx,
            fontWeight: 700,
        });
    });
}
function evaluateNbackOutcome(parsed, _block, trial, responseKey, rtMs) {
    const responseCategory = parsed.responseSemantics.responseCategoryFromKey(responseKey);
    const expectedCategorySpec = trial.expectedCategory ?? trial.correctResponse;
    const expectedCategoryResolved = parsed.responseSemantics.expectedCategoryFromSpec(expectedCategorySpec, "timeout");
    const outcome = evaluateTrialOutcome({
        responseCategory,
        rt: rtMs,
        expectedCategory: expectedCategoryResolved,
        meta: {
            trialType: trial.trialType,
            item: trial.item,
            correctResponse: trial.correctResponse,
            responseKey: responseKey,
        },
    });
    return {
        correct: outcome.correct,
        responded: responseKey ? 1 : 0,
        responseCategory: outcome.responseCategory,
        expectedCategory: outcome.expectedCategory ?? expectedCategoryResolved,
        rtMs: outcome.rt,
    };
}
function resolveAllowedKeysForNback(semantics, block) {
    const allowedKeys = new Set(semantics.allowedKeys(["target", "non_target"]));
    for (const trial of block.trials) {
        const key = normalizeKey(trial.correctResponse);
        if (key.length > 0 && key !== "timeout") {
            allowedKeys.add(key);
        }
    }
    return Array.from(allowedKeys);
}
function collectNbackRecords(rows, participantId, variantId) {
    const output = [];
    for (const row of rows) {
        if (row.phase !== "nback_response_window")
            continue;
        output.push({
            participantId: asString(row.participantId) || participantId,
            variantId: asString(row.variantId) || variantId,
            blockLabel: asString(row.blockLabel) || "",
            blockIndex: Number(row.blockIndex ?? -1),
            blockType: asString(row.blockType) || "",
            nLevel: Number(row.nLevel ?? -1),
            trialIndex: Number(row.trialIndex ?? -1),
            trialType: asString(row.trialType) || "",
            trial_code: asString(row.trialType) || "",
            item: asString(row.item) || "",
            stimulusPath: asString(row.stimulusPath) || "",
            sourceCategory: asString(row.sourceCategory) || "",
            itemCategory: asString(row.itemCategory) || "",
            correctResponse: asString(row.correctResponse) || "",
            responseKey: typeof row.responseKey === "string" ? normalizeKey(row.responseKey) : "",
            responseRtMs: Number(row.responseRtMs ?? -1),
            responseCorrect: Number(row.responseCorrect ?? 0) === 1 ? 1 : 0,
            clockTime: asString(row.clockTime) || "",
            clockTimeUnixMs: Number(row.clockTimeUnixMs ?? -1),
        });
    }
    return output;
}
function readNbackTrialResponseRow(capture, blockIndex, trialIndex) {
    const row = capture.responseWindowRow;
    if (row && Number(row.blockIndex) === blockIndex && Number(row.trialIndex) === trialIndex)
        return row;
    throw new Error(`Missing n-back response window data for block ${blockIndex}, trial ${trialIndex}.`);
}
function parseNbackConfig(config, selection, variableResolver, stimuliByCategory, moduleRunner, rawConfig) {
    const mappingRaw = asObject(config.mapping);
    const targetKey = normalizeKey(asString(mappingRaw?.targetKey) || "m");
    const nonTargetKey = parseOptionalResponseKey(mappingRaw?.nonTargetKey ?? "z");
    const taskRaw = asObject(config.task);
    if (nonTargetKey && targetKey === nonTargetKey) {
        throw new Error("Invalid NBack mapping: target and nonTarget keys must be distinct.");
    }
    // Modular semantics: extract response keys from all active modules
    let moduleConfigs = asObject(taskRaw?.modules) ?? {};
    // Support legacy jspsych_pm implementation by injecting a pm module
    if (asString(taskRaw?.implementation) === "jspsych_pm" && !moduleConfigs.pm) {
        moduleConfigs = {
            ...moduleConfigs,
            pm: {
                enabled: true,
                key: asString(mappingRaw?.pmKey) || "space",
            },
        };
    }
    const modularSemantics = variableResolver.resolveInValue(moduleRunner.getModularSemantics(moduleConfigs, { resolver: variableResolver }));
    const responseSemantics = createResponseSemantics({
        ...(nonTargetKey
            ? { target: targetKey, non_target: nonTargetKey }
            : { target: targetKey }),
        ...asObject(modularSemantics),
    });
    const timingRaw = asObject(config.timing);
    const timing = {
        trialDurationMs: toPositiveNumber(timingRaw?.trialDurationMs, 5000),
        fixationDurationMs: toNonNegativeNumber(timingRaw?.fixationDurationMs, 500),
        stimulusOnsetMs: toNonNegativeNumber(timingRaw?.stimulusOnsetMs, 1000),
        responseWindowStartMs: toNonNegativeNumber(timingRaw?.responseWindowStartMs, 1000),
        responseWindowEndMs: toNonNegativeNumber(timingRaw?.responseWindowEndMs, 5000),
    };
    const rtTaskRaw = asObject(taskRaw?.rtTask);
    const rtTask = resolveRtTaskConfig({
        baseTiming: {
            trialDurationMs: timing.trialDurationMs,
            fixationOnsetMs: 0,
            fixationDurationMs: timing.fixationDurationMs,
            stimulusOnsetMs: timing.stimulusOnsetMs,
            stimulusDurationMs: Math.max(0, timing.trialDurationMs - timing.stimulusOnsetMs),
            responseWindowStartMs: timing.responseWindowStartMs,
            responseWindowEndMs: timing.responseWindowEndMs,
        },
        override: rtTaskRaw,
        defaultEnabled: false,
        defaultResponseTerminatesTrial: false,
    });
    const drtRaw = resolveScopedModuleConfig(taskRaw, "drt");
    const drt = resolveNbackDrtConfig({
        enabled: false,
        scope: "block",
        key: "space",
        transformPersistence: "scope",
        responseWindowMs: 1500,
        displayDurationMs: 1000,
        responseTerminatesStimulus: true,
        isiSampler: { type: "uniform", min: 3000, max: 5000 },
        parameterTransforms: [],
        stimMode: "visual",
        stimModes: [],
        visual: {
            shape: "square",
            color: "#dc2626",
            sizePx: 32,
            topPx: 16,
            leftPx: null,
        },
        audio: {
            volume: 0.25,
            frequencyHz: 900,
            durationMs: 120,
            waveform: "sine",
        },
        border: {
            color: "#dc2626",
            widthPx: 4,
            radiusPx: 0,
            target: "display",
        },
    }, drtRaw);
    const displayRaw = asObject(config.display);
    const display = {
        aperturePx: toPositiveNumber(displayRaw?.aperturePx, 250),
        paddingYPx: toNonNegativeNumber(displayRaw?.paddingYPx, 16),
        cueHeightPx: toNonNegativeNumber(displayRaw?.cueHeightPx, 0),
        cueMarginBottomPx: toNonNegativeNumber(displayRaw?.cueMarginBottomPx, 0),
        frameBackground: asString(displayRaw?.frameBackground) || "#ffffff",
        frameBorder: asString(displayRaw?.frameBorder) || "2px solid #d1d5db",
        textColor: asString(displayRaw?.textColor) || "#111827",
        fixationFontSizePx: toPositiveNumber(displayRaw?.fixationFontSizePx, 28),
        fixationFontWeight: toPositiveNumber(displayRaw?.fixationFontWeight, 500),
        stimulusFontSizePx: toPositiveNumber(displayRaw?.stimulusFontSizePx, 48),
        stimulusScale: Math.max(0.1, Math.min(1, Number(displayRaw?.stimulusScale ?? 0.82))),
        imageWidthPx: Number.isFinite(Number(displayRaw?.imageWidthPx))
            ? Math.max(1, Math.floor(Number(displayRaw?.imageWidthPx)))
            : null,
        imageHeightPx: Number.isFinite(Number(displayRaw?.imageHeightPx))
            ? Math.max(1, Math.floor(Number(displayRaw?.imageHeightPx)))
            : null,
        imageUpscale: displayRaw?.imageUpscale === true,
    };
    const feedbackDefaults = parseTrialFeedbackConfig(asObject(config.feedback), null, {
        style: {
            canvasBackground: display.frameBackground,
            canvasBorder: display.frameBorder,
            fontSizePx: Math.max(16, Math.round(display.stimulusFontSizePx * 0.6)),
            fontWeight: 700,
        },
    });
    const plan = asObject(config.plan);
    const nbackRuleRaw = asObject(config.nbackRule);
    const imageAssetsRaw = asObject(config.imageAssets);
    const stimuliCsvRaw = asObject(config.stimuliCsv);
    const stimulusPoolsRaw = asObject(config.stimulusPools);
    const configVariables = asObject(config.variables);
    const taskVariables = asObject(asObject(config.task)?.variables);
    const variableDefinitions = {
        ...(taskVariables ?? {}),
        ...(configVariables ?? {}),
    };
    const lureLagPasses = parseLureLagPasses(nbackRuleRaw?.lureLagPasses);
    const maxInsertionAttempts = toPositiveNumber(nbackRuleRaw?.maxInsertionAttempts, 10);
    const planManipulations = createManipulationOverrideMap(plan?.manipulations);
    const planPoolAllocator = createManipulationPoolAllocator(plan?.manipulationPools, selection
        ? [
            selection.participant.participantId,
            selection.participant.sessionId,
            selection.variantId,
            "nback_plan_manipulation_pools",
        ]
        : ["nback_plan_manipulation_pools"]);
    const mergedBlocks = asArray(plan?.blocks).map((entry, index) => parseBlock(applyManipulationOverridesToBlock(entry, resolveBlockManipulationIds(entry, planPoolAllocator), planManipulations, `Invalid NBack plan: block ${index + 1}`), index, null, variableResolver, feedbackDefaults, rtTask, drt));
    const parsedPracticeBlocks = mergedBlocks.filter((block) => block.isPractice);
    const parsedMainBlocks = mergedBlocks.filter((block) => !block.isPractice);
    if (mergedBlocks.length === 0)
        throw new Error("Invalid NBack plan: plan.blocks is empty.");
    const referencedCategories = mergedBlocks.flatMap((block) => [
        ...block.nbackSourceCategories,
    ]);
    ensureStimulusCategories(stimuliByCategory, referencedCategories);
    const instructionsRaw = asObject(config.instructions);
    const rawInstructions = asObject(rawConfig?.instructions);
    const instructionSource = {
        ...(instructionsRaw ?? {}),
        ...(asString(rawInstructions?.blockIntroTemplate)
            ? { blockIntroTemplate: asString(rawInstructions?.blockIntroTemplate) }
            : {}),
    };
    const instructionConfig = buildTaskInstructionConfig({
        title: asString(taskRaw?.title) || "NBack Task",
        instructions: instructionSource,
        defaults: {
            intro: [
                nonTargetKey
                    ? "Respond for n-back targets and non-targets using the mapped keys."
                    : "Respond only to n-back targets. Withhold response for non-targets.",
            ],
        },
        blockIntroTemplateDefault: "This is a {nLevel}-back block.",
        showBlockLabelDefault: instructionsRaw?.showBlockLabel !== false,
        preBlockBeforeBlockIntroDefault: instructionsRaw?.preBlockBeforeBlockIntro === true,
    });
    const completeRaw = asObject(config.completion);
    const redirectRaw = asObject(completeRaw?.redirect);
    const taskAllowedKeys = responseSemantics.allowedKeys(["target", "non_target"]);
    const drtKeysByBlock = mergedBlocks.filter((block) => block.drt.enabled).map((block) => block.drt.key);
    const allowedKeysSet = new Set([...taskAllowedKeys, ...drtKeysByBlock]);
    if (drt.enabled)
        allowedKeysSet.add(drt.key);
    const finalAllowedKeys = Array.from(allowedKeysSet);
    return {
        title: asString(taskRaw?.title) || "NBack Task",
        mapping: { targetKey, nonTargetKey },
        responseSemantics,
        timing,
        display,
        rtTask,
        drt,
        imageAssets: {
            enabled: imageAssetsRaw?.enabled === true,
            basePath: asString(imageAssetsRaw?.basePath) || "",
            filenameTemplate: asString(imageAssetsRaw?.filenameTemplate) || "{id}",
            practiceVariant: toPositiveNumber(imageAssetsRaw?.practiceVariant, 1),
            mainVariants: asPositiveNumberArray(imageAssetsRaw?.mainVariants, [1]),
            mainMode: (asString(imageAssetsRaw?.mainMode) || "with_replacement").toLowerCase() === "cycle"
                ? "cycle"
                : "with_replacement",
        },
        stimuliCsv: coerceCsvStimulusConfig(stimuliCsvRaw),
        nbackPoolDraw: coercePoolDrawConfig(asObject(stimulusPoolsRaw?.nbackDraw), {
            mode: "without_replacement",
            shuffle: true,
        }),
        variableDefinitions,
        allowedKeys: finalAllowedKeys,
        instructions: instructionConfig,
        practiceBlocks: parsedPracticeBlocks,
        mainBlocks: parsedMainBlocks,
        stimuliByCategory,
        nbackRule: {
            lureLagPasses,
            maxInsertionAttempts,
        },
        feedbackDefaults,
        redirectCompleteTemplate: asString(redirectRaw?.completeUrlTemplate) || "",
    };
}
function parseBlock(entry, index, isPractice, variableResolver, feedbackFallback, rtTaskFallback, drtFallback) {
    const b = asObject(entry);
    if (!b)
        throw new Error(`Invalid NBack plan: block ${index + 1} is not an object.`);
    const scope = { blockIndex: index };
    const resolvedPhase = variableResolver.resolveToken(b.phase, scope);
    const phaseRaw = (asString(resolvedPhase) || "").toLowerCase();
    const resolvedIsPractice = variableResolver.resolveToken(b.isPractice, scope);
    const inferredPractice = typeof resolvedIsPractice === "boolean" ? resolvedIsPractice : phaseRaw === "practice";
    const isPracticeResolved = isPractice ?? inferredPractice;
    const resolvedLabel = variableResolver.resolveToken(b.label, scope);
    const label = asString(resolvedLabel) || `${isPracticeResolved ? "Practice" : "Block"} ${index + 1}`;
    const resolvedTrials = variableResolver.resolveToken(b.trials, scope);
    const trials = toPositiveNumber(resolvedTrials, isPracticeResolved ? 20 : 54);
    const resolvedNLevel = variableResolver.resolveToken(b.nLevel, scope);
    const nLevel = toPositiveNumber(resolvedNLevel, isPracticeResolved ? 2 : 1);
    const nbackSourceCategories = expandCategoryEntriesWithVariables(asStringArray(b.nbackSourceCategories, ["other"]), variableResolver, scope);
    const resolvedTargetCount = variableResolver.resolveToken(b.targetCount, scope);
    const resolvedLureCount = variableResolver.resolveToken(b.lureCount, scope);
    const resolvedStimulusVariant = variableResolver.resolveToken(b.stimulusVariant, scope);
    const resolvedFeedbackRaw = variableResolver.resolveToken(b.feedback, scope);
    const rawBeforeBlockScreens = b.beforeBlockScreens ?? b.preBlockInstructions;
    const rawAfterBlockScreens = b.afterBlockScreens ?? b.postBlockInstructions;
    const rawRepeatAfterBlockScreens = b.repeatAfterBlockScreens ?? b.repeatPostBlockScreens;
    const rawBlockSummary = b.blockSummary;
    const rawRepeatUntil = b.repeatUntil;
    const rawRtTask = b.rtTask;
    const rawDrt = resolveScopedModuleConfig(b, "drt");
    const resolvedBeforeBlockScreens = variableResolver.resolveInValue(rawBeforeBlockScreens, scope);
    const resolvedAfterBlockScreens = variableResolver.resolveInValue(rawAfterBlockScreens, scope);
    const resolvedRepeatAfterBlockScreens = variableResolver.resolveInValue(rawRepeatAfterBlockScreens, scope);
    const resolvedBlockSummary = variableResolver.resolveToken(rawBlockSummary, scope);
    const resolvedRepeatUntil = variableResolver.resolveToken(rawRepeatUntil, scope);
    const resolvedRtTask = variableResolver.resolveToken(rawRtTask, scope);
    const resolvedDrt = variableResolver.resolveToken(rawDrt, scope);
    const feedback = parseTrialFeedbackConfig(asObject(resolvedFeedbackRaw), feedbackFallback ?? null);
    const rtTask = mergeRtTaskConfig(rtTaskFallback ??
        resolveRtTaskConfig({
            baseTiming: {
                trialDurationMs: 5000,
                fixationOnsetMs: 0,
                fixationDurationMs: 500,
                stimulusOnsetMs: 1000,
                stimulusDurationMs: 4000,
                responseWindowStartMs: 1000,
                responseWindowEndMs: 5000,
            },
            override: null,
            defaultEnabled: false,
            defaultResponseTerminatesTrial: false,
        }), resolvedRtTask);
    const drt = resolveNbackDrtConfig(drtFallback ??
        resolveNbackDrtConfig({
            enabled: false,
            scope: "block",
            key: "space",
            transformPersistence: "scope",
            responseWindowMs: 1500,
            displayDurationMs: 1000,
            responseTerminatesStimulus: true,
            isiSampler: { type: "uniform", min: 3000, max: 5000 },
            parameterTransforms: [],
            stimMode: "visual",
            stimModes: [],
            visual: {
                shape: "square",
                color: "#dc2626",
                sizePx: 32,
                topPx: 16,
                leftPx: null,
            },
            audio: {
                volume: 0.25,
                frequencyHz: 900,
                durationMs: 120,
                waveform: "sine",
            },
            border: {
                color: "#dc2626",
                widthPx: 4,
                radiusPx: 0,
                target: "display",
            },
        }, null), asObject(resolvedDrt));
    return {
        label,
        isPractice: isPracticeResolved,
        nLevel,
        trials,
        nbackSourceCategories,
        targetCount: toNonNegativeNumber(resolvedTargetCount, isPracticeResolved ? 6 : 18),
        lureCount: toNonNegativeNumber(resolvedLureCount, isPracticeResolved ? 3 : 18),
        stimulusVariant: Number.isFinite(Number(resolvedStimulusVariant))
            ? Math.max(1, Math.floor(Number(resolvedStimulusVariant)))
            : null,
        feedback,
        rtTask,
        blockSummary: asObject(resolvedBlockSummary),
        repeatUntil: asObject(resolvedRepeatUntil),
        beforeBlockScreens: toStringScreens(resolvedBeforeBlockScreens),
        afterBlockScreens: toStringScreens(resolvedAfterBlockScreens),
        repeatAfterBlockScreens: toStringScreens(resolvedRepeatAfterBlockScreens),
        drt,
        variables: asObject(b.variables) ?? {},
    };
}
function coerceInlinePools(source) {
    if (!source)
        return {};
    const pools = {};
    for (const [category, entries] of Object.entries(source)) {
        const normalized = asStringArray(entries, []).map((entry) => entry.trim()).filter((entry) => entry.length > 0);
        if (normalized.length > 0)
            pools[category] = normalized;
    }
    return pools;
}
function makeSynthetic(prefix, count) {
    return Array.from({ length: count }, (_, idx) => `${prefix}_${String(idx + 1).padStart(3, "0")}`);
}
function ensureStimulusCategories(pools, categories) {
    for (const raw of categories) {
        const category = String(raw || "").trim();
        if (!category)
            continue;
        if (!Array.isArray(pools[category]) || pools[category].length === 0) {
            pools[category] = makeSynthetic(category, 400);
        }
    }
}
function buildExperimentPlan(config, rng, moduleRunner, moduleConfigs, variableResolver) {
    const blocks = [...config.practiceBlocks, ...config.mainBlocks];
    let mainCycleIndex = 0;
    return blocks.map((block, index) => {
        const resolvedVariant = resolveBlockStimulusVariant(config, block, rng, mainCycleIndex);
        if (!block.isPractice && config.imageAssets.mainMode === "cycle" && config.imageAssets.mainVariants.length > 0) {
            mainCycleIndex += 1;
        }
        return buildBlockPlanWithChecks(block, index, config, rng, resolvedVariant, moduleRunner, moduleConfigs, variableResolver);
    });
}
function buildBlockPlanWithChecks(block, blockIndex, config, rng, stimulusVariant, moduleRunner, moduleConfigs, variableResolver) {
    const maxAttempts = Math.max(5, config.nbackRule.maxInsertionAttempts * 3);
    let lastError = null;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        try {
            const purePlan = buildBlockPlanAttempt(block, blockIndex, config, rng, stimulusVariant);
            // Allow modules to transform the block plan (e.g. inject PM)
            return moduleRunner.transformBlockPlan(purePlan, moduleConfigs, {
                rng,
                stimuliByCategory: config.stimuliByCategory,
                resolver: variableResolver,
                blockIndex,
                locals: purePlan.variables,
            });
        }
        catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
        }
    }
    throw new Error(`Failed to generate valid NBack block '${block.label}' after ${maxAttempts} attempts: ${lastError?.message ?? "unknown error"}`);
}
function buildBlockPlanAttempt(block, blockIndex, config, rng, stimulusVariant) {
    const nbackCandidates = collectPoolCandidates(config.stimuliByCategory, block.nbackSourceCategories, new Set());
    if (nbackCandidates.length === 0) {
        nbackCandidates.push(...collectPoolCandidates(config.stimuliByCategory, ["other"], new Set()));
    }
    if (nbackCandidates.length === 0)
        throw new Error(`Block '${block.label}' has no n-back candidate items.`);
    const drawNback = createPoolDrawer(nbackCandidates, rng, config.nbackPoolDraw);
    const trials = [];
    const nonTargetResponseSpec = config.mapping.nonTargetKey ?? "timeout";
    for (let i = 0; i < block.trials; i += 1) {
        const picked = drawNback();
        trials.push({
            trialIndex: i,
            blockIndex: blockIndex,
            trialType: "F",
            item: picked.item,
            sourceCategory: picked.category,
            itemCategory: "other",
            correctResponse: nonTargetResponseSpec,
        });
    }
    let insertedTargets = 0;
    for (let i = 0; i < config.nbackRule.maxInsertionAttempts; i += 1) {
        insertedTargets += injectNBackTargets(rng, trials, block.nLevel, block.targetCount - insertedTargets, config.mapping.targetKey);
        if (insertedTargets >= block.targetCount)
            break;
    }
    let insertedLures = 0;
    for (const lagPass of config.nbackRule.lureLagPasses) {
        insertedLures += injectNBackLures(rng, trials, block.nLevel, block.lureCount - insertedLures, lagPass);
        if (insertedLures >= block.lureCount)
            break;
    }
    const planned = {
        blockIndex,
        label: block.label,
        blockType: block.isPractice ? "practice" : "main",
        isPractice: block.isPractice,
        nLevel: block.nLevel,
        stimulusVariant,
        trials,
        feedback: block.feedback,
        rtTask: block.rtTask,
        blockSummary: block.blockSummary,
        repeatUntil: block.repeatUntil,
        beforeBlockScreens: block.beforeBlockScreens,
        afterBlockScreens: block.afterBlockScreens,
        repeatAfterBlockScreens: block.repeatAfterBlockScreens,
        drt: block.drt,
        variables: block.variables,
    };
    return planned;
}
function injectNBackTargets(rng, trials, nLevel, nTargets, targetKey) {
    let inserted = 0;
    if (nTargets <= 0)
        return 0;
    const candidates = Array.from({ length: Math.max(0, trials.length - nLevel) }, (_, idx) => idx + nLevel);
    rng.shuffle(candidates);
    for (const pos of candidates) {
        const backPos = pos - nLevel;
        const prevPos = pos - 1;
        const nextPos = pos + 1;
        if (inserted >= nTargets)
            break;
        if (prevPos >= 0 && trials[prevPos].trialType !== "F")
            continue;
        if (nextPos < trials.length && trials[nextPos].trialType === "N")
            continue;
        if (trials[pos].usedAsSource)
            continue;
        if (trials[backPos].usedAsSource)
            continue;
        if (trials[pos].trialType !== "F" || trials[backPos].trialType !== "F")
            continue;
        trials[pos].item = trials[backPos].item;
        trials[pos].sourceCategory = trials[backPos].sourceCategory;
        trials[pos].trialType = "N";
        trials[pos].correctResponse = targetKey;
        trials[pos].usedAsSource = true;
        trials[backPos].usedAsSource = true;
        inserted += 1;
    }
    return inserted;
}
function injectNBackLures(rng, trials, nLevel, nLures, lureLags) {
    if (nLures <= 0 || lureLags.length === 0)
        return 0;
    const candidates = [];
    const start = Math.max(...lureLags);
    for (let pos = start; pos < trials.length; pos += 1) {
        if (trials[pos].trialType !== "F")
            continue;
        if (trials[pos].usedAsSource)
            continue;
        for (const lag of lureLags) {
            if (lag === nLevel)
                continue;
            const lurePos = pos - lag;
            if (lurePos < 0)
                continue;
            if (trials[lurePos].trialType !== "F")
                continue;
            if (trials[lurePos].usedAsSource)
                continue;
            candidates.push([pos, lurePos, lag]);
        }
    }
    rng.shuffle(candidates);
    const used = new Set();
    let inserted = 0;
    for (const [pos, lurePos, lag] of candidates) {
        if (inserted >= nLures)
            break;
        if (used.has(pos) || used.has(lurePos))
            continue;
        trials[pos].item = trials[lurePos].item;
        trials[pos].sourceCategory = trials[lurePos].sourceCategory;
        trials[pos].trialType = `L${lag}`;
        trials[pos].usedAsSource = true;
        trials[lurePos].usedAsSource = true;
        used.add(pos);
        used.add(lurePos);
        inserted += 1;
    }
    return inserted;
}
function resolveStimulusPath(parsed, block, itemId, trialIndex, resolver) {
    if (!parsed.imageAssets.enabled)
        return itemId;
    return resolveAssetPath({
        basePath: parsed.imageAssets.basePath,
        template: parsed.imageAssets.filenameTemplate,
        resolver,
        context: {
            blockIndex: block.blockIndex,
            trialIndex,
            locals: {
                itemId,
                blockIndex: block.blockIndex,
                blockLabel: block.label,
                nLevel: block.nLevel,
            },
        },
    });
}
function primeUpcomingBlockStimuli(parsed, block, startTrialIndex, resolver, lookaheadCount) {
    if (!parsed.imageAssets.enabled)
        return;
    if (lookaheadCount <= 0)
        return;
    const start = Math.max(0, Math.floor(startTrialIndex));
    const endExclusive = Number.isFinite(lookaheadCount)
        ? Math.min(block.trials.length, start + Math.floor(lookaheadCount))
        : block.trials.length;
    for (let idx = start; idx < endExclusive; idx += 1) {
        const trial = block.trials[idx];
        if (!trial)
            continue;
        const resolved = resolveStimulusPath(parsed, block, trial.item, trial.trialIndex, resolver);
        void preloadNbackStimulus(resolved);
    }
}
function resolveBlockStimulusVariant(parsed, block, rng, mainCycleIndex) {
    if (!parsed.imageAssets.enabled)
        return null;
    if (block.stimulusVariant && block.stimulusVariant > 0)
        return block.stimulusVariant;
    if (block.isPractice)
        return parsed.imageAssets.practiceVariant;
    const mainVariants = parsed.imageAssets.mainVariants.length > 0 ? parsed.imageAssets.mainVariants : [1, 2];
    if (parsed.imageAssets.mainMode === "cycle") {
        return mainVariants[mainCycleIndex % mainVariants.length];
    }
    const pick = rng.int(0, mainVariants.length - 1);
    return mainVariants[pick];
}
async function preloadNbackStimulus(item) {
    const image = await loadImageIfLikelyVisualStimulus(item, NBACK_IMAGE_CACHE);
    return { image };
}
function applyNbackRootPresentation(root) {
    const prior = {
        maxWidth: root.style.maxWidth,
        margin: root.style.margin,
        fontFamily: root.style.fontFamily,
        lineHeight: root.style.lineHeight,
        hadCenteredClass: root.classList.contains("exp-jspsych-canvas-centered"),
    };
    root.style.maxWidth = "1000px";
    root.style.margin = "0 auto";
    root.style.fontFamily = "system-ui";
    root.style.lineHeight = "1.4";
    ensureJsPsychCanvasCentered(root);
    return prior;
}
function restoreNbackRootPresentation(root, prior) {
    root.style.maxWidth = prior?.maxWidth ?? "";
    root.style.margin = prior?.margin ?? "";
    root.style.fontFamily = prior?.fontFamily ?? "";
    root.style.lineHeight = prior?.lineHeight ?? "";
    if (!(prior?.hadCenteredClass ?? false)) {
        root.classList.remove("exp-jspsych-canvas-centered");
    }
}
export const __testing__ = {
    appendJsPsychNbackTrial,
    readNbackTrialResponseRow,
    applyNbackRootPresentation,
    restoreNbackRootPresentation,
};
function drawSizedImage(ctx, image, centerX, centerY, configuredWidth, configuredHeight, frameMaxWidth, frameMaxHeight, allowUpscale) {
    const nativeWidth = image.naturalWidth || image.width;
    const nativeHeight = image.naturalHeight || image.height;
    if (!(nativeWidth > 0 && nativeHeight > 0))
        return;
    const targetWidth = configuredWidth ?? nativeWidth;
    const targetHeight = configuredHeight ?? nativeHeight;
    const widthRatio = frameMaxWidth / targetWidth;
    const heightRatio = frameMaxHeight / targetHeight;
    let scale = Math.min(widthRatio, heightRatio);
    if (!Number.isFinite(scale) || scale <= 0)
        scale = 1;
    if (!allowUpscale)
        scale = Math.min(scale, 1);
    const drawWidth = Math.max(1, Math.floor(targetWidth * scale));
    const drawHeight = Math.max(1, Math.floor(targetHeight * scale));
    ctx.drawImage(image, Math.round(centerX - drawWidth / 2), Math.round(centerY - drawHeight / 2), drawWidth, drawHeight);
}
function expandCategoryEntriesWithVariables(entries, resolver, context) {
    const flattenResolved = (value) => {
        const resolved = resolver.resolveInValue(value, context);
        if (Array.isArray(resolved)) {
            return resolved.flatMap((entry) => flattenResolved(entry));
        }
        const parsed = asString(resolved);
        return parsed ? [parsed] : [];
    };
    const out = [];
    for (const entry of entries) {
        out.push(...flattenResolved(entry));
    }
    return out;
}
function parseLureLagPasses(value) {
    const rawPasses = asArray(value);
    if (rawPasses.length === 0) {
        return [[2, 4, 5], [6, 7, 8, 9]];
    }
    const parsed = rawPasses
        .map((pass) => asArray(pass)
        .map((v) => Number(v))
        .filter((v) => Number.isInteger(v) && v > 0))
        .filter((pass) => pass.length > 0);
    return parsed.length > 0 ? parsed : [[2, 4, 5], [6, 7, 8, 9]];
}
//# sourceMappingURL=index.js.map