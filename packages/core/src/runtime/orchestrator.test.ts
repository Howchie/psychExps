/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskOrchestrator } from './orchestrator';
import { TaskModuleRunner } from '../api/taskModule';
import * as taskUiFlow from '../web/taskUiFlow';
import { InstructionFlowExitRequestedError } from '../web/instructionFlow';

vi.mock('../web/taskUiFlow', () => ({
  runTaskIntroFlow: vi.fn().mockResolvedValue(undefined),
  runBlockStartFlow: vi.fn().mockResolvedValue(undefined),
  runBlockEndFlow: vi.fn().mockResolvedValue(undefined),
  runTaskEndFlow: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../web/lifecycle', () => ({
  finalizeTaskRun: vi.fn().mockResolvedValue({ submittedToJatos: true, redirected: false }),
}));

describe('TaskOrchestrator', () => {
  let container: HTMLElement;
  let mockModuleRunner: TaskModuleRunner;
  let mockContext: any;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    mockModuleRunner = new TaskModuleRunner([]);
    vi.spyOn(mockModuleRunner, 'startScopedModules');
    vi.spyOn(mockModuleRunner, 'stopScopedModules');
    vi.spyOn(mockModuleRunner, 'initialize');
    vi.spyOn(mockModuleRunner, 'terminate');

    mockContext = {
      container,
      selection: {
        participant: { participantId: 'p1', sessionId: 's1' },
        variantId: 'v1'
      },
      coreConfig: {},
      taskConfig: {
        task: { title: 'Test Task' },
        instructions: { introPages: ['Intro 1'] },
        plan: {
          blocks: [
            { label: 'Block 1', trials: 2 }
          ]
        }
      },
      rawTaskConfig: {},
      resolver: {
        resolveInValue: vi.fn().mockImplementation((val) => val)
      },
      moduleRunner: mockModuleRunner
    };
  });

  it('should run the full lifecycle', async () => {
    const orchestrator = new TaskOrchestrator(mockContext);
    
    // We'll need to mock runTrial
    const runTrial = vi.fn().mockResolvedValue({ score: 1 });
    
    await orchestrator.run({
      getBlocks: (config: any) => config.plan.blocks,
      getTrials: ({ block }: any) => Array.from({ length: block.trials }, (_, i) => ({ id: i })),
      runTrial,
      buttonIdPrefix: 'test'
    });

    expect(runTrial).toHaveBeenCalledTimes(2);
    expect(mockModuleRunner.startScopedModules).toHaveBeenCalled();
    expect(mockModuleRunner.stopScopedModules).toHaveBeenCalled();
  });

  it('should handle no blocks gracefully', async () => {
    mockContext.taskConfig.plan.blocks = [];
    const orchestrator = new TaskOrchestrator(mockContext);
    const runTrial = vi.fn();
    
    await orchestrator.run({
      getBlocks: (config: any) => config.plan.blocks,
      getTrials: () => [],
      runTrial,
      buttonIdPrefix: 'test'
    });

    expect(runTrial).not.toHaveBeenCalled();
  });

  it('should handle no intro pages gracefully', async () => {
    mockContext.taskConfig.instructions.introPages = [];
    const orchestrator = new TaskOrchestrator(mockContext);
    const runTrial = vi.fn().mockResolvedValue({});
    
    await orchestrator.run({
      getBlocks: (config: any) => config.plan.blocks,
      getTrials: ({ block }: any) => Array.from({ length: block.trials }, (_, i) => ({ id: i })),
      runTrial,
      buttonIdPrefix: 'test'
    });

    expect(runTrial).toHaveBeenCalledTimes(2);
  });

  it('should run staircase phase before main session when enabled', async () => {
    mockContext.taskConfig.staircase = { enabled: true };
    const orchestrator = new TaskOrchestrator(mockContext);
    const staircaseRun = vi.fn().mockResolvedValue(undefined);
    const runTrial = vi.fn().mockResolvedValue({});

    await orchestrator.run({
      getBlocks: (config: any) => config.plan.blocks,
      getTrials: ({ block }: any) => Array.from({ length: block.trials }, (_, i) => ({ id: i })),
      runTrial,
      buttonIdPrefix: 'test',
      staircase: {
        run: staircaseRun,
      },
    });

    expect(staircaseRun).toHaveBeenCalledTimes(1);
    const staircaseOrder = (staircaseRun as any).mock.invocationCallOrder[0];
    const trialOrder = (runTrial as any).mock.invocationCallOrder[0];
    expect(staircaseOrder).toBeLessThan(trialOrder);
  });

  it('should skip staircase phase when disabled in config', async () => {
    mockContext.taskConfig.staircase = { enabled: false };
    const orchestrator = new TaskOrchestrator(mockContext);
    const staircaseRun = vi.fn().mockResolvedValue(undefined);
    const runTrial = vi.fn().mockResolvedValue({});

    await orchestrator.run({
      getBlocks: (config: any) => config.plan.blocks,
      getTrials: ({ block }: any) => Array.from({ length: block.trials }, (_, i) => ({ id: i })),
      runTrial,
      buttonIdPrefix: 'test',
      staircase: {
        run: staircaseRun,
      },
    });

    expect(staircaseRun).not.toHaveBeenCalled();
    expect(runTrial).toHaveBeenCalledTimes(2);
  });

  it('should skip staircase phase unless explicitly enabled', async () => {
    mockContext.taskConfig.staircase = {};
    const orchestrator = new TaskOrchestrator(mockContext);
    const staircaseRun = vi.fn().mockResolvedValue(undefined);
    const runTrial = vi.fn().mockResolvedValue({});

    await orchestrator.run({
      getBlocks: (config: any) => config.plan.blocks,
      getTrials: ({ block }: any) => Array.from({ length: block.trials }, (_, i) => ({ id: i })),
      runTrial,
      buttonIdPrefix: 'test',
      staircase: {
        run: staircaseRun,
      },
    });

    expect(staircaseRun).not.toHaveBeenCalled();
    expect(runTrial).toHaveBeenCalledTimes(2);
  });

  it('should allow filtering auto-started modules by scope/name', async () => {
    mockContext.rawTaskConfig = {
      task: {
        modules: {
          drt: { enabled: true },
          pm: { enabled: true },
        },
      },
    };
    const orchestrator = new TaskOrchestrator(mockContext);
    const runTrial = vi.fn().mockResolvedValue({});

    await orchestrator.run({
      getBlocks: (config: any) => config.plan.blocks,
      getTrials: ({ block }: any) => Array.from({ length: block.trials }, (_, i) => ({ id: i })),
      runTrial,
      buttonIdPrefix: 'test',
      shouldAutoStartModule: ({ moduleName }) => moduleName !== 'drt',
    });

    const calls = (mockModuleRunner.startScopedModules as any).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call[0].moduleConfigs).toEqual({ pm: { enabled: true } });
    }
  });

  it('should merge task/block/trial module configs for scoped auto-start', async () => {
    mockContext.rawTaskConfig = {
      task: {
        modules: {
          drt: { enabled: true, scope: 'block', stimMode: 'visual' },
        },
      },
    };
    mockContext.taskConfig.plan.blocks = [
      {
        label: 'Block 1',
        trials: [{ id: 0, modules: { drt: { scope: 'trial', stimMode: 'border' } } }],
        modules: { drt: { key: 'space' } },
      },
    ];
    const orchestrator = new TaskOrchestrator(mockContext);
    const runTrial = vi.fn().mockResolvedValue({});

    await orchestrator.run({
      getBlocks: (config: any) => config.plan.blocks,
      getTrials: ({ block }: any) => block.trials,
      runTrial,
      buttonIdPrefix: 'test',
    });

    const calls = (mockModuleRunner.startScopedModules as any).mock.calls;
    const blockCall = calls.find((call: any[]) => call[0].scope === 'block');
    const trialCall = calls.find((call: any[]) => call[0].scope === 'trial');
    expect(blockCall?.[0]?.moduleConfigs?.drt).toEqual({
      enabled: true,
      scope: 'block',
      stimMode: 'visual',
      key: 'space',
    });
    expect(trialCall?.[0]?.moduleConfigs?.drt).toEqual({
      enabled: true,
      scope: 'trial',
      stimMode: 'border',
      key: 'space',
    });
  });

  it('should route instruction insertions to task and block flows', async () => {
    mockContext.taskConfig.instructions = {
      introPages: ['Intro 1'],
      endPages: ['End 1'],
      insertions: [
        { at: 'task_intro_before', pages: ['Before Intro'] },
        { at: 'task_intro_after', pages: ['After Intro'] },
        { at: 'block_start_before_intro', pages: ['Before Block Intro'], when: { blockIndex: [0] } },
        { at: 'block_start_after_intro', pages: ['After Block Intro'], when: { blockType: ['main'] } },
        { at: 'block_start_after_pre', pages: ['After Pre'], when: { isPractice: false } },
        { at: 'block_end_before_post', pages: ['Before Post'] },
        { at: 'block_end_after_post', pages: ['After Post'] },
        { at: 'task_end_before', pages: ['Before End'] },
        { at: 'task_end_after', pages: ['After End'] },
      ],
    };
    mockContext.taskConfig.plan.blocks = [{ label: 'Block 1', blockType: 'main', isPractice: false, trials: 1 }];
    const orchestrator = new TaskOrchestrator(mockContext);
    const runTrial = vi.fn().mockResolvedValue({});

    await orchestrator.run({
      getBlocks: (config: any) => config.plan.blocks,
      getTrials: ({ block }: any) => Array.from({ length: block.trials }, (_, i) => ({ id: i })),
      runTrial,
      buttonIdPrefix: 'test'
    });

    expect(taskUiFlow.runTaskIntroFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        beforeIntroPages: [[{ text: 'Before Intro' }]],
        afterIntroPages: [[{ text: 'After Intro' }]],
      }),
    );
    expect(taskUiFlow.runBlockStartFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        beforeIntroInsertions: [[{ text: 'Before Block Intro' }]],
        afterIntroInsertions: [[{ text: 'After Block Intro' }]],
        afterPreInsertions: [[{ text: 'After Pre' }]],
      }),
    );
    expect(taskUiFlow.runBlockEndFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        beforePostInsertions: [[{ text: 'Before Post' }]],
        afterPostInsertions: [[{ text: 'After Post' }]],
      }),
    );
    expect(taskUiFlow.runTaskEndFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        beforeEndPages: [[{ text: 'Before End' }]],
        afterEndPages: [[{ text: 'After End' }]],
      }),
    );
  });

  it('should derive block UI defaults from instructions without getBlockUi', async () => {
    mockContext.taskConfig.instructions = {
      introPages: ['Intro 1'],
      preBlockPages: ['Global pre'],
      postBlockPages: ['Global post'],
      blockIntroTemplate: 'Level {nLevel} - {blockLabel} ({nTrials})',
      showBlockLabel: false,
      preBlockBeforeBlockIntro: true,
    };
    mockContext.taskConfig.plan.blocks = [
      {
        label: 'Block A',
        nLevel: 2,
        trials: 2,
        beforeBlockScreens: ['Block pre'],
        afterBlockScreens: ['Block post'],
      },
    ];
    const orchestrator = new TaskOrchestrator(mockContext);
    const runTrial = vi.fn().mockResolvedValue({});

    await orchestrator.run({
      getBlocks: (config: any) => config.plan.blocks,
      getTrials: ({ block }: any) => Array.from({ length: block.trials }, (_, i) => ({ id: i })),
      runTrial,
      buttonIdPrefix: 'test',
    });

    expect(taskUiFlow.runBlockStartFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        introText: 'Level 2 - Block A (2)',
        preBlockPages: [{ text: 'Global pre' }, { text: 'Block pre' }],
        showBlockLabel: false,
        preBlockBeforeIntro: true,
      }),
    );
    expect(taskUiFlow.runBlockEndFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        postBlockPages: [{ text: 'Global post' }, { text: 'Block post' }],
      }),
    );
  });

  it('should resolve insertion pages with block-local vars at render time', async () => {
    mockContext.resolver.resolveInValue = vi.fn().mockImplementation((value: any, ctx?: any) => {
      const locals = ctx?.locals ?? {};
      const walk = (v: any): any => {
        if (Array.isArray(v)) return v.map(walk);
        if (v && typeof v === 'object') {
          return Object.fromEntries(Object.entries(v).map(([k, val]) => [k, walk(val)]));
        }
        if (typeof v === 'string') {
          return v.replace(/\$\{(var|local)\.([A-Za-z0-9_]+)\}/g, (_m, _ns, key) => String(locals[key] ?? _m));
        }
        return v;
      };
      return walk(value);
    });
    mockContext.taskConfig.instructions = {
      insertions: [
        { at: 'block_start_before_intro', pages: ['pm=${var.pmEnabled} / local=${local.pmEnabled}'] },
      ],
    };
    mockContext.taskConfig.plan.blocks = [
      { label: 'Block 1', blockType: 'main', isPractice: false, trials: 1, variables: { pmEnabled: true } },
    ];
    const orchestrator = new TaskOrchestrator(mockContext);
    const runTrial = vi.fn().mockResolvedValue({});

    await orchestrator.run({
      getBlocks: (config: any) => config.plan.blocks,
      getTrials: ({ block }: any) => Array.from({ length: block.trials }, (_, i) => ({ id: i })),
      runTrial,
      buttonIdPrefix: 'test',
    });

    expect(taskUiFlow.runBlockStartFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        beforeIntroInsertions: [[{ text: 'pm=true / local=true' }]],
      }),
    );
  });

  it('should preserve html insertion page objects', async () => {
    mockContext.taskConfig.instructions = {
      insertions: [
        {
          at: 'task_intro_before',
          pages: [{ title: 'Consent', html: '<iframe src="/assets/pm-words/consent.html"></iframe>' }],
        },
      ],
    };
    const orchestrator = new TaskOrchestrator(mockContext);
    const runTrial = vi.fn().mockResolvedValue({});

    await orchestrator.run({
      getBlocks: (config: any) => config.plan.blocks,
      getTrials: ({ block }: any) => Array.from({ length: block.trials }, (_, i) => ({ id: i })),
      runTrial,
      buttonIdPrefix: 'test',
    });

    expect(taskUiFlow.runTaskIntroFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        beforeIntroPages: [[{ title: 'Consent', html: '<iframe src="/assets/pm-words/consent.html"></iframe>' }]],
      }),
    );
  });

  it('should abort run when instruction flow requests exit', async () => {
    (taskUiFlow.runTaskIntroFlow as any).mockRejectedValueOnce(new InstructionFlowExitRequestedError());
    mockContext.taskConfig.instructions = {
      insertions: [
        {
          at: 'task_intro_before',
          pages: [{ title: 'Consent', html: '<p>Consent</p>' }],
        },
      ],
    };
    const orchestrator = new TaskOrchestrator(mockContext);
    const runTrial = vi.fn().mockResolvedValue({});

    const result = await orchestrator.run({
      getBlocks: (config: any) => config.plan.blocks,
      getTrials: ({ block }: any) => Array.from({ length: block.trials }, (_, i) => ({ id: i })),
      runTrial,
      buttonIdPrefix: 'test',
    });

    expect(runTrial).not.toHaveBeenCalled();
    expect((result as any).aborted).toBe(true);
  });

  it('should inject block summary screen from instructions.blockSummary', async () => {
    mockContext.taskConfig.instructions = {
      blockSummary: {
        enabled: true,
        at: 'before_post',
        title: 'End of {blockLabel}',
        lines: ['Accuracy: {accuracyPct}% ({correct}/{total})'],
        metrics: { correctField: 'correct', rtField: 'rt' },
      },
    };
    mockContext.taskConfig.plan.blocks = [{ label: 'Block 1', blockType: 'main', isPractice: false, trials: 2 }];
    const orchestrator = new TaskOrchestrator(mockContext);
    const runTrial = vi
      .fn()
      .mockResolvedValueOnce({ correct: 1, rt: 500 })
      .mockResolvedValueOnce({ correct: 0, rt: 700 });

    await orchestrator.run({
      getBlocks: (config: any) => config.plan.blocks,
      getTrials: ({ block }: any) => Array.from({ length: block.trials }, (_, i) => ({ id: i })),
      runTrial,
      buttonIdPrefix: 'test',
    });

    expect(taskUiFlow.runBlockEndFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        beforePostInsertions: expect.arrayContaining([
          expect.arrayContaining([{ text: 'End of Block 1\nAccuracy: 50.0% (1/2)' }]),
        ]),
      }),
    );
  });

  it('should support block-level summary override and row filtering', async () => {
    mockContext.taskConfig.instructions = {
      blockSummary: {
        enabled: true,
        at: 'before_post',
        title: 'End of {blockLabel}',
        lines: ['All-trial accuracy: {accuracyPct}% ({correct}/{total})'],
        metrics: { correctField: 'responseCorrect', rtField: 'responseRtMs' },
      },
    };
    mockContext.taskConfig.plan.blocks = [
      {
        label: 'Practice 1',
        blockType: 'practice',
        isPractice: true,
        trials: 3,
        blockSummary: {
          when: { isPractice: true },
          where: { trialType: ['N'] },
          lines: ['Target accuracy: {accuracyPct}% ({correct}/{total})'],
        },
      },
    ];
    const orchestrator = new TaskOrchestrator(mockContext);
    const runTrial = vi
      .fn()
      .mockResolvedValueOnce({ trialType: 'N', responseCorrect: 1, responseRtMs: 400 })
      .mockResolvedValueOnce({ trialType: 'F', responseCorrect: 1, responseRtMs: 450 })
      .mockResolvedValueOnce({ trialType: 'N', responseCorrect: 0, responseRtMs: 700 });

    await orchestrator.run({
      getBlocks: (config: any) => config.plan.blocks,
      getTrials: ({ block }: any) => Array.from({ length: block.trials }, (_, i) => ({ id: i })),
      runTrial,
      buttonIdPrefix: 'test',
    });

    expect(taskUiFlow.runBlockEndFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        beforePostInsertions: expect.arrayContaining([
          expect.arrayContaining([{ text: 'End of Practice 1\nTarget accuracy: 50.0% (1/2)' }]),
        ]),
      }),
    );
  });

  it('should emit session events and trial results to a custom data sink', async () => {
    const orchestrator = new TaskOrchestrator(mockContext);
    const runTrial = vi.fn().mockResolvedValue({ score: 1 });
    const dataSink = {
      onTaskStart: vi.fn(),
      onSessionEvent: vi.fn(),
      onTrialResult: vi.fn(),
      onTaskEnd: vi.fn(),
      getStatus: vi.fn().mockReturnValue({ jatosStreamingUsed: false, jatosStreamingFailed: false }),
    };

    await orchestrator.run({
      getBlocks: (config: any) => config.plan.blocks,
      getTrials: ({ block }: any) => Array.from({ length: block.trials }, (_, i) => ({ id: i })),
      runTrial,
      buttonIdPrefix: 'test',
      dataSink,
    });

    expect(dataSink.onTaskStart).toHaveBeenCalledTimes(1);
    expect(dataSink.onSessionEvent).toHaveBeenCalled();
    expect(dataSink.onTrialResult).toHaveBeenCalledTimes(2);
    expect(dataSink.onTaskEnd).toHaveBeenCalledTimes(1);
  });

  it('should repeat a block until threshold is met or maxAttempts is reached', async () => {
    mockContext.taskConfig.plan.blocks = [
      {
        label: 'Practice 1',
        trials: 1,
        repeatUntil: {
          enabled: true,
          maxAttempts: 3,
          minAccuracy: 1,
          metrics: { correctField: 'responseCorrect' },
        },
      },
    ];
    const orchestrator = new TaskOrchestrator(mockContext);
    const runTrial = vi
      .fn()
      .mockResolvedValueOnce({ responseCorrect: 0 })
      .mockResolvedValueOnce({ responseCorrect: 1 });

    await orchestrator.run({
      getBlocks: (config: any) => config.plan.blocks,
      getTrials: ({ block }: any) => Array.from({ length: block.trials }, (_, i) => ({ id: i })),
      runTrial,
      buttonIdPrefix: 'test',
    });

    expect(runTrial).toHaveBeenCalledTimes(2);
    expect(taskUiFlow.runBlockStartFlow).toHaveBeenCalledTimes(2);
    expect(taskUiFlow.runBlockEndFlow).toHaveBeenCalledTimes(2);
  });

  it('should use repeat post-block pages on retries and regular post-block pages on final attempt', async () => {
    mockContext.taskConfig.plan.blocks = [
      {
        label: 'Practice 1',
        trials: 1,
        afterBlockScreens: ['Regular end page'],
        repeatAfterBlockScreens: ['Retry page'],
        repeatUntil: {
          enabled: true,
          maxAttempts: 2,
          minAccuracy: 1,
          metrics: { correctField: 'responseCorrect' },
        },
      },
    ];
    const orchestrator = new TaskOrchestrator(mockContext);
    const runTrial = vi
      .fn()
      .mockResolvedValueOnce({ responseCorrect: 0 })
      .mockResolvedValueOnce({ responseCorrect: 0 });

    await orchestrator.run({
      getBlocks: (config: any) => config.plan.blocks,
      getTrials: ({ block }: any) => Array.from({ length: block.trials }, (_, i) => ({ id: i })),
      runTrial,
      buttonIdPrefix: 'test',
    });

    const calls = (taskUiFlow.runBlockEndFlow as any).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][0].postBlockPages).toEqual([{ text: 'Retry page' }]);
    expect(calls[1][0].postBlockPages).toEqual([{ text: 'Regular end page' }]);
  });
});
