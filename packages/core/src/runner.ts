import { asObject, asString } from "./utils/coerce";

export type RunnerId = "native" | "jspsych";

export interface TaskRunner<TContext = unknown, TResult = unknown> {
  id: RunnerId;
  run: (context: TContext) => Promise<TResult>;
}

export interface SelectRunnerArgs<TContext = unknown, TResult = unknown> {
  context: TContext;
  taskConfig?: unknown;
  preferredRunner?: RunnerId | null;
  defaultRunner?: RunnerId;
  supportedRunners: TaskRunner<TContext, TResult>[];
}

export interface TaskRunnerSelection<TContext = unknown, TResult = unknown> {
  runnerId: RunnerId;
  runner: TaskRunner<TContext, TResult>;
}

export function resolveRunnerPreference(taskConfig: unknown): RunnerId | null {
  const root = asObject(taskConfig);
  const taskNode = asObject(root?.task);
  const explicit = asString(root?.runner) || asString(taskNode?.runner);
  if (explicit === "native" || explicit === "jspsych") return explicit;

  const implementation = asString(taskNode?.implementation);
  if (!implementation) return null;
  if (implementation.startsWith("jspsych_")) return "jspsych";
  if (implementation.startsWith("native_")) return "native";
  return null;
}

export function selectRunner<TContext = unknown, TResult = unknown>(
  args: SelectRunnerArgs<TContext, TResult>,
): TaskRunnerSelection<TContext, TResult> {
  const supported = args.supportedRunners ?? [];
  if (supported.length === 0) {
    throw new Error("selectRunner requires at least one supported runner");
  }
  const byId = new Map<RunnerId, TaskRunner<TContext, TResult>>();
  for (const runner of supported) {
    byId.set(runner.id, runner);
  }

  const preferenceOrder: Array<RunnerId | null | undefined> = [
    args.preferredRunner ?? null,
    resolveRunnerPreference(args.taskConfig),
    args.defaultRunner ?? "native",
  ];

  for (const preferred of preferenceOrder) {
    if (!preferred) continue;
    const runner = byId.get(preferred);
    if (!runner) continue;
    return { runnerId: preferred, runner };
  }

  const fallback = supported[0];
  return { runnerId: fallback.id, runner: fallback };
}

export interface RunWithRunnerArgs<TContext = unknown, TResult = unknown> extends SelectRunnerArgs<TContext, TResult> {}

export async function runWithRunner<TContext = unknown, TResult = unknown>(
  args: RunWithRunnerArgs<TContext, TResult>,
): Promise<TaskRunnerSelection<TContext, TResult> & { result: TResult }> {
  const selected = selectRunner(args);
  const result = await selected.runner.run(args.context);
  return { ...selected, result };
}
