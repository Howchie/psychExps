import { asArray, asObject, asString, buildConditionSequence, computeCanvasFrameLayout, computeRtPhaseDurations, createColorRegistry, createConditionCellId, createEventLogger, createMulberry32, createSemanticResolver, createResponseSemantics, drawCanvasCenteredText, drawCanvasFramedScene, drawTrialFeedbackOnCanvas, escapeHtml, evaluateTrialOutcome, finalizeTaskRun, hashSeed, installKeyScrollBlocker, loadCsvDictionary, loadTokenPool, normalizeKey, parseTrialFeedbackConfig, pushJsPsychContinueScreen, recordsToCsv, resolveJsPsychContentHost, resolveTrialFeedbackView, runJsPsychTimeline, setCursorHidden, toJsPsychChoices, toNonNegativeNumber, toPositiveNumber, toStringScreens, waitForContinue, ensureJsPsychCanvasCentered, } from "@experiments/core";
import { initJsPsych } from "jspsych";
import CanvasKeyboardResponsePlugin from "@jspsych/plugin-canvas-keyboard-response";
import CallFunctionPlugin from "@jspsych/plugin-call-function";
function shouldHideCursorForPhase(phase) {
    if (typeof phase !== "string")
        return false;
    return /(fixation|blank|stimulus|response|feedback)/.test(phase.toLowerCase());
}
class StroopTaskAdapter {
    manifest = {
        taskId: "stroop",
        label: "Stroop",
        variants: [
            { id: "default", label: "Classic Congruence", configPath: "stroop/default" },
            { id: "arbitrary_words", label: "Arbitrary Word Pool", configPath: "stroop/arbitrary_words" },
            { id: "emotional_valence", label: "Emotional Stroop", configPath: "stroop/emotional_valence" },
        ],
    };
    context = null;
    removeKeyScrollBlocker = null;
    async initialize(context) {
        this.context = context;
    }
    async execute() {
        if (!this.context)
            throw new Error("Stroop Task not initialized");
        const result = await runStroopTask(this.context);
        return result;
    }
    async terminate() {
        setCursorHidden(false);
        if (this.removeKeyScrollBlocker) {
            this.removeKeyScrollBlocker();
            this.removeKeyScrollBlocker = null;
        }
    }
    setKeyScrollRemover(remover) {
        this.removeKeyScrollBlocker = remover;
    }
}
export const stroopAdapter = new StroopTaskAdapter();
async function runStroopTask(context) {
    const parsed = await parseStroopConfig(context.taskConfig);
    const selection = context.selection;
    const participantId = selection.participant.participantId;
    const baseRng = createMulberry32(hashSeed(participantId, selection.participant.sessionId, selection.variantId, "stroop"));
    const records = [];
    const root = context.container;
    const eventLogger = createEventLogger(selection);
    root.style.maxWidth = "980px";
    root.style.margin = "0 auto";
    root.style.fontFamily = "system-ui";
    ensureJsPsychCanvasCentered(root);
    const removeKeyScrollBlocker = installKeyScrollBlocker(parsed.allowedKeys);
    if (stroopAdapter instanceof StroopTaskAdapter) {
        stroopAdapter.setKeyScrollRemover(removeKeyScrollBlocker);
    }
    const plannedBlocks = buildStroopPlan(parsed, baseRng);
    eventLogger.emit("task_start", { task: "stroop", runner: "jspsych", mode: parsed.mode });
    const timeline = [];
    pushJsPsychContinueScreen(timeline, CallFunctionPlugin, root, `<h2>${escapeHtml(parsed.title)}</h2><p>Participant: <code>${escapeHtml(participantId)}</code></p>`, "intro_start", "stroop-continue-intro_start");
    pushJsPsychContinueScreen(timeline, CallFunctionPlugin, root, `<p>${escapeHtml(parsed.instructions)}</p><p><b>Respond to the font color:</b> red = <code>${escapeHtml(parsed.mapping.redKey)}</code>, green = <code>${escapeHtml(parsed.mapping.greenKey)}</code></p>`, "intro_instructions", "stroop-continue-intro_instructions");
    for (let blockIndex = 0; blockIndex < plannedBlocks.length; blockIndex += 1) {
        const block = plannedBlocks[blockIndex];
        timeline.push({
            type: CallFunctionPlugin,
            data: { phase: "block_start_hook", blockIndex, blockId: block.id },
            func: () => {
                eventLogger.emit("block_start", { blockId: block.id, label: block.label }, { blockIndex });
            },
        });
        pushJsPsychContinueScreen(timeline, CallFunctionPlugin, root, `<h3>${escapeHtml(block.label)}</h3><p>Press continue when ready.</p>`, "block_start", `stroop-continue-block_start-${blockIndex}`, { blockIndex });
        for (let instructionIndex = 0; instructionIndex < block.beforeBlockScreens.length; instructionIndex += 1) {
            const instruction = block.beforeBlockScreens[instructionIndex];
            pushJsPsychContinueScreen(timeline, CallFunctionPlugin, root, `<h3>${escapeHtml(block.label)}</h3><p>${escapeHtml(instruction)}</p>`, "block_pre_instruction", `stroop-continue-block_pre_instruction-${blockIndex}-${instructionIndex}`, { blockIndex, instructionIndex });
        }
        for (const trial of block.trials) {
            appendStroopTrialTimeline({
                timeline,
                parsed,
                block,
                blockIndex,
                trial,
                participantId,
                variantId: selection.variantId,
                records,
                eventLogger,
            });
        }
        timeline.push({
            type: CallFunctionPlugin,
            data: { phase: "block_end_hook", blockIndex, blockId: block.id },
            func: () => {
                const blockRows = records.filter((row) => row.blockIndex === blockIndex);
                const accuracy = blockRows.length > 0 ? Math.round((blockRows.reduce((acc, row) => acc + row.responseCorrect, 0) / blockRows.length) * 1000) / 10 : 0;
                eventLogger.emit("block_end", { blockId: block.id, label: block.label, accuracy }, { blockIndex });
            },
        });
        timeline.push({
            type: CallFunctionPlugin,
            data: { phase: "block_end", blockIndex, blockId: block.id },
            async: true,
            func: (done) => {
                const blockRows = records.filter((row) => row.blockIndex === blockIndex);
                const accuracy = blockRows.length > 0 ? Math.round((blockRows.reduce((acc, row) => acc + row.responseCorrect, 0) / blockRows.length) * 1000) / 10 : 0;
                const host = resolveJsPsychContentHost(root);
                void waitForContinue(host, `<h3>End of ${escapeHtml(block.label)}</h3><p>Accuracy: <b>${accuracy.toFixed(1)}%</b></p>`, {
                    buttonId: `stroop-end-${block.id}`,
                }).then(done);
            },
        });
        for (let instructionIndex = 0; instructionIndex < block.afterBlockScreens.length; instructionIndex += 1) {
            const instruction = block.afterBlockScreens[instructionIndex];
            pushJsPsychContinueScreen(timeline, CallFunctionPlugin, root, `<h3>${escapeHtml(block.label)}</h3><p>${escapeHtml(instruction)}</p>`, "block_post_instruction", `stroop-continue-block_post_instruction-${blockIndex}-${instructionIndex}`, { blockIndex, instructionIndex });
        }
    }
    const jsPsych = initJsPsych({
        display_element: root,
        on_trial_start: (trial) => {
            const data = asObject(trial?.data);
            setCursorHidden(shouldHideCursorForPhase(data?.phase));
        },
        on_finish: () => {
            setCursorHidden(false);
        }
    });
    try {
        await runJsPsychTimeline(jsPsych, timeline);
    }
    finally {
        setCursorHidden(false);
    }
    eventLogger.emit("task_end", {
        task: "stroop",
        mode: parsed.mode,
        trials: records.length,
    });
    const csv = recordsToCsv(records);
    const payload = {
        selection,
        runner: "jspsych",
        mode: parsed.mode,
        records,
        events: eventLogger.events,
        jsPsychData: jsPsych.data.get().values(),
    };
    await finalizeTaskRun({
        coreConfig: context.coreConfig,
        selection,
        payload,
        csv: csv ? { contents: csv, suffix: "stroop_trials" } : null,
        completionStatus: "complete",
    });
    const host = resolveJsPsychContentHost(root);
    const accuracy = records.length > 0 ? Math.round((records.reduce((acc, row) => acc + row.responseCorrect, 0) / records.length) * 1000) / 10 : 0;
    await waitForContinue(host, `<h2>Task complete</h2><p>Trials: <b>${records.length}</b></p><p>Accuracy: <b>${accuracy.toFixed(1)}%</b></p>`, { buttonId: "stroop-task-complete" });
    return payload;
}
function appendStroopTrialTimeline(args) {
    const { timeline, parsed, block, blockIndex, trial, participantId, variantId, records, eventLogger } = args;
    const layout = computeCanvasFrameLayout({
        aperturePx: parsed.display.aperturePx,
        paddingYPx: parsed.display.paddingYPx,
        cueHeightPx: parsed.display.cueHeightPx,
        cueMarginBottomPx: parsed.display.cueMarginBottomPx,
    });
    const feedback = block.feedback;
    const phase = computeRtPhaseDurations(parsed.rtTask.timing, {
        responseTerminatesTrial: parsed.rtTask.responseTerminatesTrial,
    });
    let feedbackView = null;
    timeline.push({
        type: CanvasKeyboardResponsePlugin,
        stimulus: (canvas) => {
            drawFixation(canvas, parsed, layout);
        },
        canvas_size: [layout.totalHeightPx, parsed.display.aperturePx],
        choices: "NO_KEYS",
        response_ends_trial: false,
        trial_duration: Math.max(0, Math.round(phase.fixationMs)),
        data: {
            phase: "fixation",
            blockIndex,
            trialIndex: trial.trialIndex,
            blockId: block.id,
            trialId: trial.id,
        },
    });
    if (phase.blankMs > 0) {
        timeline.push({
            type: CanvasKeyboardResponsePlugin,
            stimulus: (canvas) => {
                drawBlank(canvas, parsed, layout);
            },
            canvas_size: [layout.totalHeightPx, parsed.display.aperturePx],
            choices: "NO_KEYS",
            response_ends_trial: false,
            trial_duration: Math.max(0, Math.round(phase.blankMs)),
            data: {
                phase: "blank",
                blockIndex,
                trialIndex: trial.trialIndex,
                blockId: block.id,
                trialId: trial.id,
            },
        });
    }
    timeline.push({
        type: CanvasKeyboardResponsePlugin,
        stimulus: (canvas) => {
            drawStimulus(canvas, parsed, layout, trial);
        },
        canvas_size: [layout.totalHeightPx, parsed.display.aperturePx],
        choices: toJsPsychChoices(parsed.allowedKeys),
        response_ends_trial: parsed.rtTask.responseTerminatesTrial,
        trial_duration: Math.max(0, Math.round(phase.responseMs)),
        data: {
            phase: "response_window",
            blockIndex,
            trialIndex: trial.trialIndex,
            blockId: block.id,
            trialId: trial.id,
            mode: parsed.mode,
            conditionLabel: trial.conditionLabel,
            fontColorToken: trial.fontColorToken,
            word: trial.word,
        },
        on_finish: (data) => {
            const response = extractTrialResponse(data);
            const responseCategory = parsed.responseSemantics.responseCategoryFromKey(response.key);
            const outcome = evaluateTrialOutcome({
                responseCategory,
                expectedCategory: trial.fontColorToken,
                rt: response.rtMs,
            });
            feedbackView = resolveTrialFeedbackView({
                feedback,
                responseCategory,
                correct: outcome.correct,
                vars: {
                    expectedCategory: trial.fontColorToken,
                    word: trial.word,
                    conditionLabel: trial.conditionLabel,
                    blockLabel: block.label,
                },
            });
            const record = {
                participantId,
                variantId,
                mode: parsed.mode,
                blockId: block.id,
                blockLabel: block.label,
                blockIndex,
                trialId: trial.id,
                trialIndex: trial.trialIndex,
                word: trial.word,
                wordColorToken: trial.wordColorToken ?? "",
                valence: trial.valence ?? "",
                fontColorToken: trial.fontColorToken,
                fontColorHex: trial.fontColorHex,
                conditionLabel: trial.conditionLabel,
                correctResponse: trial.correctResponse,
                responseKey: response.key ?? "",
                responseRtMs: outcome.rt,
                responseCorrect: outcome.correct,
            };
            records.push(record);
            eventLogger.emit("trial_end", {
                conditionLabel: trial.conditionLabel,
                word: trial.word,
                fontColorToken: trial.fontColorToken,
                responseKey: record.responseKey,
                responseRtMs: record.responseRtMs,
                responseCorrect: record.responseCorrect,
            }, { blockIndex, trialIndex: trial.trialIndex });
        },
    });
    const postResponseMs = Math.max(0, Math.round(phase.postResponseStimulusMs));
    if (!parsed.rtTask.responseTerminatesTrial && postResponseMs > 0) {
        timeline.push({
            type: CanvasKeyboardResponsePlugin,
            stimulus: (canvas) => {
                if (feedback.enabled && parsed.rtTask.feedbackPhase === "post_response") {
                    drawFeedback(canvas, parsed, layout, feedback, feedbackView);
                    return;
                }
                if (parsed.rtTask.postResponseContent === "blank") {
                    drawBlank(canvas, parsed, layout);
                    return;
                }
                drawStimulus(canvas, parsed, layout, trial);
            },
            canvas_size: [layout.totalHeightPx, parsed.display.aperturePx],
            choices: "NO_KEYS",
            response_ends_trial: false,
            trial_duration: postResponseMs,
            data: {
                phase: "post_response",
                blockIndex,
                trialIndex: trial.trialIndex,
                blockId: block.id,
                trialId: trial.id,
            },
        });
    }
    if (feedback.enabled &&
        feedback.durationMs > 0 &&
        !(parsed.rtTask.feedbackPhase === "post_response" && !parsed.rtTask.responseTerminatesTrial)) {
        timeline.push({
            type: CanvasKeyboardResponsePlugin,
            stimulus: (canvas) => {
                drawFeedback(canvas, parsed, layout, feedback, feedbackView);
            },
            canvas_size: [layout.totalHeightPx, parsed.display.aperturePx],
            choices: "NO_KEYS",
            response_ends_trial: false,
            trial_duration: Math.max(0, feedback.durationMs),
            data: {
                phase: "feedback",
                blockIndex,
                trialIndex: trial.trialIndex,
                blockId: block.id,
                trialId: trial.id,
            },
        });
    }
}
function drawFixation(canvas, parsed, layout) {
    const ctx = canvas.getContext("2d");
    if (!ctx)
        return;
    drawCanvasFramedScene(ctx, layout, {
        cueText: "",
        cueColor: parsed.display.cueColor,
        frameBackground: parsed.display.frameBackground,
        frameBorder: parsed.display.frameBorder,
    }, ({ ctx: frameCtx, centerX, centerY }) => {
        drawCanvasCenteredText(frameCtx, centerX, centerY, "+", {
            color: parsed.display.fixationColor,
            fontSizePx: parsed.display.fixationFontSizePx,
            fontWeight: parsed.display.fixationFontWeight,
        });
    });
}
function drawBlank(canvas, parsed, layout) {
    const ctx = canvas.getContext("2d");
    if (!ctx)
        return;
    drawCanvasFramedScene(ctx, layout, {
        cueText: "",
        cueColor: parsed.display.cueColor,
        frameBackground: parsed.display.frameBackground,
        frameBorder: parsed.display.frameBorder,
    });
}
function drawStimulus(canvas, parsed, layout, trial) {
    const ctx = canvas.getContext("2d");
    if (!ctx)
        return;
    drawCanvasFramedScene(ctx, layout, {
        cueText: "",
        cueColor: parsed.display.cueColor,
        frameBackground: parsed.display.frameBackground,
        frameBorder: parsed.display.frameBorder,
    }, ({ ctx: frameCtx, centerX, centerY }) => {
        drawCanvasCenteredText(frameCtx, centerX, centerY, trial.word, {
            color: trial.fontColorHex,
            fontSizePx: parsed.display.stimulusFontSizePx,
            fontWeight: parsed.display.stimulusFontWeight,
        });
    });
}
function drawFeedback(canvas, parsed, layout, feedback, feedbackView) {
    const ctx = canvas.getContext("2d");
    if (!ctx)
        return;
    drawTrialFeedbackOnCanvas(ctx, layout, feedback, feedbackView);
    void parsed;
}
function extractTrialResponse(data) {
    const rawKey = data.response;
    const rawRt = data.rt;
    const key = typeof rawKey === "string" ? normalizeKey(rawKey) : null;
    const rtMs = typeof rawRt === "number" && Number.isFinite(rawRt) ? rawRt : null;
    return { key, rtMs };
}
async function parseStroopConfig(config) {
    const taskRaw = asObject(config.task);
    const conditionsRaw = asObject(config.conditions);
    const displayRaw = asObject(config.display);
    const stimuliRaw = asObject(config.stimuli);
    const planRaw = asObject(config.plan);
    const mappingRaw = asObject(config.mapping);
    const mode = parseMode(conditionsRaw?.mode);
    const mapping = {
        redKey: normalizeKey(asString(mappingRaw?.redKey) || "f"),
        greenKey: normalizeKey(asString(mappingRaw?.greenKey) || "j"),
    };
    if (mapping.redKey === mapping.greenKey) {
        throw new Error("Stroop config invalid: mapping.redKey and mapping.greenKey must be distinct.");
    }
    const responseColorTokens = asArray(stimuliRaw?.responseColorTokens)
        .map((entry) => asString(entry)?.toLowerCase())
        .filter((entry) => Boolean(entry));
    const normalizedResponseColors = responseColorTokens.length > 0 ? dedupeStrings(responseColorTokens) : ["red", "green"];
    for (const required of ["red", "green"]) {
        if (!normalizedResponseColors.includes(required)) {
            throw new Error(`Stroop config invalid: stimuli.responseColorTokens must include '${required}'.`);
        }
    }
    const responseSemantics = createResponseSemantics({
        red: mapping.redKey,
        green: mapping.greenKey,
    });
    const textColorByTokenRaw = asObject(displayRaw?.textColorByToken);
    const textColorByToken = {
        red: "#ff0000",
        green: "#00aa00",
        ...(textColorByTokenRaw ?? {}),
    };
    const colorRegistry = createColorRegistry(textColorByToken);
    for (const token of normalizedResponseColors) {
        if (!colorRegistry.has(token)) {
            throw new Error(`Stroop config invalid: display.textColorByToken missing token '${token}'.`);
        }
    }
    const feedbackDefaults = parseTrialFeedbackConfig(asObject(config.feedback), null);
    const defaultTiming = {
        trialDurationMs: 2000,
        fixationDurationMs: 500,
        stimulusOnsetMs: 700,
        responseWindowStartMs: 700,
        responseWindowEndMs: 1700,
    };
    const legacyTimingRaw = asObject(config.timing);
    if (legacyTimingRaw) {
        defaultTiming.trialDurationMs = toPositiveNumber(legacyTimingRaw.trialDurationMs, defaultTiming.trialDurationMs);
        defaultTiming.fixationDurationMs = toNonNegativeNumber(legacyTimingRaw.fixationDurationMs, defaultTiming.fixationDurationMs);
        defaultTiming.stimulusOnsetMs = toNonNegativeNumber(legacyTimingRaw.stimulusOnsetMs, defaultTiming.stimulusOnsetMs);
        defaultTiming.responseWindowStartMs = toNonNegativeNumber(legacyTimingRaw.responseWindowStartMs, defaultTiming.responseWindowStartMs);
        defaultTiming.responseWindowEndMs = toNonNegativeNumber(legacyTimingRaw.responseWindowEndMs, defaultTiming.responseWindowEndMs);
    }
    const rtRaw = asObject(taskRaw?.rtTask);
    const rtTimingRaw = asObject(rtRaw?.timing);
    const rtTiming = {
        trialDurationMs: toPositiveNumber(rtTimingRaw?.trialDurationMs, defaultTiming.trialDurationMs),
        fixationDurationMs: toNonNegativeNumber(rtTimingRaw?.fixationDurationMs, defaultTiming.fixationDurationMs),
        stimulusOnsetMs: toNonNegativeNumber(rtTimingRaw?.stimulusOnsetMs, defaultTiming.stimulusOnsetMs),
        responseWindowStartMs: toNonNegativeNumber(rtTimingRaw?.responseWindowStartMs, defaultTiming.responseWindowStartMs),
        responseWindowEndMs: toNonNegativeNumber(rtTimingRaw?.responseWindowEndMs, defaultTiming.responseWindowEndMs),
    };
    const postResponseContentRaw = (asString(rtRaw?.postResponseContent) || "stimulus").toLowerCase();
    const feedbackPhaseRaw = (asString(rtRaw?.feedbackPhase) || "separate").toLowerCase();
    const blockCount = toPositiveNumber(planRaw?.blockCount, 2);
    const blockTemplateRaw = asObject(planRaw?.blockTemplate);
    const trialsPerBlock = toPositiveNumber(blockTemplateRaw?.trials, 36);
    const blockFeedback = parseTrialFeedbackConfig(asObject(blockTemplateRaw?.feedback), feedbackDefaults);
    const rawBeforeBlockScreens = blockTemplateRaw?.beforeBlockScreens ?? blockTemplateRaw?.preBlockInstructions;
    const rawAfterBlockScreens = blockTemplateRaw?.afterBlockScreens ?? blockTemplateRaw?.postBlockInstructions;
    const parsedBeforeBlockScreens = toStringScreens(rawBeforeBlockScreens);
    const parsedAfterBlockScreens = toStringScreens(rawAfterBlockScreens);
    const blocks = Array.from({ length: blockCount }, (_, idx) => ({
        id: `B${idx + 1}`,
        label: (asString(blockTemplateRaw?.label) || "Block {blockIndex}").replace("{blockIndex}", String(idx + 1)),
        trials: trialsPerBlock,
        feedback: blockFeedback,
        beforeBlockScreens: parsedBeforeBlockScreens.map((screen) => screen.replaceAll("{blockIndex}", String(idx + 1))),
        afterBlockScreens: parsedAfterBlockScreens.map((screen) => screen.replaceAll("{blockIndex}", String(idx + 1))),
    }));
    const labels = mode === "congruence"
        ? ["congruent", "incongruent", "neutral"]
        : ["positive", "neutral", "negative"];
    const quotaPerBlock = parseQuotaMap(asObject(conditionsRaw?.quotaPerBlock), labels, trialsPerBlock);
    const fontColorQuotaPerBlock = parseQuotaMap(asObject(conditionsRaw?.fontColorQuotaPerBlock), normalizedResponseColors, trialsPerBlock);
    const words = await resolveWords(stimuliRaw);
    const colorLexicon = await resolveColorLexicon(stimuliRaw, normalizedResponseColors);
    const wordColorResolver = createSemanticResolver(colorLexicon);
    const valenceIndex = await resolveValenceIndex(stimuliRaw);
    const valenceResolver = createSemanticResolver(valenceIndex);
    const resolvedWords = mode === "valence" ? dedupeStrings([...words, ...Object.keys(valenceIndex)]) : words;
    if (resolvedWords.length === 0) {
        throw new Error("Stroop config invalid: no stimuli words were found.");
    }
    if (mode === "valence") {
        const unmapped = resolvedWords.filter((word) => !valenceResolver.has(word));
        if (unmapped.length > 0) {
            throw new Error(`Stroop config invalid: valence mode requires all words to be labeled; missing: ${unmapped.slice(0, 10).join(", ")}`);
        }
    }
    return {
        title: asString(taskRaw?.title) || "Stroop Task",
        instructions: asString(taskRaw?.instructions) ||
            "Respond to the FONT COLOR of each word as quickly and accurately as possible.",
        mode,
        mapping,
        responseSemantics,
        allowedKeys: responseSemantics.allowedKeys(["red", "green"]),
        responseColorTokens: normalizedResponseColors,
        rtTask: {
            timing: rtTiming,
            responseTerminatesTrial: rtRaw?.responseTerminatesTrial === true,
            postResponseContent: postResponseContentRaw === "blank" ? "blank" : "stimulus",
            feedbackPhase: feedbackPhaseRaw === "post_response" ? "post_response" : "separate",
        },
        display: {
            aperturePx: toPositiveNumber(displayRaw?.aperturePx, 440),
            paddingYPx: toNonNegativeNumber(displayRaw?.paddingYPx, 16),
            cueHeightPx: toNonNegativeNumber(displayRaw?.cueHeightPx, 0),
            cueMarginBottomPx: toNonNegativeNumber(displayRaw?.cueMarginBottomPx, 0),
            frameBackground: asString(displayRaw?.frameBackground) || "#ffffff",
            frameBorder: asString(displayRaw?.frameBorder) || "2px solid #d1d5db",
            cueColor: asString(displayRaw?.cueColor) || "#0f172a",
            fixationColor: asString(displayRaw?.fixationColor) || "#111827",
            fixationFontSizePx: toPositiveNumber(displayRaw?.fixationFontSizePx, 30),
            fixationFontWeight: toPositiveNumber(displayRaw?.fixationFontWeight, 600),
            stimulusFontSizePx: toPositiveNumber(displayRaw?.stimulusFontSizePx, 56),
            stimulusFontWeight: toPositiveNumber(displayRaw?.stimulusFontWeight, 700),
            textColorByToken,
        },
        feedbackDefaults,
        conditions: {
            labels,
            quotaPerBlock,
            fontColorQuotaPerBlock,
            maxConditionRunLength: toPositiveNumber(conditionsRaw?.maxConditionRunLength, 3),
            noImmediateWordRepeat: conditionsRaw?.noImmediateWordRepeat !== false,
        },
        words: resolvedWords,
        wordColorResolver,
        valenceResolver,
        blocks,
    };
}
function buildStroopPlan(parsed, baseRng) {
    const output = [];
    const responseSet = new Set(parsed.responseColorTokens);
    const colorRegistry = createColorRegistry(parsed.display.textColorByToken);
    for (let blockIndex = 0; blockIndex < parsed.blocks.length; blockIndex += 1) {
        const block = parsed.blocks[blockIndex];
        const blockRng = createMulberry32(hashSeed("stroop_block", block.id, String(blockIndex), String(Math.floor(baseRng() * 1e9))));
        const conditionSequence = buildConditionSequence({
            factors: [{ name: "condition", levels: parsed.conditions.labels }],
            trialCount: block.trials,
            cellWeights: Object.fromEntries(parsed.conditions.labels.map((label) => [
                createConditionCellId({ condition: label }),
                parsed.conditions.quotaPerBlock[label] ?? 0,
            ])),
            adjacency: {
                maxRunLengthByFactor: { condition: parsed.conditions.maxConditionRunLength },
            },
            rng: { next: () => blockRng() },
            maxAttempts: 500,
        }).map((cell) => cell.levels.condition);
        const candidatePools = buildCandidatePools(parsed, responseSet);
        const plannedTrials = buildBlockTrials({
            parsed,
            block,
            conditionSequence,
            candidatePools,
            colorRegistry,
            rng: blockRng,
        });
        output.push({
            id: block.id,
            label: block.label,
            trials: plannedTrials,
            feedback: block.feedback,
            beforeBlockScreens: block.beforeBlockScreens,
            afterBlockScreens: block.afterBlockScreens,
        });
    }
    return output;
}
function buildCandidatePools(parsed, responseSet) {
    const pools = {};
    for (const condition of parsed.conditions.labels) {
        pools[condition] = {};
        for (const colorToken of parsed.responseColorTokens) {
            const candidates = parsed.words.filter((word) => {
                const semanticColor = parsed.wordColorResolver.resolve(word);
                const valence = parsed.valenceResolver.resolve(word);
                if (parsed.mode === "congruence") {
                    if (condition === "congruent")
                        return semanticColor === colorToken;
                    if (condition === "incongruent")
                        return semanticColor != null && responseSet.has(semanticColor) && semanticColor !== colorToken;
                    return semanticColor == null || !responseSet.has(semanticColor);
                }
                return valence === condition;
            });
            pools[condition][colorToken] = dedupeStrings(candidates);
        }
    }
    return pools;
}
function buildBlockTrials(args) {
    const { parsed, block, conditionSequence, candidatePools, colorRegistry, rng } = args;
    for (let attempt = 0; attempt < 300; attempt += 1) {
        const colorSequence = assignColorsToConditionSequence(conditionSequence, parsed.conditions.fontColorQuotaPerBlock, parsed.responseColorTokens, candidatePools, rng);
        if (!colorSequence)
            continue;
        const words = [];
        let prevWord = "";
        let ok = true;
        for (let i = 0; i < conditionSequence.length; i += 1) {
            const condition = conditionSequence[i];
            const color = colorSequence[i];
            const pool = candidatePools[condition]?.[color] ?? [];
            if (pool.length === 0) {
                ok = false;
                break;
            }
            const filtered = parsed.conditions.noImmediateWordRepeat ? pool.filter((word) => word !== prevWord) : pool;
            const chosenPool = filtered.length > 0 ? filtered : pool;
            const word = chooseFrom(chosenPool, rng);
            if (!word) {
                ok = false;
                break;
            }
            words.push(word);
            prevWord = word;
        }
        if (!ok || words.length !== conditionSequence.length)
            continue;
        const trials = words.map((word, idx) => {
            const fontColorToken = colorSequence[idx];
            const fontColorHex = colorRegistry.resolve(fontColorToken) || "#000000";
            const conditionLabel = conditionSequence[idx];
            return {
                id: `${block.id}_T${idx + 1}`,
                trialIndex: idx,
                word,
                fontColorToken,
                fontColorHex,
                conditionLabel,
                wordColorToken: parsed.wordColorResolver.resolve(word),
                valence: parsed.valenceResolver.resolve(word),
                correctResponse: parsed.responseSemantics.keyForCategory(fontColorToken) ?? "",
            };
        });
        return trials;
    }
    throw new Error(`Failed to generate valid Stroop trial list for block '${block.id}'.`);
}
function assignColorsToConditionSequence(conditions, colorQuota, colorTokens, candidatePools, rng) {
    for (let attempt = 0; attempt < 300; attempt += 1) {
        const remaining = { ...colorQuota };
        const assigned = [];
        let ok = true;
        for (const condition of conditions) {
            const candidates = colorTokens.filter((color) => {
                const remainingCount = remaining[color] ?? 0;
                const pool = candidatePools[condition]?.[color] ?? [];
                return remainingCount > 0 && pool.length > 0;
            });
            if (candidates.length === 0) {
                ok = false;
                break;
            }
            const weighted = candidates.flatMap((color) => {
                const weight = Math.max(1, remaining[color] ?? 1);
                return Array.from({ length: weight }, () => color);
            });
            const chosen = chooseFrom(weighted, rng);
            if (!chosen) {
                ok = false;
                break;
            }
            assigned.push(chosen);
            remaining[chosen] = Math.max(0, (remaining[chosen] ?? 0) - 1);
        }
        if (ok && assigned.length === conditions.length) {
            return assigned;
        }
    }
    return null;
}
function parseMode(value) {
    const mode = (asString(value) || "congruence").toLowerCase();
    return mode === "valence" ? "valence" : "congruence";
}
function parseQuotaMap(raw, labels, expectedTotal) {
    const output = {};
    const provided = raw ? labels.some((label) => Object.prototype.hasOwnProperty.call(raw, label)) : false;
    if (!provided) {
        const base = Math.floor(expectedTotal / labels.length);
        let rem = expectedTotal - base * labels.length;
        for (const label of labels) {
            output[label] = base + (rem > 0 ? 1 : 0);
            if (rem > 0)
                rem -= 1;
        }
        return output;
    }
    for (const label of labels) {
        output[label] = toNonNegativeNumber(raw?.[label], 0);
    }
    const total = Object.values(output).reduce((acc, value) => acc + value, 0);
    if (total !== expectedTotal) {
        throw new Error(`Stroop config invalid: quota total (${total}) must equal blockTemplate.trials (${expectedTotal}).`);
    }
    return output;
}
async function resolveWords(stimuliRaw) {
    const wordsCsvRaw = asObject(stimuliRaw?.wordsCsv);
    return loadTokenPool({
        inline: stimuliRaw?.words,
        csv: wordsCsvRaw
            ? {
                path: asString(wordsCsvRaw.path) || "",
                column: asString(wordsCsvRaw.column) || "word",
                basePath: asString(wordsCsvRaw.basePath) || undefined,
            }
            : null,
        normalize: "lowercase",
        dedupe: true,
    });
}
async function resolveColorLexicon(stimuliRaw, responseColorTokens) {
    const baseMap = Object.fromEntries(responseColorTokens.map((token) => [token, token]));
    const colorLexiconRaw = asObject(stimuliRaw?.colorLexicon);
    const inlineMap = asObject(colorLexiconRaw?.map) ?? colorLexiconRaw;
    for (const [rawWord, rawToken] of Object.entries(inlineMap ?? {})) {
        if (rawWord === "csv" || rawWord === "map")
            continue;
        const word = String(rawWord || "").trim().toLowerCase();
        const token = String(rawToken || "").trim().toLowerCase();
        if (!word || !token)
            continue;
        baseMap[word] = token;
    }
    const csvSpec = asObject(colorLexiconRaw?.csv);
    const csvPath = asString(csvSpec?.path);
    if (csvPath) {
        const keyColumn = asString(csvSpec?.keyColumn) || "word";
        const valueColumn = asString(csvSpec?.valueColumn) || "color";
        const csvMap = await loadCsvDictionary({
            path: csvPath,
            keyColumn,
            valueColumn,
            basePath: asString(csvSpec?.basePath) || undefined,
        });
        for (const [key, value] of csvMap.entries()) {
            baseMap[key] = value.trim().toLowerCase();
        }
    }
    return baseMap;
}
async function resolveValenceIndex(stimuliRaw) {
    const valenceRaw = asObject(stimuliRaw?.valenceLists);
    const output = {};
    const inlineLabels = [
        ["positive", valenceRaw?.positive],
        ["neutral", valenceRaw?.neutral],
        ["negative", valenceRaw?.negative],
    ];
    for (const [label, rawList] of inlineLabels) {
        for (const word of asArray(rawList).map((entry) => asString(entry)).filter((entry) => Boolean(entry))) {
            output[word.toLowerCase()] = label;
        }
    }
    const csvRaw = asObject(valenceRaw?.csv);
    const csvPath = asString(csvRaw?.path);
    if (csvPath) {
        const columns = asObject(csvRaw?.columns);
        const basePath = asString(csvRaw?.basePath) || undefined;
        for (const [label, fallbackColumn] of [
            ["positive", "positive"],
            ["neutral", "neutral"],
            ["negative", "negative"],
        ]) {
            const column = asString(columns?.[label]) || fallbackColumn;
            const items = await loadTokenPool({
                csv: { path: csvPath, column, basePath },
                normalize: "lowercase",
                dedupe: true,
            });
            for (const item of items) {
                output[item.toLowerCase()] = label;
            }
        }
    }
    return output;
}
function chooseFrom(items, rng) {
    if (items.length === 0)
        return null;
    const index = Math.floor(rng() * items.length);
    return items[index] ?? null;
}
function dedupeStrings(values) {
    const seen = new Set();
    const out = [];
    for (const entry of values) {
        const value = String(entry || "").trim();
        if (!value)
            continue;
        const key = value.toLowerCase();
        if (seen.has(key))
            continue;
        seen.add(key);
        out.push(key);
    }
    return out;
}
//# sourceMappingURL=index.js.map