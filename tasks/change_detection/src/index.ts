import {
  type TaskAdapter,
  type TaskAdapterContext,
  type TaskManifest,
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
  finalizeTaskRun,
  runTaskSession,
  runTaskIntroFlow,
  runTaskEndFlow,
  runBlockStartFlow,
  recordsToCsv,
} from "@experiments/core";
import { buildTrialPlan, type TrialPlanItem } from "./planner";

class ChangeDetectionTaskAdapter implements TaskAdapter {
  readonly manifest: TaskManifest = {
    taskId: "change_detection",
    label: "Change Detection",
    variants: [
      { id: "default", label: "Default Change Detection", configPath: "change_detection/default" },
    ],
  };

  private context: TaskAdapterContext | null = null;
  private layoutManager = new SpatialLayoutManager();

  async initialize(context: TaskAdapterContext): Promise<void> {
    this.context = context;
  }

  async execute(): Promise<unknown> {
    if (!this.context) throw new Error("Task not initialized");
    const { container, taskConfig, selection } = this.context;
    
    const rng = new SeededRandom(
      hashSeed(selection.participant.participantId, selection.participant.sessionId, selection.variantId)
    );
    
    const feedbackConfig = parseTrialFeedbackConfig(asObject(taskConfig.feedback), null);

    const trialPlan = buildTrialPlan(taskConfig, rng);
    const blocks = asArray(asObject(taskConfig.plan)?.blocks);

    const { canvas, ctx } = mountCanvasElement({
      container,
      width: 600,
      height: 600,
    });
    const sceneRenderer = new SceneRenderer(canvas);
    const layout = computeCanvasFrameLayout({ aperturePx: 560 });

    const sessionResult = await runTaskSession({
      blocks: blocks,
      getTrials: ({ blockIndex }) => trialPlan.filter(t => t.blockIndex === blockIndex),
      runTrial: async ({ trial, trialIndex }) => {
        const result = await this.runTrial(trial, taskConfig, sceneRenderer, canvas, ctx, container, layout, rng);
        
        // Feedback
        if (feedbackConfig.enabled) {
          const view = resolveTrialFeedbackView({
            feedback: feedbackConfig,
            responseCategory: result.responseCorrect === 1 ? "correct" : "incorrect",
            correct: result.responseCorrect,
          });

          drawTrialFeedbackOnCanvas(ctx, layout, feedbackConfig, view);
          await sleep(feedbackConfig.durationMs);

          // Blank after feedback
          drawCanvasTrialFrame(ctx, layout, { frameBackground: "#ffffff", frameBorder: "1px solid #ddd" });
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
    const csv = recordsToCsv(flatResults.map(r => ({
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

  private async runTrial(
    trial: TrialPlanItem,
    config: JSONObject,
    renderer: SceneRenderer,
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
    container: HTMLElement,
    layout: any,
    rng: SeededRandom
  ): Promise<any> {
    const stimulusConfig = asObject(config.stimulus);
    const layoutConfig = asObject(stimulusConfig?.layout);
    const itemConfig = asObject(stimulusConfig?.items);
    const timingConfig = asObject(config.timing);
    const mappingConfig = asObject(config.mapping);

    const slots = this.layoutManager.generateSlots({
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
      frameBorder: "1px solid #ddd",
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

  async terminate(): Promise<void> {
    // Cleanup
  }
}

export const changeDetectionAdapter = new ChangeDetectionTaskAdapter();
