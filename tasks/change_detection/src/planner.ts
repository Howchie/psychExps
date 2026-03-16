import { SeededRandom, asObject, asArray, buildScheduledItems } from "@experiments/core";

export interface TrialPlanItem {
  isChange: boolean;
  setSize: number;
  blockIndex: number;
  trialIndex: number;
}

export function buildTrialPlan(config: any, rng: SeededRandom): TrialPlanItem[] {
  const plan: TrialPlanItem[] = [];
  const blocks = asArray(asObject(config.plan)?.blocks);

  blocks.forEach((blockConfig, blockIndex) => {
    const b = asObject(blockConfig);
    if (!b) return;
    const nTrials = Number(b.trials) || 0;
    const changeProb = Number(b.changeProbability) ?? 0.5;
    const setSizes = asArray(b.setSizes).map(Number);

    const trialTypes = buildScheduledItems({
      items: [true, false],
      count: nTrials,
      schedule: { mode: "quota_shuffle" },
      weights: [changeProb, 1 - changeProb],
      rng: { next: () => rng.next() },
    });

    const setSizesArray = buildScheduledItems({
      items: setSizes,
      count: nTrials,
      schedule: { mode: "quota_shuffle" },
      weights: setSizes.map(() => 1),
      rng: { next: () => rng.next() },
    });

    for (let trialIndex = 0; trialIndex < nTrials; trialIndex++) {
      plan.push({
        isChange: trialTypes[trialIndex],
        setSize: setSizesArray[trialIndex],
        blockIndex,
        trialIndex,
      });
    }
  });

  return plan;
}
