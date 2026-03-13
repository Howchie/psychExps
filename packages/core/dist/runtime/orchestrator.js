import { asObject, asString, coerceInstructionInsertions, toInstructionScreenSpecs, toStringScreens, } from "../utils/coerce";
import { runTaskIntroFlow, runBlockStartFlow, runBlockEndFlow, runTaskEndFlow } from "../web/taskUiFlow";
import { isInstructionFlowExitRequestedError } from "../web/instructionFlow";
import { renderCenteredNotice, resolveButtonStyleOverrides } from "../web/ui";
import { runTaskSession } from "./sessionRunner";
import { finalizeTaskRun } from "../web/lifecycle";
import { recordsToCsv } from "../infrastructure/data";
import { createDefaultTaskDataSink } from "../infrastructure/dataSink";
import { buildBlockSummaryModel, coerceBlockSummaryConfig, mergeBlockSummaryConfig } from "./blockSummary";
import { coerceBlockRepeatUntilConfig, evaluateBlockRepeatUntil } from "./blockRepeat";
export class TaskOrchestrator {
    context;
    constructor(context) {
        this.context = context;
    }
    async run(args) {
        const { context } = this;
        const { taskConfig, rawTaskConfig, moduleRunner, container, selection } = context;
        const taskModules = asObject(asObject(rawTaskConfig.task)?.modules) ?? {};
        const sinkContext = {
            coreConfig: context.coreConfig,
            selection,
            taskConfig,
            rawTaskConfig,
        };
        const dataSink = args.dataSink ?? createDefaultTaskDataSink();
        // 1. Task Start
        if (args.onTaskStart)
            await args.onTaskStart();
        await dataSink.onTaskStart?.(sinkContext);
        const uiContainer = args.resolveUiContainer ? args.resolveUiContainer(container) : container;
        // 2. Intro Flow
        const instructions = asObject(taskConfig.instructions);
        const uiConfig = asObject(taskConfig.ui);
        const continueButtonStyle = resolveButtonStyleOverrides(uiConfig?.continueButtonStyle ?? uiConfig?.buttonStyle ?? instructions?.continueButtonStyle ?? instructions?.buttonStyle);
        const autoFocusContinueButton = uiConfig?.autoFocusContinueButton !== false;
        const blockSummaryRaw = instructions?.blockSummary;
        const repeatEvaluationCache = new Map();
        const makeRepeatCacheKey = (blockIndex, blockAttempt) => `${blockIndex}:${blockAttempt}`;
        const evaluateRepeatForAttempt = (ctx) => {
            const cacheKey = makeRepeatCacheKey(ctx.blockIndex, ctx.blockAttempt);
            const cached = repeatEvaluationCache.get(cacheKey);
            if (cached)
                return cached;
            const blockResolverContext = {
                blockIndex: ctx.blockIndex,
                locals: asObject(asObject(ctx.block)?.variables) ?? {},
            };
            const resolvedRepeatRaw = context.resolver.resolveInValue(asObject(ctx.block)?.repeatUntil, blockResolverContext);
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
        const selectInsertionGroups = (at, blockCtx) => {
            return insertionSpecs
                .filter((spec) => spec.at === at)
                .filter((spec) => {
                if (!spec.when)
                    return true;
                const hasBlockFilters = Array.isArray(spec.when.blockIndex) ||
                    Array.isArray(spec.when.blockLabel) ||
                    Array.isArray(spec.when.blockType) ||
                    typeof spec.when.isPractice === "boolean";
                if (!blockCtx && hasBlockFilters)
                    return false;
                if (!blockCtx)
                    return true;
                const block = asObject(blockCtx.block);
                if (Array.isArray(spec.when.blockIndex) && spec.when.blockIndex.length > 0) {
                    if (!spec.when.blockIndex.includes(blockCtx.blockIndex))
                        return false;
                }
                if (Array.isArray(spec.when.blockLabel) && spec.when.blockLabel.length > 0) {
                    const label = asString(block?.label);
                    if (!label || !spec.when.blockLabel.includes(label))
                        return false;
                }
                if (Array.isArray(spec.when.blockType) && spec.when.blockType.length > 0) {
                    const blockType = (asString(block?.blockType) || "").toLowerCase();
                    if (!blockType || !spec.when.blockType.includes(blockType))
                        return false;
                }
                if (typeof spec.when.isPractice === "boolean") {
                    if (Boolean(block?.isPractice) !== spec.when.isPractice)
                        return false;
                }
                return true;
            })
                .map((spec) => {
                const resolved = context.resolver.resolveInValue(spec.pages, blockCtx
                    ? {
                        blockIndex: blockCtx.blockIndex,
                        locals: asObject(asObject(blockCtx.block)?.variables) ?? {},
                    }
                    : undefined);
                return toInstructionScreenSpecs(resolved);
            })
                .filter((pages) => pages.length > 0);
        };
        const introPages = toInstructionScreenSpecs(args.introPages ?? context.resolver.resolveInValue(instructions?.introPages));
        const showTaskTitleCard = instructions?.showTaskTitleCard !== false;
        const introBeforeInsertions = selectInsertionGroups("task_intro_before");
        const introAfterInsertions = selectInsertionGroups("task_intro_after");
        let sessionResult;
        try {
            if ((introPages && Array.isArray(introPages) && introPages.length > 0) ||
                introBeforeInsertions.length > 0 ||
                introAfterInsertions.length > 0) {
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
            // 3. Main Session
            sessionResult = await runTaskSession({
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
                            locals: ctx.block.variables,
                            displayElement: container,
                        }
                    });
                    if (args.onTrialStart)
                        await args.onTrialStart(ctx);
                    try {
                        const result = await args.runTrial(ctx);
                        if (args.onTrialEnd)
                            await args.onTrialEnd({ ...ctx, result });
                        await dataSink.onTrialResult?.({ ...ctx, result, context: sinkContext });
                        return result;
                    }
                    finally {
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
                                locals: ctx.block.variables,
                                displayElement: container,
                            }
                        });
                        const blockUi = args.getBlockUi ? args.getBlockUi(ctx) : null;
                        await runBlockStartFlow({
                            container: uiContainer,
                            blockLabel: ctx.block.label || `Block ${ctx.blockIndex + 1}`,
                            blockIndex: ctx.blockIndex,
                            buttonIdPrefix: args.buttonIdPrefix,
                            continueButtonStyle,
                            autoFocusContinueButton,
                            introText: blockUi?.introText ?? ctx.block.introText,
                            preBlockPages: blockUi?.preBlockPages ?? ctx.block.beforeBlockScreens,
                            showBlockLabel: blockUi?.showBlockLabel,
                            preBlockBeforeIntro: blockUi?.preBlockBeforeIntro,
                            beforeIntroInsertions: selectInsertionGroups("block_start_before_intro", ctx),
                            afterIntroInsertions: selectInsertionGroups("block_start_after_intro", ctx),
                            afterPreInsertions: selectInsertionGroups("block_start_after_pre", ctx),
                            renderHtml: args.renderInstruction,
                        });
                        if (args.onBlockStart)
                            await args.onBlockStart(ctx);
                    },
                    onBlockEnd: async (ctx) => {
                        if (args.onBlockEnd)
                            await args.onBlockEnd(ctx);
                        const blockUi = args.getBlockUi ? args.getBlockUi(ctx) : null;
                        const blockResolverContext = {
                            blockIndex: ctx.blockIndex,
                            locals: asObject(asObject(ctx.block)?.variables) ?? {},
                        };
                        const repeatEvaluation = evaluateRepeatForAttempt({
                            block: ctx.block,
                            blockIndex: ctx.blockIndex,
                            blockAttempt: ctx.blockAttempt ?? 0,
                            trialResults: ctx.trialResults,
                        });
                        const globalSummarySpec = coerceBlockSummaryConfig(context.resolver.resolveInValue(blockSummaryRaw, blockResolverContext));
                        const summaryOverrideRaw = context.resolver.resolveInValue(asObject(ctx.block)?.blockSummary, blockResolverContext);
                        const summarySpec = mergeBlockSummaryConfig(globalSummarySpec, summaryOverrideRaw);
                        const summaryModel = buildBlockSummaryModel({
                            config: summarySpec,
                            block: ctx.block,
                            blockIndex: ctx.blockIndex,
                            trialResults: ctx.trialResults,
                        });
                        const beforePostInsertions = selectInsertionGroups("block_end_before_post", ctx);
                        const afterPostInsertions = selectInsertionGroups("block_end_after_post", ctx);
                        if (summaryModel) {
                            if (summaryModel.at === "block_end_after_post") {
                                afterPostInsertions.push([{ text: summaryModel.text }]);
                            }
                            else {
                                beforePostInsertions.push([{ text: summaryModel.text }]);
                            }
                        }
                        const repeatPostBlockPages = toStringScreens(blockUi?.repeatPostBlockPages ??
                            context.resolver.resolveInValue(asObject(ctx.block)?.repeatAfterBlockScreens ?? asObject(ctx.block)?.repeatPostBlockScreens, blockResolverContext));
                        const postBlockPages = toInstructionScreenSpecs(repeatEvaluation.shouldRepeat
                            ? repeatPostBlockPages
                            : (blockUi?.postBlockPages ?? ctx.block.afterBlockScreens));
                        await runBlockEndFlow({
                            container: uiContainer,
                            blockLabel: ctx.block.label || `Block ${ctx.blockIndex + 1}`,
                            blockIndex: ctx.blockIndex,
                            buttonIdPrefix: args.buttonIdPrefix,
                            continueButtonStyle,
                            autoFocusContinueButton,
                            postBlockPages,
                            showBlockLabel: blockUi?.showBlockLabel,
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
                        trialResults: ctx.trialResults,
                    });
                    return evaluation.shouldRepeat;
                },
            });
            // 4. Task End Flow
            const endPages = toInstructionScreenSpecs(args.endPages ?? context.resolver.resolveInValue(instructions?.endPages));
            const endBeforeInsertions = selectInsertionGroups("task_end_before");
            const endAfterInsertions = selectInsertionGroups("task_end_after");
            if ((endPages && Array.isArray(endPages) && endPages.length > 0) ||
                endBeforeInsertions.length > 0 ||
                endAfterInsertions.length > 0) {
                await runTaskEndFlow({
                    container: uiContainer,
                    beforeEndPages: endBeforeInsertions,
                    endPages,
                    afterEndPages: endAfterInsertions,
                    buttonIdPrefix: args.buttonIdPrefix,
                    continueButtonStyle,
                    autoFocusContinueButton,
                    renderHtml: args.renderInstruction,
                });
            }
        }
        catch (error) {
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
            mapping: taskConfig.mapping,
            timing: taskConfig.timing,
            blocks: sessionResult.blocks.map(b => ({
                blockIndex: b.blockIndex,
                label: b.block.label,
            })),
            records,
            moduleResults: moduleRunner.getResults(),
            events: Array.isArray(taskEvents) ? taskEvents : [],
            ...taskMetadata,
        };
        if (args.onTaskEnd)
            await args.onTaskEnd(payload);
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
//# sourceMappingURL=orchestrator.js.map