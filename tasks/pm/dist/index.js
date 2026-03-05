import { SeededRandom, createEventLogger, drawTrialFeedbackOnCanvas, escapeHtml, evaluateTrialOutcome, finalizeTaskRun, hashSeed, normalizeKey, computeCanvasFrameLayout, drawCanvasFramedScene, drawCanvasCenteredText, ensureJsPsychCanvasCentered, pushJsPsychContinueScreen, resolveJsPsychContentHost, resolveTrialFeedbackView, runJsPsychTimeline, renderCenteredNotice, recordsToCsv, setCursorHidden, toJsPsychChoices, waitForContinue, resolveTemplate, createResponseSemantics, computeRtPhaseDurations, createVariableResolver, resolveWithVariables, coerceCategoryDrawConfig, coerceCsvStimulusConfig, coercePoolDrawConfig, collectPoolCandidates, createCategoryPoolDrawer, createPoolDrawer, loadCategorizedStimulusPools, loadImageIfLikelyVisualStimulus, resolveAssetPath, createManipulationOverrideMap, createManipulationPoolAllocator, resolveBlockManipulationIds, applyManipulationOverridesToBlock, asObject, asArray, asString, asStringArray, asPositiveNumberArray, toStringScreens, resolveInstructionPageSlots, toPositiveNumber, toNonNegativeNumber, parseTrialFeedbackConfig, } from "@experiments/core";
import { initJsPsych } from "jspsych";
import CanvasKeyboardResponsePlugin from "@jspsych/plugin-canvas-keyboard-response";
import CallFunctionPlugin from "@jspsych/plugin-call-function";
class PmTaskAdapter {
    manifest = {
        taskId: "pm",
        label: "PM",
        variants: [
            { id: "modern", label: "NBack PM Modern", configPath: "pm/modern" },
            { id: "nirvanaExp1", label: "NBack PM Images", configPath: "pm/nirvanaExp1" },
            { id: "annikaHons", label: "NBack PM Text (Blocked PM/Control)", configPath: "pm/annikaHons" },
            { id: "word_multicat", label: "NBack PM Word Multicat", configPath: "pm/word_multicat" },
        ],
    };
    context = null;
    runtime = null;
    removeKeyScrollBlocker = null;
    async initialize(context) {
        this.context = context;
        this.runtime = await preparePmRuntime(context);
    }
    async execute() {
        if (!this.context || !this.runtime) {
            throw new Error("PM Task not initialized");
        }
        await runPmJsPsychTask(this.context, this.runtime);
        return { success: true };
    }
    async terminate() {
        setCursorHidden(false);
        if (this.removeKeyScrollBlocker) {
            this.removeKeyScrollBlocker();
            this.removeKeyScrollBlocker = null;
        }
    }
}
export const pmAdapter = new PmTaskAdapter();
function shouldHideCursorForPhase(phase) {
    if (typeof phase !== "string")
        return false;
    return /(fixation|blank|stimulus|response|feedback)/.test(phase.toLowerCase());
}
const PM_IMAGE_CACHE = new Map();
async function preparePmRuntime(context) {
    const parsed = parsePmConfig(context.taskConfig, context.selection);
    const variableResolver = createPmVariableResolver(parsed, context);
    parsed.stimuliByCategory = await loadCategorizedStimulusPools({
        inlinePools: parsed.stimuliByCategory,
        csvConfig: parsed.stimuliCsv,
        resolver: variableResolver,
    });
    applyPmVariableResolution(parsed, variableResolver);
    const rng = new SeededRandom(hashSeed(context.selection.participant.participantId, context.selection.participant.sessionId, context.selection.variantId));
    const plan = buildExperimentPlan(parsed, rng);
    const eventLogger = createEventLogger(context.selection);
    return {
        parsed,
        plan,
        variableResolver,
        eventLogger,
        participantId: context.selection.participant.participantId,
        variantId: context.selection.variantId,
    };
}
async function runPmJsPsychTask(context, runtime) {
    const { parsed, plan, eventLogger } = runtime;
    const root = context.container;
    let jsPsychRef = null;
    // Note: key scroll blocker is managed by adapter.terminate now
    root.style.maxWidth = "1000px";
    root.style.margin = "0 auto";
    root.style.fontFamily = "system-ui";
    root.style.lineHeight = "1.4";
    ensureJsPsychCanvasCentered(root);
    eventLogger.emit("task_start", { task: "pm", runner: "jspsych" });
    const timeline = [];
    pushJsPsychContinueScreen(timeline, CallFunctionPlugin, root, `<h2>${escapeHtml(parsed.title)}</h2><p>Participant: <code>${escapeHtml(runtime.participantId)}</code></p>`, "intro_start", "pm-continue-intro_start");
    for (let introIndex = 0; introIndex < parsed.instructions.introPages.length; introIndex += 1) {
        pushJsPsychContinueScreen(timeline, CallFunctionPlugin, root, `<p>${escapeHtml(parsed.instructions.introPages[introIndex] ?? "")}</p>`, "intro_page", `pm-continue-intro_page-${introIndex}`, { introIndex });
    }
    if (parsed.instructions.pmTemplate) {
        pushJsPsychContinueScreen(timeline, CallFunctionPlugin, root, `<p>${escapeHtml(parsed.instructions.pmTemplate.replace("{pmCategoryText}", parsed.pmCategories.join(", ")))}</p>`, "intro_pm_template", "pm-continue-intro_pm_template");
    }
    for (const block of plan) {
        timeline.push({
            type: CallFunctionPlugin,
            data: { phase: "block_start_hook", blockIndex: block.blockIndex },
            func: () => {
                eventLogger.emit("block_start", { label: block.label, blockType: block.blockType }, { blockIndex: block.blockIndex });
            },
        });
        const intro = block.blockType === "PM" ? parsed.instructions.blockIntroPmTemplate : parsed.instructions.blockIntroControlTemplate;
        const introText = intro
            .replace("{nLevel}", String(block.nLevel))
            .replace("{pmCategoryText}", block.activePmCategories.join(", "));
        const blockScreenHtml = (text) => parsed.instructions.showBlockLabel
            ? `<h3>${escapeHtml(block.label)}</h3><p>${escapeHtml(text)}</p>`
            : `<p>${escapeHtml(text)}</p>`;
        const preBlockScreens = [...parsed.instructions.preBlockPages, ...block.beforeBlockScreens];
        const pushPreBlockScreens = () => {
            for (let instructionIndex = 0; instructionIndex < preBlockScreens.length; instructionIndex += 1) {
                const instruction = preBlockScreens[instructionIndex];
                pushJsPsychContinueScreen(timeline, CallFunctionPlugin, root, blockScreenHtml(instruction), "block_pre_instruction", `pm-continue-block_pre_instruction-${block.blockIndex}-${instructionIndex}`, { blockIndex: block.blockIndex, instructionIndex });
            }
        };
        const pushBlockIntro = () => {
            pushJsPsychContinueScreen(timeline, CallFunctionPlugin, root, blockScreenHtml(introText), "block_start", `pm-continue-block_start-${block.blockIndex}`, { blockIndex: block.blockIndex });
        };
        if (parsed.instructions.preBlockBeforeBlockIntro) {
            pushPreBlockScreens();
            pushBlockIntro();
        }
        else {
            pushBlockIntro();
            pushPreBlockScreens();
        }
        for (const trial of block.trials) {
            const resolvedStimulus = resolveStimulusPath(parsed, block, trial.item, trial.trialIndex, runtime.variableResolver);
            const preloaded = await preloadPmStimulus(resolvedStimulus);
            appendJsPsychPmTrial({
                timeline,
                parsed,
                block,
                trial,
                resolvedStimulus,
                runtime,
                preloaded,
                eventLogger,
            });
        }
        timeline.push({
            type: CallFunctionPlugin,
            data: { phase: "block_end_hook", blockIndex: block.blockIndex },
            func: () => {
                const rows = getPmResponseRowsFromValues(jsPsychRef?.data.get().values() ?? [], block.blockIndex);
                const blockCorrect = rows.reduce((acc, row) => acc + row.responseCorrect, 0);
                const blockResponded = rows.reduce((acc, row) => acc + (row.responseKey ? 1 : 0), 0);
                const accuracy = block.trials.length > 0 ? Math.round((blockCorrect / block.trials.length) * 1000) / 10 : 0;
                eventLogger.emit("block_end", { label: block.label, blockType: block.blockType, accuracy, responded: blockResponded }, { blockIndex: block.blockIndex });
            },
        });
        timeline.push({
            type: CallFunctionPlugin,
            data: { phase: "block_end", blockIndex: block.blockIndex },
            async: true,
            func: (done) => {
                const rows = getPmResponseRowsFromValues(jsPsychRef?.data.get().values() ?? [], block.blockIndex);
                const blockCorrect = rows.reduce((acc, row) => acc + row.responseCorrect, 0);
                const blockResponded = rows.reduce((acc, row) => acc + (row.responseKey ? 1 : 0), 0);
                const accuracy = block.trials.length > 0 ? Math.round((blockCorrect / block.trials.length) * 1000) / 10 : 0;
                const host = resolveJsPsychContentHost(root);
                const endTitle = parsed.instructions.showBlockLabel
                    ? `End of ${escapeHtml(block.label)}`
                    : "End of Block";
                void waitForContinue(host, `<h3>${endTitle}</h3><p>Accuracy: <b>${accuracy.toFixed(1)}%</b></p><p>Responses: <b>${blockResponded}</b> / ${block.trials.length}</p>`, { buttonId: `pm-end-${block.blockIndex}` }).then(done);
            },
        });
        const postBlockScreens = [...parsed.instructions.postBlockPages, ...block.afterBlockScreens];
        for (let instructionIndex = 0; instructionIndex < postBlockScreens.length; instructionIndex += 1) {
            const instruction = postBlockScreens[instructionIndex];
            pushJsPsychContinueScreen(timeline, CallFunctionPlugin, root, blockScreenHtml(instruction), "block_post_instruction", `pm-continue-block_post_instruction-${block.blockIndex}-${instructionIndex}`, { blockIndex: block.blockIndex, instructionIndex });
        }
    }
    for (let endIndex = 0; endIndex < parsed.instructions.endPages.length; endIndex += 1) {
        pushJsPsychContinueScreen(timeline, CallFunctionPlugin, root, `<p>${escapeHtml(parsed.instructions.endPages[endIndex] ?? "")}</p>`, "end_page", `pm-continue-end_page-${endIndex}`, { endIndex });
    }
    try {
        jsPsychRef = initJsPsych({
            display_element: root,
            on_trial_start: (trial) => {
                const data = asObject(trial?.data);
                setCursorHidden(shouldHideCursorForPhase(data?.phase));
            },
            on_finish: () => {
                setCursorHidden(false);
            },
        });
        await runJsPsychTimeline(jsPsychRef, timeline);
    }
    finally {
        setCursorHidden(false);
    }
    const records = collectPmRecords(jsPsychRef.data.get().values(), runtime.participantId, runtime.variantId);
    await finalizePmRun(context, runtime, records, { runner: "jspsych", jsPsychData: jsPsychRef.data.get().values() });
}
async function finalizePmRun(context, runtime, records, extras) {
    runtime.eventLogger.emit("task_complete", { task: "pm", runner: extras.runner ?? "unknown", nTrials: records.length });
    const payload = {
        selection: context.selection,
        mapping: runtime.parsed.mapping,
        timing: runtime.parsed.timing,
        records,
        events: runtime.eventLogger.events,
        ...extras,
    };
    const finalizeResult = await finalizeTaskRun({
        coreConfig: context.coreConfig,
        selection: context.selection,
        payload,
        csv: { contents: recordsToCsv(records), suffix: "pm" },
        completionStatus: "complete",
    });
    const completeTemplate = runtime.parsed.redirectCompleteTemplate;
    if (!finalizeResult.redirected && completeTemplate) {
        const url = resolveTemplate(completeTemplate, context.selection);
        if (url) {
            window.location.assign(url);
            return;
        }
    }
    context.container.innerHTML = renderCenteredNotice({
        title: "PM complete",
        message: "Data saved locally.",
    });
}
function appendJsPsychPmTrial(args) {
    const { timeline, parsed, block, trial, resolvedStimulus, runtime, preloaded, eventLogger } = args;
    const { timing } = parsed;
    const layout = computeCanvasFrameLayout({
        aperturePx: parsed.display.aperturePx,
        paddingYPx: parsed.display.paddingYPx,
        cueHeightPx: parsed.display.cueHeightPx,
        cueMarginBottomPx: parsed.display.cueMarginBottomPx,
    });
    const jsPsychAllowedKeys = toJsPsychChoices(resolveAllowedKeysForBlock(parsed.responseSemantics, block.blockType));
    const rtTiming = parsed.rtTask.enabled
        ? parsed.rtTask.timing
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
        responseTerminatesTrial: parsed.rtTask.enabled ? parsed.rtTask.responseTerminatesTrial : false,
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
        stimulusVariant: block.stimulusVariant ?? -1,
        sourceCategory: trial.sourceCategory,
        itemCategory: trial.itemCategory,
        correctResponse: trial.correctResponse,
    };
    if (preFixationBlankMs > 0) {
        timeline.push({
            type: CanvasKeyboardResponsePlugin,
            stimulus: (canvas) => {
                drawPmPhase(canvas, layout, parsed, preloaded, trial, { showFixation: false, showStimulus: false });
            },
            canvas_size: [layout.totalHeightPx, layout.aperturePx],
            choices: "NO_KEYS",
            response_ends_trial: false,
            trial_duration: preFixationBlankMs,
            data: { ...baseData, phase: "pm_pre_fixation_blank" },
        });
    }
    if (fixationMs > 0) {
        timeline.push({
            type: CanvasKeyboardResponsePlugin,
            stimulus: (canvas) => {
                drawPmPhase(canvas, layout, parsed, preloaded, trial, { showFixation: true, showStimulus: false });
            },
            canvas_size: [layout.totalHeightPx, layout.aperturePx],
            choices: "NO_KEYS",
            response_ends_trial: false,
            trial_duration: fixationMs,
            data: { ...baseData, phase: "pm_fixation" },
        });
    }
    if (blankMs > 0) {
        timeline.push({
            type: CanvasKeyboardResponsePlugin,
            stimulus: (canvas) => {
                drawPmPhase(canvas, layout, parsed, preloaded, trial, { showFixation: false, showStimulus: false });
            },
            canvas_size: [layout.totalHeightPx, layout.aperturePx],
            choices: "NO_KEYS",
            response_ends_trial: false,
            trial_duration: blankMs,
            data: { ...baseData, phase: "pm_blank" },
        });
    }
    if (preResponseMs > 0) {
        timeline.push({
            type: CanvasKeyboardResponsePlugin,
            stimulus: (canvas) => {
                drawPmPhase(canvas, layout, parsed, preloaded, trial, { showFixation: false, showStimulus: true });
            },
            canvas_size: [layout.totalHeightPx, layout.aperturePx],
            choices: "NO_KEYS",
            response_ends_trial: false,
            trial_duration: preResponseMs,
            data: { ...baseData, phase: "pm_stimulus_pre_response" },
        });
    }
    const responseSegments = [];
    if (!parsed.rtTask.responseTerminatesTrial && parsed.rtTask.enabled) {
        if (responsePreStimBlankMs > 0) {
            responseSegments.push({ phase: "pm_response_window_pre_stim_blank", durationMs: responsePreStimBlankMs, showStimulus: false, isFinal: false });
        }
        if (responseStimulusMs > 0) {
            responseSegments.push({ phase: "pm_response_window_stimulus", durationMs: responseStimulusMs, showStimulus: true, isFinal: false });
        }
        if (responsePostStimBlankMs > 0) {
            responseSegments.push({ phase: "pm_response_window_post_stim_blank", durationMs: responsePostStimBlankMs, showStimulus: false, isFinal: false });
        }
    }
    if (responseSegments.length === 0) {
        responseSegments.push({ phase: "pm_response_window", durationMs: responseMs, showStimulus: true, isFinal: true });
    }
    else {
        responseSegments[responseSegments.length - 1].phase = "pm_response_window";
        responseSegments[responseSegments.length - 1].isFinal = true;
    }
    let capturedKey = null;
    let capturedRt = null;
    let captured = false;
    for (const segment of responseSegments) {
        timeline.push({
            type: CanvasKeyboardResponsePlugin,
            stimulus: (canvas) => {
                drawPmPhase(canvas, layout, parsed, preloaded, trial, { showFixation: false, showStimulus: segment.showStimulus });
            },
            canvas_size: [layout.totalHeightPx, layout.aperturePx],
            choices: segment.durationMs > 0 ? jsPsychAllowedKeys : "NO_KEYS",
            response_ends_trial: parsed.rtTask.responseTerminatesTrial,
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
                const evaluated = evaluatePmOutcome(parsed, block, trial, capturedKey, capturedRt);
                feedbackView = resolveTrialFeedbackView({
                    feedback: block.feedback,
                    responseCategory: evaluated.responseCategory,
                    correct: evaluated.correct,
                    vars: {
                        item: trial.item,
                        trialType: trial.trialType,
                        blockLabel: block.label,
                        blockType: block.blockType,
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
                });
                eventLogger.emit("trial_complete", {
                    blockType: block.blockType,
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
                drawPmPhase(canvas, layout, parsed, preloaded, trial, { showFixation: false, showStimulus: true });
            },
            canvas_size: [layout.totalHeightPx, layout.aperturePx],
            choices: "NO_KEYS",
            response_ends_trial: false,
            trial_duration: postResponseStimulusMs,
            data: { ...baseData, phase: "pm_post_response" },
        });
    }
    if (postResponseBlankMs > 0) {
        timeline.push({
            type: CanvasKeyboardResponsePlugin,
            stimulus: (canvas) => {
                drawPmPhase(canvas, layout, parsed, preloaded, trial, { showFixation: false, showStimulus: false });
            },
            canvas_size: [layout.totalHeightPx, layout.aperturePx],
            choices: "NO_KEYS",
            response_ends_trial: false,
            trial_duration: postResponseBlankMs,
            data: { ...baseData, phase: "pm_post_response_blank" },
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
            data: { ...baseData, phase: "pm_feedback" },
        });
    }
}
function drawPmPhase(canvas, layout, parsed, preloaded, trial, flags) {
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
function evaluatePmOutcome(parsed, block, trial, responseKey, rtMs) {
    const responseCategory = parsed.responseSemantics.responseCategoryFromKey(responseKey);
    const expectedCategory = parsed.responseSemantics.expectedCategoryFromKey(trial.correctResponse);
    const outcome = evaluateTrialOutcome({
        responseCategory,
        rt: rtMs,
        expectedCategory,
        meta: {
            trialType: trial.trialType,
            blockType: block.blockType,
            item: trial.item,
        },
    });
    return {
        correct: outcome.correct,
        responded: responseKey ? 1 : 0,
        responseCategory: outcome.responseCategory,
        expectedCategory: outcome.expectedCategory ?? expectedCategory,
        rtMs: outcome.rt,
    };
}
function resolveAllowedKeysForBlock(semantics, blockType) {
    if (blockType === "PM")
        return semantics.allowedKeys(["target", "non_target", "pm"]);
    return semantics.allowedKeys(["target", "non_target"]);
}
function collectPmRecords(rows, participantId, variantId) {
    const output = [];
    for (const row of rows) {
        if (row.phase !== "pm_response_window")
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
            item: asString(row.item) || "",
            stimulusPath: asString(row.stimulusPath) || "",
            stimulusVariant: Number(row.stimulusVariant ?? -1),
            sourceCategory: asString(row.sourceCategory) || "",
            itemCategory: asString(row.itemCategory) || "",
            correctResponse: asString(row.correctResponse) || "",
            responseKey: typeof row.responseKey === "string" ? normalizeKey(row.responseKey) : "",
            responseRtMs: Number(row.responseRtMs ?? -1),
            responseCorrect: Number(row.responseCorrect ?? 0) === 1 ? 1 : 0,
        });
    }
    return output;
}
function getPmResponseRowsFromValues(rows, blockIndex) {
    return collectPmRecords(rows, "", "").filter((row) => row.blockIndex === blockIndex);
}
function parsePmConfig(config, selection) {
    const mappingRaw = asObject(config.mapping);
    const targetKey = normalizeKey(asString(mappingRaw?.targetKey) || "m");
    const nonTargetKey = normalizeKey(asString(mappingRaw?.nonTargetKey) || "z");
    const pmKey = normalizeKey(asString(mappingRaw?.pmKey) || "space");
    const distinct = new Set([targetKey, nonTargetKey, pmKey]);
    if (distinct.size < 3)
        throw new Error("Invalid PM mapping: target/nonTarget/pm keys must be distinct.");
    const responseSemantics = createResponseSemantics({
        target: targetKey,
        non_target: nonTargetKey,
        pm: pmKey,
    });
    const timingRaw = asObject(config.timing);
    const timing = {
        trialDurationMs: toPositiveNumber(timingRaw?.trialDurationMs, 5000),
        fixationDurationMs: toNonNegativeNumber(timingRaw?.fixationDurationMs, 500),
        stimulusOnsetMs: toNonNegativeNumber(timingRaw?.stimulusOnsetMs, 1000),
        responseWindowStartMs: toNonNegativeNumber(timingRaw?.responseWindowStartMs, 1000),
        responseWindowEndMs: toNonNegativeNumber(timingRaw?.responseWindowEndMs, 5000),
    };
    const taskRaw = asObject(config.task);
    const rtTaskRaw = asObject(taskRaw?.rtTask);
    const rtTaskTimingRaw = asObject(rtTaskRaw?.timing);
    const rtTrialDurationMs = toPositiveNumber(rtTaskTimingRaw?.trialDurationMs, timing.trialDurationMs);
    const rtStimulusOnsetMs = toNonNegativeNumber(rtTaskTimingRaw?.stimulusOnsetMs, timing.stimulusOnsetMs);
    const rtTaskTiming = {
        trialDurationMs: rtTrialDurationMs,
        fixationOnsetMs: toNonNegativeNumber(rtTaskTimingRaw?.fixationOnsetMs, 0),
        fixationDurationMs: toNonNegativeNumber(rtTaskTimingRaw?.fixationDurationMs, timing.fixationDurationMs),
        stimulusOnsetMs: rtStimulusOnsetMs,
        stimulusDurationMs: toNonNegativeNumber(rtTaskTimingRaw?.stimulusDurationMs, Math.max(0, rtTrialDurationMs - rtStimulusOnsetMs)),
        responseWindowStartMs: toNonNegativeNumber(rtTaskTimingRaw?.responseWindowStartMs, timing.responseWindowStartMs),
        responseWindowEndMs: toNonNegativeNumber(rtTaskTimingRaw?.responseWindowEndMs, timing.responseWindowEndMs),
    };
    const rtTask = {
        enabled: rtTaskRaw ? rtTaskRaw.enabled !== false : false,
        timing: rtTaskTiming,
        responseTerminatesTrial: rtTaskRaw ? rtTaskRaw.responseTerminatesTrial === true : false,
    };
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
    const planVariableResolver = createVariableResolver({
        variables: variableDefinitions,
        seedParts: selection
            ? [
                selection.participant.participantId,
                selection.participant.sessionId,
                selection.variantId,
                "pm_variables",
            ]
            : ["pm_variables"],
    });
    const lureLagPasses = parseLureLagPasses(nbackRuleRaw?.lureLagPasses);
    const maxInsertionAttempts = toPositiveNumber(nbackRuleRaw?.maxInsertionAttempts, 10);
    const planManipulations = createManipulationOverrideMap(plan?.manipulations);
    const planPoolAllocator = createManipulationPoolAllocator(plan?.manipulationPools, selection
        ? [
            selection.participant.participantId,
            selection.participant.sessionId,
            selection.variantId,
            "pm_plan_manipulation_pools",
        ]
        : ["pm_plan_manipulation_pools"]);
    const mergedBlocks = asArray(plan?.blocks).map((entry, index) => parseBlock(applyManipulationOverridesToBlock(entry, resolveBlockManipulationIds(entry, planPoolAllocator), planManipulations, `Invalid PM plan: block ${index + 1}`), index, null, planVariableResolver, feedbackDefaults));
    const parsedPracticeBlocks = mergedBlocks.filter((block) => block.isPractice);
    const parsedMainBlocks = mergedBlocks.filter((block) => !block.isPractice);
    if (mergedBlocks.length === 0)
        throw new Error("Invalid PM plan: plan.blocks is empty.");
    const stimuliByCategory = parseStimulusPools(config);
    const pmCategories = Array.from(new Set(mergedBlocks.flatMap((b) => b.activePmCategories)));
    const instructionsRaw = asObject(config.instructions);
    const instructionSlots = resolveInstructionPageSlots(instructionsRaw, {
        intro: [
            "Respond M for n-back targets, Z for non-targets, and SPACE for PM items.",
        ],
    });
    const pmTemplateConfig = instructionsRaw?.pmTemplate;
    const pmTemplate = typeof pmTemplateConfig === "string"
        ? (pmTemplateConfig.trim() ? pmTemplateConfig.trim() : null)
        : "PM categories for this session: {pmCategoryText}";
    const completeRaw = asObject(config.completion);
    const redirectRaw = asObject(completeRaw?.redirect);
    return {
        title: asString(taskRaw?.title) || "PM Task",
        mapping: { targetKey, nonTargetKey, pmKey },
        responseSemantics,
        timing,
        display,
        rtTask,
        imageAssets: {
            enabled: imageAssetsRaw?.enabled === true,
            basePath: asString(imageAssetsRaw?.basePath) || "",
            filenameTemplate: asString(imageAssetsRaw?.filenameTemplate) || "{id}",
            practiceVariant: toPositiveNumber(imageAssetsRaw?.practiceVariant, 1),
            mainVariants: asPositiveNumberArray(imageAssetsRaw?.mainVariants, [1]),
            mainMode: (asString(imageAssetsRaw?.mainMode) || "with_replacement").toLowerCase() === "cycle" ? "cycle" : "with_replacement",
        },
        stimuliCsv: coerceCsvStimulusConfig(stimuliCsvRaw),
        nbackPoolDraw: coercePoolDrawConfig(asObject(stimulusPoolsRaw?.nbackDraw), {
            mode: "without_replacement",
            shuffle: true,
        }),
        pmItemPoolDraw: coercePoolDrawConfig(asObject(stimulusPoolsRaw?.pmItemDraw), {
            mode: "without_replacement",
            shuffle: true,
        }),
        pmCategoryDraw: coerceCategoryDrawConfig(asObject(stimulusPoolsRaw?.pmCategoryDraw), {
            mode: "round_robin",
            shuffle: true,
        }),
        variableDefinitions,
        allowedKeys: responseSemantics.allowedKeys(["target", "non_target", "pm"]),
        pmCategories,
        instructions: {
            introPages: instructionSlots.intro,
            preBlockPages: instructionSlots.preBlock,
            postBlockPages: instructionSlots.postBlock,
            endPages: instructionSlots.end,
            showBlockLabel: instructionsRaw?.showBlockLabel !== false,
            preBlockBeforeBlockIntro: instructionsRaw?.preBlockBeforeBlockIntro === true,
            pmTemplate,
            blockIntroControlTemplate: asString(instructionsRaw?.blockIntroControlTemplate) ||
                "This is a {nLevel}-back block. There are no PM trials in this block.",
            blockIntroPmTemplate: asString(instructionsRaw?.blockIntroPmTemplate) ||
                "This is a {nLevel}-back PM block. Watch for {pmCategoryText}.",
        },
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
function parseBlock(entry, index, isPractice, variableResolver, feedbackFallback) {
    const b = asObject(entry);
    if (!b)
        throw new Error(`Invalid PM plan: block ${index + 1} is not an object.`);
    const scope = { blockIndex: index };
    const resolvedPhase = variableResolver ? variableResolver.resolveToken(b.phase, scope) : b.phase;
    const phaseRaw = (asString(resolvedPhase) || "").toLowerCase();
    const resolvedIsPractice = variableResolver ? variableResolver.resolveToken(b.isPractice, scope) : b.isPractice;
    const inferredPractice = typeof resolvedIsPractice === "boolean" ? resolvedIsPractice : phaseRaw === "practice";
    const isPracticeResolved = isPractice ?? inferredPractice;
    const resolvedLabel = variableResolver ? variableResolver.resolveToken(b.label, scope) : b.label;
    const label = asString(resolvedLabel) || `${isPracticeResolved ? "Practice" : "Block"} ${index + 1}`;
    const resolvedBlockType = variableResolver ? variableResolver.resolveToken(b.blockType, scope) : b.blockType;
    const rawType = (asString(resolvedBlockType) || "control").toLowerCase();
    if (rawType !== "pm" && rawType !== "control")
        throw new Error(`Invalid PM plan: block '${label}' has invalid blockType.`);
    const blockType = rawType === "pm" ? "PM" : "Control";
    const resolvedTrials = variableResolver ? variableResolver.resolveToken(b.trials, scope) : b.trials;
    const trials = toPositiveNumber(resolvedTrials, isPracticeResolved ? 20 : 54);
    const resolvedNLevel = variableResolver ? variableResolver.resolveToken(b.nLevel, scope) : b.nLevel;
    const nLevel = toPositiveNumber(resolvedNLevel, isPracticeResolved ? 2 : 1);
    const activePmCategories = asStringArray(b.activePmCategories, ["pm"]);
    const nbackSourceCategories = asStringArray(b.nbackSourceCategories, ["other"]);
    const controlSourceCategories = asStringArray(b.controlSourceCategories, []);
    const resolvedPmCount = variableResolver ? variableResolver.resolveToken(b.pmCount, scope) : b.pmCount;
    const resolvedTargetCount = variableResolver ? variableResolver.resolveToken(b.targetCount, scope) : b.targetCount;
    const resolvedLureCount = variableResolver ? variableResolver.resolveToken(b.lureCount, scope) : b.lureCount;
    const resolvedMinPmSep = variableResolver ? variableResolver.resolveToken(b.minPmSeparation, scope) : b.minPmSeparation;
    const resolvedMaxPmSep = variableResolver ? variableResolver.resolveToken(b.maxPmSeparation, scope) : b.maxPmSeparation;
    const resolvedStimulusVariant = variableResolver ? variableResolver.resolveToken(b.stimulusVariant, scope) : b.stimulusVariant;
    const resolvedFeedbackRaw = variableResolver ? variableResolver.resolveToken(b.feedback, scope) : b.feedback;
    const rawBeforeBlockScreens = b.beforeBlockScreens ?? b.preBlockInstructions;
    const rawAfterBlockScreens = b.afterBlockScreens ?? b.postBlockInstructions;
    const resolvedBeforeBlockScreens = resolveWithVariables(rawBeforeBlockScreens, variableResolver, scope);
    const resolvedAfterBlockScreens = resolveWithVariables(rawAfterBlockScreens, variableResolver, scope);
    const feedback = parseTrialFeedbackConfig(asObject(resolvedFeedbackRaw), feedbackFallback ?? null);
    return {
        label,
        blockType,
        isPractice: isPracticeResolved,
        nLevel,
        trials,
        activePmCategories,
        nbackSourceCategories,
        controlSourceCategories,
        pmCount: toNonNegativeNumber(resolvedPmCount, isPracticeResolved ? 2 : 5),
        targetCount: toNonNegativeNumber(resolvedTargetCount, isPracticeResolved ? 6 : 18),
        lureCount: toNonNegativeNumber(resolvedLureCount, isPracticeResolved ? 3 : 18),
        minPmSeparation: toPositiveNumber(resolvedMinPmSep, 8),
        maxPmSeparation: toPositiveNumber(resolvedMaxPmSep, 11),
        stimulusVariant: Number.isFinite(Number(resolvedStimulusVariant))
            ? Math.max(1, Math.floor(Number(resolvedStimulusVariant)))
            : null,
        feedback,
        beforeBlockScreens: toStringScreens(resolvedBeforeBlockScreens),
        afterBlockScreens: toStringScreens(resolvedAfterBlockScreens),
    };
}
function parseStimulusPools(config) {
    const stimuliRaw = asObject(config.stimuli);
    if (!stimuliRaw) {
        return {
            pm: makeSynthetic("pm", 400),
            control: makeSynthetic("control", 400),
            other: makeSynthetic("other", 600),
        };
    }
    const out = {};
    for (const [key, value] of Object.entries(stimuliRaw)) {
        const list = asArray(value).map((item) => asString(item)).filter((item) => Boolean(item));
        if (list.length > 0)
            out[key] = list;
    }
    if (!out.pm)
        out.pm = makeSynthetic("pm", 400);
    if (!out.control)
        out.control = makeSynthetic("control", 400);
    if (!out.other)
        out.other = makeSynthetic("other", 600);
    return out;
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
function buildExperimentPlan(config, rng) {
    const blocks = [...config.practiceBlocks, ...config.mainBlocks];
    let mainCycleIndex = 0;
    return blocks.map((block, index) => {
        const resolvedVariant = resolveBlockStimulusVariant(config, block, rng, mainCycleIndex);
        if (!block.isPractice && config.imageAssets.mainMode === "cycle" && config.imageAssets.mainVariants.length > 0) {
            mainCycleIndex += 1;
        }
        return buildBlockPlanWithChecks(block, index, config, rng, resolvedVariant);
    });
}
function buildBlockPlanWithChecks(block, blockIndex, config, rng, stimulusVariant) {
    const maxAttempts = Math.max(5, config.nbackRule.maxInsertionAttempts * 3);
    let lastError = null;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        try {
            return buildBlockPlanAttempt(block, blockIndex, config, rng, stimulusVariant);
        }
        catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
        }
    }
    throw new Error(`Failed to generate valid PM block '${block.label}' after ${maxAttempts} attempts: ${lastError?.message ?? "unknown error"}`);
}
function buildBlockPlanAttempt(block, blockIndex, config, rng, stimulusVariant) {
    const effectivePmCount = block.blockType === "Control" && block.controlSourceCategories.length === 0
        ? 0
        : block.pmCount;
    const pmPositions = generatePmPositions(rng, block.trials, effectivePmCount, block.minPmSeparation, block.maxPmSeparation);
    const pmPositionSet = new Set(pmPositions);
    const excluded = new Set([...block.activePmCategories, ...block.controlSourceCategories]);
    const nbackCandidates = collectPoolCandidates(config.stimuliByCategory, block.nbackSourceCategories, excluded);
    if (nbackCandidates.length === 0) {
        nbackCandidates.push(...collectPoolCandidates(config.stimuliByCategory, ["other"], new Set()));
    }
    if (nbackCandidates.length === 0)
        throw new Error(`Block '${block.label}' has no n-back candidate items.`);
    const drawPm = createCategoryPoolDrawer(config.stimuliByCategory, block.blockType === "PM" ? block.activePmCategories : block.controlSourceCategories, rng, { itemDraw: config.pmItemPoolDraw, categoryDraw: config.pmCategoryDraw });
    const drawNback = createPoolDrawer(nbackCandidates, rng, config.nbackPoolDraw);
    const trials = [];
    for (let i = 0; i < block.trials; i += 1) {
        if (pmPositionSet.has(i)) {
            const picked = drawPm();
            trials.push({
                trialIndex: i,
                trialType: "PM",
                item: picked.item,
                sourceCategory: picked.category,
                itemCategory: block.blockType === "PM" ? "PM" : "Control",
                correctResponse: config.mapping.pmKey,
            });
        }
        else {
            const picked = drawNback();
            trials.push({
                trialIndex: i,
                trialType: "F",
                item: picked.item,
                sourceCategory: picked.category,
                itemCategory: "other",
                correctResponse: config.mapping.nonTargetKey,
            });
        }
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
    if (block.blockType === "Control") {
        for (const pos of pmPositions) {
            const trial = trials[pos];
            if (!trial)
                continue;
            trial.trialType = "F";
            trial.correctResponse = config.mapping.nonTargetKey;
            trial.itemCategory = "Control";
        }
    }
    const planned = {
        blockIndex,
        label: block.label,
        blockType: block.blockType,
        isPractice: block.isPractice,
        nLevel: block.nLevel,
        stimulusVariant,
        activePmCategories: block.activePmCategories,
        trials,
        feedback: block.feedback,
        beforeBlockScreens: block.beforeBlockScreens,
        afterBlockScreens: block.afterBlockScreens,
    };
    validatePmBlock(planned, pmPositionSet, config.mapping);
    return planned;
}
function generatePmPositions(rng, nTrials, nPm, minSep, maxSep) {
    if (nPm <= 0)
        return [];
    if (minSep <= 0 || maxSep < minSep)
        throw new Error("Invalid PM separation settings.");
    if (nPm * minSep > nTrials - 1)
        throw new Error(`Cannot place ${nPm} PM trials in ${nTrials} trials.`);
    const positions = [];
    let lastPos = 0;
    for (let i = 0; i < nPm; i += 1) {
        const remaining = nPm - i - 1;
        const minPos = lastPos + minSep;
        const latestByMaxGap = lastPos + maxSep;
        const latestByRemaining = nTrials - 1 - remaining * minSep;
        const maxPos = Math.min(latestByMaxGap, latestByRemaining);
        if (minPos > maxPos)
            throw new Error(`Cannot place PM trial ${i + 1}/${nPm}.`);
        const pos = rng.int(minPos, maxPos);
        positions.push(pos);
        lastPos = pos;
    }
    return positions;
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
function validatePmBlock(block, pmPositionSet, mapping) {
    for (let i = 0; i < block.trials.length; i += 1) {
        const trial = block.trials[i];
        const atPmSlot = pmPositionSet.has(i);
        if (block.blockType === "PM" && atPmSlot) {
            if (trial.trialType !== "PM") {
                throw new Error(`PM integrity: block '${block.label}' trial ${i} should be PM-slot but is '${trial.trialType}'.`);
            }
            if (trial.correctResponse !== mapping.pmKey) {
                throw new Error(`PM integrity: block '${block.label}' trial ${i} PM-slot does not use pmKey.`);
            }
        }
        if (block.blockType === "Control" && atPmSlot) {
            if (trial.trialType !== "F") {
                throw new Error(`PM integrity: block '${block.label}' control-slot trial ${i} must be filler after remap.`);
            }
            if (trial.correctResponse !== mapping.nonTargetKey) {
                throw new Error(`PM integrity: block '${block.label}' control-slot trial ${i} must use nonTargetKey.`);
            }
        }
        if (trial.trialType === "N" && trial.correctResponse !== mapping.targetKey) {
            throw new Error(`PM integrity: block '${block.label}' trial ${i} N-target does not use targetKey.`);
        }
        if (trial.trialType === "F" && trial.correctResponse !== mapping.nonTargetKey) {
            throw new Error(`PM integrity: block '${block.label}' trial ${i} filler does not use nonTargetKey.`);
        }
    }
    for (let i = 0; i < block.trials.length; i += 1) {
        const trial = block.trials[i];
        const backPos = i - block.nLevel;
        const hasNback = backPos >= 0;
        const nbackMatch = hasNback ? trial.item === block.trials[backPos].item : false;
        if (trial.trialType === "PM" && nbackMatch) {
            throw new Error(`PM integrity: block '${block.label}' trial ${i} is PM but also n-back match.`);
        }
        if (trial.trialType === "N" && !nbackMatch) {
            throw new Error(`PM integrity: block '${block.label}' trial ${i} marked N but does not match n-back.`);
        }
        if (trial.trialType === "F" && nbackMatch) {
            throw new Error(`PM integrity: block '${block.label}' trial ${i} marked F but matches n-back.`);
        }
        if (trial.trialType.startsWith("L")) {
            const lag = Number.parseInt(trial.trialType.slice(1), 10);
            if (!Number.isInteger(lag) || lag <= 0 || lag === block.nLevel) {
                throw new Error(`PM integrity: block '${block.label}' trial ${i} has invalid lure label '${trial.trialType}'.`);
            }
            const lurePos = i - lag;
            if (lurePos < 0 || trial.item !== block.trials[lurePos].item) {
                throw new Error(`PM integrity: block '${block.label}' trial ${i} lure does not match lag ${lag}.`);
            }
            if (nbackMatch) {
                throw new Error(`PM integrity: block '${block.label}' trial ${i} lure also matches n-back.`);
            }
        }
    }
}
function resolveStimulusPath(parsed, block, itemId, trialIndex, resolver) {
    if (!parsed.imageAssets.enabled)
        return itemId;
    const variant = Math.max(1, block.stimulusVariant ?? parsed.imageAssets.practiceVariant);
    return resolveAssetPath({
        basePath: parsed.imageAssets.basePath,
        template: parsed.imageAssets.filenameTemplate,
        resolver,
        context: {
            blockIndex: block.blockIndex,
            trialIndex,
            locals: {
                itemId,
                stimulusVariant: variant,
                blockIndex: block.blockIndex,
                blockLabel: block.label,
                nLevel: block.nLevel,
            },
        },
    });
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
async function preloadPmStimulus(item) {
    const image = await loadImageIfLikelyVisualStimulus(item, PM_IMAGE_CACHE);
    return { image };
}
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
function createPmVariableResolver(parsed, context) {
    return createVariableResolver({
        variables: parsed.variableDefinitions,
        seedParts: [
            context.selection.participant.participantId,
            context.selection.participant.sessionId,
            context.selection.variantId,
            "pm_variables",
        ],
    });
}
function applyPmVariableResolution(parsed, resolver) {
    const blocks = [...parsed.practiceBlocks, ...parsed.mainBlocks];
    for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
        const block = blocks[blockIndex];
        const scope = { blockIndex };
        block.activePmCategories = expandCategoryEntriesWithVariables(block.activePmCategories, resolver, scope);
        block.controlSourceCategories = expandCategoryEntriesWithVariables(block.controlSourceCategories, resolver, scope);
        block.nbackSourceCategories = expandCategoryEntriesWithVariables(block.nbackSourceCategories, resolver, scope);
    }
    const referencedCategories = blocks.flatMap((block) => [
        ...block.activePmCategories,
        ...block.controlSourceCategories,
        ...block.nbackSourceCategories,
    ]);
    ensureStimulusCategories(parsed.stimuliByCategory, referencedCategories);
    parsed.pmCategories = Array.from(new Set(blocks.flatMap((block) => block.activePmCategories)));
}
function expandCategoryEntriesWithVariables(entries, resolver, context) {
    const flattenResolved = (value) => {
        const resolved = resolveWithVariables(value, resolver, context);
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
    return out.length > 0 ? out : entries;
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