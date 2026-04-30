/**
 * MATB Compensatory Tracking Task (standalone adapter).
 *
 * The participant keeps a cursor dot centred inside a fixed reticle by
 * compensating for a sinusoidal perturbation signal with mouse input.
 * This is the compensatory tracking paradigm from NASA's MATB, distinct
 * from the pursuit tracking in the existing `tracking` task.
 *
 * Can run standalone (block/trial via TaskOrchestrator) or be instantiated
 * as a SubTaskHandle for composite MATB sessions.
 */

import {
  PerturbationController,
  TrackingBinSummarizer,
  computeTrackingDistance,
  createMulberry32,
  hashSeed,
  asArray,
  asObject,
  asString,
  createTaskAdapter,
  buildTaskInstructionConfig,
  applyTaskInstructionConfig,
  toPositiveNumber,
  toPositiveFloat,
  toNonNegativeNumber,
  toStringScreens,
  resolveBlockScreenSlotValue,
  TaskOrchestrator,
  runTrialWithEnvelope,
  sleep,
  type PerturbationComponent,
  type PerturbationControllerConfig,
  type TrackingCircleTarget,
  type TaskAdapterContext,
  type SelectionContext,
  type StandardTaskInstructionConfig,
} from "@experiments/core";
import {
  createCompensatoryRenderer,
  type CompensatoryDisplayConfig,
  type CompensatoryRendererConfig,
} from "./renderer";

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export const matbTrackingAdapter = createTaskAdapter({
  manifest: {
    taskId: "matb-tracking",
    label: "MATB Tracking",
  },
  run: (context) => runMatbTrackingTask(context),
  terminate: async () => {},
});

// ---------------------------------------------------------------------------
// Parsed config types
// ---------------------------------------------------------------------------

interface ParsedDisplayConfig {
  aperturePx: number;
  frameBackground: string;
  frameBorder: string;
  canvasBackground: string;
  showCrosshair: boolean;
}

interface ParsedReticleConfig {
  radiusPx: number;
  strokeColor: string;
  strokeWidthPx: number;
  fillColor: string;
}

interface ParsedCursorConfig {
  radiusPx: number;
  colorInside: string;
  colorOutside: string;
}

interface ParsedPerturbationConfig {
  components: PerturbationComponent[];
  inputGain: number;
  maxDisplacementPx: number;
}

interface ParsedTrialTemplate {
  durationMs: number;
  sampleIntervalMs: number;
  binMs: number;
  storeRawSamples: boolean;
  perturbation: ParsedPerturbationConfig;
}

interface ParsedBlock {
  label: string;
  phase: string;
  trials: number;
  beforeBlockScreens: string[];
  afterBlockScreens: string[];
  trialTemplate: ParsedTrialTemplate;
}

interface ParsedConfig {
  title: string;
  instructions: StandardTaskInstructionConfig;
  display: ParsedDisplayConfig;
  reticle: ParsedReticleConfig;
  cursor: ParsedCursorConfig;
  interTrialIntervalMs: number;
  blocks: ParsedBlock[];
}

// ---------------------------------------------------------------------------
// Data records
// ---------------------------------------------------------------------------

interface TrialBinRecord {
  blockIndex: number;
  blockLabel: string;
  trialIndex: number;
  binIndex: number;
  startMs: number;
  endMs: number;
  sampleCount: number;
  insideCount: number;
  outsideCount: number;
  distanceSampleCount: number;
  meanBoundaryDistancePx: number | null;
}

interface RawSample {
  blockIndex: number;
  trialIndex: number;
  timeMs: number;
  cursorX: number;
  cursorY: number;
  perturbationX: number;
  perturbationY: number;
  compensationX: number;
  compensationY: number;
  inside: boolean;
  boundaryDistancePx: number;
}

interface TrialRecord {
  participantId: string;
  configPath: string;
  blockIndex: number;
  blockLabel: string;
  trialIndex: number;
  phase: string;
  durationMs: number;
  sampleCount: number;
  insideCount: number;
  outsideCount: number;
  distanceSampleCount: number;
  meanBoundaryDistancePx: number | null;
  reticleRadiusPx: number;
  inputGain: number;
  perturbationComponentCount: number;
}

interface TrialRuntimeResult {
  elapsedMs: number;
  sampleCount: number;
  insideCount: number;
  outsideCount: number;
  distanceSampleCount: number;
  meanBoundaryDistancePx: number | null;
  bins: TrialBinRecord[];
  rawSamples: RawSample[];
}

// ---------------------------------------------------------------------------
// Task runner
// ---------------------------------------------------------------------------

async function runMatbTrackingTask(context: TaskAdapterContext): Promise<unknown> {
  const parsed = parseConfig(context.taskConfig, context.selection);
  const participantId = context.selection.participant.participantId;
  const configPath = context.selection.configPath ?? "";
  const eventLogger = context.eventLogger;

  const root = context.container;
  root.style.fontFamily = "system-ui";

  const stageShell = document.createElement("div");
  stageShell.style.display = "flex";
  stageShell.style.justifyContent = "center";
  stageShell.style.alignItems = "center";
  stageShell.style.width = `${parsed.display.aperturePx + 8}px`;
  stageShell.style.height = `${parsed.display.aperturePx + 8}px`;
  root.innerHTML = "";
  root.appendChild(stageShell);

  const trialRecords: TrialRecord[] = [];
  const trialBins: TrialBinRecord[] = [];
  const rawSamples: RawSample[] = [];

  const orchestrator = new TaskOrchestrator<ParsedBlock, number, TrialRuntimeResult>(context);
  applyTaskInstructionConfig(context.taskConfig, parsed.instructions);

  return await orchestrator.run({
    buttonIdPrefix: "matb-tracking-continue",
    getBlocks: () =>
      parsed.blocks.map((block) => ({
        ...block,
        modules: {},
      })),
    getTrials: ({ block }) => Array.from({ length: block.trials }, (_, i) => i),
    runTrial: async ({ block, blockIndex, trial, trialIndex }) =>
      runTrialWithEnvelope<
        { block: ParsedBlock; blockIndex: number; trial: number; trialIndex: number },
        TrialRuntimeResult
      >({
        context: { block, blockIndex, trial, trialIndex },
        before: ({ block, blockIndex, trialIndex }) => {
          eventLogger.emit(
            "trial_start",
            { label: block.label, phase: block.phase, mode: "compensatory" },
            { blockIndex, trialIndex },
          );
        },
        execute: ({ block, blockIndex, trialIndex }) =>
          runCompensatoryTrial({
            blockIndex,
            trialIndex,
            blockLabel: block.label,
            stageHost: stageShell,
            display: parsed.display,
            reticle: parsed.reticle,
            cursor: parsed.cursor,
            trialTemplate: block.trialTemplate,
          }),
        after: async ({ block, blockIndex, trialIndex }, result) => {
          trialRecords.push({
            participantId,
            configPath,
            blockIndex,
            blockLabel: block.label,
            trialIndex,
            phase: block.phase,
            durationMs: result.elapsedMs,
            sampleCount: result.sampleCount,
            insideCount: result.insideCount,
            outsideCount: result.outsideCount,
            distanceSampleCount: result.distanceSampleCount,
            meanBoundaryDistancePx: result.meanBoundaryDistancePx,
            reticleRadiusPx: parsed.reticle.radiusPx,
            inputGain: block.trialTemplate.perturbation.inputGain,
            perturbationComponentCount: block.trialTemplate.perturbation.components.length,
          });
          trialBins.push(...result.bins);
          if (block.trialTemplate.storeRawSamples) {
            rawSamples.push(...result.rawSamples);
          }

          eventLogger.emit(
            "trial_end",
            {
              durationMs: result.elapsedMs,
              mode: "compensatory",
              sampleCount: result.sampleCount,
              insideCount: result.insideCount,
              outsideCount: result.outsideCount,
              meanBoundaryDistancePx: result.meanBoundaryDistancePx,
            },
            { blockIndex, trialIndex },
          );

          if (parsed.interTrialIntervalMs > 0 && trialIndex < block.trials - 1) {
            await sleep(parsed.interTrialIntervalMs);
          }
        },
      }),
    onTaskStart: () => {
      eventLogger.emit("task_start", { task: "matb-tracking", runner: "native_compensatory" });
    },
    onBlockStart: async ({ block, blockIndex }) => {
      root.innerHTML = "";
      root.appendChild(stageShell);
      eventLogger.emit(
        "block_start",
        { label: block.label, phase: block.phase, trials: block.trials },
        { blockIndex },
      );
    },
    onBlockEnd: async ({ block, blockIndex }) => {
      eventLogger.emit(
        "block_end",
        {
          label: block.label,
          phase: block.phase,
          meanInsideRate: computeBlockInsideRate(trialRecords, blockIndex),
        },
        { blockIndex },
      );
      root.innerHTML = "";
      root.appendChild(stageShell);
    },
    onTaskEnd: () => {
      eventLogger.emit("task_complete", { task: "matb-tracking", nTrials: trialRecords.length });
    },
    csvOptions: {
      suffix: "matb_tracking_trials",
      getRecords: () => trialRecords,
    },
    getTaskMetadata: () => ({
      config: parsed,
      records: trialRecords,
      trialBins,
      rawSamples,
      eventLog: eventLogger.events,
    }),
  });
}

// ---------------------------------------------------------------------------
// Trial runner
// ---------------------------------------------------------------------------

interface RunCompensatoryTrialArgs {
  blockIndex: number;
  trialIndex: number;
  blockLabel: string;
  stageHost: HTMLElement;
  display: ParsedDisplayConfig;
  reticle: ParsedReticleConfig;
  cursor: ParsedCursorConfig;
  trialTemplate: ParsedTrialTemplate;
}

async function runCompensatoryTrial(args: RunCompensatoryTrialArgs): Promise<TrialRuntimeResult> {
  args.stageHost.innerHTML = "";

  const frame = createDisplayFrame(args.stageHost, args.display);
  const rendererConfig: CompensatoryRendererConfig = {
    width: args.display.aperturePx,
    height: args.display.aperturePx,
    backgroundColor: args.display.canvasBackground,
    showCrosshair: args.display.showCrosshair,
  };
  const renderer = createCompensatoryRenderer(frame, rendererConfig);

  const displayConfig: CompensatoryDisplayConfig = {
    reticleRadiusPx: args.reticle.radiusPx,
    reticleStrokeColor: args.reticle.strokeColor,
    reticleStrokeWidthPx: args.reticle.strokeWidthPx,
    reticleFillColor: args.reticle.fillColor,
    cursorRadiusPx: args.cursor.radiusPx,
    cursorColorInside: args.cursor.colorInside,
    cursorColorOutside: args.cursor.colorOutside,
  };

  const perturbation = new PerturbationController({
    components: args.trialTemplate.perturbation.components,
    inputGain: args.trialTemplate.perturbation.inputGain,
    maxDisplacementPx: args.trialTemplate.perturbation.maxDisplacementPx,
  });

  // Target geometry: fixed circle at canvas centre.
  const halfAperture = args.display.aperturePx / 2;
  const reticleTarget: TrackingCircleTarget = {
    shape: "circle",
    centerX: halfAperture,
    centerY: halfAperture,
    radiusPx: args.reticle.radiusPx,
  };

  const localRawSamples: RawSample[] = [];
  const binner = new TrackingBinSummarizer({
    binMs: args.trialTemplate.binMs,
    includeEmptyBins: true,
  });

  let sampleCount = 0;
  let insideCount = 0;
  let outsideCount = 0;
  let distanceSampleCount = 0;
  let distanceSum = 0;

  const startMs = performance.now();
  let previousMs = startMs;
  let lastSampleElapsed = -Infinity;

  await new Promise<void>((resolve) => {
    let rafId: number | null = null;

    const tick = (now: number) => {
      const elapsed = now - startMs;
      const dtMs = now - previousMs;
      previousMs = now;

      // Get participant's mouse delta and advance the perturbation model.
      const delta = renderer.consumeMouseDelta();
      const state = perturbation.step(dtMs, delta.dx, delta.dy);

      // Absolute cursor position on canvas.
      const absCursorX = halfAperture + state.cursorX;
      const absCursorY = halfAperture + state.cursorY;

      const distResult = computeTrackingDistance(
        { x: absCursorX, y: absCursorY },
        reticleTarget,
      );
      const inside = distResult.inside;
      const boundaryDistancePx = distResult.boundaryDistancePx;

      // Sample at the configured interval.
      if (elapsed - lastSampleElapsed >= args.trialTemplate.sampleIntervalMs) {
        sampleCount += 1;
        if (inside) insideCount += 1;
        else outsideCount += 1;
        if (Number.isFinite(boundaryDistancePx)) {
          distanceSampleCount += 1;
          distanceSum += boundaryDistancePx;
        }

        const timeMs = Math.max(0, Math.round(elapsed));
        binner.add({ timeMs, inside, boundaryDistancePx });

        if (args.trialTemplate.storeRawSamples) {
          localRawSamples.push({
            blockIndex: args.blockIndex,
            trialIndex: args.trialIndex,
            timeMs,
            cursorX: state.cursorX,
            cursorY: state.cursorY,
            perturbationX: state.perturbationX,
            perturbationY: state.perturbationY,
            compensationX: state.compensationX,
            compensationY: state.compensationY,
            inside,
            boundaryDistancePx,
          });
        }

        lastSampleElapsed = elapsed;
      }

      // Render.
      renderer.render(
        { cursorX: state.cursorX, cursorY: state.cursorY, inside },
        displayConfig,
      );

      if (elapsed >= args.trialTemplate.durationMs) {
        if (rafId != null) cancelAnimationFrame(rafId);
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
    elapsedMs,
    sampleCount,
    insideCount,
    outsideCount,
    distanceSampleCount,
    meanBoundaryDistancePx: distanceSampleCount > 0 ? distanceSum / distanceSampleCount : null,
    bins,
    rawSamples: localRawSamples,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createDisplayFrame(host: HTMLElement, display: ParsedDisplayConfig): HTMLElement {
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

function computeBlockInsideRate(records: TrialRecord[], blockIndex: number): number {
  const rows = records.filter((r) => r.blockIndex === blockIndex);
  if (rows.length === 0) return 0;
  const totals = rows.reduce(
    (acc, row) => {
      acc.inside += row.insideCount;
      acc.total += row.sampleCount;
      return acc;
    },
    { inside: 0, total: 0 },
  );
  return totals.total > 0 ? totals.inside / totals.total : 0;
}

// ---------------------------------------------------------------------------
// Config parsing
// ---------------------------------------------------------------------------

function parseConfig(taskConfig: Record<string, unknown>, _selection: SelectionContext): ParsedConfig {
  const taskRaw = asObject(taskConfig.task) ?? {};
  const title = asString(taskRaw.title) ?? "MATB Compensatory Tracking";

  const instructionsRaw = asObject(taskConfig.instructions) ?? {};
  const instructionConfig = buildTaskInstructionConfig({
    title,
    instructions: instructionsRaw,
    defaults: {
      intro: [
        "Keep the cursor dot centred inside the reticle by moving your mouse.",
        "The cursor will drift due to perturbation — compensate to keep it inside the target circle.",
        "Click the display to lock your mouse pointer.",
      ],
    },
    blockIntroTemplateDefault: "Block with {nTrials} tracking trials. Phase: {phase}.",
  });

  const displayRaw = asObject(taskConfig.display) ?? {};
  const display: ParsedDisplayConfig = {
    aperturePx: toPositiveNumber(displayRaw.aperturePx, 400),
    frameBackground: asString(displayRaw.frameBackground) ?? "#0f172a",
    frameBorder: asString(displayRaw.frameBorder) ?? "#334155",
    canvasBackground: asString(displayRaw.canvasBackground) ?? "#e2e8f0",
    showCrosshair: displayRaw.showCrosshair !== false,
  };

  const reticleRaw = asObject(taskConfig.reticle) ?? {};
  const reticle: ParsedReticleConfig = {
    radiusPx: toPositiveNumber(reticleRaw.radiusPx, 50),
    strokeColor: asString(reticleRaw.strokeColor) ?? "#334155",
    strokeWidthPx: toPositiveNumber(reticleRaw.strokeWidthPx, 2),
    fillColor: asString(reticleRaw.fillColor) ?? "rgba(22, 163, 74, 0.15)",
  };

  const cursorRaw = asObject(taskConfig.cursor) ?? {};
  const cursor: ParsedCursorConfig = {
    radiusPx: toPositiveNumber(cursorRaw.radiusPx, 4),
    colorInside: asString(cursorRaw.colorInside) ?? "#000000",
    colorOutside: asString(cursorRaw.colorOutside) ?? "#ef4444",
  };

  const trialDefaultsRaw = asObject(taskConfig.trialDefaults) ?? {};
  const perturbationDefaultsRaw = asObject(trialDefaultsRaw.perturbation) ?? {};
  const defaultComponents = parsePerturbationComponents(
    asArray(perturbationDefaultsRaw.components),
  );

  const planRaw = asObject(taskConfig.plan) ?? {};
  const blocksRaw = asArray(planRaw.blocks);
  const blocks = (blocksRaw.length > 0 ? blocksRaw : [{}]).map((entry, index) => {
    const raw = asObject(entry) ?? {};
    const pertRaw = asObject(raw.perturbation) ?? perturbationDefaultsRaw;
    const components = parsePerturbationComponents(
      asArray(pertRaw.components).length > 0 ? asArray(pertRaw.components) : defaultComponents as unknown as unknown[],
    );

    const perturbation: ParsedPerturbationConfig = {
      components: components.length > 0 ? components : defaultPerturbationComponents(),
      inputGain: toPositiveNumber(pertRaw.inputGain ?? perturbationDefaultsRaw.inputGain, 1),
      maxDisplacementPx: toPositiveNumber(
        pertRaw.maxDisplacementPx ?? perturbationDefaultsRaw.maxDisplacementPx,
        display.aperturePx / 2,
      ),
    };

    const trialTemplate: ParsedTrialTemplate = {
      durationMs: toPositiveNumber(raw.trialDurationMs ?? trialDefaultsRaw.durationMs, 60000),
      sampleIntervalMs: toPositiveNumber(raw.sampleIntervalMs ?? trialDefaultsRaw.sampleIntervalMs, 16),
      binMs: toPositiveNumber(raw.binMs ?? trialDefaultsRaw.binMs, 2000),
      storeRawSamples: raw.storeRawSamples === true || trialDefaultsRaw.storeRawSamples === true,
      perturbation,
    };

    return {
      label: asString(raw.label) ?? `Block ${index + 1}`,
      phase: asString(raw.phase) ?? "main",
      trials: toPositiveNumber(raw.trials, 1),
      beforeBlockScreens: toStringScreens(resolveBlockScreenSlotValue(raw, "before")),
      afterBlockScreens: toStringScreens(resolveBlockScreenSlotValue(raw, "after")),
      trialTemplate,
    } satisfies ParsedBlock;
  });

  return {
    title,
    instructions: instructionConfig,
    display,
    reticle,
    cursor,
    interTrialIntervalMs: toNonNegativeNumber(taskConfig.interTrialIntervalMs, 300),
    blocks,
  };
}

function parsePerturbationComponents(raw: unknown[]): PerturbationComponent[] {
  const out: PerturbationComponent[] = [];
  for (const entry of raw) {
    const obj = asObject(entry);
    if (!obj) continue;
    const axis = asString(obj.axis);
    if (axis !== "x" && axis !== "y") continue;
    out.push({
      axis,
      frequencyHz: toPositiveFloat(obj.frequencyHz, 0.05),
      amplitude: toPositiveFloat(obj.amplitude, 40),
      phaseRad: toNonNegativeNumber(obj.phaseRad, 0),
    });
  }
  return out;
}

function defaultPerturbationComponents(): PerturbationComponent[] {
  // Default from Comstock & Arnegard (1992) style: two components per axis
  // at different frequencies for complex, non-repeating perturbation.
  return [
    { axis: "x", frequencyHz: 0.03, amplitude: 40, phaseRad: 0 },
    { axis: "x", frequencyHz: 0.07, amplitude: 28, phaseRad: 0 },
    { axis: "y", frequencyHz: 0.05, amplitude: 40, phaseRad: 0 },
    { axis: "y", frequencyHz: 0.11, amplitude: 20, phaseRad: 0 },
  ];
}
