export type TransformObservationOutcome = "hit" | "miss" | "false_alarm" | "forced_end";

export interface OnlineTransformObservation {
  timeMs: number;
  rtMs: number | null;
  stimId: string | null;
  outcome: TransformObservationOutcome;
  key?: string;
  source?: string;
  meta?: Record<string, unknown>;
}

export interface ParameterEstimateInterval {
  lower: number;
  upper: number;
}

export interface OnlineParameterTransformEstimate {
  modelId: string;
  modelType: string;
  sampleSize: number;
  values: Record<string, number>;
  intervals?: Record<string, ParameterEstimateInterval>;
  aux?: Record<string, unknown>;
}

export interface OnlineParameterTransform {
  readonly id: string;
  readonly type: string;
  observe(observation: OnlineTransformObservation): OnlineParameterTransformEstimate | null;
  reset(): void;
  exportState(): Record<string, unknown>;
}

export interface WaldConjugateTransformConfig {
  type: "wald_conjugate";
  id?: string;
  enabled?: boolean;
  includeOutcomes?: Array<TransformObservationOutcome>;
  minWindowSize?: number;
  maxWindowSize?: number;
  t0?: number;
  priors?: {
    mu0?: number;
    precision0?: number;
    kappa0?: number;
    beta0?: number;
  };
  credibleInterval?: {
    lower?: number;
    upper?: number;
  };
  priorUpdate?: {
    enabled?: boolean;
    mode?: "none" | "shift_means";
    shiftMu0From?: "posterior_location";
    shiftKappa0From?: "threshold_mode_sq_plus_1";
  };
}

export type OnlineParameterTransformConfig = WaldConjugateTransformConfig;

export interface OnlineTransformRuntimeData {
  id: string;
  type: string;
  updateCount: number;
  latestEstimate: OnlineParameterTransformEstimate | null;
  state: Record<string, unknown>;
}

const DEFAULT_OUTCOMES: TransformObservationOutcome[] = ["hit"];

function toFinite(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toPositive(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function clampProbability(value: unknown, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(0.999999, Math.max(0.000001, numeric));
}

const LOG_GAMMA_COEFFS = [
  676.5203681218851,
  -1259.1392167224028,
  771.3234287776531,
  -176.6150291621406,
  12.507343278686905,
  -0.13857109526572012,
  9.984369578019572e-6,
  1.5056327351493116e-7,
] as const;

function logGamma(z: number): number {
  if (z < 0.5) {
    return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
  }
  let x = 0.9999999999998099;
  const shifted = z - 1;
  for (let i = 0; i < LOG_GAMMA_COEFFS.length; i += 1) {
    x += LOG_GAMMA_COEFFS[i] / (shifted + i + 1);
  }
  const t = shifted + LOG_GAMMA_COEFFS.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (shifted + 0.5) * Math.log(t) - t + Math.log(x);
}

function nakaMoment(order: number, shape: number, scale: number): number {
  const half = order / 2;
  const logRatio = logGamma(shape + half) - logGamma(shape);
  const logScale = half * (Math.log(scale) - Math.log(shape));
  return Math.exp(logRatio + logScale);
}

function mellinProductMoments(
  momentsX: [number, number, number],
  momentsY: [number, number, number],
): { mean: number; variance: number; skewness: number } {
  const [mu1x, mu2x, mu3x] = momentsX;
  const [mu1y, mu2y, mu3y] = momentsY;

  const mu1 = mu1x * mu1y;
  const mu2 = mu2x * mu2y;
  const mu3 = mu3x * mu3y;

  const variance = mu2 - mu1 * mu1;
  const centralM3 = mu3 - 3 * mu1 * mu2 + 2 * mu1 * mu1 * mu1;
  const skewness = centralM3 / Math.pow(Math.max(variance, 1e-12), 1.5);
  return { mean: mu1, variance, skewness };
}

function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const poly = (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t;
  return sign * (1 - poly * Math.exp(-ax * ax));
}

function normalCdf(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

function normalInvCdf(pIn: number): number {
  const p = clampProbability(pIn, 0.5);
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239] as const;
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1] as const;
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783] as const;
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416] as const;
  const plow = 0.02425;
  const phigh = 1 - plow;

  if (p < plow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > phigh) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const q = p - 0.5;
  const r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

function regularizedGammaP(a: number, x: number): number {
  if (x <= 0) return 0;
  if (a <= 0) return Number.NaN;

  const gln = logGamma(a);
  if (x < a + 1) {
    let ap = a;
    let sum = 1 / a;
    let del = sum;
    for (let n = 1; n <= 200; n += 1) {
      ap += 1;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-12) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - gln);
  }

  let b = x + 1 - a;
  let c = 1 / 1e-30;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i <= 200; i += 1) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = b + an / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-12) break;
  }
  const q = Math.exp(-x + a * Math.log(x) - gln) * h;
  return 1 - q;
}

function nakagamiCdf(x: number, shape: number, scale: number): number {
  if (x <= 0) return 0;
  const y = (shape / scale) * x * x;
  return regularizedGammaP(shape, y);
}

function nakagamiPpf(p: number, shape: number, scale: number): number {
  const target = clampProbability(p, 0.5);
  let low = 0;
  let high = Math.max(1e-3, Math.sqrt(scale) * 2);
  for (let i = 0; i < 80; i += 1) {
    if (nakagamiCdf(high, shape, scale) >= target) break;
    high *= 2;
  }
  for (let i = 0; i < 80; i += 1) {
    const mid = 0.5 * (low + high);
    const cdf = nakagamiCdf(mid, shape, scale);
    if (!Number.isFinite(cdf) || cdf < target) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return 0.5 * (low + high);
}

function saddlepointCore(x: number, mean: number, variance: number, skewness: number): {
  z: number;
  nHat: number;
  kVal: number;
  k2: number;
  valid: boolean;
} {
  const rZ = Math.sqrt(Math.max(variance, 1e-12));
  const z = (x - mean) / rZ;
  if (Math.abs(skewness) < 1e-12) {
    const nHat = z;
    return { z, nHat, kVal: 0.5 * nHat * nHat, k2: 1, valid: true };
  }
  const a3s = skewness;
  const nHat = (2 * z) / (2 + a3s * z);
  const denom = 1 - 0.5 * a3s * nHat;
  const kVal = (-2 / a3s) * nHat - (2 / (a3s * a3s)) * Math.log(denom * denom);
  const k2 = 1 / (denom * denom);
  const zCutoff = -2 / a3s + 0.01;
  return { z, nHat, kVal, k2, valid: z > zCutoff };
}

function saddlepointDensity(x: number, mean: number, variance: number, skewness: number): number {
  const core = saddlepointCore(x, mean, variance, skewness);
  if (!core.valid) return Number.NaN;
  const num = Math.exp(core.kVal - core.nHat * core.z);
  const denom = Math.sqrt(2 * Math.PI * core.k2) * Math.sqrt(Math.max(variance, 1e-12));
  return num / denom;
}

function saddlepointCdf(x: number, mean: number, variance: number, skewness: number): number {
  const core = saddlepointCore(x, mean, variance, skewness);
  if (!core.valid) return Number.NaN;
  const rRaw = 2 * (core.nHat * core.z - core.kVal);
  const r = Math.sign(core.nHat) * Math.sqrt(Math.max(0, rRaw));
  const q = core.nHat * Math.sqrt(core.k2);
  const adjustment = Math.abs(r) < 1e-10 ? 0 : (1 / r) * Math.log(q / r);
  return normalCdf(r + adjustment);
}

function saddlepointQuantile(
  p: number,
  xGrid: number[],
  mean: number,
  variance: number,
  skewness: number,
): number {
  const target = clampProbability(p, 0.5);
  const points: Array<{ x: number; cdf: number }> = [];
  for (const x of xGrid) {
    const cdf = saddlepointCdf(x, mean, variance, skewness);
    if (Number.isFinite(cdf)) points.push({ x, cdf });
  }
  if (points.length < 2) {
    const sd = Math.sqrt(Math.max(variance, 1e-12));
    return mean + normalInvCdf(target) * sd;
  }
  points.sort((a, b) => a.cdf - b.cdf);

  if (target <= points[0].cdf) return points[0].x;
  if (target >= points[points.length - 1].cdf) return points[points.length - 1].x;

  for (let i = 1; i < points.length; i += 1) {
    if (target > points[i].cdf) continue;
    const left = points[i - 1];
    const right = points[i];
    const width = right.cdf - left.cdf;
    if (width <= 1e-12) return right.x;
    const t = (target - left.cdf) / width;
    return left.x + t * (right.x - left.x);
  }
  return points[points.length - 1].x;
}

interface WaldFitResult {
  v: number;
  vLower: number;
  vUpper: number;
  a: number;
  aLower: number;
  aUpper: number;
  t0: number;
  n: number;
  posterior: {
    tlocationP: number;
  };
}

interface WaldPriorParams {
  mu0: number;
  precision0: number;
  kappa0: number;
  beta0: number;
}

interface WaldFitOptions {
  t0: number;
  lower: number;
  upper: number;
  prior: WaldPriorParams;
}

function fitWaldAnalytic(rtWindow: number[], options: WaldFitOptions): WaldFitResult {
  const rt = rtWindow.filter((value) => Number.isFinite(value) && value > 0);
  if (rt.length < 1) throw new Error("No RT values available for Wald fit.");

  const t0 = Math.max(0, toFinite(options.t0, 0));
  const minRt = Math.min(...rt);
  if (t0 >= minRt) {
    throw new Error(`t0=${t0} must be less than min RT=${minRt}.`);
  }

  const shifted = rt.map((value) => value - t0).filter((value) => value > 0);
  if (shifted.length < 1) throw new Error("No RT values remain after subtracting t0.");

  const n = shifted.length;
  const s1 = shifted.reduce((sum, value) => sum + value, 0);
  const sInv = shifted.reduce((sum, value) => sum + 1 / value, 0);

  const prior = options.prior;
  const term1 = prior.beta0 + ((prior.mu0 * prior.mu0 * prior.precision0 + sInv) / 2)
    - (((prior.mu0 * prior.precision0 + n) ** 2) / (2 * (prior.precision0 + s1)));
  const term2 = prior.precision0 + s1;
  const term3 = prior.kappa0 + n / 2;

  if (!(term1 > 0 && term2 > 0 && term3 > 0)) {
    throw new Error("Invalid posterior terms for Wald fit.");
  }

  const nakashapeP = term3;
  const nakascaleP = term3 / term1;

  const tlocationP = (prior.mu0 * prior.precision0 + n) / term2;
  const tscaleP = Math.sqrt(term1 / (term3 * term2));
  const tdfP = 2 * term3;

  const m1Naka = nakaMoment(1, nakashapeP, nakascaleP);
  const m2Naka = nakaMoment(2, nakashapeP, nakascaleP);
  const m3Naka = nakaMoment(3, nakashapeP, nakascaleP);

  const m1T = tlocationP;
  const m2T = tscaleP * tscaleP * tdfP / (tdfP - 2) + tlocationP * tlocationP;
  const m3T = (tlocationP * (tlocationP * tlocationP * (tdfP - 2) + 3 * tdfP * tscaleP * tscaleP)) / (tdfP - 2);

  const productMoments = mellinProductMoments(
    [m1Naka, m2Naka, m3Naka],
    [m1T, m2T, m3T],
  );

  const meanV = productMoments.mean;
  const varV = Math.max(productMoments.variance, 1e-12);
  const skewV = Number.isFinite(productMoments.skewness) ? productMoments.skewness : 0;

  const sdV = Math.sqrt(varV);
  const xMin = Math.max(0.001, meanV - 5 * sdV);
  const xMax = meanV + 5 * sdV;
  const steps = 2000;
  const xGrid: number[] = [];
  for (let i = 0; i < steps; i += 1) {
    xGrid.push(xMin + (i / (steps - 1)) * (xMax - xMin));
  }

  let vMode = meanV;
  let vLower = meanV + normalInvCdf(options.lower) * sdV;
  let vUpper = meanV + normalInvCdf(options.upper) * sdV;

  const pdfValues = xGrid.map((x) => saddlepointDensity(x, meanV, varV, skewV));
  const finiteIdx = pdfValues
    .map((value, index) => ({ value, index }))
    .filter((entry) => Number.isFinite(entry.value) && entry.value > 0);

  if (finiteIdx.length > 0) {
    const maxEntry = finiteIdx.reduce((best, current) => (current.value > best.value ? current : best), finiteIdx[0]);
    vMode = xGrid[maxEntry.index];
    vLower = saddlepointQuantile(options.lower, xGrid, meanV, varV, skewV);
    vUpper = saddlepointQuantile(options.upper, xGrid, meanV, varV, skewV);
  }

  const aMode = (Math.sqrt(2) / 2) * Math.sqrt(((2 * nakashapeP - 1) * nakascaleP) / nakashapeP);
  const aLower = nakagamiPpf(options.lower, nakashapeP, nakascaleP);
  const aUpper = nakagamiPpf(options.upper, nakashapeP, nakascaleP);

  return {
    v: vMode,
    vLower,
    vUpper,
    a: aMode,
    aLower,
    aUpper,
    t0,
    n,
    posterior: {
      tlocationP,
    },
  };
}

export class WaldConjugateOnlineTransform implements OnlineParameterTransform {
  readonly id: string;
  readonly type = "wald_conjugate" as const;

  private readonly includeOutcomes: Set<TransformObservationOutcome>;
  private readonly minWindowSize: number;
  private readonly maxWindowSize: number;
  private readonly t0: number;
  private readonly lower: number;
  private readonly upper: number;
  private readonly priorUpdateMode: "none" | "shift_means";

  private readonly rtWindow: number[] = [];
  private mu0: number;
  private precision0: number;
  private kappa0: number;
  private beta0: number;

  private updateCount = 0;
  private latestEstimate: OnlineParameterTransformEstimate | null = null;

  constructor(config: WaldConjugateTransformConfig) {
    this.id = String(config.id ?? "wald_conjugate");
    this.includeOutcomes = new Set(
      (config.includeOutcomes && config.includeOutcomes.length > 0 ? config.includeOutcomes : DEFAULT_OUTCOMES)
        .filter((entry): entry is TransformObservationOutcome => (
          entry === "hit" || entry === "miss" || entry === "false_alarm" || entry === "forced_end"
        )),
    );
    this.minWindowSize = Math.max(1, Math.floor(toPositive(config.minWindowSize, 10)));
    this.maxWindowSize = Math.max(this.minWindowSize, Math.floor(toPositive(config.maxWindowSize, 50)));
    this.t0 = Math.max(0, toFinite(config.t0, 0));
    this.lower = clampProbability(config.credibleInterval?.lower, 0.05);
    this.upper = clampProbability(config.credibleInterval?.upper, 0.95);
    this.priorUpdateMode = config.priorUpdate?.enabled === false
      ? "none"
      : (config.priorUpdate?.mode ?? "shift_means");

    this.mu0 = toFinite(config.priors?.mu0, 2);
    this.precision0 = toPositive(config.priors?.precision0, 1);
    this.kappa0 = toPositive(config.priors?.kappa0, 6);
    this.beta0 = toPositive(config.priors?.beta0, 1);
  }

  observe(observation: OnlineTransformObservation): OnlineParameterTransformEstimate | null {
    if (!this.includeOutcomes.has(observation.outcome)) return null;
    if (!(observation.rtMs && observation.rtMs > 0)) return null;

    this.rtWindow.push(observation.rtMs);
    while (this.rtWindow.length > this.maxWindowSize) {
      this.rtWindow.shift();
    }
    if (this.rtWindow.length < this.minWindowSize) return null;

    const fit = fitWaldAnalytic(this.rtWindow, {
      t0: this.t0,
      lower: this.lower,
      upper: this.upper,
      prior: {
        mu0: this.mu0,
        precision0: this.precision0,
        kappa0: this.kappa0,
        beta0: this.beta0,
      },
    });

    if (this.priorUpdateMode === "shift_means") {
      this.mu0 = fit.posterior.tlocationP;
      this.kappa0 = Math.max(1e-6, fit.a * fit.a + 1);
    }

    this.updateCount += 1;
    this.latestEstimate = {
      modelId: this.id,
      modelType: this.type,
      sampleSize: fit.n,
      values: {
        drift_rate: fit.v,
        threshold: fit.a,
        t0: fit.t0,
      },
      intervals: {
        drift_rate: { lower: fit.vLower, upper: fit.vUpper },
        threshold: { lower: fit.aLower, upper: fit.aUpper },
      },
      aux: {
        windowSize: this.rtWindow.length,
        prior: {
          mu0: this.mu0,
          precision0: this.precision0,
          kappa0: this.kappa0,
          beta0: this.beta0,
        },
      },
    };
    return this.latestEstimate;
  }

  reset(): void {
    this.rtWindow.length = 0;
    this.updateCount = 0;
    this.latestEstimate = null;
  }

  exportState(): Record<string, unknown> {
    return {
      windowSize: this.rtWindow.length,
      windowRtMs: this.rtWindow.slice(),
      priors: {
        mu0: this.mu0,
        precision0: this.precision0,
        kappa0: this.kappa0,
        beta0: this.beta0,
      },
    };
  }

  getRuntimeData(): OnlineTransformRuntimeData {
    return {
      id: this.id,
      type: this.type,
      updateCount: this.updateCount,
      latestEstimate: this.latestEstimate,
      state: this.exportState(),
    };
  }
}

export function createOnlineParameterTransform(config: OnlineParameterTransformConfig): OnlineParameterTransform {
  if (config.type === "wald_conjugate") {
    return new WaldConjugateOnlineTransform(config);
  }
  throw new Error(`Unsupported online parameter transform type: ${String((config as { type?: unknown }).type ?? "")}`);
}

export class OnlineParameterTransformRunner {
  private readonly transforms: Array<OnlineParameterTransform & { getRuntimeData?: () => OnlineTransformRuntimeData }>;

  constructor(configs: OnlineParameterTransformConfig[]) {
    this.transforms = configs
      .filter((cfg) => cfg.enabled !== false)
      .map((cfg) => createOnlineParameterTransform(cfg))
      .map((transform) => transform as OnlineParameterTransform & { getRuntimeData?: () => OnlineTransformRuntimeData });
  }

  isEnabled(): boolean {
    return this.transforms.length > 0;
  }

  observe(observation: OnlineTransformObservation): OnlineParameterTransformEstimate[] {
    const estimates: OnlineParameterTransformEstimate[] = [];
    for (const transform of this.transforms) {
      const estimate = transform.observe(observation);
      if (estimate) estimates.push(estimate);
    }
    return estimates;
  }

  reset(): void {
    for (const transform of this.transforms) transform.reset();
  }

  exportData(): OnlineTransformRuntimeData[] {
    return this.transforms.map((transform) => {
      if (typeof transform.getRuntimeData === "function") {
        return transform.getRuntimeData();
      }
      return {
        id: transform.id,
        type: transform.type,
        updateCount: 0,
        latestEstimate: null,
        state: transform.exportState(),
      };
    });
  }
}
