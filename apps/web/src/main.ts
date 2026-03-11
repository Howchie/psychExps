import "./styles.css";

import {
  ConfigurationManager,
  LifecycleManager,
  configureAutoResponder,
  resolveAutoResponderProfile,
  resolveSelection,
  readJatosSelectionInput,
  buildTaskMap,
  getVariantOrThrow,
  installFullscreenOnFirstInteraction,
  installGlobalScrollBlocker,
  resolvePageBackground,
  validateTaskConfigIsolation,
} from "@experiments/core";
import type { TaskAdapter } from "@experiments/core";

import { sftAdapter } from "@experiments/task-sft";
import { nbackPmOldAdapter } from "@experiments/task-nback-pm-old";
import { nbackAdapter } from "@experiments/task-nback";
import { bricksAdapter } from "@experiments/task-bricks";
import { stroopAdapter } from "@experiments/task-stroop";
import { trackingAdapter } from "@experiments/task-tracking";
import { changeDetectionAdapter } from "@experiments/task-change-detection";

import { coreDefaultConfig } from "./appCoreConfig";
import { taskConfigsByPath, taskDefaults } from "./taskVariantConfigs";

declare const jatos: JatosLike | undefined;

function getJatosRuntime(): JatosLike | undefined {
  const fromWindow = (window as unknown as { jatos?: JatosLike }).jatos;
  if (fromWindow) return fromWindow;
  try {
    return typeof jatos !== "undefined" ? jatos : undefined;
  } catch {
    return undefined;
  }
}

async function resolveSelectionWithJatosRetry(maxWaitMs = 10000): Promise<ReturnType<typeof resolveSelection>> {
  const started = Date.now();
  let selection = resolveSelection(coreDefaultConfig);
  const hasUrlTask = new URLSearchParams(window.location.search).get("task") != null;
  while (
    selection.platform === "jatos"
    && selection.source.task === "default"
    && !hasUrlTask
    && Date.now() - started < maxWaitMs
  ) {
    if (readJatosSelectionInput() != null) {
      selection = resolveSelection(coreDefaultConfig);
      if (selection.source.task !== "default") break;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 100));
  }
  return selection;
}

async function bootstrap(): Promise<void> {
  const app = document.querySelector("#app");
  if (!(app instanceof HTMLElement)) {
    throw new Error("Missing #app container");
  }

  const configManager = new ConfigurationManager();
  const adapters: TaskAdapter[] = [
    sftAdapter,
    nbackPmOldAdapter,
    nbackAdapter,
    bricksAdapter,
    stroopAdapter,
    trackingAdapter,
    changeDetectionAdapter,
  ];
  const adapterMap = buildTaskMap(adapters);

  const initialSelection = await resolveSelectionWithJatosRetry();
  const selection = initialSelection.taskId === "pm"
    ? { ...initialSelection, taskId: "nback_pm_old", source: { ...initialSelection.source, task: "url" as const } }
    : initialSelection;
  const adapter = adapterMap.get(selection.taskId);
  if (!adapter) {
    throw new Error(`Unknown task '${selection.taskId}'. Available: ${adapters.map((a) => a.manifest.taskId).join(", ")}`);
  }

  const variant = getVariantOrThrow(adapter, selection.variantId);

  let resolvedVariantConfig = {} as Record<string, unknown>;
  if (selection.configPath) {
    const fromMap = taskConfigsByPath[selection.configPath];
    if (fromMap) {
      resolvedVariantConfig = fromMap;
    } else {
      const explicitPath = selection.configPath.endsWith(".json")
        ? selection.configPath
        : `/configs/${selection.configPath}.json`;
      resolvedVariantConfig = await configManager.load(explicitPath);
    }
  } else if (variant.configPath) {
    const fromMap = taskConfigsByPath[variant.configPath];
    if (fromMap) {
      resolvedVariantConfig = fromMap;
    } else {
      resolvedVariantConfig = await configManager.load(`/configs/${variant.configPath}.json`);
    }
  }

  const mergedTaskConfig = configManager.merge(
    {},
    taskDefaults[selection.taskId] ?? {},
    resolvedVariantConfig,
    selection.overrides ?? undefined,
  );

  const query = new URLSearchParams(window.location.search);
  const exportStimuliFlag = query.get("exportStimuli") ?? query.get("export_stimuli");
  const exportStimuliOnly = exportStimuliFlag === "1" || exportStimuliFlag === "true";
  if (exportStimuliOnly) {
    const taskObj = (mergedTaskConfig.task && typeof mergedTaskConfig.task === "object" && !Array.isArray(mergedTaskConfig.task))
      ? mergedTaskConfig.task as Record<string, unknown>
      : {};
    taskObj.exportStimuliOnly = true;
    mergedTaskConfig.task = taskObj;
  }
  configureAutoResponder(
    resolveAutoResponderProfile({
      coreConfig: coreDefaultConfig,
      taskConfig: mergedTaskConfig,
      selection,
    }),
  );

  validateTaskConfigIsolation(
    selection.taskId,
    mergedTaskConfig,
    adapters.map((entry) => entry.manifest.taskId),
  );

  app.innerHTML = "";
  app.classList.add("app-experiment");
  const pageBackground = resolvePageBackground({ coreConfig: coreDefaultConfig, taskConfig: mergedTaskConfig });
  app.style.background = pageBackground ?? "";

  const launchContainer = document.createElement("div");
  launchContainer.className = "experiment-stage";
  app.appendChild(launchContainer);

  const removeGlobalScrollBlocker = installGlobalScrollBlocker();
  const removeFullscreenHooks = installFullscreenOnFirstInteraction(launchContainer);
  
  const lifecycle = new LifecycleManager(adapter);
  try {
    await lifecycle.run({
      container: launchContainer,
      selection,
      coreConfig: coreDefaultConfig,
      taskConfig: mergedTaskConfig,
    });
  } finally {
    removeFullscreenHooks();
    removeGlobalScrollBlocker();
  }
}

const handleBootstrapError = (error: unknown): void => {
  const app = document.querySelector("#app");
  const errorMessage = error instanceof Error ? error.message : String(error);
  if (app instanceof HTMLElement) {
    app.innerHTML = `<div class=\"card\"><h1>Experiment shell failed</h1><pre>${errorMessage}</pre></div>`;
  }
  console.error(error);
};

const startApp = (): void => {
  void bootstrap().catch(handleBootstrapError);
};

type JatosLike = {
  onLoad?: (cb: () => void) => void;
  componentJsonInput?: unknown;
  studySessionData?: unknown;
};

const waitForJatosReady = async (timeoutMs = 2000): Promise<void> => {
  const api = getJatosRuntime();
  if (!api) return;
  if (typeof api.onLoad === "function") {
    await new Promise<void>((resolve) => {
      let settled = false;
      const done = (): void => {
        if (settled) return;
        settled = true;
        resolve();
      };
      const timer = window.setTimeout(done, timeoutMs);
      api.onLoad?.(() => {
        window.clearTimeout(timer);
        done();
      });
    });
    return;
  }
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const latest = getJatosRuntime();
    if (latest?.componentJsonInput != null || latest?.studySessionData != null) return;
    await new Promise((resolve) => window.setTimeout(resolve, 50));
  }
};

void waitForJatosReady().finally(startApp);
