import { describe, it, expect } from 'vitest';
import { ProspectiveMemoryModule } from './prospectiveMemory';

describe('ProspectiveMemoryModule', () => {
  it('should be identified as "pm"', () => {
    const module = new ProspectiveMemoryModule();
    expect(module.id).toBe('pm');
  });

  describe('transformPlan', () => {
    it('should inject PM trials into eligible trials', () => {
      const module = new ProspectiveMemoryModule();
      const plan = [
        {
          blockIndex: 0,
          trials: Array.from({ length: 20 }, (_, i) => ({ trialIndex: i, trialType: 'F', item: 'filler' }))
        }
      ];
      const config = {
        enabled: true,
        eligibleTrialTypes: ['F'],
        schedule: { count: 2, minSeparation: 5, maxSeparation: 10 },
        rules: [{ type: 'category_in', categories: ['animals'], responseKey: 'space' }]
      };
      const context = {
        rng: { 
          int: (min: number, _max: number) => min, // Deterministic mock
          shuffle: (arr: any[]) => arr 
        } as any,
        stimuliByCategory: { animals: ['cat'] }
      };

      const transformed = module.transformBlockPlan(plan[0], config, context as any);
      const trials = transformed.trials;
      const pmTrials = trials.filter((t: any) => t.trialType === 'PM');
      
      expect(pmTrials.length).toBeGreaterThan(0);
      expect(pmTrials[0].item).toBe('cat');
      expect(pmTrials[0].correctResponse).toBe('space');
    });
  });
});
