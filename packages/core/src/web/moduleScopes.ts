import { DrtController, type ScopedDrtConfig } from "../engines/drt";
import { hashSeed } from "../infrastructure/random";
import type { TaskModuleContext, TaskModuleResult, TaskModuleRunner } from "../api/taskModule";

export interface StartDrtModuleScopeArgs {
  runner: TaskModuleRunner;
  drtConfig: ScopedDrtConfig;
  scope: "block" | "trial";
  blockIndex: number;
  trialIndex: number | null;
  participantId: string;
  sessionId: string;
  variantId: string;
  taskSeedKey: string;
  seedSuffix?: string;
  onControllerCreated?: (controller: DrtController) => void;
  context: Pick<TaskModuleContext, "displayElement" | "borderTargetElement" | "borderTargetRect">;
}

export function startDrtModuleScope(args: StartDrtModuleScopeArgs): void {
  if (!args.drtConfig.enabled) return;
  args.runner.start({
    module: DrtController.asTaskModule({
      ...args.drtConfig,
      ...(args.onControllerCreated ? { onControllerCreated: args.onControllerCreated } : {}),
      seed: hashSeed(
        args.participantId,
        args.sessionId,
        args.variantId,
        args.taskSeedKey,
        args.seedSuffix ?? `B${args.blockIndex}${args.trialIndex !== null ? `T${args.trialIndex}` : ""}`,
      ),
    }),
    address: { scope: args.scope, blockIndex: args.blockIndex, trialIndex: args.trialIndex },
    config: args.drtConfig,
    context: args.context,
  });
}

export function stopModuleScope(args: {
  runner: TaskModuleRunner;
  scope: "block" | "trial";
  blockIndex: number;
  trialIndex: number | null;
}): TaskModuleResult | undefined {
  return args.runner.stop({ scope: args.scope, blockIndex: args.blockIndex, trialIndex: args.trialIndex });
}
