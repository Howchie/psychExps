import { asObject, asString, asArray, asStringArray, toPositiveNumber, toNonNegativeNumber, SeededRandom, hashSeed, SpatialLayoutManager, SceneRenderer, runCustomRtTrial, createScene, diffScenes, parseTrialFeedbackConfig, resolveTrialFeedbackView, drawTrialFeedbackOnCanvas, computeCanvasFrameLayout, sleep, mountCanvasElement, drawCanvasFramedScene, drawCanvasTrialFrame, finalizeTaskRun, runTaskSession, runTaskIntroFlow, runTaskEndFlow, runBlockStartFlow, recordsToCsv, } from "@experiments/core";
import { buildTrialPlan } from "./planner";
class ChangeDetectionTaskAdapter {
    manifest = {
        taskId: "change_detection",
        label: "Change Detection",
        variants: [
            { id: "default", label: "Default Change Detection", configPath: "change_detection/default" },
        ],
    };
    context = null;
    layoutManager = new SpatialLayoutManager();
    async initialize(context) {
        this.context = context;
    }
    async execute() {
        if (!this.context)
            throw new Error("Task not initialized");
        const { container, taskConfig, selection } = this.context;
        const rng = new SeededRandom(hashSeed(selection.participant.participantId, selection.participant.sessionId, selection.variantId));
        const feedbackConfig = parseTrialFeedbackConfig(asObject(taskConfig.feedback), null);
        const layout = computeCanvasFrameLayout({
            aperturePx: toPositiveNumber(asObject(taskConfig.display)?.aperturePx, 560)
        });
        const trialPlan = buildTrialPlan(taskConfig, rng);
        const blocks = asArray(asObject(taskConfig.plan)?.blocks);
        // Mount canvas with correct height for the layout
        const { canvas, ctx } = mountCanvasElement({
            container,
            width: layout.aperturePx,
            height: layout.totalHeightPx,
        });
        const sceneRenderer = new SceneRenderer(canvas);
        const sessionResult = await runTaskSession({
            blocks: blocks,
            getTrials: ({ blockIndex }) => trialPlan.filter(t => t.blockIndex === blockIndex),
            runTrial: async ({ trial }) => {
                // Ensure canvas is mounted at start of every trial
                container.innerHTML = "";
                container.appendChild(canvas.parentElement || canvas);
                const result = await this.runTrial(trial, taskConfig, sceneRenderer, canvas, ctx, container, layout, feedbackConfig, rng);
                // Feedback
                if (feedbackConfig.enabled) {
                    const responseCategory = result.key === null ? "timeout" : (result.responseCorrect === 1 ? "correct" : "incorrect");
                    const view = resolveTrialFeedbackView({
                        feedback: feedbackConfig,
                        responseCategory,
                        correct: result.responseCorrect,
                    });
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    drawTrialFeedbackOnCanvas(ctx, layout, feedbackConfig, view);
                    await sleep(feedbackConfig.durationMs);
                    // Blank after feedback
                    drawCanvasTrialFrame(ctx, layout, {
                        frameBackground: "#ffffff",
                        frameBorder: feedbackConfig.style.canvasBorder
                    });
                    await sleep(100);
                }
                return result;
            },
            hooks: {
                onTaskStart: async () => {
                    await runTaskIntroFlow({
                        container,
                        title: asString(asObject(taskConfig.task)?.title) || "Change Detection",
                        participantId: selection.participant.participantId,
                        introPages: [
                            "In this task, you will see a set of colored shapes. Memorize them.",
                            "After a short delay, you will see the shapes again. One of them might have changed.",
                            "Press 'S' if they have CHANGED, and 'D' if they are the SAME."
                        ],
                        buttonIdPrefix: "cd-intro"
                    });
                },
                onBlockStart: async ({ block, blockIndex }) => {
                    await runBlockStartFlow({
                        container,
                        blockLabel: asString(asObject(block)?.label) || `Block ${blockIndex + 1}`,
                        blockIndex,
                        buttonIdPrefix: "cd-block-start",
                    });
                },
                onTaskEnd: async () => {
                    await runTaskEndFlow({
                        container,
                        endPages: ["Thank you for participating."],
                        buttonIdPrefix: "cd-end"
                    });
                }
            }
        });
        const flatResults = sessionResult.blocks.flatMap(b => b.trialResults);
        const csv = recordsToCsv(flatResults.map((r) => ({
            participantId: selection.participant.participantId,
            variantId: selection.variantId,
            ...r,
            // Flatten diff for CSV
            changedIndices: r.diff.changedIndices.join("|")
        })));
        await finalizeTaskRun({
            coreConfig: this.context.coreConfig,
            selection: this.context.selection,
            payload: sessionResult,
            csv: { contents: csv, suffix: "trials" }
        });
        return sessionResult;
    }
    async runTrial(trial, config, renderer, canvas, ctx, container, layout, feedbackConfig, rng) {
        const stimulusConfig = asObject(config.stimulus);
        const layoutConfig = asObject(stimulusConfig?.layout);
        const itemConfig = asObject(stimulusConfig?.items);
        const timingConfig = asObject(config.timing);
        const mappingConfig = asObject(config.mapping);
        const slots = this.layoutManager.generateSlots({
            template: asString(layoutConfig?.type) || "circular",
            count: trial.setSize,
            radius: toPositiveNumber(layoutConfig?.radius, 200),
            centerX: layout.aperturePx / 2,
            centerY: layout.aperturePx / 2,
            bounds: { width: layout.aperturePx, height: layout.aperturePx },
            slotSize: { width: 50, height: 50 },
            padding: toNonNegativeNumber(layoutConfig?.padding, 20),
            rng,
        });
        const colors = asStringArray(itemConfig?.colors, ["red", "blue", "green", "yellow", "black"]);
        const shapes = asStringArray(itemConfig?.shapes, ["circle", "square"]);
        const generateItem = () => ({
            id: Math.random().toString(),
            category: "shape",
            features: {
                type: shapes[Math.floor(rng.next() * shapes.length)],
                color: colors[Math.floor(rng.next() * colors.length)],
                size: 40,
            }
        });
        const encodingItems = Array.from({ length: trial.setSize }, generateItem);
        const encodingScene = createScene(encodingItems);
        const probeItems = [...encodingItems];
        if (trial.isChange) {
            const changeIdx = Math.floor(rng.next() * trial.setSize);
            let newItem = generateItem();
            while (newItem.features.type === encodingItems[changeIdx].features.type &&
                newItem.features.color === encodingItems[changeIdx].features.color) {
                newItem = generateItem();
            }
            probeItems[changeIdx] = newItem;
        }
        const probeScene = createScene(probeItems);
        const sameKey = asString(mappingConfig?.noChangeKey) || "d";
        const diffKey = asString(mappingConfig?.changeKey) || "s";
        const frameOptions = {
            frameBackground: "#ffffff",
            frameBorder: feedbackConfig.style.canvasBorder,
        };
        const result = await runCustomRtTrial({
            container,
            stages: [
                {
                    id: "fixation",
                    durationMs: toPositiveNumber(timingConfig?.fixationMs, 500),
                    render: () => {
                        drawCanvasFramedScene(ctx, layout, frameOptions, (args) => {
                            args.ctx.fillStyle = "black";
                            args.ctx.font = "40px Arial";
                            args.ctx.textAlign = "center";
                            args.ctx.textBaseline = "middle";
                            args.ctx.fillText("+", args.centerX, args.centerY);
                        });
                    }
                },
                {
                    id: "encoding",
                    durationMs: toPositiveNumber(timingConfig?.encodingMs, 500),
                    render: () => {
                        drawCanvasFramedScene(ctx, layout, frameOptions, (args) => {
                            ctx.save();
                            ctx.translate(args.frameLeft, args.frameTop);
                            renderer.render(encodingScene, slots, { clear: false });
                            ctx.restore();
                        });
                    }
                },
                {
                    id: "delay",
                    durationMs: toPositiveNumber(timingConfig?.delayMs, 1000),
                    render: () => {
                        drawCanvasTrialFrame(ctx, layout, frameOptions);
                    }
                },
                {
                    id: "probe",
                    durationMs: toPositiveNumber(timingConfig?.probeMs, 3000),
                    render: () => {
                        drawCanvasFramedScene(ctx, layout, frameOptions, (args) => {
                            ctx.save();
                            ctx.translate(args.frameLeft, args.frameTop);
                            renderer.render(probeScene, slots, { clear: false });
                            ctx.restore();
                        });
                    }
                },
            ],
            response: {
                allowedKeys: [sameKey, diffKey],
                startMs: toPositiveNumber(timingConfig?.fixationMs, 500) +
                    toPositiveNumber(timingConfig?.encodingMs, 500) +
                    toPositiveNumber(timingConfig?.delayMs, 1000),
                endMs: 10000,
            }
        });
        const isCorrect = trial.isChange
            ? result.key === diffKey
            : result.key === sameKey;
        return {
            ...trial,
            ...result,
            responseCorrect: isCorrect ? 1 : 0,
            diff: diffScenes(encodingScene, probeScene),
        };
    }
    async terminate() {
        // Cleanup
    }
}
export const changeDetectionAdapter = new ChangeDetectionTaskAdapter();
//# sourceMappingURL=index.js.map