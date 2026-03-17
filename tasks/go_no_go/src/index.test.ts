// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { goNoGoAdapter, parseGoNoGoConfig, generateSequence } from "./index";

describe('Go/No-Go Adapter', () => {
  it('should have the correct manifest', () => {
    expect(goNoGoAdapter.manifest.taskId).toBe('go_no_go');
    expect(goNoGoAdapter.manifest.label).toBe('Go/No-Go');
  });

  it('should parse basic go/no-go config', async () => {
    const config = {
      task: {
        title: "Test Task",
        mapping: {
          goKey: " "
        },
        stimuli: {
          goStimuli: ["O"],
          noGoStimuli: ["X"]
        },
        blocks: [
          {
            id: "block1",
            trials: 10,
            goRatio: 0.8
          }
        ]
      }
    };

    const parsed = parseGoNoGoConfig(config as any);
    expect(parsed.title).toBe("Test Task");
    expect(parsed.mapping.goKey).toBe("space");
    expect(parsed.blocks[0].trials).toBe(10);
    expect(parsed.blocks[0].goRatio).toBe(0.8);
  });

  it('should generate sequence with correct go ratio', () => {
    const config: any = {
      stimuli: {
        goStimuli: ["O"],
        noGoStimuli: ["X"]
      }
    };
    
    const block: any = {
      trials: 10,
      goRatio: 0.8
    };

    // Use a fixed pseudo-random number generator for predictability, but we just check ratios.
    const sequence = generateSequence(config, block, () => 0.5);
    
    expect(sequence.length).toBe(10);
    const goTrials = sequence.filter(s => s.condition === "go");
    const noGoTrials = sequence.filter(s => s.condition === "no-go");
    
    expect(goTrials.length).toBe(8);
    expect(noGoTrials.length).toBe(2);
    
    expect(goTrials[0].stimulus).toBe("O");
    expect(noGoTrials[0].stimulus).toBe("X");
  });
});
