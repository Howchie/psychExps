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
  ensureEegBridgeReady,
} from "@experiments/core";
import type { CoreConfig, JSONObject, TaskAdapter } from "@experiments/core";

import { sftAdapter } from "@experiments/task-sft";
import { nbackAdapter } from "@experiments/task-nback";
import { bricksAdapter } from "@experiments/task-bricks";
import { stroopAdapter } from "@experiments/task-stroop";
import { trackingAdapter } from "@experiments/task-tracking";
import { rdkAdapter } from "@experiments/task-rdk";
import { changeDetectionAdapter } from "@experiments/task-change-detection";
import { flankerAdapter } from "@experiments/task-flanker";
import { goNoGoAdapter } from "@experiments/task-go-no-go";
import { matbTrackingAdapter } from "@experiments/task-matb-tracking";
import { matbSysmonAdapter } from "@experiments/task-matb-sysmon";
import { matbResmanAdapter } from "@experiments/task-matb-resman";
import { matbCommsAdapter } from "@experiments/task-matb-comms";
import { matbAdapter } from "@experiments/task-matb";

import { coreDefaultConfig } from "./appCoreConfig";
import { taskConfigsByPath } from "./taskVariantConfigs";
import { buildConfigReferenceCandidates, toBundledConfigKey, toConfigFetchPath } from "./configResolution";

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
    rdkAdapter,
    changeDetectionAdapter,
    flankerAdapter,
    goNoGoAdapter,
    matbTrackingAdapter,
    matbSysmonAdapter,
    matbResmanAdapter,
    matbCommsAdapter,
    matbAdapter,
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
    const candidates = buildConfigReferenceCandidates({
      requestedConfig: selection.configPath,
      taskId: selection.taskId,
      variants: adapter.manifest.variants,
    });

    let loaded = false;
    let lastError: unknown = null;
    for (const candidate of candidates) {
      const fromMap = taskConfigsByPath[toBundledConfigKey(candidate)];
      if (fromMap) {
        resolvedVariantConfig = fromMap;
        loaded = true;
        break;
      }
      try {
        resolvedVariantConfig = await configManager.load(toConfigFetchPath(candidate));
        loaded = true;
        break;
      } catch (error) {
        lastError = error;
      }
    }

    if (!loaded) {
      const suffix = lastError instanceof Error ? ` Last error: ${lastError.message}` : "";
      throw new Error(
        `Could not resolve config '${selection.configPath}' for task '${selection.taskId}'. ` +
        `Tried: ${candidates.join(", ")}.${suffix}`,
      );
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
    {},
    resolvedVariantConfig,
    selection.overrides ?? undefined,
  );
  const mergedCoreConfig = configManager.merge(
    coreDefaultConfig as unknown as JSONObject,
    {},
    {
      ...(mergedTaskConfig.completion && typeof mergedTaskConfig.completion === "object" && !Array.isArray(mergedTaskConfig.completion)
        ? { completion: mergedTaskConfig.completion as unknown as JSONObject }
        : {}),
    },
  ) as unknown as CoreConfig;
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
      coreConfig: mergedCoreConfig,
      taskConfig: mergedTaskConfig,
      selection,
    }),
  );

  validateTaskConfigIsolation(
    selection.taskId,
    mergedTaskConfig,
    adapters.map((entry) => entry.manifest.taskId),
  );
  await ensureEegBridgeReady(mergedCoreConfig, mergedTaskConfig);

  app.innerHTML = "";
  app.classList.add("app-experiment");
  const pageBackground = resolvePageBackground({ coreConfig: mergedCoreConfig, taskConfig: mergedTaskConfig });
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
      coreConfig: mergedCoreConfig,
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
