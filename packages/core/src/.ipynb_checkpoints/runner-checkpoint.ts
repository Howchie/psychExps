import type { JSONObject, TaskAdapterContext } from "./types";

export type ExperimentRunnerId = "native" | "jspsych";

export type ExperimentRunner = (context: TaskAdapterContext) => Promise<void>;

export interface RunWithRunnerArgs {
  context: TaskAdapterContext;
  runners: Partial<Record<ExperimentRunnerId, ExperimentRunner>>;
  preferredRunner?: string | null;
  defaultRunner?: ExperimentRunnerId;
}

export interface TaskRunnerSelection {
  runnerId: ExperimentRunnerId;
  runner: ExperimentRunner;
}

const SUPPORTED_RUNNERS: ExperimentRunnerId[] = ["native", "jspsych"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function normalizeRunnerId(value: unknown): ExperimentRunnerId | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return SUPPORTED_RUNNERS.includes(normalized as ExperimentRunnerId) ? (normalized as ExperimentRunnerId) : null;
}

export function resolveRunnerPreference(taskConfig: JSONObject): ExperimentRunnerId | null {
  if (!isRecord(taskConfig)) return null;
  const runtimeRunner = normalizeRunnerId(taskConfig.runner);
  if (runtimeRunner) return runtimeRunner;

  const taskSection = isRecord(taskConfig.task) ? taskConfig.task : null;
  const taskRunner = normalizeRunnerId(taskSection?.runner);
  if (taskRunner) return taskRunner;

  const implementation = typeof taskSection?.implementation === "string" ? taskSection.implementation.trim().toLowerCase() : "";
  if (implementation === "jspsych_sft") return "jspsych";
  if (implementation.startsWith("native_")) return "native";
  return null;
}

export function selectRunner(args: RunWithRunnerArgs): TaskRunnerSelection {
  const defaultRunner = args.defaultRunner ?? "native";
  const configPreferred = resolveRunnerPreference(args.context.taskConfig);
  const ordered = [normalizeRunnerId(args.preferredRunner), defaultRunner, ...SUPPORTED_RUNNERS].filter(
    (id): id is ExperimentRunnerId => Boolean(id),
  );
  ordered.splice(1, 0, ...(configPreferred ? [configPreferred] : []));

  for (const runnerId of ordered) {
    const runner = args.runners[runnerId];
    if (runner) return { runnerId, runner };
  }

  throw new Error(`No configured experiment runner. Available ids: ${Object.keys(args.runners).join(", ")}`);
}

export async function runWithRunner(args: RunWithRunnerArgs): Promise<TaskRunnerSelection> {
  const selected = selectRunner(args);
  await selected.runner(args.context);
  return selected;
}
