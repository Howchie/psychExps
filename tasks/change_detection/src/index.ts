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
    
    // 1. Instructions
    await waitForContinue(container, "<h1>Change Detection</h1><p>In this task, you will see a set of colored shapes. Memorize them.</p><p>After a short delay, you will see the shapes again. One of them might have changed.</p><p>Press 'S' if they have CHANGED, and 'D' if they are the SAME.</p>");

    const trialPlan = buildTrialPlan(taskConfig, rng);
    const results: any[] = [];

    // Use a square canvas to match core layout expectations
    const { canvas, ctx } = mountCanvasElement({
      container,
      width: 600,
      height: 600,
    });

    const sceneRenderer = new SceneRenderer(canvas);
    const feedbackConfig = parseTrialFeedbackConfig(asObject(taskConfig.feedback), null, {
      style: {
        canvasBackground: "#ffffff",
        canvasBorder: "1px solid #ddd",
      }
    });
    const layout = computeCanvasFrameLayout({ aperturePx: 560 });

    for (const trial of trialPlan) {
      const result = await this.runTrial(trial, taskConfig, sceneRenderer, canvas, ctx, container, layout, rng);
      results.push(result);
      
      // Feedback using core utilities
      if (feedbackConfig.enabled) {
        const view = resolveTrialFeedbackView({
          feedback: feedbackConfig,
          responseCategory: result.responseCorrect === 1 ? "correct" : "incorrect",
          correct: result.responseCorrect,
        });
        
        container.innerHTML = "";
        container.appendChild(canvas.parentElement || canvas);
        drawTrialFeedbackOnCanvas(ctx, layout, feedbackConfig, view);
        await sleep(feedbackConfig.durationMs);
      }
    }

    return { success: true, results };
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
      centerX: 280, // Half of aperture 560
      centerY: 280,
      bounds: { width: 560, height: 560 },
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

    const trialResult = await runCustomRtTrial({
      container,
      stages: [
        { 
          id: "fixation", 
          durationMs: toPositiveNumber(timingConfig?.fixationMs, 500), 
          render: () => {
            container.innerHTML = "";
            container.appendChild(canvas.parentElement || canvas);
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
              renderer.render(encodingScene, slots);
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
              renderer.render(probeScene, slots);
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
      ? trialResult.key === diffKey 
      : trialResult.key === sameKey;

    return {
      ...trial,
      ...trialResult,
      responseCorrect: isCorrect ? 1 : 0,
      diff: diffScenes(encodingScene, probeScene),
    };
  }

  async terminate(): Promise<void> {
    // Cleanup
  }
}

export const changeDetectionAdapter = new ChangeDetectionTaskAdapter();
