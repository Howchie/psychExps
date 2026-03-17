import { buildScheduledItems, createAtwitSurvey, createMulberry32, collectSurveyEntries, createInstructionRenderer, deepClone, deepMerge, findFirstSurveyScore, createManipulationPoolAllocator, resolveBlockManipulationIds, hashSeed, attachSurveyResults, parseSurveyDefinitions, applyTaskInstructionConfig, resolveInstructionScreenSlots, resolveTemplatedString, runSurveySequence, asObject, asString, resolveScopedModuleConfig, TaskOrchestrator, createTaskAdapter, } from '@experiments/core';
import { resolveBricksDrtConfig } from './runtime/drtConfig.js';
import { addTrialStatsToAccumulator, applyResetRulesAt, buildHudBaseStats, createBricksStatsAccumulator, resolveBricksStatsPresentation, } from './runtime/statsPresentation.js';
import { runConveyorTrial, } from './runtime/runConveyorTrial.js';
function toBricksDrtScopeId(blockIndex, trialIndex) {
    return `B${blockIndex}${trialIndex !== null ? `T${trialIndex}` : ""}`;
}
async function runBricksTask(context) {
    const { taskConfig, selection, resolver, container, moduleRunner } = context;
    const rng = createMulberry32(hashSeed(selection.participant.participantId, selection.participant.sessionId, selection.variantId));
    const blockPlan = buildBlockPlan(taskConfig, rng, selection);
    const instructionsRaw = asObject(taskConfig.instructions) ?? {};
    const instructionSlots = resolveInstructionScreenSlots(instructionsRaw);
    const blockIntroTemplate = asString(instructionsRaw.blockIntroTemplate);
    const showBlockLabel = instructionsRaw.showBlockLabel !== false;
    const preBlockBeforeBlockIntro = instructionsRaw.preBlockBeforeBlockIntro === true;
    const statsPresentation = resolveBricksStatsPresentation(taskConfig);
    const statsAccumulator = createBricksStatsAccumulator();
    const eventLogger = context.eventLogger;
    const activeDrtScopes = new Map();
    const blockDrtPreviousStats = new Map();
    moduleRunner.setOptions({
        onEvent: (event) => {
            const address = event.address;
            const scopeId = (address?.blockIndex != null)
                ? toBricksDrtScopeId(address.blockIndex, address.trialIndex)
                : null;
            const active = scopeId ? activeDrtScopes.get(scopeId) : undefined;
            if (event.type === "bricks_drt" || event.type.startsWith("drt_")) {
                active?.bindings?.onEvent(event);
            }
            eventLogger.emit(event.type, event, {
                blockIndex: address?.blockIndex ?? -1,
                ...(typeof address?.trialIndex === "number" ? { trialIndex: address.trialIndex } : {}),
            });
        }
    });
    const orchestrator = new TaskOrchestrator(context);
    applyTaskInstructionConfig(taskConfig, {
        introPages: instructionSlots.intro,
        preBlockPages: instructionSlots.preBlock,
        postBlockPages: instructionSlots.postBlock,
        endPages: instructionSlots.end,
        blockIntroTemplate: blockIntroTemplate ?? "Press continue when ready.",
        showBlockLabel,
        preBlockBeforeBlockIntro: preBlockBeforeBlockIntro,
    });
    return await orchestrator.run({
        buttonIdPrefix: "bricks",
        stimulusExport: {
            rows: buildBricksStimulusRows(blockPlan),
            suffix: "bricks_stimulus_list",
        },
        resolveModuleContext: ({ scope, blockIndex, trialIndex }) => {
            const scopeId = scope === "trial"
                ? toBricksDrtScopeId(blockIndex, trialIndex)
                : toBricksDrtScopeId(blockIndex, null);
            return {
                displayElement: container,
                borderTargetRect: () => activeDrtScopes.get(scopeId)?.bindings?.displayElement?.getBoundingClientRect() ?? null,
            };
        },
        getBlocks: () => blockPlan,
        getTrials: ({ block }) => block.trialConfigs,
        onTaskStart: () => {
            eventLogger.emit("task_start", { task: "bricks" });
        },
        renderInstruction: createInstructionRenderer({
            showBlockLabel: false,
            resolvePage: (ctx) => {
                const blockIndex = ctx.blockLabel ? blockPlan.findIndex((b) => b.label === ctx.blockLabel) : undefined;
                const resolveField = (value) => {
                    if (!value)
                        return "";
                    return resolveTemplatedString({
                        template: value,
                        vars: taskConfig,
                        resolver,
                        context: typeof blockIndex === "number" && blockIndex >= 0 ? { blockIndex } : undefined,
                    });
                };
                const title = resolveField(ctx.pageTitle);
                const html = resolveField(ctx.pageHtml);
                const text = resolveField(ctx.pageText);
                return {
                    pageText: text,
                    ...(html ? { pageHtml: html } : {}),
                    ...(title ? { pageTitle: title } : {}),
                };
            },
        }),
        onBlockStart: async ({ block, blockIndex }) => {
            eventLogger.emit("block_start", { label: block.label, manipulationId: block.manipulationId }, { blockIndex });
            blockDrtPreviousStats.delete(blockIndex);
            statsAccumulator.block = { spawned: 0, cleared: 0, dropped: 0, points: 0 };
            applyResetRulesAt(statsAccumulator, statsPresentation, "block_start", {
                label: block.label,
                manipulationId: block.manipulationId,
                phase: block.phase,
                isPractice: block.isPractice,
            });
        },
        runTrial: async ({ block, blockIndex, trial, trialIndex }) => {
            const stageHost = document.createElement("div");
            stageHost.style.width = "100%";
            stageHost.style.minHeight = "70vh";
            stageHost.style.display = "flex";
            stageHost.style.justifyContent = "center";
            stageHost.style.alignItems = "center";
            container.innerHTML = "";
            container.appendChild(stageHost);
            const resolvedDrtConfig = resolveBricksDrtConfig(resolveScopedModuleConfig(trial, "drt"));
            let injectedDrtRuntime;
            const scopeId = toBricksDrtScopeId(blockIndex, resolvedDrtConfig.scope === "trial" ? trialIndex : null);
            if (resolvedDrtConfig.enabled) {
                const moduleAddress = resolvedDrtConfig.scope === "trial"
                    ? { scope: "trial", blockIndex, trialIndex }
                    : { scope: "block", blockIndex, trialIndex: null };
                const handle = moduleRunner.getActiveHandle({
                    moduleId: "drt",
                    ...moduleAddress,
                });
                const controller = handle?.controller ?? null;
                if (!controller) {
                    throw new Error(`Bricks DRT is enabled for ${resolvedDrtConfig.scope} scope but no active DRT module handle was found at block ${blockIndex + 1}, trial ${trialIndex + 1}.`);
                }
                const active = activeDrtScopes.get(scopeId) ?? {
                    config: resolvedDrtConfig,
                    bindings: null,
                    activeTrialIndex: null,
                };
                active.config = resolvedDrtConfig;
                activeDrtScopes.set(scopeId, active);
                injectedDrtRuntime = {
                    config: active.config,
                    controller,
                    stopOnCleanup: false,
                    attachBindings: (bindings) => {
                        active.bindings = bindings;
                        active.activeTrialIndex = trialIndex;
                    },
                    detachBindings: () => {
                        active.bindings = null;
                        active.activeTrialIndex = null;
                    },
                };
            }
            let record = await runConveyorTrial({
                displayElement: stageHost,
                blockLabel: block.label,
                blockIndex: block.index,
                trialIndex,
                config: trial,
                drtRuntime: injectedDrtRuntime,
                hudBaseStats: buildHudBaseStats(statsAccumulator, statsPresentation),
            });
            if (resolvedDrtConfig.enabled && resolvedDrtConfig.scope === "trial") {
                const trialHandle = moduleRunner.getActiveHandle({
                    moduleId: "drt",
                    scope: "trial",
                    blockIndex,
                    trialIndex,
                });
                const controller = trialHandle?.controller ?? null;
                if (controller) {
                    const responseRows = controller.exportResponseRows();
                    const latestEstimate = responseRows
                        .slice()
                        .reverse()
                        .map((row) => row.estimate)
                        .find((estimate) => Boolean(estimate)) ?? null;
                    const drtData = controller.exportData();
                    record = {
                        ...record,
                        drt: {
                            ...drtData,
                            transforms: controller.exportTransformData(),
                            responseRows,
                            ...(latestEstimate ? { transform_latest: latestEstimate } : {}),
                        },
                        drt_response_rows: responseRows,
                    };
                }
                activeDrtScopes.delete(scopeId);
            }
            // Handle block-scoped DRT stats
            if (resolvedDrtConfig.enabled && resolvedDrtConfig.scope === "block") {
                const previousStats = blockDrtPreviousStats.get(blockIndex) ?? {};
                const activeData = moduleRunner.getActiveData({ moduleId: "drt", blockIndex });
                const currentDrtData = activeData[0]?.data;
                const currentStats = extractNumericStats((currentDrtData?.stats ?? {}));
                const deltaStats = subtractStats(currentStats, previousStats);
                record.drt_cumulative = currentDrtData;
                record.drt = {
                    ...(currentDrtData ?? {}),
                    stats: deltaStats,
                };
                blockDrtPreviousStats.set(blockIndex, currentStats);
            }
            const surveyResults = await runConfiguredTrialSurveys(container, trial);
            record = withSurveyResults(record, surveyResults);
            eventLogger.emit("trial_complete", {
                endReason: record.end_reason,
                trialDurationMs: record.trial_duration_ms,
                game: record.game?.stats ?? {},
                drt: record.drt?.stats ?? {},
                surveys: surveyResults.map((entry) => ({
                    surveyId: entry.surveyId,
                    scores: entry.scores ?? {},
                })),
            }, { blockIndex, trialIndex });
            addTrialStatsToAccumulator(statsAccumulator, record?.game?.stats ?? {});
            record.stats_scope_totals = {
                block: { ...statsAccumulator.block },
                experiment: { ...statsAccumulator.experiment },
            };
            return record;
        },
        onBlockEnd: async ({ block, blockIndex, trialResults }) => {
            const totals = summarizeBlockTrials(trialResults);
            eventLogger.emit("block_end", { label: block.label, totals }, { blockIndex });
            applyResetRulesAt(statsAccumulator, statsPresentation, "block_end", {
                label: block.label,
                manipulationId: block.manipulationId,
                phase: block.phase,
                isPractice: block.isPractice,
            });
            activeDrtScopes.delete(toBricksDrtScopeId(blockIndex, null));
            blockDrtPreviousStats.delete(blockIndex);
        },
        csvOptions: {
            suffix: "bricks_drt_rows",
            getRecords: (res) => buildBricksDrtRows(res.blocks.flatMap((b) => b.trialResults), blockPlan, {
                participantId: selection.participant.participantId,
                variantId: selection.variantId,
            }),
        },
        getTaskMetadata: (res) => ({
            drt_rows: buildBricksDrtRows(res.blocks.flatMap((b) => b.trialResults), blockPlan, {
                participantId: selection.participant.participantId,
                variantId: selection.variantId,
            }),
        }),
    });
}
export const bricksAdapter = createTaskAdapter({
    manifest: {
        taskId: 'bricks',
        label: 'Bricks (DiscoveryProject)',
        variants: [
            { id: 'baseline', label: 'Moray Baseline', configPath: 'bricks/baseline' },
            { id: 'moray1991', label: 'Moray 1991 VPT+VDD', configPath: 'bricks/moray1991' },
            { id: 'spotlight', label: 'Spotlight + DRT', configPath: 'bricks/spotlight' },
            { id: 'evanderHons', label: 'Evander Honours', configPath: 'bricks/evanderHons' },
            { id: 'evanderHonsNoSpotlight', label: 'Evander Honours No SPotlight', configPath: 'bricks/evanderHonsNoSpotlight' },
            { id: 'drt_block_demo', label: 'DRT Block Scope Demo', configPath: 'bricks/drt_block_demo' },
        ],
    },
    run: runBricksTask,
});
function buildBlockPlan(config, rng, selection) {
    const planNode = asObject(config.plan);
    const blocks = Array.isArray(config.blocks)
        ? config.blocks
        : (Array.isArray(planNode?.blocks) ? planNode.blocks : []);
    const manipulations = Array.isArray(config.manipulations)
        ? config.manipulations
        : (Array.isArray(planNode?.manipulations) ? planNode.manipulations : []);
    const manipulationById = new Map();
    for (const manipulation of manipulations) {
        const id = typeof manipulation.id === 'string' ? manipulation.id.trim() : '';
        if (id)
            manipulationById.set(id, manipulation);
    }
    const poolAllocator = createManipulationPoolAllocator(config.manipulationPools ?? planNode?.manipulationPools, [
        selection.participant.participantId,
        selection.participant.sessionId,
        selection.variantId,
        "bricks_manipulation_pools",
    ]);
    if (blocks.length === 0) {
        throw new Error('Bricks config invalid: expected non-empty `blocks`.');
    }
    return blocks.map((block, index) => {
        const manipulationIds = resolveBlockManipulationIds(block, poolAllocator);
        const selectedManipulations = manipulationIds.map((id) => {
            const found = manipulationById.get(id);
            if (!found)
                throw new Error(`Bricks config invalid: block ${index + 1} references unknown manipulation '${id}'.`);
            return found;
        });
        const manipulationId = manipulationIds.length > 0 ? manipulationIds.join("+") : null;
        const label = typeof block.label === 'string' && block.label.trim() ? block.label.trim() : `Block ${index + 1}`;
        const phase = typeof block.phase === 'string' && block.phase.trim().length > 0 ? block.phase.trim() : null;
        const isPractice = typeof block.isPractice === 'boolean'
            ? block.isPractice
            : (typeof phase === 'string' && phase.toLowerCase().includes('practice'));
        const trialsRaw = Number(block.trials ?? 1);
        const trials = Number.isFinite(trialsRaw) ? Math.max(1, Math.floor(trialsRaw)) : 1;
        const beforeBlockScreens = block.beforeBlockScreens ?? block.preBlockInstructions;
        const afterBlockScreens = block.afterBlockScreens ?? block.postBlockInstructions;
        const repeatAfterBlockScreens = block.repeatAfterBlockScreens ?? block.repeatPostBlockScreens;
        const blockConfigBase = deepClone(config);
        for (const manipulation of selectedManipulations) {
            if (manipulation.overrides && typeof manipulation.overrides === 'object') {
                deepMerge(blockConfigBase, manipulation.overrides);
            }
        }
        if (block.overrides && typeof block.overrides === 'object') {
            deepMerge(blockConfigBase, block.overrides);
        }
        const trialPlanSource = selectedManipulations
            .slice()
            .reverse()
            .map((entry) => resolveManipulationTrialPlan(entry))
            .find((entry) => Boolean(entry)) ?? null;
        const variants = normalizeVariants(trialPlanSource?.variants);
        const schedule = asObject(trialPlanSource?.schedule) ?? null;
        const scheduledVariants = variants.length
            ? buildScheduledItems({
                items: variants,
                count: trials,
                schedule,
                weights: variants.map((variant) => Number(variant.weight ?? 1)),
                rng: { next: rng },
                resolveToken: (token) => {
                    if (Number.isInteger(token) && Number(token) >= 0 && Number(token) < variants.length) {
                        return variants[Number(token)];
                    }
                    if (typeof token === 'string') {
                        const key = token.trim();
                        if (key)
                            return variants.find((variant) => String(variant.id) === key) ?? null;
                    }
                    return null;
                },
            })
            : [];
        const trialConfigs = Array.from({ length: trials }, (_, trialIndex) => {
            const trialConfig = deepClone(blockConfigBase);
            const variant = scheduledVariants[trialIndex] ?? null;
            if (variant && variant.overrides && typeof variant.overrides === 'object') {
                deepMerge(trialConfig, variant.overrides);
            }
            if (!(trialConfig.trial && typeof trialConfig.trial === 'object' && !Array.isArray(trialConfig.trial))) {
                trialConfig.trial = {};
            }
            trialConfig.trial.planVariantId = (variant?.id ?? null);
            trialConfig.trial.planVariantLabel = (variant?.label ?? null);
            return trialConfig;
        });
        const blockScopedDrt = resolveBlockScopedDrtConfig(trialConfigs);
        const blockModules = deepClone(asObject(block.modules) ?? {});
        if (blockScopedDrt && blockScopedDrt.enabled && blockScopedDrt.scope === "block") {
            blockModules.drt = blockScopedDrt;
        }
        return {
            ...block,
            index,
            label,
            trials,
            manipulationId,
            phase,
            isPractice,
            beforeBlockScreens,
            afterBlockScreens,
            repeatAfterBlockScreens,
            ...(Object.keys(blockModules).length > 0
                ? { modules: blockModules }
                : {}),
            trialConfigs,
        };
    });
}
function resolveManipulationTrialPlan(manipulation) {
    return asObject(manipulation.trialPlan) ?? asObject(manipulation.trial_plan);
}
function buildBricksStimulusRows(blockPlan) {
    return blockPlan.flatMap((block) => block.trialConfigs.map((trialConfig, trialIndex) => {
        const trialNode = asObject(trialConfig.trial);
        const drt = resolveBricksDrtConfig(resolveScopedModuleConfig(trialConfig, "drt"));
        const planVariantId = typeof trialNode?.planVariantId === "string" ? trialNode.planVariantId : null;
        return {
            block_index: block.index,
            block_label: block.label,
            trial_index: trialIndex,
            manipulation_id: block.manipulationId,
            plan_variant_id: planVariantId,
            plan_variant_label: typeof trialNode?.planVariantLabel === "string" ? trialNode.planVariantLabel : null,
            trial_code: planVariantId ?? "default",
            drt_enabled: drt.enabled,
            drt_scope: drt.enabled ? drt.scope : null,
        };
    }));
}
function normalizeVariants(input) {
    if (!Array.isArray(input))
        return [];
    return input
        .map((entry, index) => {
        if (!entry || typeof entry !== 'object')
            return null;
        const variant = entry;
        const id = typeof variant.id === 'string' && variant.id.trim() ? variant.id.trim() : `variant_${index + 1}`;
        const label = typeof variant.label === 'string' && variant.label.trim() ? variant.label.trim() : id;
        const weightNum = Number(variant.weight ?? 1);
        return {
            ...variant,
            id,
            label,
            weight: Number.isFinite(weightNum) && weightNum > 0 ? weightNum : 1,
        };
    })
        .filter(Boolean);
}
function resolveBlockScopedDrtConfig(trialConfigs) {
    const blockScoped = trialConfigs
        .map((trialConfig) => resolveBricksDrtConfig(resolveScopedModuleConfig(trialConfig, "drt")))
        .filter((entry) => entry.enabled && entry.scope === "block");
    if (blockScoped.length === 0)
        return null;
    const canonical = JSON.stringify(blockScoped[0]);
    const hasMismatch = blockScoped.some((entry) => JSON.stringify(entry) !== canonical);
    if (hasMismatch) {
        console.warn("Bricks config includes mismatched block-scoped DRT settings within one block; using the first resolved config.");
    }
    return blockScoped[0];
}
function extractNumericStats(stats) {
    const out = {};
    for (const [key, value] of Object.entries(stats)) {
        const num = Number(value);
        if (Number.isFinite(num))
            out[key] = num;
    }
    return out;
}
function subtractStats(current, previous) {
    const keys = new Set([...Object.keys(current), ...Object.keys(previous)]);
    const out = {};
    for (const key of keys) {
        const curr = Number(current[key] ?? 0);
        const prev = Number(previous[key] ?? 0);
        const delta = curr - prev;
        out[key] = Number.isFinite(delta) ? Math.max(0, delta) : 0;
    }
    return out;
}
function summarizeBlockTrials(rows) {
    return rows.reduce((acc, row) => {
        const gameStats = (row.game?.stats ?? {});
        const drtStats = (row.drt?.stats ?? {});
        acc.cleared += Number(gameStats.cleared ?? 0);
        acc.dropped += Number(gameStats.dropped ?? 0);
        acc.hits += Number(drtStats.hits ?? 0);
        acc.misses += Number(drtStats.misses ?? 0);
        return acc;
    }, { cleared: 0, dropped: 0, hits: 0, misses: 0 });
}
function blockHasEnabledDrt(rows) {
    return rows.some((row) => {
        const drt = row?.drt;
        if (!drt || typeof drt !== 'object')
            return false;
        if (drt.enabled === true)
            return true;
        const presented = Number(drt.stats?.presented ?? 0);
        return Number.isFinite(presented) && presented > 0;
    });
}
function toPrimitiveCell(value) {
    if (value === null || value === undefined)
        return null;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
        return value;
    return JSON.stringify(value);
}
function flattenUnknown(value, prefix, out) {
    if (value === null || value === undefined) {
        out[prefix] = null;
        return;
    }
    if (Array.isArray(value)) {
        out[prefix] = JSON.stringify(value);
        return;
    }
    if (typeof value !== "object") {
        out[prefix] = toPrimitiveCell(value);
        return;
    }
    const entries = Object.entries(value);
    if (entries.length === 0) {
        out[prefix] = "{}";
        return;
    }
    for (const [key, nested] of entries) {
        const child = prefix ? `${prefix}_${String(key)}` : String(key);
        flattenUnknown(nested, child, out);
    }
}
function buildSpotlightLookup(row) {
    const timeline = Array.isArray(row.timeline_events) ? row.timeline_events : [];
    const sorted = timeline
        .map((entry) => ({
        time: Number(entry.time ?? entry.time_ms ?? 0),
        event: entry,
    }))
        .filter((entry) => Number.isFinite(entry.time))
        .sort((a, b) => a.time - b.time);
    const brickToConveyor = new Map();
    let spotlightBrickId = null;
    const checkpoints = [];
    for (const entry of sorted) {
        const event = entry.event;
        const type = String(event.type ?? "");
        if (type === "brick_spawned") {
            const brickId = typeof event.brick_id === "string" ? event.brick_id : null;
            const conveyorId = typeof event.conveyor_id === "string" ? event.conveyor_id : null;
            if (brickId)
                brickToConveyor.set(brickId, conveyorId);
        }
        if (type === "brick_focus_changed") {
            spotlightBrickId = typeof event.active_brick_id === "string" ? event.active_brick_id : null;
        }
        checkpoints.push({
            time: entry.time,
            spotlightBrickId,
            spotlightConveyorId: spotlightBrickId ? (brickToConveyor.get(spotlightBrickId) ?? null) : null,
        });
    }
    return {
        findSpotlightAtMs: (timeMs) => {
            if (checkpoints.length === 0)
                return { spotlightBrickId: null, spotlightConveyorId: null };
            let chosen = {
                spotlightBrickId: null,
                spotlightConveyorId: null,
            };
            for (const checkpoint of checkpoints) {
                if (checkpoint.time > timeMs)
                    break;
                chosen = {
                    spotlightBrickId: checkpoint.spotlightBrickId,
                    spotlightConveyorId: checkpoint.spotlightConveyorId,
                };
            }
            return chosen;
        },
    };
}
function buildBricksDrtRows(rows, blockPlan, ids) {
    const out = [];
    for (const row of rows) {
        const responseRows = Array.isArray(row.drt_response_rows)
            ? row.drt_response_rows
            : [];
        if (responseRows.length === 0)
            continue;
        const blockMeta = blockPlan[row.block_index];
        const spotlightLookup = buildSpotlightLookup(row);
        for (const responseRow of responseRows) {
            const response = (responseRow.response ?? {});
            const responseTimeMs = Number(response.time ?? response.rt_ms ?? 0);
            const spotlightAtResponse = spotlightLookup.findSpotlightAtMs(responseTimeMs);
            const flat = {
                participant_id: ids.participantId,
                variant_id: ids.variantId,
                bricks_trial_id: `B${row.block_index}_T${row.trial_index}`,
                block_index: row.block_index,
                block_label: row.block_label,
                block_phase: blockMeta?.phase ?? null,
                block_is_practice: blockMeta?.isPractice ?? null,
                manipulation_id: blockMeta?.manipulationId ?? null,
                trial_index: row.trial_index,
                trial_duration_ms: row.trial_duration_ms,
                trial_end_reason: row.end_reason,
                spotlight_brick_id: spotlightAtResponse.spotlightBrickId,
                spotlight_conveyor_id: spotlightAtResponse.spotlightConveyorId,
            };
            flattenUnknown(responseRow, "", flat);
            out.push(flat);
        }
    }
    if (out.length === 0)
        return out;
    const allColumns = new Set();
    out.forEach((entry) => Object.keys(entry).forEach((key) => allColumns.add(key)));
    const orderedColumns = Array.from(allColumns);
    return out.map((entry) => {
        const normalized = {};
        orderedColumns.forEach((key) => {
            normalized[key] = Object.prototype.hasOwnProperty.call(entry, key) ? entry[key] : null;
        });
        return normalized;
    });
}
async function runConfiguredTrialSurveys(container, trialConfig) {
    const surveys = resolvePostTrialSurveys(trialConfig);
    if (surveys.length === 0)
        return [];
    return runSurveySequence(container, surveys, "bricks-survey-submit");
}
function resolvePostTrialSurveys(trialConfig) {
    const candidates = collectSurveyEntries(trialConfig, {
        arrayKey: "postTrial",
        singletonKey: "survey",
    });
    if (candidates.length > 0) {
        return parseSurveyDefinitions(candidates);
    }
    const selfReport = asObject(trialConfig.selfReport);
    if (!selfReport || selfReport.enable !== true)
        return [];
    const prompt = typeof selfReport.prompt === 'string' && selfReport.prompt.trim()
        ? selfReport.prompt.trim()
        : undefined;
    return [
        createAtwitSurvey({
            id: "atwit",
            prompt,
        }),
    ];
}
function withSurveyResults(trialData, surveys) {
    const merged = attachSurveyResults(trialData, surveys);
    const atwitOverall = findFirstSurveyScore(surveys, "overall");
    if (atwitOverall !== null) {
        merged.self_report = { workload: atwitOverall };
    }
    return merged;
}
function collectSurveySummaries(row) {
    const surveys = (row.surveys ?? []);
    return {
        atwitOverall: findFirstSurveyScore(surveys, "overall"),
        nasaRawTlx: findFirstSurveyScore(surveys, "raw_tlx"),
    };
}
//# sourceMappingURL=index.js.map