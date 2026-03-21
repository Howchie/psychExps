/**
 * MATB Composite Task Adapter.
 *
 * Assembles all four MATB sub-tasks (sysmon, tracking, comms, resman)
 * into a simultaneous multi-panel session using PanelLayoutManager and
 * ConcurrentTaskRunner.  A TaskOrchestrator drives the block-level session
 * lifecycle (instructions, DRT modules, break screens, data export).
 *
 * Config shape (backward-compatible — all existing flat configs work as-is):
 *
 *   task.title              - display title
 *   task.durationMs         - default block duration in ms (default 480000)
 *   task.modules.drt        - task-level DRT config (overridable per block)
 *   display                 - sizing / aspect-ratio for the MATB area
 *   instructions.intro/end  - intro / end screen text
 *   layout                  - default PanelLayoutConfig (rows, cols, panels[])
 *   subtasks                - default sub-task configs
 *   scenario.events         - default scenario events
 *   plan.blocks[]           - block definitions (optional; omit for single session)
 *   endSurvey               - optional post-session survey (e.g. NASA-TLX)
 */

import {
  asArray,
  asObject,
  asString,
  asStringArray,
  createTaskAdapter,
  buildTaskInstructionConfig,
  applyTaskInstructionConfig,
  toPositiveNumber,
  toNonNegativeNumber,
  finalizeTaskRun,
  PanelLayoutManager,
  ConcurrentTaskRunner,
  ScenarioScheduler,
  DynamicScenarioSource,
  TaskOrchestrator,
  recordsToCsv,
  downloadCsv,
  createSurveyFromPreset,
  runSurvey,
  type TaskAdapterContext,
  type PanelLayoutConfig,
  type ScenarioEvent,
  type ScenarioEventSource,
  type DynamicScenarioSourceConfig,
  type StandardTaskInstructionConfig,
  type SurveyRunResult,
} from "@experiments/core";

import { createSysmonSubTaskHandle, type SysmonSubTaskResult } from "./subtasks/sysmon";
import { createTrackingSubTaskHandle, type TrackingSubTaskResult } from "./subtasks/tracking";
import { createCommsSubTaskHandle, type CommsSubTaskResult } from "./subtasks/comms";
import { createResmanSubTaskHandle, type ResmanSubTaskResult } from "./subtasks/resman";
import { WaldOverlay, type WaldOverlayConfig } from "./widgets/waldOverlay";
import { AdaptiveController, type AdaptiveControllerConfig } from "./adaptiveController";

// ---------------------------------------------------------------------------
// Adapter registration
// ---------------------------------------------------------------------------

export const matbAdapter = createTaskAdapter({
  manifest: {
    taskId: "matb",
    label: "MATB Multi-Attribute Task Battery",
    variants: [
      { id: "default",            label: "MATB Default",                  configPath: "matb/default" },
      { id: "practice",           label: "MATB Practice",                 configPath: "matb/practice" },
      { id: "low-load",           label: "MATB Low Load",                 configPath: "matb/low-load" },
      { id: "high-load",          label: "MATB High Load",                configPath: "matb/high-load" },
      { id: "basic",              label: "MATB Basic",                    configPath: "matb/basic" },
      { id: "parasuraman-high",   label: "Parasuraman High Reliability",  configPath: "matb/parasuraman-high" },
      { id: "parasuraman-low",    label: "Parasuraman Low Reliability",   configPath: "matb/parasuraman-low" },
      { id: "parasuraman-drt",    label: "Parasuraman + DRT (2-block)",   configPath: "matb/parasuraman-drt" },
      { id: "parasuraman-drt-dynamic", label: "Parasuraman + DRT Dynamic", configPath: "matb/parasuraman-drt-dynamic" },
    ],
  },
  run: (context) => runMatbCompositeTask(context),
  terminate: async () => {},
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MatbDisplayConfig {
  maxWidthPx: number;
  maxHeightPx: number;
  minWidthPx: number;
  minHeightPx: number;
  aspectRatio: string;
  marginPx: number;
  background: string;
}

interface MatbBlock {
  label: string;
  blockType: string;
  isPractice: boolean;
  durationMs: number;
  subtasks: {
    sysmon:   Record<string, unknown>;
    tracking: Record<string, unknown>;
    comms:    Record<string, unknown>;
    resman:   Record<string, unknown>;
  };
  /** Static events (used when scenarioMode is "static" or absent). */
  scenario: ScenarioEvent[];
  /** Dynamic scenario config (used when scenarioMode is "dynamic"). */
  dynamicScenario: DynamicScenarioSourceConfig | null;
  /** "static" (default) or "dynamic". */
  scenarioMode: "static" | "dynamic";
  layout: PanelLayoutConfig | null;
  beforeBlockScreens: string[];
  afterBlockScreens: string[];
  modules: Record<string, unknown>;
}

export interface MatbBlockResult {
  blockIndex: number;
  blockLabel: string;
  durationMs: number;
  sysmon:   SysmonSubTaskResult   | null;
  tracking: TrackingSubTaskResult | null;
  comms:    CommsSubTaskResult    | null;
  resman:   ResmanSubTaskResult   | null;
}

interface ParsedCompositeConfig {
  title: string;
  display: MatbDisplayConfig;
  instructions: StandardTaskInstructionConfig;
  layout: PanelLayoutConfig;
  blocks: MatbBlock[];
  endSurvey: { preset: string; [key: string]: unknown } | null;
  waldOverlay: WaldOverlayConfig;
  adaptive: AdaptiveControllerConfig;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_INTRO_PAGES = [
  "The Multi-Attribute Task Battery (MATB) will now begin.",
  "You will be asked to monitor four tasks simultaneously:",
  "SYSMON (top-left): Watch for indicator failures and press the labelled key.",
  "TRACKING (top-right): Keep the cursor inside the central reticle using the mouse.",
  "COMMS (bottom-left): Respond to radio prompts when you hear your own callsign.",
  "RESMAN (bottom-right): Keep tanks A and B near their target levels using the numpad.",
  "Press continue when you are ready to begin.",
];

const SUBTASK_IDS = ["sysmon", "tracking", "comms", "resman"] as const;

function parseScenarioEvents(raw: unknown): ScenarioEvent[] {
  const obj = asObject(raw) ?? {};
  const eventsRaw = asArray(obj.events);
  return eventsRaw.map((e) => {
    const o = asObject(e) ?? {};
    return {
      timeMs:   toNonNegativeNumber(o.timeMs, 0),
      targetId: asString(o.targetId ?? o.target) ?? "*",
      command:  asString(o.command) ?? "noop",
      path:     asString(o.path) ?? undefined,
      value:    o.value,
    };
  });
}

function parseScenarioMode(raw: unknown): "static" | "dynamic" {
  const obj = asObject(raw) ?? {};
  const mode = asString(obj.mode);
  return mode === "dynamic" ? "dynamic" : "static";
}

function parseDynamicScenarioConfig(raw: unknown, durationMs: number): DynamicScenarioSourceConfig | null {
  const obj = asObject(raw) ?? {};
  if (asString(obj.mode) !== "dynamic") return null;

  const sysmonRaw   = asObject(obj.sysmon) ?? {};
  const commsRaw    = asObject(obj.comms) ?? {};
  const resmanRaw   = asObject(obj.resman) ?? {};
  const trackingRaw = asObject(obj.tracking) ?? {};

  return {
    durationMs,
    seed:                  obj.seed != null ? toPositiveNumber(obj.seed, 1) : undefined,
    warmupMs:              obj.warmupMs != null ? toNonNegativeNumber(obj.warmupMs, 20000) : undefined,
    cooldownMs:            obj.cooldownMs != null ? toNonNegativeNumber(obj.cooldownMs, 15000) : undefined,
    maxConcurrentFailures: obj.maxConcurrentFailures != null ? toNonNegativeNumber(obj.maxConcurrentFailures, 0) : undefined,
    sysmon: {
      intervalMs:         sysmonRaw.intervalMs != null ? toPositiveNumber(sysmonRaw.intervalMs, 30000) : undefined,
      minGapMs:           sysmonRaw.minGapMs != null ? toPositiveNumber(sysmonRaw.minGapMs, 8000) : undefined,
      reliability:        sysmonRaw.reliability != null ? Number(sysmonRaw.reliability) || 0 : undefined,
      autoResolveDelayMs: sysmonRaw.autoResolveDelayMs != null ? toNonNegativeNumber(sysmonRaw.autoResolveDelayMs, 4000) : undefined,
      scaleIds:           asArray(sysmonRaw.scaleIds).length > 0 ? asArray(sysmonRaw.scaleIds).map(String) : undefined,
      lightIds:           asArray(sysmonRaw.lightIds).length > 0 ? asArray(sysmonRaw.lightIds).map(String) : undefined,
    },
    comms: {
      intervalMs:      commsRaw.intervalMs != null ? toPositiveNumber(commsRaw.intervalMs, 40000) : undefined,
      minGapMs:        commsRaw.minGapMs != null ? toPositiveNumber(commsRaw.minGapMs, 15000) : undefined,
      ownRatio:        commsRaw.ownRatio != null ? Number(commsRaw.ownRatio) || 0.5 : undefined,
      ownCallsign:     asString(commsRaw.ownCallsign) ?? undefined,
      otherCallsigns:  asArray(commsRaw.otherCallsigns).length > 0 ? asArray(commsRaw.otherCallsigns).map(String) : undefined,
      radioIds:        asArray(commsRaw.radioIds).length > 0 ? asArray(commsRaw.radioIds).map(String) : undefined,
    },
    resman: {
      intervalMs:        resmanRaw.intervalMs != null ? toPositiveNumber(resmanRaw.intervalMs, 60000) : undefined,
      minGapMs:          resmanRaw.minGapMs != null ? toPositiveNumber(resmanRaw.minGapMs, 15000) : undefined,
      failureDurationMs: resmanRaw.failureDurationMs != null ? toPositiveNumber(resmanRaw.failureDurationMs, 30000) : undefined,
      reliability:       resmanRaw.reliability != null ? Number(resmanRaw.reliability) || 0 : undefined,
      pumpIds:           asArray(resmanRaw.pumpIds).length > 0 ? asArray(resmanRaw.pumpIds).map(String) : undefined,
    },
    tracking: {
      automated:      trackingRaw.automated !== undefined ? trackingRaw.automated === true || trackingRaw.automated === "true" : undefined,
      automationGain: trackingRaw.automationGain != null ? Number(trackingRaw.automationGain) || 0.95 : undefined,
    },
  };
}

/**
 * When scenario mode is "dynamic", merge automation-relevant fields from the
 * scenario sub-configs into the respective subtask configs. This lets
 * researchers specify `automated: true` once in the scenario block rather than
 * repeating it in a separate subtasks block.
 * Explicit subtask config values always win (they are applied first; scenario
 * values only fill in keys that aren't already set).
 */
function mergeScenarioAutomation(
  scenarioRaw: unknown,
  subtasks: { sysmon: Record<string, unknown>; tracking: Record<string, unknown>; comms: Record<string, unknown>; resman: Record<string, unknown> },
): void {
  const obj = asObject(scenarioRaw) ?? {};

  const scen = {
    sysmon:   asObject(obj.sysmon)   ?? {},
    comms:    asObject(obj.comms)    ?? {},
    resman:   asObject(obj.resman)   ?? {},
    tracking: asObject(obj.tracking) ?? {},
  };

  // Fields to propagate from scenario sub-config → subtask config (only if not already set).
  const mergeIfAbsent = (target: Record<string, unknown>, source: Record<string, unknown>, keys: string[]): void => {
    for (const k of keys) {
      if (source[k] !== undefined && target[k] === undefined) {
        target[k] = source[k];
      }
    }
  };

  mergeIfAbsent(subtasks.sysmon,   scen.sysmon,   ["automated", "autoResolveDelayMs"]);
  mergeIfAbsent(subtasks.comms,    scen.comms,    ["automated", "muteAudio", "automatedResponseDelayMs"]);
  mergeIfAbsent(subtasks.resman,   scen.resman,   ["automated", "autoResolveDelayMs"]);
  mergeIfAbsent(subtasks.tracking, scen.tracking, ["automated", "automationGain"]);
}

function parsePanelLayout(raw: unknown): PanelLayoutConfig {
  const layoutRaw = asObject(raw) ?? {};
  const panelsRaw = asArray(layoutRaw.panels);
  return {
    rows: toPositiveNumber(layoutRaw.rows, 2),
    cols: toPositiveNumber(layoutRaw.cols, 2),
    gap:  asString(layoutRaw.gap) ?? "2px",
    padding:    asString(layoutRaw.padding) ?? "0",
    background: asString(layoutRaw.background) ?? "#1a1a1a",
    panels: panelsRaw.length > 0
      ? panelsRaw.map((p) => {
          const o = asObject(p) ?? {};
          return {
            id:         asString(o.id) ?? "panel",
            row:        toNonNegativeNumber(o.row, 0),
            col:        toNonNegativeNumber(o.col, 0),
            rowSpan:    o.rowSpan != null ? toPositiveNumber(o.rowSpan, 1) : undefined,
            colSpan:    o.colSpan != null ? toPositiveNumber(o.colSpan, 1) : undefined,
            label:      asString(o.label) ?? undefined,
            background: asString(o.background) ?? undefined,
            border:     asString(o.border) ?? undefined,
          };
        })
      : [
          { id: "sysmon",   row: 0, col: 0, label: "SYSMON" },
          { id: "tracking", row: 0, col: 1, label: "TRACKING" },
          { id: "comms",    row: 1, col: 0, label: "COMMS" },
          { id: "resman",   row: 1, col: 1, label: "RESMAN" },
        ],
  };
}

// ---------------------------------------------------------------------------
// Config parsing
// ---------------------------------------------------------------------------

function parseConfig(raw: Record<string, unknown>): ParsedCompositeConfig {
  const taskRaw      = asObject(raw.task) ?? {};
  const title        = asString(taskRaw.title) ?? "MATB";
  const defaultDurMs = toPositiveNumber(taskRaw.durationMs, 480000);

  // ── Display ────────────────────────────────────────────────────────────

  const dRaw = asObject(raw.display) ?? {};
  const display: MatbDisplayConfig = {
    maxWidthPx:  toPositiveNumber(dRaw.maxWidthPx, 1200),
    maxHeightPx: toPositiveNumber(dRaw.maxHeightPx, 900),
    minWidthPx:  toPositiveNumber(dRaw.minWidthPx, 640),
    minHeightPx: toPositiveNumber(dRaw.minHeightPx, 480),
    aspectRatio: asString(dRaw.aspectRatio) ?? "4/3",
    marginPx:    toNonNegativeNumber(dRaw.marginPx, 32),
    background:  asString(dRaw.background) ?? "#111",
  };

  // ── Instructions ───────────────────────────────────────────────────────

  const instructionsRaw = asObject(raw.instructions) ?? {};
  const instructions = buildTaskInstructionConfig({
    title,
    instructions: instructionsRaw,
    defaults: { intro: DEFAULT_INTRO_PAGES },
  });

  // ── Default layout ─────────────────────────────────────────────────────

  const layout = parsePanelLayout(raw.layout);

  // ── Default sub-task configs ───────────────────────────────────────────

  const sRaw = asObject(raw.subtasks) ?? {};
  const defaultSubtasks = {
    sysmon:   asObject(sRaw.sysmon)   ?? {},
    tracking: asObject(sRaw.tracking) ?? {},
    comms:    asObject(sRaw.comms)    ?? {},
    resman:   asObject(sRaw.resman)   ?? {},
  };

  // ── Default scenario ───────────────────────────────────────────────────

  const defaultScenarioMode = parseScenarioMode(raw.scenario);
  const defaultScenario = parseScenarioEvents(raw.scenario);
  const defaultDynamicScenario = parseDynamicScenarioConfig(raw.scenario, defaultDurMs);

  // ── Blocks ─────────────────────────────────────────────────────────────

  const planRaw   = asObject(raw.plan);
  const blocksRaw = planRaw ? asArray(planRaw.blocks) : [];

  let blocks: MatbBlock[];

  if (blocksRaw.length > 0) {
    blocks = blocksRaw.map((b, i) => {
      const o    = asObject(b) ?? {};
      const bSub = asObject(o.subtasks);
      const blockDurMs = toPositiveNumber(o.durationMs, defaultDurMs);
      const blockScenarioMode = o.scenario ? parseScenarioMode(o.scenario) : defaultScenarioMode;
      const blockSubtasks: MatbBlock["subtasks"] = bSub
        ? {
            sysmon:   asObject(bSub.sysmon)   ?? defaultSubtasks.sysmon,
            tracking: asObject(bSub.tracking) ?? defaultSubtasks.tracking,
            comms:    asObject(bSub.comms)    ?? defaultSubtasks.comms,
            resman:   asObject(bSub.resman)   ?? defaultSubtasks.resman,
          }
        : { ...defaultSubtasks };
      if (blockScenarioMode === "dynamic" && o.scenario) {
        mergeScenarioAutomation(o.scenario, blockSubtasks);
      }
      return {
        label:              asString(o.label) ?? `Block ${i + 1}`,
        blockType:          asString(o.blockType) ?? "experimental",
        isPractice:         o.isPractice === true,
        durationMs:         blockDurMs,
        subtasks:           blockSubtasks,
        scenario:           o.scenario ? parseScenarioEvents(o.scenario) : defaultScenario,
        dynamicScenario:    o.scenario
          ? parseDynamicScenarioConfig(o.scenario, blockDurMs)
          : (defaultDynamicScenario ? { ...defaultDynamicScenario, durationMs: blockDurMs } : null),
        scenarioMode:       blockScenarioMode,
        layout:             o.layout ? parsePanelLayout(o.layout) : null,
        beforeBlockScreens: asStringArray(o.beforeBlockScreens, []),
        afterBlockScreens:  asStringArray(o.afterBlockScreens, []),
        modules:            asObject(o.modules) ?? {},
      };
    });
  } else {
    // Legacy flat config → single block (preserves backward compatibility).
    const legacySubtasks: MatbBlock["subtasks"] = { ...defaultSubtasks };
    if (defaultScenarioMode === "dynamic" && raw.scenario) {
      mergeScenarioAutomation(raw.scenario, legacySubtasks);
    }
    blocks = [
      {
        label:              "Session",
        blockType:          "experimental",
        isPractice:         false,
        durationMs:         defaultDurMs,
        subtasks:           legacySubtasks,
        scenario:           defaultScenario,
        dynamicScenario:    defaultDynamicScenario,
        scenarioMode:       defaultScenarioMode,
        layout:             null,
        beforeBlockScreens: [],
        afterBlockScreens:  [],
        modules:            {},
      },
    ];
  }

  // ── End survey ─────────────────────────────────────────────────────────

  const endSurveyRaw = asObject(raw.endSurvey);
  const endSurvey = endSurveyRaw
    ? { preset: asString(endSurveyRaw.preset) ?? "nasa_tlx", ...endSurveyRaw }
    : null;

  // ── Wald overlay ──────────────────────────────────────────────────────

  const woRaw = asObject(raw.waldOverlay) ?? {};
  const waldOverlay: WaldOverlayConfig = {
    enabled:            woRaw.enabled === true || woRaw.enabled === "true",
    maxSparklinePoints: woRaw.maxSparklinePoints != null ? toPositiveNumber(woRaw.maxSparklinePoints, 60) : undefined,
    position:           (asString(woRaw.position) as WaldOverlayConfig["position"]) ?? undefined,
  };

  // ── Adaptive controller ─────────────────────────────────────────────

  const adRaw = asObject(raw.adaptive) ?? {};
  const adaptive: AdaptiveControllerConfig = {
    enabled:              adRaw.enabled === true || adRaw.enabled === "true",
    targetDriftRateBand:  Array.isArray(adRaw.targetDriftRateBand) && adRaw.targetDriftRateBand.length === 2
      ? [Number(adRaw.targetDriftRateBand[0]) || 2.0, Number(adRaw.targetDriftRateBand[1]) || 4.0]
      : undefined,
    minSampleSize:        adRaw.minSampleSize != null ? toPositiveNumber(adRaw.minSampleSize, 15) : undefined,
    adjustmentCooldownMs: adRaw.adjustmentCooldownMs != null ? toPositiveNumber(adRaw.adjustmentCooldownMs, 30000) : undefined,
    intervalStepFraction: adRaw.intervalStepFraction != null ? Number(adRaw.intervalStepFraction) || 0.15 : undefined,
    reliabilityStep:      adRaw.reliabilityStep != null ? Number(adRaw.reliabilityStep) || 0.1 : undefined,
  };

  return { title, display, instructions, layout, blocks, endSurvey, waldOverlay, adaptive };
}

// ---------------------------------------------------------------------------
// Display container
// ---------------------------------------------------------------------------

/**
 * Create the proportional MATB display area.
 *
 * Returns an outer wrapper (flex-centered, provides margin/background) and
 * the inner matbArea that maintains the configured aspect ratio and respects
 * min/max size constraints.  The panel grid is rendered inside matbArea;
 * matbArea also serves as the DRT borderTargetElement.
 */
function createMatbDisplayElements(display: MatbDisplayConfig): {
  outer: HTMLElement;
  matbArea: HTMLElement;
} {
  const outer = document.createElement("div");
  outer.style.display        = "flex";
  outer.style.alignItems     = "center";
  outer.style.justifyContent = "center";
  outer.style.width          = "100%";
  outer.style.height         = "100dvh";
  outer.style.overflow       = "hidden";
  outer.style.cursor         = "none";
  outer.style.background     = display.background;
  outer.style.padding        = `${display.marginPx}px`;
  outer.style.boxSizing      = "border-box";

  const matbArea = document.createElement("div");
  matbArea.style.width       = "100%";
  matbArea.style.maxWidth    = `${display.maxWidthPx}px`;
  matbArea.style.minWidth    = `${display.minWidthPx}px`;
  matbArea.style.aspectRatio = display.aspectRatio;
  matbArea.style.maxHeight   = `min(100%, ${display.maxHeightPx}px)`;
  matbArea.style.minHeight   = `${display.minHeightPx}px`;
  matbArea.style.position    = "relative";
  matbArea.style.boxSizing   = "border-box";
  matbArea.style.overflow    = "hidden";

  outer.appendChild(matbArea);
  return { outer, matbArea };
}

// ---------------------------------------------------------------------------
// Main runner
// ---------------------------------------------------------------------------

async function runMatbCompositeTask(context: TaskAdapterContext): Promise<unknown> {
  const config = parseConfig(context.taskConfig);
  const root   = context.container;
  const { eventLogger, selection, coreConfig, moduleRunner } = context;

  // Apply instruction config so the orchestrator can read intro/end pages.
  applyTaskInstructionConfig(context.taskConfig, config.instructions);

  // ── Proportional display area (reused across blocks) ──────────────────

  const { outer: outerContainer, matbArea: matbDisplay } =
    createMatbDisplayElements(config.display);

  // ── CSV record accumulators ───────────────────────────────────────────

  const allSysmonRecords:      Record<string, unknown>[] = [];
  const allCommsRecords:       Record<string, unknown>[] = [];
  const allResmanTankRecords:  Record<string, unknown>[] = [];
  const allResmanTickRecords:  Record<string, unknown>[] = [];
  const allTrackingBins:       Record<string, unknown>[] = [];
  const allTrackingExcursions: Record<string, unknown>[] = [];
  const blockResults: MatbBlockResult[] = [];

  // ── Wald overlay (persists across blocks) ─────────────────────────────

  let waldOverlay: WaldOverlay | null = null;

  // ── Orchestrator ──────────────────────────────────────────────────────

  const orchestrator =
    new TaskOrchestrator<MatbBlock, number, MatbBlockResult>(context);

  await orchestrator.run({
    autoFinalize:   false,
    buttonIdPrefix: "matb",

    // ── Blocks ──────────────────────────────────────────────────────────

    getBlocks: () =>
      config.blocks.map((block) => ({
        ...block,
        modules: { ...block.modules },
      })),

    // ── Module context (tells DRT where the MATB display lives) ─────────

    resolveModuleContext: () => ({
      displayElement:      matbDisplay,
      borderTargetElement: matbDisplay,
      borderTargetRect:    () => matbDisplay.getBoundingClientRect(),
    }),

    // ── Single "trial" per block = the whole MATB session ───────────────

    getTrials: () => [0],

    getBlockUi: ({ block }) => ({
      preBlockPages:  block.beforeBlockScreens.length > 0
        ? block.beforeBlockScreens : undefined,
      postBlockPages: block.afterBlockScreens.length > 0
        ? block.afterBlockScreens : undefined,
      showBlockIntro: config.blocks.length > 1,
      showBlockLabel: config.blocks.length > 1,
    }),

    // ── Run one MATB block ──────────────────────────────────────────────

    runTrial: async ({ block, blockIndex }) => {
      // Attach proportional display
      root.innerHTML = "";
      root.appendChild(outerContainer);
      matbDisplay.innerHTML = "";

      // Panel layout and sub-task handles
      const blockLayout = block.layout ?? config.layout;
      const layout = new PanelLayoutManager(matbDisplay, blockLayout);

      const sysmonHandle   = createSysmonSubTaskHandle();
      const trackingHandle = createTrackingSubTaskHandle();
      const commsHandle    = createCommsSubTaskHandle();
      const resmanHandle   = createResmanSubTaskHandle();

      const runner = new ConcurrentTaskRunner(
        [sysmonHandle, trackingHandle, commsHandle, resmanHandle],
        {
          onEvent: (e) => {
            eventLogger.emit(e.type, {
              matb: true, blockIndex, blockLabel: block.label, ...e,
            });
          },
        },
      );

      for (const id of SUBTASK_IDS) {
        try { runner.setPanel(id, layout.getPanel(id)); } catch { /* panel absent */ }
        runner.setSubtaskConfig(id, block.subtasks[id]);
      }

      // Set up event source: static (pre-authored events) or dynamic (runtime generation).
      let eventSource: ScenarioEventSource;
      let dynSource: DynamicScenarioSource | null = null;
      if (block.scenarioMode === "dynamic" && block.dynamicScenario) {
        dynSource = new DynamicScenarioSource(block.dynamicScenario);
        eventSource = dynSource;
        eventLogger.emit("matb_dynamic_scenario_init", {
          blockIndex, blockLabel: block.label,
          params: dynSource.getParams(),
        });
      } else {
        eventSource = new ScenarioScheduler(block.scenario);
      }
      runner.setScheduler(eventSource);

      // Set up adaptive controller if dynamic mode + adaptive enabled.
      let adaptiveCtrl: AdaptiveController | null = null;
      if (config.adaptive.enabled && dynSource) {
        adaptiveCtrl = new AdaptiveController(config.adaptive);
        adaptiveCtrl.attach(dynSource, (adj) => {
          eventLogger.emit("matb_adaptive_adjustment", {
            blockIndex, blockLabel: block.label, ...adj,
          });
        });
      }

      // Run session
      eventLogger.emit("matb_block_start", {
        blockIndex, blockLabel: block.label, durationMs: block.durationMs,
        scenarioMode: block.scenarioMode,
      });

      runner.start();
      for (const id of SUBTASK_IDS) runner.startSubtask(id);

      // ── Wald overlay: create and poll DRT controller for estimates ──
      if (config.waldOverlay.enabled) {
        if (waldOverlay) waldOverlay.dispose();
        waldOverlay = new WaldOverlay(matbDisplay, config.waldOverlay);
      }
      let lastResponseRowCount = 0;

      // Wait for block duration using the runner's internal clock for precision
      // and yielding frequently to ensure the end is caught promptly even if
      // the browser throttles timers in background tabs.
      while (runner.elapsedMs() < block.durationMs) {
        await new Promise((resolve) => setTimeout(resolve, 250));

        // Poll DRT transform estimates for Wald overlay and adaptive controller.
        if ((waldOverlay || adaptiveCtrl) && moduleRunner) {
          const drtHandle = moduleRunner.getActiveHandle({
            scope: "block",
            blockIndex,
            trialIndex: null,
            moduleId: "drt",
          });
          if (drtHandle?.controller) {
            const ctrl = drtHandle.controller as { exportResponseRows?: () => Array<{ estimate: unknown }> };
            if (ctrl.exportResponseRows) {
              const rows = ctrl.exportResponseRows();
              for (let i = lastResponseRowCount; i < rows.length; i++) {
                const est = rows[i]?.estimate as import("@experiments/core").OnlineParameterTransformEstimate | null;
                if (est) {
                  waldOverlay?.update(est);
                  adaptiveCtrl?.onEstimate(est, runner.elapsedMs());
                }
              }
              lastResponseRowCount = rows.length;
            }
          }
        }
      }

      const results = runner.stop();
      if (waldOverlay) { waldOverlay.dispose(); waldOverlay = null; }
      if (adaptiveCtrl) { adaptiveCtrl.detach(); }
      layout.dispose();

      eventLogger.emit("matb_block_end", {
        blockIndex, blockLabel: block.label,
      });

      // Extract typed results
      const sysmonResult   = results.get("sysmon")   as SysmonSubTaskResult   | undefined;
      const trackingResult = results.get("tracking") as TrackingSubTaskResult | undefined;
      const commsResult    = results.get("comms")    as CommsSubTaskResult    | undefined;
      const resmanResult   = results.get("resman")   as ResmanSubTaskResult   | undefined;

      // Accumulate CSV records with block metadata
      const meta = { blockIndex, blockLabel: block.label };

      if (sysmonResult?.sdtRecords.length) {
        allSysmonRecords.push(
          ...sysmonResult.sdtRecords.map((r) => ({ ...r, ...meta })),
        );
      }
      if (commsResult?.records.length) {
        allCommsRecords.push(
          ...commsResult.records.map((r) => ({ ...r, ...meta })),
        );
      }
      if (resmanResult?.tankRecords.length) {
        allResmanTankRecords.push(
          ...resmanResult.tankRecords.map((r) => ({ ...r, ...meta })),
        );
      }
      if (resmanResult?.tickRecords?.length) {
        allResmanTickRecords.push(
          ...resmanResult.tickRecords.map((r) => ({ ...r, ...meta })),
        );
      }
      if (trackingResult?.bins.length) {
        allTrackingBins.push(
          ...trackingResult.bins.map((r) => ({ ...r, ...meta })),
        );
      }
      if (trackingResult?.excursionRecords?.length) {
        allTrackingExcursions.push(
          ...trackingResult.excursionRecords.map((r) => ({ ...r, ...meta })),
        );
      }

      const blockResult: MatbBlockResult = {
        blockIndex,
        blockLabel: block.label,
        durationMs: block.durationMs,
        sysmon:   sysmonResult   ?? null,
        tracking: trackingResult ?? null,
        comms:    commsResult    ?? null,
        resman:   resmanResult   ?? null,
      };
      blockResults.push(blockResult);
      return blockResult;
    },

    onBlockEnd: async () => {
      root.innerHTML = "";
    },

    onTaskStart: () => {
      eventLogger.emit("task_start", { task: "matb" });
    },

    onTaskEnd: () => {
      eventLogger.emit("task_complete", { task: "matb" });
    },
  });

  // ── Optional end survey ─────────────────────────────────────────────────

  let surveyResult: SurveyRunResult | null = null;
  if (config.endSurvey) {
    try {
      const surveyDef = createSurveyFromPreset(
        config.endSurvey as Parameters<typeof createSurveyFromPreset>[0],
      );
      const uiConfig = asObject(context.taskConfig.ui);
      root.innerHTML = "";
      surveyResult = await runSurvey(root, surveyDef, {
        buttonId:             "matb-survey-submit",
        autoFocusSubmitButton: true,
        cardBackground:       asString(uiConfig?.cardBackground) ?? undefined,
        cardBorder:           asString(uiConfig?.cardBorder) ?? undefined,
        cardBorderRadius:     asString(uiConfig?.cardBorderRadius) ?? undefined,
        cardColor:            asString(uiConfig?.cardColor) ?? undefined,
      });
    } catch (err) {
      console.warn("[MATB] End survey failed:", err);
    }
  }

  // ── Data export ─────────────────────────────────────────────────────────

  const filePrefix  = coreConfig.data?.filePrefix ?? "experiments";
  const localSave   = coreConfig.data?.localSave !== false;
  const localFormat = coreConfig.data?.localSaveFormat ?? "csv";

  if (localSave && localFormat !== "json") {
    if (allSysmonRecords.length) {
      downloadCsv(recordsToCsv(allSysmonRecords), filePrefix, selection, "matb_sysmon_events");
    }
    if (allCommsRecords.length) {
      downloadCsv(recordsToCsv(allCommsRecords), filePrefix, selection, "matb_comms_prompts");
    }
    if (allResmanTankRecords.length) {
      downloadCsv(recordsToCsv(allResmanTankRecords), filePrefix, selection, "matb_resman_tanks");
    }
    if (allResmanTickRecords.length) {
      downloadCsv(recordsToCsv(allResmanTickRecords), filePrefix, selection, "matb_resman_ticks");
    }
    if (allTrackingBins.length) {
      downloadCsv(recordsToCsv(allTrackingBins), filePrefix, selection, "matb_tracking_bins");
    }
    if (allTrackingExcursions.length) {
      downloadCsv(recordsToCsv(allTrackingExcursions), filePrefix, selection, "matb_tracking_excursions");
    }
  }

  // ── Finalize ──────────────────────────────────────────────────────────

  const payload = {
    taskId:      "matb",
    variantId:   selection.variantId,
    participant: selection.participant,
    blocks:      blockResults,
    survey:      surveyResult,
    eventLog:    eventLogger.events,
  };

  await finalizeTaskRun({
    coreConfig,
    selection,
    payload,
    csv: null,
  });

  return payload;
}
