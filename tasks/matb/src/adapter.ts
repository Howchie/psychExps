/**
 * MATB Composite Task Adapter.
 *
 * Assembles all four MATB sub-tasks (sysmon, tracking, comms, resman)
 * into a simultaneous multi-panel session using PanelLayoutManager and
 * ConcurrentTaskRunner. A ScenarioScheduler drives timed events (failures,
 * prompts, parameter changes) from the JSON config.
 *
 * Config shape:
 *   task.title          - display title
 *   task.durationMs     - total session length in ms (default 480000 = 8 min)
 *   instructions.intro  - intro screen text
 *   layout              - PanelLayoutConfig (rows, cols, panels[])
 *   subtasks.sysmon     - sysmon sub-task config
 *   subtasks.tracking   - tracking sub-task config
 *   subtasks.comms      - comms sub-task config
 *   subtasks.resman     - resman sub-task config
 *   scenario.events     - array of ScenarioEvent objects
 */

import {
  asArray,
  asObject,
  asString,
  createTaskAdapter,
  buildTaskInstructionConfig,
  toPositiveNumber,
  toNonNegativeNumber,
  runInstructionScreens,
  finalizeTaskRun,
  PanelLayoutManager,
  ConcurrentTaskRunner,
  ScenarioScheduler,
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
      { id: "default",            label: "MATB Default",               configPath: "matb/default" },
      { id: "practice",           label: "MATB Practice",              configPath: "matb/practice" },
      { id: "low-load",           label: "MATB Low Load",              configPath: "matb/low-load" },
      { id: "high-load",          label: "MATB High Load",             configPath: "matb/high-load" },
      { id: "basic",              label: "MATB Basic",                 configPath: "matb/basic" },
      { id: "parasuraman-high",   label: "Parasuraman High Reliability", configPath: "matb/parasuraman-high" },
      { id: "parasuraman-low",    label: "Parasuraman Low Reliability",  configPath: "matb/parasuraman-low" },
    ],
  },
  run: (context) => runMatbCompositeTask(context),
  terminate: async () => {},
});

// ---------------------------------------------------------------------------
// Parsed config
// ---------------------------------------------------------------------------

interface ParsedCompositeConfig {
  title: string;
  durationMs: number;
  instructions: StandardTaskInstructionConfig;
  layout: PanelLayoutConfig;
  subtasks: {
    sysmon:   Record<string, unknown>;
    tracking: Record<string, unknown>;
    comms:    Record<string, unknown>;
    resman:   Record<string, unknown>;
  };
  scenario: ScenarioEvent[];
  /** Optional end-of-session survey (e.g. NASA-TLX). */
  endSurvey: { preset: string; [key: string]: unknown } | null;
}

function parseConfig(raw: Record<string, unknown>): ParsedCompositeConfig {
  const taskRaw = asObject(raw.task) ?? {};
  const title       = asString(taskRaw.title) ?? "MATB";
  const durationMs  = toPositiveNumber(taskRaw.durationMs, 480000);

  const instructionsRaw = asObject(raw.instructions) ?? {};
  const instructions = buildTaskInstructionConfig({
    title,
    instructions: instructionsRaw,
    defaults: {
      intro: [
        "The Multi-Attribute Task Battery (MATB) will now begin.",
        "You will be asked to monitor four tasks simultaneously:",
        "SYSMON (top-left): Watch for indicator failures and press the labelled key.",
        "TRACKING (top-right): Keep the cursor inside the central reticle using the mouse.",
        "COMMS (bottom-left): Respond to radio prompts when you hear your own callsign.",
        "RESMAN (bottom-right): Keep tanks A and B near their target levels using the numpad.",
        "Press continue when you are ready to begin.",
      ],
    },
  });

  // Layout
  const layoutRaw = asObject(raw.layout) ?? {};
  const panelsRaw = asArray(layoutRaw.panels);
  const layout: PanelLayoutConfig = {
    rows: toPositiveNumber(layoutRaw.rows, 2),
    cols: toPositiveNumber(layoutRaw.cols, 2),
    gap: asString(layoutRaw.gap) ?? "2px",
    padding: asString(layoutRaw.padding) ?? "0",
    background: asString(layoutRaw.background) ?? "#1a1a1a",
    panels: panelsRaw.length > 0
      ? panelsRaw.map((p) => {
          const o = asObject(p) ?? {};
          return {
            id:       asString(o.id) ?? "panel",
            row:      toNonNegativeNumber(o.row, 0),
            col:      toNonNegativeNumber(o.col, 0),
            rowSpan:  o.rowSpan != null ? toPositiveNumber(o.rowSpan, 1) : undefined,
            colSpan:  o.colSpan != null ? toPositiveNumber(o.colSpan, 1) : undefined,
            label:    asString(o.label) ?? undefined,
            background: asString(o.background) ?? undefined,
            border:   asString(o.border) ?? undefined,
          };
        })
      : [
          { id: "sysmon",   row: 0, col: 0, label: "SYSMON" },
          { id: "tracking", row: 0, col: 1, label: "TRACKING" },
          { id: "comms",    row: 1, col: 0, label: "COMMS" },
          { id: "resman",   row: 1, col: 1, label: "RESMAN" },
        ],
  };

  // Sub-task configs
  const subtasksRaw = asObject(raw.subtasks) ?? {};
  const subtasks = {
    sysmon:   asObject(subtasksRaw.sysmon)   ?? {},
    tracking: asObject(subtasksRaw.tracking) ?? {},
    comms:    asObject(subtasksRaw.comms)    ?? {},
    resman:   asObject(subtasksRaw.resman)   ?? {},
  };

  // Scenario events
  const scenarioRaw = asObject(raw.scenario) ?? {};
  const eventsRaw = asArray(scenarioRaw.events);
  const scenario: ScenarioEvent[] = eventsRaw.map((e) => {
    const o = asObject(e) ?? {};
    return {
      timeMs:   toNonNegativeNumber(o.timeMs, 0),
      targetId: asString(o.targetId ?? o.target) ?? "*",
      command:  asString(o.command) ?? "noop",
      path:     asString(o.path) ?? undefined,
      value:    o.value,
    };
  });

  // Optional end-of-session survey.
  const endSurveyRaw = asObject(raw.endSurvey);
  const endSurvey = endSurveyRaw
    ? { preset: asString(endSurveyRaw.preset) ?? "nasa_tlx", ...endSurveyRaw }
    : null;

  return { title, durationMs, instructions, layout, subtasks, scenario, endSurvey };
}

// ---------------------------------------------------------------------------
// Main runner
// ---------------------------------------------------------------------------

async function runMatbCompositeTask(context: TaskAdapterContext): Promise<unknown> {
  const config = parseConfig(context.taskConfig);
  const root = context.container;
  const { eventLogger, selection, coreConfig } = context;

  // ── Instructions ────────────────────────────────────────────────────────

  root.innerHTML = "";
  await runInstructionScreens({
    container:        root,
    pages:            config.instructions.introPages,
    section:          "intro",
    title:            config.title,
    buttonIdPrefix:   "matb-intro",
    cardBackground:   "#1e293b",
    cardColor:        "#e2e8f0",
    cardFontFamily:   "monospace",
  });

  // ── Layout ──────────────────────────────────────────────────────────────

  root.innerHTML = "";
  root.style.padding = "0";
  const layout = new PanelLayoutManager(root, config.layout);

  // ── Sub-task handles ────────────────────────────────────────────────────

  const sysmonHandle   = createSysmonSubTaskHandle();
  const trackingHandle = createTrackingSubTaskHandle();
  const commsHandle    = createCommsSubTaskHandle();
  const resmanHandle   = createResmanSubTaskHandle();

  // ── ConcurrentTaskRunner ────────────────────────────────────────────────

  const runner = new ConcurrentTaskRunner(
    [sysmonHandle, trackingHandle, commsHandle, resmanHandle],
    {
      onEvent: (e) => {
        eventLogger.emit(e.type, { matb: true, ...e });
      },
    },
  );

  // Register panels from the layout. Only connect sub-tasks that have a
  // matching panel in the config; extra panels (e.g. scheduling, perf) are
  // silently ignored at this stage.
  const subtaskIds = ["sysmon", "tracking", "comms", "resman"] as const;
  for (const id of subtaskIds) {
    try {
      runner.setPanel(id, layout.getPanel(id));
    } catch {
      // Panel not present in this layout config — sub-task won't start.
    }
    runner.setSubtaskConfig(id, config.subtasks[id]);
  }

  // Scheduler with timed scenario events.
  const scheduler = new ScenarioScheduler(config.scenario);
  runner.setScheduler(scheduler);

  // ── Session ──────────────────────────────────────────────────────────────

  eventLogger.emit("task_start", { task: "matb", durationMs: config.durationMs });

  runner.start();

  // Start all four sub-tasks immediately (not via scenario events, so we
  // don't require the config to spell out start events at t=0).
  for (const id of subtaskIds) {
    runner.startSubtask(id);
  }

  // Wait for the session duration.
  await new Promise<void>((resolve) => setTimeout(resolve, config.durationMs));

  // Collect results.
  const results = runner.stop();
  layout.dispose();
  root.innerHTML = "";

  eventLogger.emit("task_complete", { task: "matb", durationMs: config.durationMs });

  // ── Extract typed results ────────────────────────────────────────────────

  const sysmonResult   = results.get("sysmon")   as SysmonSubTaskResult   | undefined;
  const trackingResult = results.get("tracking") as TrackingSubTaskResult | undefined;
  const commsResult    = results.get("comms")    as CommsSubTaskResult    | undefined;
  const resmanResult   = results.get("resman")   as ResmanSubTaskResult   | undefined;

  // ── End screen ───────────────────────────────────────────────────────────

  await runInstructionScreens({
    container:      root,
    pages:          config.instructions.endPages,
    section:        "end",
    title:          config.title,
    buttonIdPrefix: "matb-end",
    cardBackground: "#1e293b",
    cardColor:      "#e2e8f0",
    cardFontFamily: "monospace",
  });

  // ── Optional end survey ───────────────────────────────────────────────────

  let surveyResult: SurveyRunResult | null = null;
  if (config.endSurvey) {
    try {
      const surveyDef = createSurveyFromPreset(
        config.endSurvey as Parameters<typeof createSurveyFromPreset>[0],
      );
      root.innerHTML = "";
      surveyResult = await runSurvey(root, surveyDef, {
        buttonId: "matb-survey-submit",
        autoFocusSubmitButton: true,
      });
    } catch (err) {
      console.warn("[MATB] End survey failed:", err);
    }
  }

  // ── Data export ──────────────────────────────────────────────────────────

  const filePrefix   = coreConfig.data?.filePrefix ?? "experiments";
  const localSave    = coreConfig.data?.localSave !== false;
  const localFormat  = coreConfig.data?.localSaveFormat ?? "csv";

  if (localSave && localFormat !== "json") {
    // Sysmon: one row per failure event.
    if (sysmonResult?.sdtRecords.length) {
      downloadCsv(
        recordsToCsv(sysmonResult.sdtRecords),
        filePrefix, selection, "matb_sysmon_events",
      );
    }
    // Comms: one row per prompt.
    if (commsResult?.records.length) {
      downloadCsv(
        recordsToCsv(commsResult.records),
        filePrefix, selection, "matb_comms_prompts",
      );
    }
    // Resman: one row per target tank.
    if (resmanResult?.tankRecords.length) {
      downloadCsv(
        recordsToCsv(resmanResult.tankRecords),
        filePrefix, selection, "matb_resman_tanks",
      );
    }
    // Tracking: one row per bin.
    if (trackingResult?.bins.length) {
      downloadCsv(
        recordsToCsv(trackingResult.bins),
        filePrefix, selection, "matb_tracking_bins",
      );
    }
  }

  // ── Finalize ─────────────────────────────────────────────────────────────

  const payload = {
    taskId:      "matb",
    variantId:   selection.variantId,
    participant: selection.participant,
    durationMs:  config.durationMs,
    sysmon:      sysmonResult  ?? null,
    tracking:    trackingResult ?? null,
    comms:       commsResult   ?? null,
    resman:      resmanResult  ?? null,
    survey:      surveyResult,
    eventLog:    eventLogger.events,
  };

  await finalizeTaskRun({
    coreConfig,
    selection,
    payload,
    csv: null, // Multiple CSVs already downloaded above.
  });

  return payload;
}
