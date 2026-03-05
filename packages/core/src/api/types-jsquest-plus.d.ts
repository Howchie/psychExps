declare module 'jsquest-plus' {
  export default class JsQuestPlus {
    static weibull(stim: number, threshold: number, slope: number, guessRate: number, lapseRate: number): number;
    constructor(settings: Record<string, unknown>);
    getStimParams(): number;
    update(stimParams: number, responseIndex: number): void;
    getEstimates(mode?: string): number[];
    posteriors: unknown;
  }
}
