// @ts-ignore jsquest-plus is untyped and consumed via runtime API.
import JsQuestPlus from 'jsquest-plus';
export class QuestBinaryStaircase {
    quest;
    currentStimulus;
    constructor(config) {
        const thresholdDomain = config.thresholdDomain?.length ? config.thresholdDomain : config.stimDomain;
        const slopeDomain = config.slopeDomain?.length ? config.slopeDomain : [1, 1.5, 2, 2.5, 3, 3.5];
        const lapseDomain = config.lapseDomain?.length ? config.lapseDomain : [0, 0.01, 0.02, 0.04, 0.06];
        const guessRate = Number.isFinite(config.guessRate) ? Number(config.guessRate) : 0.5;
        const pYes = (stim, threshold, slope, guess, lapse) => {
            return JsQuestPlus.weibull(stim, threshold, slope, guess, lapse);
        };
        const pNo = (stim, threshold, slope, guess, lapse) => 1 - pYes(stim, threshold, slope, guess, lapse);
        this.quest = new JsQuestPlus({
            psych_func: [pYes, pNo],
            stim_samples: [config.stimDomain],
            psych_samples: [thresholdDomain, slopeDomain, [guessRate], lapseDomain],
            priors: buildQuestPrior(config.priors),
        });
        this.currentStimulus = Number(this.quest.getStimParams());
    }
    nextStimulus() {
        return this.currentStimulus;
    }
    update(response) {
        this.quest.update(this.currentStimulus, response);
        this.currentStimulus = Number(this.quest.getStimParams());
        return this.currentStimulus;
    }
    estimateMode() {
        const estimates = this.quest.getEstimates('mode');
        return {
            threshold: Number(estimates[0]),
            slope: Number(estimates[1]),
            guess: Number(estimates[2]),
            lapse: Number(estimates[3]),
        };
    }
    exportPosterior() {
        return this.quest.posteriors;
    }
}
export function buildLinearRange(start, end, step) {
    const out = [];
    const safeStep = Math.abs(step) > 0 ? Math.abs(step) : 1;
    const dir = end >= start ? 1 : -1;
    const maxN = 100000;
    let n = 0;
    let value = start;
    while ((dir > 0 ? value <= end : value >= end) && n < maxN) {
        out.push(Number(value.toFixed(8)));
        value += safeStep * dir;
        n += 1;
    }
    if (out.length === 0 || out[out.length - 1] !== Number(end.toFixed(8))) {
        out.push(Number(end.toFixed(8)));
    }
    return out;
}
export function luminanceToDb(value) {
    const bounded = Math.max(1e-8, value);
    return Math.log10(bounded);
}
export function dbToLuminance(value) {
    return 10 ** value;
}
function buildQuestPrior(priors) {
    if (!priors)
        return undefined;
    const entries = [priors.threshold, priors.slope, priors.guess, priors.lapse];
    if (!entries.some((entry) => Array.isArray(entry) && entry.length > 0)) {
        return undefined;
    }
    const valid = entries.map((entry) => (Array.isArray(entry) ? entry : null));
    if (valid.some((entry) => entry === null)) {
        return undefined;
    }
    return {
        priors: valid,
    };
}
//# sourceMappingURL=staircase.js.map