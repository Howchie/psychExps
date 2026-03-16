// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { flankerAdapter, parseFlankerConfig } from './index';

describe('Flanker Adapter', () => {
  it('should have the correct manifest', () => {
    expect(flankerAdapter.manifest.taskId).toBe('flanker');
    expect(flankerAdapter.manifest.label).toBe('Flanker');
  });

  it('should parse basic flanker config', async () => {
    const config = {
      task: {
        title: "Test Task"
      },
      mapping: {
        leftKey: "f",
        rightKey: "j"
      },
      stimuli: {
        leftTarget: "<",
        rightTarget: ">",
        flankerCount: 4
      },
      plan: {
        blockCount: 1,
        blockTemplate: {
          trials: 3
        }
      },
      conditions: {
        quotaPerBlock: {
          congruent: 1,
          incongruent: 1,
          neutral: 1
        }
      }
    };

    const parsed = await parseFlankerConfig(config);
    expect(parsed.title).toBe("Test Task");
    expect(parsed.mapping.leftKey).toBe("f");
    expect(parsed.mapping.rightKey).toBe("j");
    expect(parsed.stimuli.leftTarget).toBe("<");
    expect(parsed.stimuli.flankerCount).toBe(4);
    expect(parsed.blocks.length).toBe(1);
    expect(parsed.blocks[0].trials).toBe(3);
    expect(parsed.conditions.quotaPerBlock.congruent).toBe(1);
  });
});
