/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bricksAdapter } from './index';
import { createVariableResolver, TaskOrchestrator } from '@experiments/core';

vi.mock('@experiments/core', async () => {
  const actual = await vi.importActual<any>('@experiments/core');
  return {
    ...actual,
    TaskOrchestrator: vi.fn().mockImplementation(function(this: any) {
      this.run = vi.fn().mockResolvedValue({ status: 'complete' });
    })
  };
});

describe('BricksTaskAdapter', () => {
  beforeEach(() => {
    vi.mocked(TaskOrchestrator).mockClear();
  });

  it('should initialize and execute using TaskOrchestrator', async () => {
    const taskConfig = {
      task: { title: 'Test' },
      blocks: [{ label: 'B1', trials: 10 }]
    };
    const resolver = createVariableResolver({ variables: {} });
    const mockModuleRunner = {
      setOptions: vi.fn(),
      getResults: vi.fn().mockReturnValue([]),
      getActiveData: vi.fn().mockReturnValue([]),
      getActiveHandle: vi.fn().mockReturnValue(null),
    };

    const context: any = {
      container: document.createElement('div'),
      selection: {
        participant: { participantId: 'p1', sessionId: 's1' },
        configPath: 'bricks/annikaHons'
      },
      taskConfig: taskConfig,
      rawTaskConfig: taskConfig,
      resolver: resolver,
      moduleRunner: mockModuleRunner
    };

    if (!bricksAdapter.initialize || !bricksAdapter.execute) {
      throw new Error('bricksAdapter lifecycle hooks are missing');
    }
    await bricksAdapter.initialize(context);
    const result = await bricksAdapter.execute();

    expect(result).toEqual({ status: 'complete' });
    expect(TaskOrchestrator).toHaveBeenCalledWith(context);
  });

  it('expands static block manipulations into readable CSV columns', async () => {
    const taskConfig = {
      task: { title: 'Test' },
      variables: {
        between: {
          scope: 'participant',
          sampler: {
            type: 'list',
            values: [{
              cell1Label: 'Low',
              cell1SpeedPxPerSec: 24,
            }],
          },
        },
      },
      manipulations: [
        {
          id: 'cell_1',
          label: '$between.cell1Label difficulty',
          overrides: {
            conveyors: {
              speedPxPerSec: { type: 'fixed', value: '$between.cell1SpeedPxPerSec' },
            },
          },
        },
      ],
      blocks: [{ label: 'B1', trials: 1, manipulations: ['cell_1'] }],
    };

    const resolver = createVariableResolver({
      variables: {
        between: {
          scope: 'participant',
          sampler: {
            type: 'list',
            values: [{
              cell1Label: 'Low',
              cell1SpeedPxPerSec: 24,
            }],
          },
        },
      },
    });
    const mockModuleRunner = {
      setOptions: vi.fn(),
      getResults: vi.fn().mockReturnValue([]),
      getActiveData: vi.fn().mockReturnValue([]),
      getActiveHandle: vi.fn().mockReturnValue(null),
    };

    const context: any = {
      container: document.createElement('div'),
      selection: {
        participant: { participantId: 'p1', sessionId: 's1' },
        configPath: 'bricks/annikaHons'
      },
      taskConfig,
      rawTaskConfig: taskConfig,
      resolver,
      moduleRunner: mockModuleRunner,
    };

    if (!bricksAdapter.initialize || !bricksAdapter.execute) {
      throw new Error('bricksAdapter lifecycle hooks are missing');
    }
    await bricksAdapter.initialize(context);
    await bricksAdapter.execute();

    const orchestratorInstance = (TaskOrchestrator as unknown as { mock: { instances: Array<{ run: { mock: { calls: any[][] } } }> } }).mock.instances[0];
    const runArgs = orchestratorInstance.run.mock.calls[0][0];
    const extraCsvs = runArgs.csvOptions.getExtraCsvs({
      sessionResult: {
        blocks: [
          {
            trialResults: [
              {
                block_index: 0,
                block_label: 'B1',
                trial_index: 0,
                trial_duration_ms: 1000,
                end_reason: 'time_limit',
                config_snapshot: {
                  trial: {},
                },
                timeline_events: [
                  {
                    type: 'brick_spawned',
                    time: 0,
                    brick_id: 'brick-1',
                    conveyor_id: 'c0',
                    nominal_drop_deadline_time_ms: 1234,
                    nominal_drop_delay_ms: 1234,
                    completion_mode: 'hold_duration',
                  },
                  {
                    type: 'brick_dropped',
                    time: 900,
                    brick_id: 'brick-1',
                    conveyor_id: 'c0',
                    completion_mode: 'hold_duration',
                  },
                ],
              },
            ],
          },
        ],
      },
    });

    const brickOutcomes = extraCsvs.find((entry: any) => entry.suffix === 'bricks_brick_outcomes');
    expect(brickOutcomes).toBeTruthy();
    expect(brickOutcomes.contents).toContain('block_static_manipulation_label');
    expect(brickOutcomes.contents).toContain('block_static_manipulation_speed_px_per_sec');
    expect(brickOutcomes.contents).toContain('Low difficulty');
    expect(brickOutcomes.contents).toContain('24');
    expect(brickOutcomes.contents).not.toContain('manipulation_static_id');
  });
});
