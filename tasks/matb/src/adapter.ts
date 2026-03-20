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
  TaskOrchestrator,
  recordsToCsv,
  downloadCsv,
  createSurveyFromPreset,
  runSurvey,
  type TaskAdapterContext,
  type PanelLayoutConfig,
  type ScenarioEvent,
  type StandardTaskInstructionConfig,
  type SurveyRunResult,
} from "@experiments/core";

import { createSysmonSubTaskHandle, type SysmonSubTaskResult } from "./subtasks/sysmon";
import { createTrackingSubTaskHandle, type TrackingSubTaskResult } from "./subtasks/tracking";
import { createCommsSubTaskHandle, type CommsSubTaskResult } from "./subtasks/comms";
import { createResmanSubTaskHandle, type ResmanSubTaskResult } from "./subtasks/resman";

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
  scenario: ScenarioEvent[];
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

  const defaultScenario = parseScenarioEvents(raw.scenario);

  // ── Blocks ─────────────────────────────────────────────────────────────

  const planRaw   = asObject(raw.plan);
  const blocksRaw = planRaw ? asArray(planRaw.blocks) : [];

  let blocks: MatbBlock[];

  if (blocksRaw.length > 0) {
    blocks = blocksRaw.map((b, i) => {
      const o    = asObject(b) ?? {};
      const bSub = asObject(o.subtasks);
      return {
        label:              asString(o.label) ?? `Block ${i + 1}`,
        blockType:          asString(o.blockType) ?? "experimental",
        isPractice:         o.isPractice === true,
        durationMs:         toPositiveNumber(o.durationMs, defaultDurMs),
        subtasks: bSub
          ? {
              sysmon:   asObject(bSub.sysmon)   ?? defaultSubtasks.sysmon,
              tracking: asObject(bSub.tracking) ?? defaultSubtasks.tracking,
              comms:    asObject(bSub.comms)    ?? defaultSubtasks.comms,
              resman:   asObject(bSub.resman)   ?? defaultSubtasks.resman,
            }
          : { ...defaultSubtasks },
        scenario:           o.scenario ? parseScenarioEvents(o.scenario) : defaultScenario,
        layout:             o.layout ? parsePanelLayout(o.layout) : null,
        beforeBlockScreens: asStringArray(o.beforeBlockScreens, []),
        afterBlockScreens:  asStringArray(o.afterBlockScreens, []),
        modules:            asObject(o.modules) ?? {},
      };
    });
  } else {
    // Legacy flat config → single block (preserves backward compatibility).
    blocks = [
      {
        label:              "Session",
        blockType:          "experimental",
        isPractice:         false,
        durationMs:         defaultDurMs,
        subtasks:           { ...defaultSubtasks },
        scenario:           defaultScenario,
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

  return { title, display, instructions, layout, blocks, endSurvey };
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
  outer.style.height         = "100%";
  outer.style.overflow       = "hidden";
  outer.style.background     = display.background;
  outer.style.padding        = `${display.marginPx}px`;
  outer.style.boxSizing      = "border-box";

  const matbArea = document.createElement("div");
  matbArea.style.width       = "100%";
  matbArea.style.maxWidth    = `${display.maxWidthPx}px`;
  matbArea.style.minWidth    = `${display.minWidthPx}px`;
  matbArea.style.aspectRatio = display.aspectRatio;
  matbArea.style.maxHeight   = "100%";
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
  const { eventLogger, selection, coreConfig } = context;

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

      runner.setScheduler(new ScenarioScheduler(block.scenario));

      // Run session
      eventLogger.emit("matb_block_start", {
        blockIndex, blockLabel: block.label, durationMs: block.durationMs,
      });

      runner.start();
      for (const id of SUBTASK_IDS) runner.startSubtask(id);

      await new Promise<void>((r) => setTimeout(r, block.durationMs));

      const results = runner.stop();
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
      root.innerHTML = "";
      surveyResult = await runSurvey(root, surveyDef, {
        buttonId:             "matb-survey-submit",
        autoFocusSubmitButton: true,
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
