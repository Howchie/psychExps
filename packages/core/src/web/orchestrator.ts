import { asObject, asString } from "../utils/coerce";
import type { TaskAdapterContext, JSONObject } from "../api/types";
import { TaskModuleRunner, type TaskModuleAddress } from "../api/taskModule";
import { runTaskIntroFlow, runBlockStartFlow, runBlockEndFlow, runTaskEndFlow } from "./taskUiFlow";
import { runTaskSession, type TaskSessionRunnerBlockResult } from "./sessionRunner";
import { finalizeTaskRun } from "./lifecycle";
import { recordsToCsv } from "../infrastructure/data";

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
  onTaskEnd?: (payload: any) => Promise<void> | void;
  onBlockStart?: (ctx: { block: TBlock; blockIndex: number }) => Promise<void> | void;
  onBlockEnd?: (ctx: { block: TBlock; blockIndex: number; trialResults: TTrialResult[] }) => Promise<void> | void;
  onTrialStart?: (ctx: { block: TBlock; blockIndex: number; trial: TTrial; trialIndex: number }) => Promise<void> | void;
  onTrialEnd?: (ctx: { block: TBlock; blockIndex: number; trial: TTrial; trialIndex: number; result: TTrialResult }) => Promise<void> | void;
  getTaskMetadata?: (sessionResult: any) => Record<string, unknown>;
  
  // UI Configuration
  buttonIdPrefix: string;
  autoFinalize?: boolean;
  csvOptions?: {
    suffix: string;
    getRecords?: (sessionResult: any) => any[];
  };
  renderInstruction?: (ctx: { pageText: string; pageIndex: number; section: string; blockLabel?: string | null }) => string;
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
    
    if (introPages && Array.isArray(introPages) && introPages.length > 0) {
      await runTaskIntroFlow({
        container,
        title: asString(asObject(taskConfig.task)?.title) || "Task",
        participantId: selection.participant.participantId,
        introPages,
        buttonIdPrefix: args.buttonIdPrefix,
        renderHtml: args.renderInstruction,
      });
    }

    // 3. Main Session
    const sessionResult = await runTaskSession<TBlock, TTrial, TTrialResult>({
      blocks: args.getBlocks(taskConfig),
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

        if (args.onTrialStart) await args.onTrialStart(ctx);

        try {
          const result = await args.runTrial(ctx);
          if (args.onTrialEnd) await args.onTrialEnd({ ...ctx, result });
          return result;
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
            introText: (ctx.block as any).introText,
            preBlockPages: (ctx.block as any).beforeBlockScreens,
            renderHtml: args.renderInstruction,
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
            renderHtml: args.renderInstruction,
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
    if (endPages && Array.isArray(endPages) && endPages.length > 0) {
      await runTaskEndFlow({
        container,
        endPages,
        buttonIdPrefix: args.buttonIdPrefix,
        renderHtml: args.renderInstruction,
      });
    }

    // 5. Finalization
    const records = args.csvOptions?.getRecords 
      ? args.csvOptions.getRecords(sessionResult) 
      : sessionResult.blocks.flatMap(b => b.trialResults);

    const taskMetadata = args.getTaskMetadata ? args.getTaskMetadata(sessionResult) : {};

    const payload = {
      selection,
      mapping: (taskConfig as any).mapping,
      timing: (taskConfig as any).timing,
      blocks: sessionResult.blocks.map(b => ({
        blockIndex: b.blockIndex,
        label: (b.block as any).label,
      })),
      records,
      moduleResults: moduleRunner.getResults(),
      events: (context as any).eventLogger?.events ?? [],
      ...taskMetadata,
    };

    if (args.onTaskEnd) await args.onTaskEnd(payload);

    if (args.autoFinalize !== false) {
      await finalizeTaskRun({
        coreConfig: context.coreConfig,
        selection,
        payload,
        csv: args.csvOptions ? { 
          contents: recordsToCsv(records), 
          suffix: args.csvOptions.suffix 
        } : null,
        completionStatus: "complete",
      });
    }

    return payload;
  }
}
