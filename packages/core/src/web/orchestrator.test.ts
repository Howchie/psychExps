/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskOrchestrator } from './orchestrator';
import { TaskModuleRunner } from '../api/taskModule';
import * as taskUiFlow from './taskUiFlow';

vi.mock('./taskUiFlow', () => ({
  runTaskIntroFlow: vi.fn().mockResolvedValue(undefined),
  runBlockStartFlow: vi.fn().mockResolvedValue(undefined),
  runBlockEndFlow: vi.fn().mockResolvedValue(undefined),
  runTaskEndFlow: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./lifecycle', () => ({
  finalizeTaskRun: vi.fn().mockResolvedValue({ submittedToJatos: true, redirected: false }),
}));

describe('TaskOrchestrator', () => {
  let container: HTMLElement;
  let mockModuleRunner: TaskModuleRunner;
  let mockContext: any;

  beforeEach(() => {
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
});
