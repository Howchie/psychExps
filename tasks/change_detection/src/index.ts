import {
  type TaskAdapterContext,
  type JSONObject,
  asObject,
  asString,
  asArray,
  asStringArray,
  toPositiveNumber,
  toNonNegativeNumber,
  SeededRandom,
  hashSeed,
  SpatialLayoutManager,
  SceneRenderer,
  runCustomRtTrial,
  createScene,
  diffScenes,
  type SceneItem,
  waitForContinue,
  parseTrialFeedbackConfig,
  resolveTrialFeedbackView,
  drawTrialFeedbackOnCanvas,
  computeCanvasFrameLayout,
  sleep,
  mountCanvasElement,
  drawCanvasFramedScene,
  drawCanvasTrialFrame,
  TaskOrchestrator,
  buildTaskInstructionConfig,
  applyTaskInstructionConfig,
  maybeExportStimulusRows,
  createTaskAdapter,
  setCursorHidden,
  computeAccuracy,
  TaskEnvironmentGuard,
} from "@experiments/core";
import { buildTrialPlan, type TrialPlanItem } from "./planner";

const changeDetectionLayoutManager = new SpatialLayoutManager();
const changeDetectionEnvironment = new TaskEnvironmentGuard();

async function runChangeDetectionTask(context: TaskAdapterContext): Promise<unknown> {
  const { container, taskConfig, selection } = context;

  const rng = new SeededRandom(
    hashSeed(selection.participant.participantId, selection.participant.sessionId, selection.variantId, "change_detection"),
  );

  const eventLogger = context.eventLogger;

  const feedbackConfig = parseTrialFeedbackConfig(asObject(taskConfig.feedback), null);
  const instructionsRaw = asObject(taskConfig.instructions) ?? {};
  const instructionConfig = buildTaskInstructionConfig({
    title: asString(asObject(taskConfig.task)?.title) || "Change Detection",
    instructions: instructionsRaw,
    defaults: {
      intro: [
        "In this task, you will see a set of colored shapes. Memorize them.",
        "After a short delay, you will see the shapes again. One of them might have changed.",
        "Press 'S' if they have CHANGED, and 'D' if they are the SAME.",
      ],
      end: ["Thank you for participating."],
    },
    blockIntroTemplateDefault: "Press continue when ready.",
    showBlockLabelDefault: instructionsRaw.showBlockLabel !== false,
    preBlockBeforeBlockIntroDefault: instructionsRaw.preBlockBeforeBlockIntro === true,
  });
  const layout = computeCanvasFrameLayout({
    aperturePx: toPositiveNumber(asObject(taskConfig.display)?.aperturePx, 560),
  });

  const trialPlan = buildTrialPlan(taskConfig, rng);
  const blocks = asArray(asObject(taskConfig.plan)?.blocks) as JSONObject[];

  const rows = trialPlan.map((trial) => {
    const block = asObject(blocks[trial.blockIndex]);
    return {
      block_index: trial.blockIndex,
      block_label: asString(block?.label) || `Block ${trial.blockIndex + 1}`,
      trial_index: trial.trialIndex,
      set_size: trial.setSize,
      is_change: trial.isChange,
      trial_code: trial.isChange ? "change" : "no_change",
    };
  });

  const { canvas, ctx } = mountCanvasElement({
    container,
    width: layout.aperturePx,
    height: layout.totalHeightPx,
  });
  applyTaskInstructionConfig(taskConfig, instructionConfig);
  const sceneRenderer = new SceneRenderer(canvas);
  const orchestrator = new TaskOrchestrator<JSONObject, TrialPlanItem, any>(context);
  return orchestrator.run({
    buttonIdPrefix: "cd",
    stimulusExport: {
      rows,
      suffix: "change_detection_stimulus_list",
    },
    getBlocks: () => blocks,
    getTrials: ({ blockIndex }) => trialPlan.filter((t) => t.blockIndex === blockIndex),
    runTrial: async ({ trial }) => {
      container.innerHTML = "";
      container.appendChild(canvas.parentElement || canvas);

      const result = await runChangeDetectionTrial(
        trial,
        taskConfig,
        sceneRenderer,
        ctx,
        container,
        layout,
        feedbackConfig,
        rng,
      );

      if (feedbackConfig.enabled) {
        const responseCategory = result.key === null ? "timeout" : result.responseCorrect === 1 ? "correct" : "incorrect";
        const view = resolveTrialFeedbackView({
          feedback: feedbackConfig,
          responseCategory,
          correct: result.responseCorrect,
        });

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawTrialFeedbackOnCanvas(ctx, layout, feedbackConfig, view);
        await sleep(feedbackConfig.durationMs);

        drawCanvasTrialFrame(ctx, layout, {
          frameBackground: "#ffffff",
          frameBorder: feedbackConfig.style.canvasBorder,
        });
        await sleep(100);
      }

      return result;
    },
    onTaskStart: () => {
      changeDetectionEnvironment.installPageScrollLock();
      eventLogger.emit("task_start", { task: "change_detection", runner: "native_canvas" });
    },
    onBlockStart: ({ blockIndex }) => {
      const block = asObject(blocks[blockIndex]);
      eventLogger.emit("block_start", { label: asString(block?.label) || `Block ${blockIndex + 1}` }, { blockIndex });
    },
    onBlockEnd: ({ blockIndex, trialResults }) => {
      const block = asObject(blocks[blockIndex]);
      const correct = trialResults.reduce((acc: number, r: any) => acc + (r?.responseCorrect ?? 0), 0);
      const accuracy = computeAccuracy(correct, trialResults.length);
      eventLogger.emit("block_end", { label: asString(block?.label) || `Block ${blockIndex + 1}`, accuracy }, { blockIndex });
    },
    onTaskEnd: () => {
      eventLogger.emit("task_end", { task: "change_detection" });
    },
    completeTitle: "Change Detection complete",
    csvOptions: {
      suffix: "change_detection_trials",
      getRecords: (sessionResult) =>
        sessionResult.blocks.flatMap((b: any) =>
          b.trialResults.map((r: any) => ({
            participantId: selection.participant.participantId,
            variantId: selection.variantId,
            ...r,
            changedIndices: r.diff.changedIndices.join("|"),
          })),
        ),
    },
  });
}

async function runChangeDetectionTrial(
  trial: TrialPlanItem,
  config: JSONObject,
  renderer: SceneRenderer,
  ctx: CanvasRenderingContext2D,
  container: HTMLElement,
  layout: any,
  feedbackConfig: any,
  rng: SeededRandom,
): Promise<any> {
    const stimulusConfig = asObject(config.stimulus);
    const layoutConfig = asObject(stimulusConfig?.layout);
    const itemConfig = asObject(stimulusConfig?.items);
    const timingConfig = asObject(config.timing);
    const mappingConfig = asObject(config.mapping);

    const slots = changeDetectionLayoutManager.generateSlots({
      template: (asString(layoutConfig?.type) as any) || "circular",
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

    const generateItem = (): SceneItem => ({
      id: crypto.randomUUID(),
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

export const changeDetectionAdapter = createTaskAdapter({
  manifest: {
    taskId: "change_detection",
    label: "Change Detection",
    variants: [{ id: "default", label: "Default Change Detection", configPath: "change_detection/default" }],
  },
  run: runChangeDetectionTask,
  terminate: async () => {
    changeDetectionEnvironment.cleanup();
  },
});
