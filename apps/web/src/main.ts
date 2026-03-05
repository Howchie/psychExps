import "./styles.css";

import {
  ConfigurationManager,
  LifecycleManager,
  configureAutoResponder,
  resolveAutoResponderProfile,
  resolveSelection,
  buildTaskMap,
  getVariantOrThrow,
  installFullscreenOnFirstInteraction,
  installGlobalScrollBlocker,
  resolvePageBackground,
  validateTaskConfigIsolation,
} from "@experiments/core";
import type { TaskAdapter } from "@experiments/core";

import { sftAdapter } from "@experiments/task-sft";
import { pmAdapter } from "@experiments/task-pm";
// import { nbackAdapter } from "@experiments/task-nback";
// import { bricksAdapter } from "@experiments/task-bricks";
// import { stroopAdapter } from "@experiments/task-stroop";
// import { trackingAdapter } from "@experiments/task-tracking";

import { coreDefaultConfig } from "./appCoreConfig";
import { taskConfigsByPath, taskDefaults } from "./taskVariantConfigs";

async function bootstrap(): Promise<void> {
  const app = document.querySelector("#app");
  if (!(app instanceof HTMLElement)) {
    throw new Error("Missing #app container");
  }

  const configManager = new ConfigurationManager();
  const adapters: TaskAdapter[] = [sftAdapter, pmAdapter];
  const adapterMap = buildTaskMap(adapters);

  const selection = resolveSelection(coreDefaultConfig);
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

bootstrap().catch((error) => {
  const app = document.querySelector("#app");
  if (app instanceof HTMLElement) {
    app.innerHTML = `<div class=\"card\"><h1>Experiment shell failed</h1><pre>${String(error?.message ?? error)}</pre></div>`;
  }
  console.error(error);
});
