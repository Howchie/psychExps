import { buildScheduledItems, createAtwitSurvey, createMulberry32, createSurveyFromPreset, DrtController, createEventLogger, deepClone, deepMerge, createManipulationPoolAllocator, resolveBlockManipulationIds, escapeHtml, finalizeTaskRun, hashSeed, TaskModuleRunner, renderCenteredNotice, runTaskSession, runSurvey, waitForContinue, } from '@experiments/core';
import { resolveBricksDrtConfig } from './runtime/drtConfig.js';
import { runConveyorTrial, } from './runtime/runConveyorTrial.js';
class BricksTaskAdapter {
    manifest = {
        taskId: 'bricks',
        label: 'Bricks (DiscoveryProject)',
        variants: [
            { id: 'baseline', label: 'Moray Baseline', configPath: 'bricks/baseline' },
            { id: 'moray1991', label: 'Moray 1991 VPT+VDD', configPath: 'bricks/moray1991' },
            { id: 'spotlight', label: 'Spotlight + DRT', configPath: 'bricks/spotlight' },
            { id: 'drt_block_demo', label: 'DRT Block Scope Demo', configPath: 'bricks/drt_block_demo' },
        ],
    };
    context = null;
    runner = new TaskModuleRunner([]);
    async initialize(context) {
        this.context = context;
    }
    async execute() {
        if (!this.context)
            throw new Error("Bricks Task not initialized");
        const result = await runBricksTask(this.context, this.runner);
        return result;
    }
    async terminate() {
        this.runner.stopAll();
    }
}
export const bricksAdapter = new BricksTaskAdapter();
async function runBricksTask(context, runner) {
    const config = context.taskConfig;
    const root = context.container;
    root.style.maxWidth = '1200px';
    root.style.margin = '0 auto';
    const rng = createMulberry32(hashSeed(context.selection.participant.participantId, context.selection.participant.sessionId, context.selection.variantId));
    const blockPlan = buildBlockPlan(config, rng, context.selection);
    const records = [];
    const eventLogger = createEventLogger(context.selection);
    const activeDrtScopes = new Map();
    const blockScopeIds = new Map();
    const blockDrtPreviousStats = new Map();
    runner.setOptions({
        onEvent: (event) => {
            const address = event.address;
            const active = activeDrtScopes.get(address ? `B${address.blockIndex}${address.trialIndex !== null ? `T${address.trialIndex}` : ""}` : "");
            if (event.type === "bricks_drt" || event.type.startsWith("drt_")) {
                active?.bindings?.onEvent(event);
            }
            eventLogger.emit(event.type, event, {
                blockIndex: address?.blockIndex ?? -1,
                ...(typeof address?.trialIndex === "number" ? { trialIndex: address.trialIndex } : {}),
            });
        }
    });
    const toConveyorDrtRuntime = (scopeId, trialIndex) => {
        const active = activeDrtScopes.get(scopeId);
        if (!active)
            return null;
        return {
            config: active.config,
            controller: active.controller,
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
    };
    const startDrtScope = (drtConfig, scope, blockIndex, trialIndex) => {
        const scopeId = `B${blockIndex}${trialIndex !== null ? `T${trialIndex}` : ""}`;
        const activeScope = {
            scopeId,
            config: drtConfig,
            controller: null,
            bindings: null,
            activeTrialIndex: trialIndex,
        };
        runner.start({
            module: DrtController.asTaskModule({
                ...drtConfig,
                seed: hashSeed(context.selection.participant.participantId, context.selection.participant.sessionId, context.selection.variantId, "bricks_drt", scopeId),
                onControllerCreated: (controller) => {
                    activeScope.controller = controller;
                }
            }),
            address: { scope, blockIndex, trialIndex },
            config: drtConfig,
            context: {
                displayElement: root,
                borderTargetElement: root,
                borderTargetRect: () => activeScope.bindings?.displayElement?.getBoundingClientRect() ?? null,
            }
        });
        activeDrtScopes.set(scopeId, activeScope);
        return scopeId;
    };
    eventLogger.emit('task_start', { task: 'bricks' });
    await waitForContinue(root, `<h2>${escapeHtml(String(config.task?.title ?? 'Bricks Task'))}</h2><p>Participant: <code>${escapeHtml(context.selection.participant.participantId)}</code></p>`, { buttonId: "bricks-continue-btn-start" });
    await runTaskSession({
        blocks: blockPlan,
        getTrials: ({ block }) => block.trialConfigs,
        runTrial: async ({ block, blockIndex, trial, trialIndex }) => {
            const resolvedDrtConfig = resolveBricksDrtConfig((trial.drt || {}));
            let trialScopeAddress = null;
            let injectedDrtRuntime;
            if (resolvedDrtConfig.enabled) {
                if (resolvedDrtConfig.scope === "trial") {
                    trialScopeAddress = { scope: "trial", blockIndex, trialIndex };
                    const scopeId = startDrtScope(resolvedDrtConfig, "trial", blockIndex, trialIndex);
                    injectedDrtRuntime = toConveyorDrtRuntime(scopeId, trialIndex) ?? undefined;
                }
                else {
                    const blockScopeId = blockScopeIds.get(blockIndex) ?? null;
                    if (blockScopeId) {
                        injectedDrtRuntime = toConveyorDrtRuntime(blockScopeId, trialIndex) ?? undefined;
                    }
                }
            }
            const stageHost = document.createElement('div');
            stageHost.style.width = '100%';
            stageHost.style.minHeight = '70vh';
            stageHost.style.display = 'flex';
            stageHost.style.justifyContent = 'center';
            stageHost.style.alignItems = 'center';
            root.innerHTML = '';
            root.appendChild(stageHost);
            let record;
            try {
                record = await runConveyorTrial({
                    displayElement: stageHost,
                    blockLabel: block.label,
                    blockIndex: block.index,
                    trialIndex,
                    config: trial,
                    drtRuntime: injectedDrtRuntime,
                });
            }
            finally {
                if (trialScopeAddress) {
                    const stopped = runner.stop(trialScopeAddress);
                    if (stopped) {
                        const scopeId = `B${blockIndex}T${trialIndex}`;
                        activeDrtScopes.delete(scopeId);
                        const snapshot = stopped.data; // TaskModuleRunner results.data is the DrtData
                        record = {
                            ...record,
                            drt: snapshot,
                            drt_transforms: stopped.transforms,
                            drt_response_rows: stopped.responseRows,
                        };
                    }
                }
            }
            if (resolvedDrtConfig.enabled && resolvedDrtConfig.scope === "block") {
                const previousStats = blockDrtPreviousStats.get(blockIndex) ?? {};
                const currentStats = extractNumericStats((record.drt?.stats ?? {}));
                const deltaStats = subtractStats(currentStats, previousStats);
                record.drt_cumulative = record.drt;
                record.drt = {
                    ...(record.drt ?? {}),
                    stats: deltaStats,
                };
                blockDrtPreviousStats.set(blockIndex, currentStats);
            }
            const surveyResults = await runConfiguredTrialSurveys(root, trial);
            record = withSurveyResults(record, surveyResults);
            records.push(record);
            eventLogger.emit('trial_complete', {
                endReason: record.end_reason,
                trialDurationMs: record.trial_duration_ms,
                game: record.game?.stats ?? {},
                drt: record.drt?.stats ?? {},
                surveys: surveyResults.map((entry) => ({
                    surveyId: entry.surveyId,
                    scores: entry.scores ?? {},
                })),
            }, { blockIndex, trialIndex });
            return record;
        },
        hooks: {
            onBlockStart: async ({ block, blockIndex }) => {
                eventLogger.emit('block_start', { label: block.label, manipulationId: block.manipulationId }, { blockIndex });
                await waitForContinue(root, `<h3>${escapeHtml(block.label)}</h3><p>Manipulation: <code>${escapeHtml(block.manipulationId ?? 'none')}</code></p><p>Trials: ${block.trials}</p>`, { buttonId: `bricks-continue-btn-block-${block.index}` });
                const blockScopedDrt = resolveBlockScopedDrtConfig(block.trialConfigs);
                if (blockScopedDrt && blockScopedDrt.enabled && blockScopedDrt.scope === "block") {
                    const scopeId = startDrtScope(blockScopedDrt, "block", blockIndex, null);
                    blockScopeIds.set(blockIndex, scopeId);
                    blockDrtPreviousStats.delete(blockIndex);
                }
            },
            onBlockEnd: async ({ block, blockIndex, trialResults }) => {
                const blockScopeAddress = { scope: "block", blockIndex, trialIndex: null };
                runner.stop(blockScopeAddress);
                const scopeId = `B${blockIndex}`;
                activeDrtScopes.delete(scopeId);
                blockScopeIds.delete(blockIndex);
                blockDrtPreviousStats.delete(blockIndex);
                const totals = summarizeBlockTrials(trialResults);
                eventLogger.emit('block_end', { label: block.label, totals }, { blockIndex });
                const showDrtSummary = blockHasEnabledDrt(trialResults);
                const drtSummary = showDrtSummary
                    ? `<li>DRT hits: ${totals.hits}</li><li>DRT misses: ${totals.misses}</li>`
                    : '';
                await waitForContinue(root, `<h3>End of ${escapeHtml(block.label)}</h3><ul><li>Bricks cleared: ${totals.cleared}</li><li>Bricks dropped: ${totals.dropped}</li>${drtSummary}</ul>`, { buttonId: `bricks-continue-btn-end-${block.index}` });
            },
        },
    });
    eventLogger.emit('task_complete', { task: 'bricks', nTrials: records.length });
    const payload = {
        selection: context.selection,
        records,
        events: eventLogger.events,
        drtScopes: runner.getResults().map((res) => ({
            address: res.address ?? { scope: res.scope, blockIndex: res.blockIndex, trialIndex: res.trialIndex },
            data: res.data,
            transforms: res.data?.transforms,
            responseRows: res.data?.responseRows,
        }))
    };
    await finalizeTaskRun({
        coreConfig: context.coreConfig,
        selection: context.selection,
        payload,
        csv: { contents: recordsToCsv(records), suffix: "bricks" },
        completionStatus: "complete",
    });
    root.innerHTML = renderCenteredNotice({
        title: "Bricks complete",
        message: "Data saved locally.",
    });
    return payload;
}
function buildBlockPlan(config, rng, selection) {
    const blocks = Array.isArray(config.blocks)
        ? config.blocks
        : [];
    const manipulations = Array.isArray(config.manipulations) ? config.manipulations : [];
    const manipulationById = new Map();
    for (const manipulation of manipulations) {
        const id = typeof manipulation.id === 'string' ? manipulation.id.trim() : '';
        if (id)
            manipulationById.set(id, manipulation);
    }
    const poolAllocator = createManipulationPoolAllocator(config.manipulationPools, [
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
        const trialsRaw = Number(block.trials ?? 1);
        const trials = Number.isFinite(trialsRaw) ? Math.max(1, Math.floor(trialsRaw)) : 1;
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
            .find((entry) => typeof entry?.trialPlan === "object" && entry?.trialPlan !== null) ?? null;
        const variants = normalizeVariants(trialPlanSource?.trialPlan?.variants);
        const schedule = trialPlanSource?.trialPlan?.schedule;
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
        return { index, label, trials, manipulationId, trialConfigs };
    });
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
        .map((trialConfig) => resolveBricksDrtConfig((trialConfig.drt || {})))
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
function recordsToCsv(rows) {
    const header = [
        'block_label',
        'block_index',
        'trial_index',
        'trial_duration_ms',
        'end_reason',
        'cleared',
        'dropped',
        'spawned',
        'drt_hits',
        'drt_misses',
        'atwit_overall',
        'nasa_raw_tlx',
    ];
    const lines = [header.join(',')];
    for (const row of rows) {
        const gameStats = (row.game?.stats ?? {});
        const drtStats = (row.drt?.stats ?? {});
        const surveySummaries = collectSurveySummaries(row);
        lines.push([
            row.block_label,
            row.block_index,
            row.trial_index,
            row.trial_duration_ms,
            row.end_reason,
            Number(gameStats.cleared ?? 0),
            Number(gameStats.dropped ?? 0),
            Number(gameStats.spawned ?? 0),
            Number(drtStats.hits ?? 0),
            Number(drtStats.misses ?? 0),
            surveySummaries.atwitOverall ?? '',
            surveySummaries.nasaRawTlx ?? '',
        ]
            .map(csvCell)
            .join(','));
    }
    return lines.join('\n');
}
function csvCell(value) {
    const text = String(value ?? '');
    if (!/[",\n]/.test(text))
        return text;
    return `"${text.replace(/"/g, '""')}"`;
}
function runConfiguredTrialSurveys(container, trialConfig) {
    const surveys = resolvePostTrialSurveys(trialConfig);
    if (surveys.length === 0)
        return Promise.resolve([]);
    return surveys.reduce(async (pending, survey, index) => {
        const acc = await pending;
        const result = await runSurvey(container, survey, {
            buttonId: `bricks-survey-submit-${index + 1}`,
        });
        acc.push(result);
        return acc;
    }, Promise.resolve([]));
}
function resolvePostTrialSurveys(trialConfig) {
    const candidates = collectModernSurveyCandidates(trialConfig);
    if (candidates.length > 0) {
        return candidates
            .map((entry, index) => toSurveyDefinition(entry, index))
            .filter((entry) => Boolean(entry));
    }
    const selfReport = trialConfig.selfReport;
    if (!isRecord(selfReport) || selfReport.enable !== true)
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
function collectModernSurveyCandidates(trialConfig) {
    const output = [];
    const surveysNode = trialConfig.surveys;
    if (Array.isArray(surveysNode)) {
        output.push(...surveysNode);
    }
    else if (isRecord(surveysNode)) {
        if (Array.isArray(surveysNode.postTrial))
            output.push(...surveysNode.postTrial);
    }
    const singleSurvey = trialConfig.survey;
    if (singleSurvey !== undefined && singleSurvey !== null) {
        output.unshift(singleSurvey);
    }
    return output;
}
function toSurveyDefinition(entry, index) {
    if (!isRecord(entry))
        return null;
    if (isSurveyDefinitionLike(entry)) {
        const normalizedId = typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : `survey_${index + 1}`;
        const questions = Array.isArray(entry.questions) ? entry.questions : [];
        if (questions.length === 0)
            return null;
        return {
            id: normalizedId,
            title: typeof entry.title === 'string' ? entry.title : undefined,
            description: typeof entry.description === 'string' ? entry.description : undefined,
            questions,
            submitLabel: typeof entry.submitLabel === 'string' ? entry.submitLabel : undefined,
            computeScores: typeof entry.computeScores === 'function'
                ? entry.computeScores
                : undefined,
        };
    }
    const preset = entry.preset;
    if (preset === "atwit" || preset === "nasa_tlx") {
        return createSurveyFromPreset(entry);
    }
    return null;
}
function isSurveyDefinitionLike(entry) {
    return Array.isArray(entry.questions);
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function withSurveyResults(trialData, surveys) {
    if (surveys.length === 0)
        return trialData;
    const next = {
        ...trialData,
        surveys,
    };
    const atwitOverall = surveys
        .map((entry) => entry.scores?.overall)
        .find((value) => typeof value === 'number' && Number.isFinite(value));
    if (atwitOverall !== undefined) {
        next.self_report = { workload: atwitOverall };
    }
    return next;
}
function collectSurveySummaries(row) {
    const surveys = (row.surveys ?? []);
    if (!Array.isArray(surveys) || surveys.length === 0) {
        return { atwitOverall: null, nasaRawTlx: null };
    }
    const atwitOverall = surveys
        .map((entry) => entry.scores?.overall)
        .find((value) => typeof value === 'number' && Number.isFinite(value)) ?? null;
    const nasaRawTlx = surveys
        .map((entry) => entry.scores?.raw_tlx)
        .find((value) => typeof value === 'number' && Number.isFinite(value)) ?? null;
    return { atwitOverall, nasaRawTlx };
}
//# sourceMappingURL=index.js.map