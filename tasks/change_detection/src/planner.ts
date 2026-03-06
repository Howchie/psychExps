import { SeededRandom, asObject, asArray } from "@experiments/core";

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

    const changeCount = Math.round(nTrials * changeProb);
    const noChangeCount = nTrials - changeCount;

    const trialTypes = [
      ...Array(changeCount).fill(true),
      ...Array(noChangeCount).fill(false),
    ];

    // Shuffle trial types
    for (let i = trialTypes.length - 1; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      [trialTypes[i], trialTypes[j]] = [trialTypes[j], trialTypes[i]];
    }

    for (let trialIndex = 0; trialIndex < nTrials; trialIndex++) {
      const setSize = setSizes[Math.floor(rng.next() * setSizes.length)];
      plan.push({
        isChange: trialTypes[trialIndex],
        setSize,
        blockIndex,
        trialIndex,
      });
    }
  });

  return plan;
}
