import {
  asObject,
  asString,
  coerceInstructionInsertions,
  toInstructionScreenSpecs,
  type InstructionInsertionPoint,
  type InstructionScreenSpec,
} from "../utils/coerce";
import type { TaskAdapterContext, JSONObject } from "../api/types";
import { TaskModuleRunner, type TaskModuleAddress } from "../api/taskModule";
import { runTaskIntroFlow, runBlockStartFlow, runBlockEndFlow, runTaskEndFlow } from "../web/taskUiFlow";
import { isInstructionFlowExitRequestedError } from "../web/instructionFlow";
import { renderCenteredNotice, resolveButtonStyleOverrides } from "../web/ui";
import { runTaskSession } from "./sessionRunner";
import { finalizeTaskRun } from "../web/lifecycle";
import { recordsToCsv } from "../infrastructure/data";
import { createDefaultTaskDataSink, type TaskDataSink } from "../infrastructure/dataSink";
import { buildBlockSummaryModel, coerceBlockSummaryConfig, mergeBlockSummaryConfig } from "./blockSummary";
import { coerceBlockRepeatUntilConfig, evaluateBlockRepeatUntil } from "./blockRepeat";
import { deepClone, deepMerge } from "../infrastructure/deepMerge";

export interface TaskOrchestratorArgs<TBlock, TTrial, TTrialResult> {
  getBlocks: (taskConfig: JSONObject) => TBlock[];
  getTrials: (ctx: { block: TBlock; blockIndex: number }) => TTrial[] | Promise<TTrial[]>;
  runTrial: (ctx: { 
    block: TBlock; 
    blockIndex: number; 
    blockAttempt?: number;
    trial: TTrial; 
    trialIndex: number; 
    blockTrialResults: TTrialResult[] 
  }) => Promise<TTrialResult>;
  
  // Customization hooks
  onTaskStart?: () => Promise<void> | void;
  onTaskEnd?: (payload: any) => Promise<void> | void;
  onBlockStart?: (ctx: { block: TBlock; blockIndex: number; blockAttempt?: number }) => Promise<void> | void;
  onBlockEnd?: (ctx: { block: TBlock; blockIndex: number; blockAttempt?: number; trialResults: TTrialResult[] }) => Promise<void> | void;
  onTrialStart?: (
    ctx: { block: TBlock; blockIndex: number; blockAttempt?: number; trial: TTrial; trialIndex: number },
  ) => Promise<void> | void;
  onTrialEnd?: (
    ctx: { block: TBlock; blockIndex: number; blockAttempt?: number; trial: TTrial; trialIndex: number; result: TTrialResult },
  ) => Promise<void> | void;
  getTaskMetadata?: (sessionResult: any) => Record<string, unknown>;
  getEvents?: (sessionResult: any) => unknown[];
  resolveUiContainer?: (baseContainer: HTMLElement) => HTMLElement;
  shouldAutoStartModule?: (ctx: {
    scope: "block" | "trial";
    moduleName: string;
    moduleConfig: unknown;
    block: TBlock;
    blockIndex: number;
    trial?: TTrial;
    trialIndex: number | null;
  }) => boolean;
  resolveModuleContext?: (ctx: {
    scope: "block" | "trial";
    block: TBlock;
    blockIndex: number;
    trial?: TTrial;
    trialIndex: number | null;
  }) => Partial<{
    displayElement: HTMLElement;
    borderTargetElement: HTMLElement;
    borderTargetRect: () => DOMRect | null;
  }>;
  
  // UI Configuration
  buttonIdPrefix: string;
  autoFinalize?: boolean;
  csvOptions?: {
    suffix: string;
    getRecords?: (sessionResult: any) => any[];
  };
  renderInstruction?: (ctx: {
    pageText: string;
    pageHtml?: string;
    pageTitle?: string;
    pageIndex: number;
    section: string;
    blockLabel?: string | null;
  }) => string;
  staircase?: {
    enabled?: boolean;
    run: () => Promise<void> | void;
  };
  introPages?: unknown;
  endPages?: unknown;
  completeTitle?: string;
  completeMessage?: string;
  doneButtonLabel?: string;
  instructionDefaults?: {
    introPages?: unknown;
    preBlockPages?: unknown;
    postBlockPages?: unknown;
    endPages?: unknown;
    blockIntroTemplate?: unknown;
    showBlockLabel?: boolean;
    preBlockBeforeIntro?: boolean;
  };
  dataSink?: TaskDataSink<TBlock, TTrial, TTrialResult>;
  getBlockUi?: (ctx: { block: TBlock; blockIndex: number; blockAttempt?: number }) => {
    introText?: string | null;
    preBlockPages?: unknown;
    postBlockPages?: unknown;
    repeatPostBlockPages?: unknown;
    showBlockLabel?: boolean;
    preBlockBeforeIntro?: boolean;
  };
}

export class TaskOrchestrator<TBlock, TTrial, TTrialResult> {
  constructor(private context: TaskAdapterContext) {}

  async run(args: TaskOrchestratorArgs<TBlock, TTrial, TTrialResult>): Promise<unknown> {
    const { context } = this;
    const { taskConfig, rawTaskConfig, moduleRunner, container, selection } = context;
    const taskModules = asObject(asObject(rawTaskConfig.task)?.modules) ?? {};
    const toModuleMap = (value: unknown): Record<string, unknown> => asObject(value) ?? {};
    const resolveScopedModules = (ctx: { block: TBlock; blockIndex: number; trial?: TTrial; trialIndex: number | null }) => {
      const blockRecord = asObject(ctx.block);
      const trialRecord = asObject(ctx.trial);
      const blockModulesTask = toModuleMap(asObject(blockRecord?.task)?.modules);
      const blockModulesLocal = toModuleMap(blockRecord?.modules);
      const trialModulesTask = toModuleMap(asObject(trialRecord?.task)?.modules);
      const trialModulesLocal = toModuleMap(trialRecord?.modules);
      const merged = deepClone(taskModules);
      deepMerge(merged, blockModulesTask);
      deepMerge(merged, blockModulesLocal);
      deepMerge(merged, trialModulesTask);
      deepMerge(merged, trialModulesLocal);
      return merged;
    };
    const applyModuleFilter = (
      modules: Record<string, unknown>,
      ctx: { scope: "block" | "trial"; block: TBlock; blockIndex: number; trial?: TTrial; trialIndex: number | null },
    ): Record<string, unknown> => {
      if (!args.shouldAutoStartModule) return modules;
      return Object.fromEntries(
        Object.entries(modules).filter(([moduleName, moduleConfig]) =>
          args.shouldAutoStartModule?.({
            scope: ctx.scope,
            moduleName,
            moduleConfig,
            block: ctx.block,
            blockIndex: ctx.blockIndex,
            trial: ctx.trial,
            trialIndex: ctx.trialIndex,
          }),
        ),
      );
    };
    const sinkContext = {
      coreConfig: context.coreConfig,
      selection,
      taskConfig,
      rawTaskConfig,
    };
    const dataSink = args.dataSink ?? createDefaultTaskDataSink<TBlock, TTrial, TTrialResult>();

    // 1. Task Start
    if (args.onTaskStart) await args.onTaskStart();
    await dataSink.onTaskStart?.(sinkContext);
    const uiContainer = args.resolveUiContainer ? args.resolveUiContainer(container) : container;
    
    // 2. Intro Flow
    const instructions = asObject(taskConfig.instructions);
    const uiConfig = asObject(taskConfig.ui);
    const continueButtonStyle = resolveButtonStyleOverrides(
      uiConfig?.continueButtonStyle ?? uiConfig?.buttonStyle ?? instructions?.continueButtonStyle ?? instructions?.buttonStyle,
    );
    const autoFocusContinueButton = uiConfig?.autoFocusContinueButton !== false;
    const blockSummaryRaw = instructions?.blockSummary;
    const repeatEvaluationCache = new Map<string, ReturnType<typeof evaluateBlockRepeatUntil>>();
    const makeRepeatCacheKey = (blockIndex: number, blockAttempt: number): string => `${blockIndex}:${blockAttempt}`;
    const evaluateRepeatForAttempt = (ctx: {
      block: unknown;
      blockIndex: number;
      blockAttempt: number;
      trialResults: unknown[];
    }) => {
      const cacheKey = makeRepeatCacheKey(ctx.blockIndex, ctx.blockAttempt);
      const cached = repeatEvaluationCache.get(cacheKey);
      if (cached) return cached;
      const blockResolverContext = {
        blockIndex: ctx.blockIndex,
        locals: asObject(asObject(ctx.block)?.variables) ?? {},
      };
      const resolvedRepeatRaw = context.resolver.resolveInValue(
        asObject(ctx.block)?.repeatUntil,
        blockResolverContext,
      );
      const repeatSpec = coerceBlockRepeatUntilConfig(resolvedRepeatRaw);
      const evaluation = evaluateBlockRepeatUntil({
        config: repeatSpec,
        trialResults: ctx.trialResults,
        attemptIndex: ctx.blockAttempt,
      });
      repeatEvaluationCache.set(cacheKey, evaluation);
      return evaluation;
    };
    const insertionSpecs = coerceInstructionInsertions(instructions?.insertions);
    const selectInsertionGroups = (
      at: InstructionInsertionPoint,
      blockCtx?: { block: unknown; blockIndex: number },
    ): InstructionScreenSpec[][] => {
      return insertionSpecs
        .filter((spec) => spec.at === at)
        .filter((spec) => {
          if (!spec.when) return true;
          const hasBlockFilters =
            Array.isArray(spec.when.blockIndex) ||
            Array.isArray(spec.when.blockLabel) ||
            Array.isArray(spec.when.blockType) ||
            typeof spec.when.isPractice === "boolean";
          if (!blockCtx && hasBlockFilters) return false;
          if (!blockCtx) return true;
          const block = asObject(blockCtx.block);
          if (Array.isArray(spec.when.blockIndex) && spec.when.blockIndex.length > 0) {
            if (!spec.when.blockIndex.includes(blockCtx.blockIndex)) return false;
          }
          if (Array.isArray(spec.when.blockLabel) && spec.when.blockLabel.length > 0) {
            const label = asString(block?.label);
            if (!label || !spec.when.blockLabel.includes(label)) return false;
          }
          if (Array.isArray(spec.when.blockType) && spec.when.blockType.length > 0) {
            const blockType = (asString(block?.blockType) || "").toLowerCase();
            if (!blockType || !spec.when.blockType.includes(blockType)) return false;
          }
          if (typeof spec.when.isPractice === "boolean") {
            if (Boolean(block?.isPractice) !== spec.when.isPractice) return false;
          }
          return true;
        })
        .map((spec) => {
          const resolved = context.resolver.resolveInValue(
            spec.pages,
            blockCtx
              ? {
                  blockIndex: blockCtx.blockIndex,
                  locals: asObject(asObject(blockCtx.block)?.variables) ?? {},
                }
              : undefined,
          );
          return toInstructionScreenSpecs(resolved);
        })
        .filter((pages) => pages.length > 0);
    };
    type ResolvedBlockUi = {
      introText: string | null;
      preBlockPages: InstructionScreenSpec[];
      postBlockPages: InstructionScreenSpec[];
      repeatPostBlockPages: InstructionScreenSpec[];
      showBlockLabel: boolean;
      preBlockBeforeIntro: boolean;
    };
    const toBlockObject = (block: unknown): Record<string, unknown> => asObject(block) ?? {};
    const resolveBlockContext = (block: unknown, blockIndex: number) => ({
      blockIndex,
      locals: asObject(asObject(block)?.variables) ?? {},
    });
    const resolveScreens = (value: unknown, block?: unknown, blockIndex?: number): InstructionScreenSpec[] => {
      if (block && typeof blockIndex === "number") {
        return toInstructionScreenSpecs(context.resolver.resolveInValue(value, resolveBlockContext(block, blockIndex)));
      }
      return toInstructionScreenSpecs(context.resolver.resolveInValue(value));
    };
    const mergeScreens = (first: InstructionScreenSpec[], second: InstructionScreenSpec[]): InstructionScreenSpec[] =>
      [...first, ...second];
    const countBlockTrials = (block: Record<string, unknown>): number => {
      const directCount = Number(block.trials);
      if (Number.isFinite(directCount) && directCount >= 0) return Math.floor(directCount);
      const trialsList = block.trials;
      return Array.isArray(trialsList) ? trialsList.length : 0;
    };
    const resolveBlockIntroText = (templateRaw: unknown, block: Record<string, unknown>, blockIndex: number): string | null => {
      const resolvedTemplate = asString(
        context.resolver.resolveInValue(templateRaw, resolveBlockContext(block, blockIndex)),
      );
      if (!resolvedTemplate) {
        return asString(block.introText);
      }
      const nTrials = countBlockTrials(block);
      return resolvedTemplate.replace(/\{([a-zA-Z0-9_]+)\}/g, (token, key: string) => {
        if (key === "blockIndex") return String(blockIndex + 1);
        if (key === "nTrials") return String(nTrials);
        if (key === "blockLabel") return asString(block.label) ?? token;
        const value = block[key];
        if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
          return String(value);
        }
        return token;
      });
    };
    const resolveDefaultBlockUi = (ctx: { block: unknown; blockIndex: number }): ResolvedBlockUi => {
      const block = toBlockObject(ctx.block);
      const preBlockGlobal = resolveScreens(
        instructions?.preBlockPages ?? args.instructionDefaults?.preBlockPages,
        ctx.block,
        ctx.blockIndex,
      );
      const postBlockGlobal = resolveScreens(
        instructions?.postBlockPages ?? args.instructionDefaults?.postBlockPages,
        ctx.block,
        ctx.blockIndex,
      );
      const beforeBlockScreens = toInstructionScreenSpecs(block.beforeBlockScreens);
      const afterBlockScreens = toInstructionScreenSpecs(block.afterBlockScreens);
      const repeatPostBlockPages = resolveScreens(
        block.repeatAfterBlockScreens ?? block.repeatPostBlockScreens,
        ctx.block,
        ctx.blockIndex,
      );
      return {
        introText: resolveBlockIntroText(
          instructions?.blockIntroTemplate ?? args.instructionDefaults?.blockIntroTemplate,
          block,
          ctx.blockIndex,
        ),
        preBlockPages: mergeScreens(preBlockGlobal, beforeBlockScreens),
        postBlockPages: mergeScreens(postBlockGlobal, afterBlockScreens),
        repeatPostBlockPages,
        showBlockLabel:
          (typeof instructions?.showBlockLabel === "boolean"
            ? instructions.showBlockLabel
            : args.instructionDefaults?.showBlockLabel) ?? true,
        preBlockBeforeIntro:
          (typeof instructions?.preBlockBeforeBlockIntro === "boolean"
            ? instructions.preBlockBeforeBlockIntro
            : args.instructionDefaults?.preBlockBeforeIntro) ?? false,
      };
    };
    const resolveMergedBlockUi = (ctx: { block: TBlock; blockIndex: number; blockAttempt?: number }): ResolvedBlockUi => {
      const defaultBlockUi = resolveDefaultBlockUi(ctx);
      const customBlockUi = args.getBlockUi ? args.getBlockUi(ctx) : null;
      if (!customBlockUi) return defaultBlockUi;
      return {
        introText: customBlockUi.introText ?? defaultBlockUi.introText,
        preBlockPages: customBlockUi.preBlockPages
          ? toInstructionScreenSpecs(customBlockUi.preBlockPages)
          : defaultBlockUi.preBlockPages,
        postBlockPages: customBlockUi.postBlockPages
          ? toInstructionScreenSpecs(customBlockUi.postBlockPages)
          : defaultBlockUi.postBlockPages,
        repeatPostBlockPages: customBlockUi.repeatPostBlockPages
          ? toInstructionScreenSpecs(customBlockUi.repeatPostBlockPages)
          : defaultBlockUi.repeatPostBlockPages,
        showBlockLabel: customBlockUi.showBlockLabel ?? defaultBlockUi.showBlockLabel,
        preBlockBeforeIntro: customBlockUi.preBlockBeforeIntro ?? defaultBlockUi.preBlockBeforeIntro,
      };
    };
    const introPages = toInstructionScreenSpecs(
      args.introPages ??
        context.resolver.resolveInValue(instructions?.introPages ?? args.instructionDefaults?.introPages),
    );
    const showTaskTitleCard = instructions?.showTaskTitleCard !== false;
    const introBeforeInsertions = selectInsertionGroups("task_intro_before");
    const introAfterInsertions = selectInsertionGroups("task_intro_after");
    
    let sessionResult: Awaited<ReturnType<typeof runTaskSession<TBlock, TTrial, TTrialResult>>>;
    
    // Cache for trials to avoid redundant calls between onBlockStart and the session runner.
    const trialsCache: Map<string, TTrial[]> = new Map();

    try {
      if (
        (introPages && Array.isArray(introPages) && introPages.length > 0) ||
        introBeforeInsertions.length > 0 ||
        introAfterInsertions.length > 0
      ) {
        await runTaskIntroFlow({
          container: uiContainer,
          title: asString(asObject(taskConfig.task)?.title) || "Task",
          participantId: selection.participant.participantId,
          showTaskTitleCard,
          beforeIntroPages: introBeforeInsertions,
          introPages,
          afterIntroPages: introAfterInsertions,
          buttonIdPrefix: args.buttonIdPrefix,
          continueButtonStyle,
          autoFocusContinueButton,
          renderHtml: args.renderInstruction,
        });
      }
      if (args.staircase) {
        const staircaseEnabledFromConfig = asObject(taskConfig.staircase)?.enabled;
        const staircaseEnabled =
          typeof args.staircase.enabled === "boolean"
            ? args.staircase.enabled
            : staircaseEnabledFromConfig === true;
        if (staircaseEnabled) {
          await args.staircase.run();
        }
      }

      // 3. Main Session
      sessionResult = await runTaskSession<TBlock, TTrial, TTrialResult>({
      blocks: args.getBlocks(taskConfig),
      getTrials: async (ctx) => {
        const key = String(ctx.blockIndex);
        if (trialsCache.has(key)) {
          const trials = trialsCache.get(key)!;
          trialsCache.delete(key);
          return trials;
        }
        return await args.getTrials(ctx);
      },
      runTrial: async (ctx) => {
        const trialScopedModules = applyModuleFilter(
          resolveScopedModules({
            block: ctx.block,
            blockIndex: ctx.blockIndex,
            trial: ctx.trial,
            trialIndex: ctx.trialIndex,
          }),
          {
            scope: "trial",
            block: ctx.block,
            blockIndex: ctx.blockIndex,
            trial: ctx.trial,
            trialIndex: ctx.trialIndex,
          },
        );
        const resolvedTrialModuleContext = args.resolveModuleContext?.({
          scope: "trial",
          block: ctx.block,
          blockIndex: ctx.blockIndex,
          trial: ctx.trial,
          trialIndex: ctx.trialIndex,
        });
        // Auto-handle trial-scoped modules
        moduleRunner.startScopedModules({
          scope: "trial",
          blockIndex: ctx.blockIndex,
          trialIndex: ctx.trialIndex,
          moduleConfigs: trialScopedModules,
          context: {
            block: ctx.block,
            blockIndex: ctx.blockIndex,
            trial: ctx.trial,
            trialIndex: ctx.trialIndex,
            resolver: context.resolver,
            locals: (ctx.block as any).variables,
            displayElement: resolvedTrialModuleContext?.displayElement ?? container,
            ...(resolvedTrialModuleContext?.borderTargetElement
              ? { borderTargetElement: resolvedTrialModuleContext.borderTargetElement }
              : {}),
            ...(resolvedTrialModuleContext?.borderTargetRect
              ? { borderTargetRect: resolvedTrialModuleContext.borderTargetRect }
              : {}),
          }
        });

        if (args.onTrialStart) await args.onTrialStart(ctx);

        try {
          const result = await args.runTrial(ctx);
          if (args.onTrialEnd) await args.onTrialEnd({ ...ctx, result });
          await dataSink.onTrialResult?.({ ...ctx, result, context: sinkContext });
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
          const blockScopedModules = applyModuleFilter(
            resolveScopedModules({
              block: ctx.block,
              blockIndex: ctx.blockIndex,
              trialIndex: null,
            }),
            {
              scope: "block",
              block: ctx.block,
              blockIndex: ctx.blockIndex,
              trialIndex: null,
            },
          );
          const resolvedBlockModuleContext = args.resolveModuleContext?.({
            scope: "block",
            block: ctx.block,
            blockIndex: ctx.blockIndex,
            trialIndex: null,
          });
          // Auto-handle block-scoped modules
          moduleRunner.startScopedModules({
            scope: "block",
            blockIndex: ctx.blockIndex,
            trialIndex: null,
            moduleConfigs: blockScopedModules,
            context: {
              block: ctx.block,
              blockIndex: ctx.blockIndex,
              resolver: context.resolver,
              locals: (ctx.block as any).variables,
              displayElement: resolvedBlockModuleContext?.displayElement ?? container,
              ...(resolvedBlockModuleContext?.borderTargetElement
                ? { borderTargetElement: resolvedBlockModuleContext.borderTargetElement }
                : {}),
              ...(resolvedBlockModuleContext?.borderTargetRect
                ? { borderTargetRect: resolvedBlockModuleContext.borderTargetRect }
                : {}),
            }
          });

          const blockUi = resolveMergedBlockUi(ctx);
          const trials = await args.getTrials(ctx);
          
          // Cache trials for the session runner.
          const key = String(ctx.blockIndex);
          trialsCache.set(key, trials);

          await runBlockStartFlow({
            container: uiContainer,
            blockLabel: (ctx.block as any).label || `Block ${ctx.blockIndex + 1}`,
            blockIndex: ctx.blockIndex,
            buttonIdPrefix: args.buttonIdPrefix,
            continueButtonStyle,
            autoFocusContinueButton,
            introText: blockUi.introText ?? (ctx.block as any).introText,
            preBlockPages: blockUi.preBlockPages,
            showBlockLabel: blockUi.showBlockLabel,
            preBlockBeforeIntro: blockUi.preBlockBeforeIntro,
            beforeIntroInsertions: selectInsertionGroups("block_start_before_intro", ctx),
            afterIntroInsertions: selectInsertionGroups("block_start_after_intro", ctx),
            afterPreInsertions: selectInsertionGroups("block_start_after_pre", ctx),
            variables: {
              nTrials: trials.length,
              blockRule: (ctx.block as any).rule ?? "",
              ...(ctx.block as any).variables,
            },
            renderHtml: args.renderInstruction,
          });

          if (args.onBlockStart) await args.onBlockStart(ctx);
        },
        onBlockEnd: async (ctx) => {
          if (args.onBlockEnd) await args.onBlockEnd(ctx);

          const blockUi = resolveMergedBlockUi(ctx);
          const blockResolverContext = {
            blockIndex: ctx.blockIndex,
            locals: asObject(asObject(ctx.block)?.variables) ?? {},
          };
          const repeatEvaluation = evaluateRepeatForAttempt({
            block: ctx.block,
            blockIndex: ctx.blockIndex,
            blockAttempt: ctx.blockAttempt ?? 0,
            trialResults: ctx.trialResults as unknown[],
          });
          const globalSummarySpec = coerceBlockSummaryConfig(
            context.resolver.resolveInValue(blockSummaryRaw, blockResolverContext),
          );
          const summaryOverrideRaw = context.resolver.resolveInValue(
            asObject(ctx.block)?.blockSummary,
            blockResolverContext,
          );
          const summarySpec = mergeBlockSummaryConfig(
            globalSummarySpec,
            summaryOverrideRaw,
          );
          const summaryModel = buildBlockSummaryModel({
            config: summarySpec,
            block: ctx.block,
            blockIndex: ctx.blockIndex,
            trialResults: ctx.trialResults as unknown[],
          });
          const beforePostInsertions = selectInsertionGroups("block_end_before_post", ctx);
          const afterPostInsertions = selectInsertionGroups("block_end_after_post", ctx);
          if (summaryModel) {
            if (summaryModel.at === "block_end_after_post") {
              afterPostInsertions.push([{ text: summaryModel.text }]);
            } else {
              beforePostInsertions.push([{ text: summaryModel.text }]);
            }
          }
          const repeatPostBlockPages = toInstructionScreenSpecs(
            blockUi.repeatPostBlockPages ??
              context.resolver.resolveInValue(
                asObject(ctx.block)?.repeatAfterBlockScreens ?? asObject(ctx.block)?.repeatPostBlockScreens,
                blockResolverContext,
              ),
          );
          const postBlockPages = toInstructionScreenSpecs(
            repeatEvaluation.shouldRepeat
              ? repeatPostBlockPages
              : (blockUi.postBlockPages ?? (ctx.block as any).afterBlockScreens),
          );
          await runBlockEndFlow({
            container: uiContainer,
            blockLabel: (ctx.block as any).label || `Block ${ctx.blockIndex + 1}`,
            blockIndex: ctx.blockIndex,
            buttonIdPrefix: args.buttonIdPrefix,
            continueButtonStyle,
            autoFocusContinueButton,
            postBlockPages,
            showBlockLabel: blockUi.showBlockLabel,
            beforePostInsertions,
            afterPostInsertions,
            renderHtml: args.renderInstruction,
          });

          moduleRunner.stopScopedModules({ 
            scope: "block", 
            blockIndex: ctx.blockIndex, 
            trialIndex: null 
          });
        },
        onEvent: async (event) => {
          await dataSink.onSessionEvent?.(sinkContext, event);
        }
      },
      shouldRepeatBlock: async (ctx) => {
        const evaluation = evaluateRepeatForAttempt({
          block: ctx.block,
          blockIndex: ctx.blockIndex,
          blockAttempt: ctx.blockAttempt,
          trialResults: ctx.trialResults as unknown[],
        });
        return evaluation.shouldRepeat;
      },
      });

      // 4. Task End Flow
      const endPages = toInstructionScreenSpecs(
        args.endPages ??
          context.resolver.resolveInValue(instructions?.endPages ?? args.instructionDefaults?.endPages),
      );
      const endBeforeInsertions = selectInsertionGroups("task_end_before");
      const endAfterInsertions = selectInsertionGroups("task_end_after");
      if (
        (endPages && Array.isArray(endPages) && endPages.length > 0) ||
        endBeforeInsertions.length > 0 ||
        endAfterInsertions.length > 0
      ) {
        await runTaskEndFlow({
          container: uiContainer,
          beforeEndPages: endBeforeInsertions,
          endPages,
          afterEndPages: endAfterInsertions,
          buttonIdPrefix: args.buttonIdPrefix,
          continueButtonStyle,
          autoFocusContinueButton,
          renderHtml: args.renderInstruction,
          completeTitle: args.completeTitle,
          completeMessage: args.completeMessage,
          doneButtonLabel: args.doneButtonLabel,
        });
      }
    } catch (error) {
      if (isInstructionFlowExitRequestedError(error)) {
        moduleRunner.stopAll();
        uiContainer.innerHTML = renderCenteredNotice({
          title: "Consent not provided",
          message: "You have exited the study. You may now close this tab.",
        });
        return {
          selection,
          aborted: true,
          reason: "instruction_exit",
        };
      }
      throw error;
    }

    // 5. Finalization
    const records = args.csvOptions?.getRecords 
      ? args.csvOptions.getRecords(sessionResult) 
      : sessionResult.blocks.flatMap(b => b.trialResults);

    const taskMetadata = args.getTaskMetadata ? args.getTaskMetadata(sessionResult) : {};
    const taskEvents = args.getEvents ? args.getEvents(sessionResult) : [];

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
      events: Array.isArray(taskEvents) ? taskEvents : [],
      ...taskMetadata,
    };

    if (args.onTaskEnd) await args.onTaskEnd(payload);
    await dataSink.onTaskEnd?.({ context: sinkContext, payload, sessionResult });
    const dataSinkStatus = dataSink.getStatus?.() ?? {
      jatosStreamingUsed: false,
      jatosStreamingFailed: false,
    };

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
        jatosHandledBySink: dataSinkStatus.jatosStreamingUsed && !dataSinkStatus.jatosStreamingFailed,
      });
    }

    return payload;
  }
}
