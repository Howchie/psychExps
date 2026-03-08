import { asObject, asString } from "../utils/coerce";
import type { TaskAdapterContext, JSONObject } from "../api/types";
import { TaskModuleRunner, type TaskModuleAddress } from "../api/taskModule";
import { runTaskIntroFlow, runBlockStartFlow, runBlockEndFlow, runTaskEndFlow } from "./taskUiFlow";
import { runTaskSession, type TaskSessionRunnerBlockResult } from "./sessionRunner";
import { finalizeTaskRun } from "./lifecycle";

export interface TaskOrchestratorArgs<TBlock, TTrial, TTrialResult> {
  getBlocks: (taskConfig: JSONObject) => TBlock[];
  getTrials: (ctx: { block: TBlock; blockIndex: number }) => TTrial[] | Promise<TTrial[]>;
  runTrial: (ctx: { 
    block: TBlock; 
    blockIndex: number; 
    trial: TTrial; 
    trialIndex: number; 
    blockTrialResults: TTrialResult[] 
  }) => Promise<TTrialResult>;
  
  // Customization hooks
  onTaskStart?: () => Promise<void> | void;
  onBlockStart?: (ctx: { block: TBlock; blockIndex: number }) => Promise<void> | void;
  onBlockEnd?: (ctx: { block: TBlock; blockIndex: number; trialResults: TTrialResult[] }) => Promise<void> | void;
  
  // UI Configuration
  buttonIdPrefix: string;
  autoFinalize?: boolean;
  csvSuffix?: string;
}

export class TaskOrchestrator<TBlock, TTrial, TTrialResult> {
  constructor(private context: TaskAdapterContext) {}

  async run(args: TaskOrchestratorArgs<TBlock, TTrial, TTrialResult>): Promise<unknown> {
    const { context } = this;
    const { taskConfig, rawTaskConfig, moduleRunner, container, selection } = context;
    const taskModules = asObject(asObject(rawTaskConfig.task)?.modules) ?? {};

    // 1. Task Start
    if (args.onTaskStart) await args.onTaskStart();
    
    // 2. Intro Flow
    const instructions = asObject(taskConfig.instructions);
    const introPages = asObject(context.resolver.resolveInValue(instructions?.introPages)) as any;
    
    await runTaskIntroFlow({
      container,
      title: asString(asObject(taskConfig.task)?.title) || "Task",
      participantId: selection.participant.participantId,
      introPages: Array.isArray(introPages) ? introPages : [],
      buttonIdPrefix: args.buttonIdPrefix,
    });

    // 3. Main Session
    const blocks = args.getBlocks(taskConfig);
    const sessionResult = await runTaskSession<TBlock, TTrial, TTrialResult>({
      blocks,
      getTrials: args.getTrials,
      runTrial: async (ctx) => {
        // Auto-handle trial-scoped modules
        moduleRunner.startScopedModules({
          scope: "trial",
          blockIndex: ctx.blockIndex,
          trialIndex: ctx.trialIndex,
          moduleConfigs: taskModules,
          context: {
            block: ctx.block,
            blockIndex: ctx.blockIndex,
            trial: ctx.trial,
            trialIndex: ctx.trialIndex,
            resolver: context.resolver,
            locals: (ctx.block as any).variables,
            displayElement: container,
          }
        });

        try {
          return await args.runTrial(ctx);
        } finally {
          moduleRunner.stopScopedModules({ 
            scope: "trial", 
            blockIndex: ctx.blockIndex, 
            trialIndex: ctx.trialIndex 
          });
        }
      },
      hooks: {
        onBlockStart: async (ctx) => {
          // Auto-handle block-scoped modules
          moduleRunner.startScopedModules({
            scope: "block",
            blockIndex: ctx.blockIndex,
            trialIndex: null,
            moduleConfigs: taskModules,
            context: {
              block: ctx.block,
              blockIndex: ctx.blockIndex,
              resolver: context.resolver,
              locals: (ctx.block as any).variables,
              displayElement: container,
            }
          });

          await runBlockStartFlow({
            container,
            blockLabel: (ctx.block as any).label || `Block ${ctx.blockIndex + 1}`,
            blockIndex: ctx.blockIndex,
            buttonIdPrefix: args.buttonIdPrefix,
            introText: (ctx.block as any).introText, // TODO: standard field?
            preBlockPages: (ctx.block as any).beforeBlockScreens,
          });

          if (args.onBlockStart) await args.onBlockStart(ctx);
        },
        onBlockEnd: async (ctx) => {
          if (args.onBlockEnd) await args.onBlockEnd(ctx);

          await runBlockEndFlow({
            container,
            blockLabel: (ctx.block as any).label || `Block ${ctx.blockIndex + 1}`,
            blockIndex: ctx.blockIndex,
            buttonIdPrefix: args.buttonIdPrefix,
            postBlockPages: (ctx.block as any).afterBlockScreens,
          });

          moduleRunner.stopScopedModules({ 
            scope: "block", 
            blockIndex: ctx.blockIndex, 
            trialIndex: null 
          });
        }
      }
    });

    // 4. Task End Flow
    const endPages = asObject(context.resolver.resolveInValue(instructions?.endPages)) as any;
    await runTaskEndFlow({
      container,
      endPages: Array.isArray(endPages) ? endPages : [],
      buttonIdPrefix: args.buttonIdPrefix,
    });

    // 5. Finalization
    const payload = {
      selection,
      blocks: sessionResult.blocks.map(b => ({
        blockIndex: b.blockIndex,
        label: (b.block as any).label,
        trialResults: b.trialResults,
      })),
      moduleResults: moduleRunner.getResults(),
    };

    if (args.autoFinalize !== false) {
      await finalizeTaskRun({
        coreConfig: context.coreConfig,
        selection,
        payload,
        csv: null, // TODO: support CSV standard row building
        completionStatus: "complete",
      });
    }

    return payload;
  }
}
