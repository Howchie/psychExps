import "./styles.css";

import {
  ConfigurationManager,
  LifecycleManager,
  configureAutoResponder,
  resolveAutoResponderProfile,
  loadJatosScriptCandidates,
  waitForJatosReady,
  resolveSelectionWithJatosRetry,
  resolveRuntimePath,
  buildTaskMap,
  getVariantOrThrow,
  installFullscreenOnFirstInteraction,
  installGlobalScrollBlocker,
  resolvePageBackground,
  validateTaskConfigIsolation,
} from "@experiments/core";
import type { TaskAdapter } from "@experiments/core";

import { sftAdapter } from "@experiments/task-sft";
import { nbackAdapter } from "@experiments/task-nback";
import { bricksAdapter } from "@experiments/task-bricks";
import { stroopAdapter } from "@experiments/task-stroop";
import { trackingAdapter } from "@experiments/task-tracking";
import { changeDetectionAdapter } from "@experiments/task-change-detection";

import { coreDefaultConfig } from "./appCoreConfig";
import { taskConfigsByPath, taskDefaults } from "./taskVariantConfigs";

async function bootstrap(): Promise<void> {
  const app = document.querySelector("#app");
  if (!(app instanceof HTMLElement)) {
    throw new Error("Missing #app container");
  }

  const configManager = new ConfigurationManager();
  const adapters: TaskAdapter[] = [
    sftAdapter,
    nbackAdapter,
    bricksAdapter,
    stroopAdapter,
    trackingAdapter,
    changeDetectionAdapter,
  ];
  const adapterMap = buildTaskMap(adapters);

  const initialSelection = await resolveSelectionWithJatosRetry(coreDefaultConfig);
  const selection = initialSelection;
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
        : resolveRuntimePath(`/configs/${selection.configPath}.json`);
      resolvedVariantConfig = await configManager.load(explicitPath);
    }
  } else if (variant.configPath) {
    const fromMap = taskConfigsByPath[variant.configPath];
    if (fromMap) {
      resolvedVariantConfig = fromMap;
    } else {
      resolvedVariantConfig = await configManager.load(resolveRuntimePath(`/configs/${variant.configPath}.json`));
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
  const stack = error instanceof Error ? error.stack : "";
  if (app instanceof HTMLElement) {
    app.innerHTML = `<div class="card"><h1>Experiment shell failed</h1><p>${errorMessage}</p><pre style="font-size: 0.7rem; text-align: left; opacity: 0.7;">${stack}</pre></div>`;
  }
  console.error("Shell bootstrap failed:", error);
};

const startApp = (): void => {
  void bootstrap().catch(handleBootstrapError);
};

void loadJatosScriptCandidates().finally(async () => {
  await waitForJatosReady();
  startApp();
});
