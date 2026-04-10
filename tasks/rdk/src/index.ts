import {
  asArray,
  asObject,
  asString,
  coerceScopedDrtConfig,
  createManipulationOverrideMap,
  createManipulationPoolAllocator,
  resolveBlockManipulationIds,
  applyManipulationOverridesToBlock,
  normalizeKey,
  buildTaskInstructionConfig,
  applyTaskInstructionConfig,
  resolveScopedModuleConfig,
  TaskOrchestrator,
  runTrialWithEnvelope,
  sleep,
  toNonNegativeNumber,
  toPositiveNumber,
  toStringScreens,
  resolveBlockScreenSlotValue,
  maybeExportStimulusRows,
  createTaskAdapter,
  type ScopedDrtConfig,
  type TaskAdapterContext,
  type TaskModuleAddress,
  type SelectionContext,
  type StandardTaskInstructionConfig,
} from "@experiments/core";
import { createRdkRenderer, type RdkDot, type RdkRendererBackend, type RdkRenderer } from "./renderer";

export const rdkAdapter = createTaskAdapter({
  manifest: {
    taskId: "rdk",
    label: "Random Dot Kinetogram",
    variants: [
      { id: "default", label: "RDK Default", configPath: "rdk/default" },
    ],
  },
  run: (context) => runRdkTask(context),
  terminate: async () => {},
});

type RdkMode = "dynamic" | "static";
export type RdkDotMode = RdkMode;

interface RdkDrtConfig extends ScopedDrtConfig {
  key: string;
  responseWindowMs: number;
  displayDurationMs: number;
  responseTerminatesStimulus: boolean;
}

interface ParsedRdkTrialTemplate {
  mode: RdkMode;
  durationMs: number;
  coherenceStart: number;
  coherenceEnd: number;
  coherenceDurationMs: number;
  coherenceFunction: string | null;
  direction: "left" | "right" | "up" | "down";
  dotCount: number;
  dotSizePx: number;
  dotColor: string;
  dotColorAlternate: string;
  speedPxPerSec: number;
  responseMaxDurationMs: number;
  responseKeys: {
    left: string;
    right: string;
    up: string;
    down: string;
    black: string;
    white: string;
  };
}

interface ParsedRdkBlock {
  label: string;
  phase: string;
  trials: number;
  manipulationId: string | null;
  beforeBlockScreens: string[];
  afterBlockScreens: string[];
  trialTemplate: ParsedRdkTrialTemplate;
  drt: RdkDrtConfig;
}

interface RdkDisplayConfig {
  aperturePx: number;
  frameBackground: string;
  frameBorder: string;
  canvasBackground: string;
  showCrosshair: boolean;
  rendererBackend: RdkRendererBackend;
}

interface ParsedRdkConfig {
  title: string;
  instructions: StandardTaskInstructionConfig;
  display: RdkDisplayConfig;
  interTrialIntervalMs: number;
  blocks: ParsedRdkBlock[];
}

export interface RdkTrialRecord {
  taskId: string;
  phase: string;
  blockLabel: string;
  blockIndex: number;
  trialIndex: number;
  mode: RdkMode;
  durationMs: number;
  coherenceStart: number;
  coherenceEnd: number;
  direction: string;
  responseKey: string | null;
  rtMs: number | null;
  correct: boolean | null;
}

function parseRdkConfig(taskConfig: Record<string, unknown>, selection: SelectionContext): ParsedRdkConfig {
  const taskRaw = asObject(taskConfig.task) ?? {};
  const title = asString(taskRaw.title) ?? "Random Dot Kinetogram";

  const instructionsRaw = asObject(taskConfig.instructions) ?? {};
  const instructionConfig = buildTaskInstructionConfig({
    title,
    instructions: instructionsRaw,
    defaults: {
      intro: [
        "In this task, you will see a field of dots.",
        "Your goal is to determine the predominant direction of motion or the predominant color.",
      ],
    },
    blockIntroTemplateDefault: "Block with {nTrials} trials. Phase: {phase}.",
  });

  const displayRaw = asObject(taskConfig.display) ?? {};
  const display: RdkDisplayConfig = {
    aperturePx: toPositiveNumber(displayRaw.aperturePx, 500),
    frameBackground: asString(displayRaw.frameBackground) ?? "#0f172a",
    frameBorder: asString(displayRaw.frameBorder) ?? "#334155",
    canvasBackground: asString(displayRaw.canvasBackground) ?? "#e2e8f0",
    showCrosshair: displayRaw.showCrosshair !== false,
    rendererBackend: (asString(displayRaw.rendererBackend) ?? "pixi") === "pixi" ? "pixi" : "canvas",
  };

  const trialDefaultsRaw = asObject(taskConfig.trialDefaults) ?? {};

  const drtTaskRaw = resolveScopedModuleConfig(taskRaw, "drt") ?? resolveScopedModuleConfig(taskConfig, "drt");
  const drtDefault = coerceScopedDrtConfig(
    {
      enabled: false,
      scope: "block",
      key: "space",
      responseWindowMs: 2500,
      displayDurationMs: 1000,
      responseTerminatesStimulus: true,
      isiSampler: { type: "uniform", min: 3000, max: 5000 },
      transformPersistence: "scope",
    },
    drtTaskRaw,
  ) as RdkDrtConfig;

  const planRaw = asObject(taskConfig.plan) ?? {};
  const planManipulations = createManipulationOverrideMap(planRaw.manipulations);
  const planPoolAllocator = createManipulationPoolAllocator(
    planRaw.manipulationPools,
    [
      selection.participant.participantId,
      selection.participant.sessionId,
      selection.variantId,
      "rdk_plan_manipulation_pools",
    ],
  );
  const blocksRaw = asArray(planRaw.blocks);
  const blocks = (blocksRaw.length > 0 ? blocksRaw : [{}]).map((entry, index) => {
    const manipulationIds = resolveBlockManipulationIds(entry, planPoolAllocator);
    const mergedEntry = applyManipulationOverridesToBlock(
      entry,
      manipulationIds,
      planManipulations,
      `Invalid RDK plan: block ${index + 1}`,
    );
    const raw = asObject(mergedEntry) ?? {};

    const mode = (asString(raw.mode) ?? asString(trialDefaultsRaw.mode) ?? "dynamic") === "static" ? "static" : "dynamic";
    const responseKeysRaw = asObject(raw.responseKeys) ?? asObject(trialDefaultsRaw.responseKeys) ?? {};

    const trialTemplate: ParsedRdkTrialTemplate = {
      mode,
      durationMs: toPositiveNumber(raw.trialDurationMs ?? trialDefaultsRaw.durationMs, 5000),
      coherenceStart: toNonNegativeNumber(raw.coherenceStart ?? trialDefaultsRaw.coherenceStart, 0.5),
      coherenceEnd: toNonNegativeNumber(raw.coherenceEnd ?? trialDefaultsRaw.coherenceEnd, 0.5),
      coherenceDurationMs: toNonNegativeNumber(raw.coherenceDurationMs ?? trialDefaultsRaw.coherenceDurationMs, 0),
      coherenceFunction: asString(raw.coherenceFunction) ?? asString(trialDefaultsRaw.coherenceFunction) ?? null,
      direction: (asString(raw.direction) ?? asString(trialDefaultsRaw.direction) ?? "right") as "left" | "right" | "up" | "down",
      dotCount: toPositiveNumber(raw.dotCount ?? trialDefaultsRaw.dotCount, 200),
      dotSizePx: toPositiveNumber(raw.dotSizePx ?? trialDefaultsRaw.dotSizePx, 4),
      dotColor: asString(raw.dotColor) ?? asString(trialDefaultsRaw.dotColor) ?? "#ffffff",
      dotColorAlternate: asString(raw.dotColorAlternate) ?? asString(trialDefaultsRaw.dotColorAlternate) ?? "#000000",
      speedPxPerSec: toPositiveNumber(raw.speedPxPerSec ?? trialDefaultsRaw.speedPxPerSec, 50),
      responseMaxDurationMs: toNonNegativeNumber(raw.responseMaxDurationMs ?? trialDefaultsRaw.responseMaxDurationMs, 0),
      responseKeys: {
        left: normalizeKey(asString(responseKeysRaw.left) ?? "ArrowLeft"),
        right: normalizeKey(asString(responseKeysRaw.right) ?? "ArrowRight"),
        up: normalizeKey(asString(responseKeysRaw.up) ?? "ArrowUp"),
        down: normalizeKey(asString(responseKeysRaw.down) ?? "ArrowDown"),
        black: normalizeKey(asString(responseKeysRaw.black) ?? "f"),
        white: normalizeKey(asString(responseKeysRaw.white) ?? "j"),
      },
    };

    return {
      label: asString(raw.label) ?? `Block ${index + 1}`,
      phase: asString(raw.phase) ?? "main",
      trials: toPositiveNumber(raw.trials, 8),
      manipulationId: manipulationIds.length > 0 ? manipulationIds.join("+") : null,
      beforeBlockScreens: toStringScreens(resolveBlockScreenSlotValue(raw, "before")),
      afterBlockScreens: toStringScreens(resolveBlockScreenSlotValue(raw, "after")),
      trialTemplate,
      drt: coerceScopedDrtConfig(drtDefault, resolveScopedModuleConfig(raw, "drt")) as RdkDrtConfig,
    } satisfies ParsedRdkBlock;
  });

  return {
    title,
    instructions: instructionConfig,
    display,
    interTrialIntervalMs: toNonNegativeNumber(taskConfig.interTrialIntervalMs, 300),
    blocks,
  };
}

async function runRdkTask(context: TaskAdapterContext): Promise<unknown> {
  const runner = context.moduleRunner;
  const parsed = parseRdkConfig(context.taskConfig, context.selection);
  const eventLogger = context.eventLogger;

  runner.setOptions({
    onEvent: (event) => {
      const address = (event as any).address as TaskModuleAddress | undefined;
      eventLogger.emit(
        "rdk_drt",
        event,
        {
          blockIndex: address?.blockIndex ?? -1,
          ...(address?.trialIndex == null ? {} : { trialIndex: address.trialIndex }),
        },
      );
    }
  });

  const orchestrator = new TaskOrchestrator<ParsedRdkBlock, number, RdkTrialRecord>(context);
  applyTaskInstructionConfig(context.taskConfig, parsed.instructions);

  const root = context.container;
  const stageShell = document.createElement("div");
  stageShell.className = "rdk-container";
  stageShell.style.display = "flex";
  stageShell.style.flexDirection = "column";
  stageShell.style.height = "100vh";
  stageShell.style.width = "100vw";
  stageShell.style.background = parsed.display.frameBackground;
  stageShell.style.alignItems = "center";
  stageShell.style.justifyContent = "center";
  stageShell.style.position = "relative";

  stageShell.innerHTML = `
    <div id="rdk-frame" style="position: relative; border: 2px solid ${parsed.display.frameBorder}; width: ${parsed.display.aperturePx}px; height: ${parsed.display.aperturePx}px; background: ${parsed.display.canvasBackground}; border-radius: 50%; overflow: hidden; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);">
      ${parsed.display.showCrosshair ? `<div style="position: absolute; width: 10px; height: 2px; background: ${parsed.display.frameBorder}; pointer-events: none; z-index: 10;"></div><div style="position: absolute; width: 2px; height: 10px; background: ${parsed.display.frameBorder}; pointer-events: none; z-index: 10;"></div>` : ""}
      <div id="rdk-renderer-host" style="position: absolute; top: 0; left: 0; pointer-events: none; width: ${parsed.display.aperturePx}px; height: ${parsed.display.aperturePx}px;"></div>
    </div>
    <div id="rdk-prompt" style="position: absolute; bottom: 2rem; color: #fff; font-size: 1.25rem; font-family: ui-sans-serif, system-ui, sans-serif; opacity: 0; transition: opacity 0.2s; pointer-events: none; text-align: center; max-width: 80%;"></div>
  `;

  return await orchestrator.run({
    buttonIdPrefix: "rdk-continue",
    getBlocks: () => parsed.blocks.map(block => ({
      ...block,
      modules: { drt: block.drt }
    })),
    resolveModuleContext: () => ({
      displayElement: stageShell,
      borderTargetElement: stageShell,
    }),
    getTrials: ({ block }) => Array.from({ length: block.trials }, (_, trialIndex) => trialIndex),
    runTrial: async ({ block, blockIndex, trialIndex }) => {
      const rendererHost = stageShell.querySelector("#rdk-renderer-host") as HTMLElement;
      const promptEl = stageShell.querySelector("#rdk-prompt") as HTMLElement;

      const renderer = await createRdkRenderer(rendererHost, {
          backend: parsed.display.rendererBackend,
          width: parsed.display.aperturePx,
          height: parsed.display.aperturePx,
          backgroundColor: parsed.display.canvasBackground,
      });

      promptEl.style.opacity = "0";

      let trialDirection = block.trialTemplate.direction;
      if (block.trialTemplate.direction === "right" || block.trialTemplate.direction === "left") {
        trialDirection = Math.random() > 0.5 ? "left" : "right";
      } else if (block.trialTemplate.direction === "up" || block.trialTemplate.direction === "down") {
        trialDirection = Math.random() > 0.5 ? "up" : "down";
      }

      let predominantColor = "black";
      if (block.trialTemplate.mode === "static") {
          predominantColor = Math.random() > 0.5 ? "black" : "white";
      }

      const result = await runTrialWithEnvelope<{ block: ParsedRdkBlock; blockIndex: number; trialIndex: number }, RdkTrialRecord>({
        context: { block, blockIndex, trialIndex },
        execute: async () => {
          const res = await renderRdkTrial(renderer, parsed.display.aperturePx, block.trialTemplate, trialDirection, predominantColor, promptEl);

          return {
            taskId: "rdk",
            phase: block.phase,
            blockLabel: block.label,
            blockIndex,
            trialIndex,
            mode: block.trialTemplate.mode,
            durationMs: res.durationMs,
            coherenceStart: block.trialTemplate.coherenceStart,
            coherenceEnd: block.trialTemplate.coherenceEnd,
            direction: block.trialTemplate.mode === "dynamic" ? trialDirection : predominantColor,
            responseKey: res.responseKey,
            rtMs: res.rtMs,
            correct: res.correct,
          };
        }
      });

      renderer.destroy();

      if (parsed.interTrialIntervalMs > 0 && trialIndex < block.trials - 1) {
        promptEl.style.opacity = "0";
        await sleep(parsed.interTrialIntervalMs);
      }

      return result;
    },
    onTaskStart: () => {
      eventLogger.emit("task_start", { task: "rdk" });
    },
    onBlockStart: async ({ block, blockIndex }) => {
      root.innerHTML = "";
      root.appendChild(stageShell);
      eventLogger.emit("block_start", { label: block.label, phase: block.phase }, { blockIndex });
    },
    onBlockEnd: async ({ block, blockIndex }) => {
      eventLogger.emit("block_end", { label: block.label, phase: block.phase }, { blockIndex });
    },
    getEvents: () => eventLogger.events,
  });
}

async function renderRdkTrial(
  renderer: RdkRenderer,
  aperturePx: number,
  template: ParsedRdkTrialTemplate,
  trialDirection: string,
  predominantColor: string,
  promptEl: HTMLElement,
): Promise<{ durationMs: number; responseKey: string | null; rtMs: number | null; correct: boolean | null }> {
  return new Promise((resolve) => {
    let animationId: number;
    let startTime: number | null = null;
    let responded = false;
    let responseKey: string | null = null;
    let rtMs: number | null = null;
    let correct: boolean | null = null;

    const { mode, durationMs, coherenceStart, coherenceEnd, coherenceDurationMs, coherenceFunction, dotCount, dotSizePx, dotColor, dotColorAlternate, speedPxPerSec, responseKeys } = template;

    let compiledCoherenceFunc: Function | null = null;
    if (coherenceFunction) {
      try {
        compiledCoherenceFunc = new Function("t", "tMax", "start", "end", `return ${coherenceFunction};`);
      } catch (e) {
        console.error("Failed to compile coherence function:", e);
      }
    }

    const dots: RdkDot[] = [];
    const radius = aperturePx / 2;
    const cx = aperturePx / 2;
    const cy = aperturePx / 2;

    for (let i = 0; i < dotCount; i++) {
      const r = radius * Math.sqrt(Math.random());
      const theta = Math.random() * 2 * Math.PI;
      dots.push({
        x: cx + r * Math.cos(theta),
        y: cy + r * Math.sin(theta),
        age: Math.floor(Math.random() * 20),
        maxAge: Math.floor(Math.random() * 20) + 10,
        isCoherent: false,
      });
    }

    const keyHandler = (e: KeyboardEvent) => {
      if (responded) return;
      const k = normalizeKey(e.key);

      let valid = false;
      let isCorrect = false;

      if (mode === "dynamic") {
        if (k === responseKeys.left || k === responseKeys.right || k === responseKeys.up || k === responseKeys.down) {
          valid = true;
          if (trialDirection === "left" && k === responseKeys.left) isCorrect = true;
          if (trialDirection === "right" && k === responseKeys.right) isCorrect = true;
          if (trialDirection === "up" && k === responseKeys.up) isCorrect = true;
          if (trialDirection === "down" && k === responseKeys.down) isCorrect = true;
        }
      } else {
         if (k === responseKeys.black || k === responseKeys.white) {
             valid = true;
             if (predominantColor === "black" && k === responseKeys.black) isCorrect = true;
             if (predominantColor === "white" && k === responseKeys.white) isCorrect = true;
         }
      }

      if (valid) {
        responded = true;
        responseKey = k;
        rtMs = performance.now() - (startTime ?? performance.now());
        correct = isCorrect;

        cleanup();
      }
    };

    window.addEventListener("keydown", keyHandler);

    function cleanup() {
      window.removeEventListener("keydown", keyHandler);
      cancelAnimationFrame(animationId);
      resolve({ durationMs: performance.now() - (startTime ?? performance.now()), responseKey, rtMs, correct });
    }

    function renderLoop(time: number) {
      if (!startTime) startTime = time;
      const elapsed = time - startTime;

      if (elapsed > durationMs || responded) {
        if (!responded) cleanup();
        return;
      }

      let currentCoherence = coherenceStart;
      if (compiledCoherenceFunc) {
        try {
          const rawCoherence = compiledCoherenceFunc(elapsed, durationMs, coherenceStart, coherenceEnd);
          currentCoherence = Math.min(1.0, Math.max(0.0, Number(rawCoherence)));
        } catch (e) {
          currentCoherence = coherenceStart;
        }
      } else if (coherenceDurationMs > 0) {
        const p = Math.min(1.0, Math.max(0, elapsed / coherenceDurationMs));
        currentCoherence = coherenceStart + (coherenceEnd - coherenceStart) * p;
      } else {
        currentCoherence = coherenceEnd;
      }

      const speedPerFrame = speedPxPerSec / 60;

      for (let i = 0; i < dots.length; i++) {
        const dot = dots[i];
        dot.age++;

        // Coherence is determined when dot is (re)born or every frame if we want standard RDK
        // Typically coherence is assigned per-frame or per-life.
        // Let's do standard per-frame reassignment to match common Psychopy/jsPsych RDK implementations.
        dot.isCoherent = Math.random() < currentCoherence;

        if (mode === "dynamic") {
          let moveAngle = Math.random() * 2 * Math.PI;
          if (dot.isCoherent) {
            if (trialDirection === "right") moveAngle = 0;
            else if (trialDirection === "left") moveAngle = Math.PI;
            else if (trialDirection === "down") moveAngle = Math.PI / 2;
            else if (trialDirection === "up") moveAngle = -Math.PI / 2;
          }

          dot.x += Math.cos(moveAngle) * speedPerFrame;
          dot.y += Math.sin(moveAngle) * speedPerFrame;

          const dx = dot.x - cx;
          const dy = dot.y - cy;
          const distSq = dx * dx + dy * dy;

          if (distSq > radius * radius || dot.age > dot.maxAge) {
             const r = radius * Math.sqrt(Math.random());
             const theta = Math.random() * 2 * Math.PI;
             dot.x = cx + r * Math.cos(theta);
             dot.y = cy + r * Math.sin(theta);
             dot.age = 0;
          }
        } else if (mode === "static") {
             if (dot.age > dot.maxAge) {
                 const r = radius * Math.sqrt(Math.random());
                 const theta = Math.random() * 2 * Math.PI;
                 dot.x = cx + r * Math.cos(theta);
                 dot.y = cy + r * Math.sin(theta);
                 dot.age = 0;
             }
             // Static mode: coherence determines the color mix
             const isSignalColor = dot.isCoherent ? true : Math.random() > 0.5;
             dot.color = isSignalColor 
                ? (predominantColor === "black" ? dotColorAlternate : dotColor)
                : (predominantColor === "black" ? dotColor : dotColorAlternate);
        }
      }

      renderer.render({
          dots,
          dotSizePx,
          dotColor,
          dotColorAlternate,
          mode
      });

      animationId = requestAnimationFrame(renderLoop);
    }

    animationId = requestAnimationFrame(renderLoop);
  });
}
