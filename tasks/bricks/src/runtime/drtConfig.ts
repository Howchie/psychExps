import { coerceScopedDrtConfig, type ScopedDrtConfig } from "@experiments/core";

export const defaultBricksScopedDrtConfig: ScopedDrtConfig = {
  enabled: false,
  scope: "trial",
  key: "space",
  responseWindowMs: 1500,
  displayDurationMs: 1000,
  responseTerminatesStimulus: true,
  isiSampler: { type: "uniform", min: 3000, max: 7000 },
  transformPersistence: "scope",
  stimMode: "visual",
  stimModes: ["visual"],
  visual: { shape: "square", color: "#dc2626", sizePx: 32, topPx: 16, leftPx: null },
  audio: { volume: 0.25, frequencyHz: 900, durationMs: 120, waveform: "sine" },
  border: { color: "#dc2626", widthPx: 4, radiusPx: 0, target: "display" },
  parameterTransforms: [],
};

export type BricksScopedDrtConfig = ScopedDrtConfig;

export function resolveBricksDrtConfig(raw: Record<string, unknown> | null | undefined): BricksScopedDrtConfig {
  return coerceScopedDrtConfig(defaultBricksScopedDrtConfig, raw);
}
