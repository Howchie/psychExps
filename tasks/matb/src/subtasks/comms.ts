/**
 * MATB Communications sub-task.
 *
 * Audio prompts announce a callsign, a target radio, and a target
 * frequency. If the callsign matches the participant's own callsign,
 * they must select the correct radio, tune it to the specified frequency,
 * and confirm with Enter. If it's someone else's callsign they should
 * ignore it (correct rejection).
 *
 * Signal detection scoring:
 *   HIT  = own callsign, confirmed before timeout
 *   MISS = own callsign, timed out without confirmation
 *   FA   = other callsign, confirmed (pressed Enter during prompt)
 *   CR   = other callsign, timed out without pressing Enter
 *
 * This file contains:
 *  - The comms state machine (usable by both standalone and composite)
 *  - A SubTaskHandle factory for composite mode
 */

import {
  asArray,
  asObject,
  asString,
  toPositiveNumber,
  toNonNegativeNumber,
  toPositiveFloat,
  AudioService,
  type SubTaskHandle,
  type SubTaskPerformance,
  type ScenarioEvent,
} from "@experiments/core";

import { renderRadio, type RadioConfig } from "../widgets/radios";

// ---------------------------------------------------------------------------
// Config types
// ---------------------------------------------------------------------------

export interface CommsRadioDef {
  /** Unique id, e.g. "com1". */
  id: string;
  /** Display label, e.g. "COM1". */
  label: string;
  /** Starting frequency in MHz. */
  defaultFreqMhz: number;
}

export interface CommsFrequencyRange {
  minMhz: number;
  maxMhz: number;
  /** Step size for each arrow key press. */
  stepMhz: number;
}

export interface CommsSpeechConfig {
  /** Prioritised list of voice names (case-insensitive). */
  voiceNames?: string[];
  /** BCP-47 language tag fallback. */
  lang?: string;
  /** Speech rate multiplier (default 0.9). */
  rate?: number;
  /** Pitch multiplier (default 1). */
  pitch?: number;
}

/**
 * Clip-based audio config (OpenMATB-style).
 * When present, comms prompts are assembled from pre-loaded WAV clips instead
 * of speech synthesis. The `baseUrl` should point to a directory containing
 * individual letter/digit/word clips (0.wav … 9.wav, a.wav … z.wav, etc.).
 */
export interface CommsClipsConfig {
  /** Base URL for clip files, e.g. "/assets/matb-audio/en-male". */
  baseUrl: string;
  /** Optional gap between clips in ms. Default 0. */
  gapMs?: number;
}

export interface CommsKeysConfig {
  radioUp: string;
  radioDown: string;
  freqUp: string;
  freqDown: string;
  confirm: string;
}

export interface CommsSubTaskConfig {
  ownCallsign?: string;
  radios?: CommsRadioDef[];
  frequencyRange?: CommsFrequencyRange;
  responseTimeoutMs?: number;
  speech?: CommsSpeechConfig;
  /** When present, use clip-based audio instead of speech synthesis. */
  clips?: CommsClipsConfig;
  keys?: CommsKeysConfig;
}

// ---------------------------------------------------------------------------
// Record types (for data export)
// ---------------------------------------------------------------------------

export type CommsOutcome = "HIT" | "MISS" | "FA" | "CR";

export interface CommsPromptRecord {
  promptIdx: number;
  callsign: string;
  isOwnCallsign: boolean;
  targetRadio: string;
  targetFreqMhz: number;
  /** Radio id selected when participant confirmed (null = no response). */
  selectedRadio: string | null;
  /** Frequency entered when participant confirmed (null = no response). */
  enteredFreqMhz: number | null;
  /** Absolute deviation from target frequency in MHz (null = no response). */
  freqDeviationMhz: number | null;
  responded: boolean;
  outcome: CommsOutcome;
  /** Response time in ms from prompt start. Null if no response. */
  rtMs: number | null;
}

export interface CommsSubTaskResult {
  elapsedMs: number;
  records: CommsPromptRecord[];
  hitCount: number;
  missCount: number;
  faCount: number;
  crCount: number;
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface ResolvedCommsConfig {
  ownCallsign: string;
  radios: CommsRadioDef[];
  frequencyRange: CommsFrequencyRange;
  responseTimeoutMs: number;
  speech: CommsSpeechConfig;
  clips: CommsClipsConfig | null;
  keys: {
    radioUp: string;
    radioDown: string;
    freqUp: string;
    freqDown: string;
    confirm: string;
  };
}

interface RadioRuntime {
  config: RadioConfig;
  frequencyMhz: number;
}

interface ActivePrompt {
  callsign: string;
  targetRadioId: string;
  targetFreqMhz: number;
  isOwn: boolean;
  startMs: number;
  promptIdx: number;
  /** Accumulated elapsed time since prompt started (ms). */
  elapsedMs: number;
  speechHandle: ReturnType<AudioService["speakText"]> | null;
  /** Set to true when using clip-based playback (no speechHandle). */
  usingClips: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DIGIT_WORDS = [
  "zero", "one", "two", "three", "four",
  "five", "six", "seven", "eight", "niner",
];

function digitWord(d: string): string {
  const n = parseInt(d, 10);
  return Number.isNaN(n) ? d : (DIGIT_WORDS[n] ?? d);
}

/**
 * Convert a MHz frequency to aviation-style spoken words.
 * e.g. 118.3 → "one one eight decimal three"
 *      135.0 → "one three five decimal zero"
 */
function toSpokenFrequency(mhz: number): string {
  const str = mhz.toFixed(3);
  const dotIdx = str.indexOf(".");
  const intPart = str.slice(0, dotIdx);
  const decPart = str.slice(dotIdx + 1).replace(/0+$/, "") || "zero";
  const intSpoken = intPart.split("").map(digitWord).join(" ");
  const decSpoken = decPart.split("").map(digitWord).join(" ");
  return `${intSpoken} decimal ${decSpoken}`;
}

/**
 * Build the spoken text for a full comms prompt.
 * e.g. "NASA five zero four, COM one, one one eight decimal three"
 */
function buildPromptText(callsign: string, radioLabel: string, freqMhz: number): string {
  return `${callsign}, ${radioLabel}, ${toSpokenFrequency(freqMhz)}`;
}

/**
 * Build the clip ID sequence for a comms prompt (OpenMATB-style).
 * Callsign characters → letter/digit clip IDs.
 * Radio label → "com_1", "com_2", "nav_1", "nav_2".
 * Frequency → digit + "point" clips.
 *
 * e.g. callsign="NASA504", radio="com1", freq=118.3
 *   → ["n","a","s","a","5","0","4", "com_1", "frequency", "1","1","8","point","3"]
 */
function buildPromptClipSequence(callsign: string, radioId: string, freqMhz: number): string[] {
  const ids: string[] = [];

  // Callsign: map each character to a letter or digit clip.
  for (const ch of callsign.toLowerCase()) {
    if (/[a-z]/.test(ch) || /[0-9]/.test(ch)) {
      ids.push(ch);
    }
  }

  // Radio: map "com1"→"com_1", "com2"→"com_2", "nav1"→"nav_1", "nav2"→"nav_2".
  const radioClipId = radioId
    .toLowerCase()
    .replace(/^(com|nav)(\d)$/, "$1_$2");
  ids.push(radioClipId);

  // "frequency" cue word.
  ids.push("frequency");

  // Frequency digits with "point" for the decimal separator.
  const freqStr = freqMhz.toFixed(3);
  const dotIdx = freqStr.indexOf(".");
  const intPart = freqStr.slice(0, dotIdx);
  const decPart = freqStr.slice(dotIdx + 1).replace(/0+$/, "") || "0";
  for (const ch of intPart) ids.push(ch);
  ids.push("point");
  for (const ch of decPart) ids.push(ch);

  return ids;
}

/**
 * Build the AudioClipManifest for the English-male clip set.
 * Maps each clip ID to its URL under `baseUrl`.
 */
function buildAudioClipManifest(baseUrl: string): Record<string, string> {
  const base = baseUrl.replace(/\/$/, "");
  const ids: string[] = [
    ...Array.from({ length: 10 }, (_, i) => String(i)),
    ..."abcdefghijklmnopqrstuvwxyz".split(""),
    "com_1", "com_2", "nav_1", "nav_2",
    "frequency", "point", "empty", "radio",
  ];
  const manifest: Record<string, string> = {};
  for (const id of ids) {
    manifest[id] = `${base}/${id}.wav`;
  }
  return manifest;
}

// ---------------------------------------------------------------------------
// Config resolution
// ---------------------------------------------------------------------------

function resolveConfig(raw: Record<string, unknown>): ResolvedCommsConfig {
  const radiosRaw = asArray(raw.radios);
  const radios: CommsRadioDef[] = radiosRaw.length > 0
    ? radiosRaw.map((entry, i) => {
        const o = asObject(entry) ?? {};
        const defaultLabels = ["NAV1", "NAV2", "COM1", "COM2"];
        const defaultFreqs  = [110.0, 110.0, 118.0, 118.0];
        return {
          id:             asString(o.id) ?? `radio${i + 1}`,
          label:          asString(o.label) ?? (defaultLabels[i] ?? `RADIO${i + 1}`),
          defaultFreqMhz: toPositiveFloat(o.defaultFreqMhz, defaultFreqs[i] ?? 118.0),
        };
      })
    : [
        { id: "nav1", label: "NAV1", defaultFreqMhz: 110.0 },
        { id: "nav2", label: "NAV2", defaultFreqMhz: 110.0 },
        { id: "com1", label: "COM1", defaultFreqMhz: 118.0 },
        { id: "com2", label: "COM2", defaultFreqMhz: 118.0 },
      ];

  const rangeRaw = asObject(raw.frequencyRange) ?? {};
  const frequencyRange: CommsFrequencyRange = {
    minMhz:  toPositiveFloat(rangeRaw.minMhz, 108.0),
    maxMhz:  toPositiveFloat(rangeRaw.maxMhz, 137.0),
    stepMhz: toPositiveFloat(rangeRaw.stepMhz, 0.1),
  };

  const speechRaw = asObject(raw.speech) ?? {};
  const voiceNamesRaw = asArray(speechRaw.voiceNames);
  const speech: CommsSpeechConfig = {
    voiceNames: voiceNamesRaw.length > 0
      ? voiceNamesRaw.map((v) => asString(v) ?? "").filter(Boolean)
      : [
          "Google UK English Male",
          "Microsoft David - English (United States)",
          "Microsoft Mark - English (United States)",
          "Alex",
          "Daniel",
        ],
    lang:  asString(speechRaw.lang)  ?? "en-US",
    rate:  toPositiveFloat(speechRaw.rate, 0.9),
    pitch: toPositiveFloat(speechRaw.pitch, 1.0),
  };

  const keysRaw = asObject(raw.keys) ?? {};
  const keys = {
    radioUp:   (asString(keysRaw.radioUp)   ?? "ArrowUp").toLowerCase(),
    radioDown: (asString(keysRaw.radioDown) ?? "ArrowDown").toLowerCase(),
    freqUp:    (asString(keysRaw.freqUp)    ?? "ArrowRight").toLowerCase(),
    freqDown:  (asString(keysRaw.freqDown)  ?? "ArrowLeft").toLowerCase(),
    confirm:   (asString(keysRaw.confirm)   ?? "Enter").toLowerCase(),
  };

  const clipsRaw = asObject(raw.clips);
  const clips: CommsClipsConfig | null = clipsRaw
    ? {
        baseUrl: asString(clipsRaw.baseUrl) ?? "/assets/matb-audio/en-male",
        gapMs: toNonNegativeNumber(clipsRaw.gapMs, 0),
      }
    : null;

  return {
    ownCallsign:       asString(raw.ownCallsign) ?? "NASA504",
    radios,
    frequencyRange,
    responseTimeoutMs: toPositiveNumber(raw.responseTimeoutMs, 20000),
    speech,
    clips,
    keys,
  };
}

// ---------------------------------------------------------------------------
// SubTaskHandle factory
// ---------------------------------------------------------------------------

export function createCommsSubTaskHandle(): SubTaskHandle<CommsSubTaskResult> {
  let config: ResolvedCommsConfig | null = null;
  let radios: RadioRuntime[] = [];
  let selectedIdx = 0;
  let activePrompt: ActivePrompt | null = null;
  let records: CommsPromptRecord[] = [];
  let promptIdxCounter = 0;
  let audio: AudioService | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let ctx2d: CanvasRenderingContext2D | null = null;
  let container: HTMLElement | null = null;
  let startMs = 0;

  // ── Prompt helpers ──────────────────────────────────────────────────────

  function startPrompt(value: unknown): void {
    if (!config) return;
    const v = asObject(value) ?? {};
    const callsign     = asString(v.callsign) ?? config.ownCallsign;
    const radioId      = asString(v.radio)    ?? config.radios[0]?.id ?? "";
    const targetFreq   = toPositiveFloat(v.frequency, config.radios[0]?.defaultFreqMhz ?? 118.0);
    const isOwn        = callsign.toLowerCase() === config.ownCallsign.toLowerCase();

    let speechHandle: ReturnType<AudioService["speakText"]> | null = null;
    let usingClips = false;

    if (config.clips && audio) {
      // Clip-based playback: fire-and-forget (sequence is async but we don't await).
      usingClips = true;
      const clipIds = buildPromptClipSequence(callsign, radioId, targetFreq);
      const gapMs = config.clips.gapMs ?? 0;
      audio.playSequence(clipIds, gapMs).catch(() => {});
    } else if (audio) {
      // Find the radio label for the spoken prompt.
      const radioDef = config.radios.find((r) => r.id === radioId);
      const radioLabel = radioDef?.label ?? radioId.toUpperCase();
      const promptText = buildPromptText(callsign, radioLabel, targetFreq);
      speechHandle = audio.speakText(promptText, {
        voiceNames: config.speech.voiceNames,
        lang:       config.speech.lang,
        rate:       config.speech.rate,
        pitch:      config.speech.pitch,
      });
    }

    activePrompt = {
      callsign,
      targetRadioId: radioId,
      targetFreqMhz: targetFreq,
      isOwn,
      startMs:    performance.now() - startMs,
      promptIdx:  promptIdxCounter++,
      elapsedMs:  0,
      speechHandle,
      usingClips,
    };
  }

  function resolvePrompt(respondedNow: boolean): void {
    if (!activePrompt || !config) return;

    const p = activePrompt;
    const responded = respondedNow;
    const currentRadio = radios[selectedIdx];
    const rt = responded ? (performance.now() - startMs) - p.startMs : null;

    // Determine outcome.
    let outcome: CommsOutcome;
    let freqDeviation: number | null = null;

    if (p.isOwn) {
      if (responded) {
        const selectedRadioId = currentRadio?.config.id ?? null;
        const enteredFreqMhz = currentRadio?.frequencyMhz ?? null;
        const radioMatch = selectedRadioId === p.targetRadioId;
        const freqMatch = enteredFreqMhz !== null && Math.abs(enteredFreqMhz - p.targetFreqMhz) <= 1e-6;
        outcome = radioMatch && freqMatch ? "HIT" : "MISS";
        freqDeviation = enteredFreqMhz !== null ? Math.abs(enteredFreqMhz - p.targetFreqMhz) : null;
      } else {
        outcome = "MISS";
      }
    } else {
      outcome = responded ? "FA" : "CR";
    }

    records.push({
      promptIdx:       p.promptIdx,
      callsign:        p.callsign,
      isOwnCallsign:   p.isOwn,
      targetRadio:     p.targetRadioId,
      targetFreqMhz:   p.targetFreqMhz,
      selectedRadio:   responded ? (currentRadio?.config.id ?? null) : null,
      enteredFreqMhz:  responded ? (currentRadio?.frequencyMhz ?? null) : null,
      freqDeviationMhz: freqDeviation,
      responded,
      outcome,
      rtMs: rt !== null ? Math.round(rt) : null,
    });

    // Stop audio if still playing.
    if (p.usingClips) {
      audio?.stopAll();
    } else {
      p.speechHandle?.stop();
    }
    activePrompt = null;
  }

  // ── Rendering ─────────────────────────────────────────────────────────

  function renderAll(): void {
    if (!ctx2d || !canvas || !config) return;
    const w = canvas.width;
    const h = canvas.height;

    ctx2d.clearRect(0, 0, w, h);
    ctx2d.fillStyle = "#0d1117";
    ctx2d.fillRect(0, 0, w, h);

    // Header.
    const headerH = Math.round(h * 0.08);
    ctx2d.fillStyle = "#334155";
    ctx2d.fillRect(0, 0, w, headerH);
    ctx2d.fillStyle = "#94a3b8";
    ctx2d.font = `bold ${Math.round(headerH * 0.55)}px monospace`;
    ctx2d.textAlign = "center";
    ctx2d.textBaseline = "middle";
    ctx2d.fillText("COMMUNICATIONS", w / 2, headerH / 2);

    // "INCOMING" indicator when a prompt is active.
    if (activePrompt) {
      ctx2d.fillStyle = activePrompt.isOwn ? "#ef4444" : "#f59e0b";
      ctx2d.font = `bold ${Math.round(headerH * 0.45)}px monospace`;
      ctx2d.textAlign = "right";
      ctx2d.fillText("INCOMING", w - 8, headerH / 2);
    }

    // Radios.
    const radioAreaTop = headerH + 4;
    const radioAreaH = h - radioAreaTop - 4;
    const radioH = Math.round(radioAreaH / radios.length);
    const radioW = w - 4;

    for (let i = 0; i < radios.length; i++) {
      const r = radios[i];
      renderRadio(
        r.config,
        { frequencyMhz: r.frequencyMhz, selected: i === selectedIdx },
        { ctx: ctx2d, x: 2, y: radioAreaTop + i * radioH, width: radioW, height: radioH - 3 },
      );
    }

    // Key hint at bottom (small text).
    ctx2d.fillStyle = "#475569";
    ctx2d.font = `${Math.max(9, Math.round(h * 0.035))}px monospace`;
    ctx2d.textAlign = "center";
    ctx2d.textBaseline = "bottom";
    ctx2d.fillText("↑↓ select radio  ←→ tune  Enter confirm", w / 2, h - 2);
  }

  // ── Public interface ───────────────────────────────────────────────────

  return {
    id: "comms",

    start(hostContainer: HTMLElement, rawConfig: Record<string, unknown>): void {
      config = resolveConfig(rawConfig);
      container = hostContainer;
      container.innerHTML = "";

      canvas = document.createElement("canvas");
      canvas.width  = 300;
      canvas.height = 380;
      canvas.style.width  = "100%";
      canvas.style.height = "100%";
      canvas.style.objectFit = "contain";
      container.appendChild(canvas);

      ctx2d = canvas.getContext("2d");
      if (!ctx2d) throw new Error("Canvas 2D context unavailable for comms.");

      // Initialise radio runtimes.
      radios = config.radios.map((def) => ({
        config: { id: def.id, label: def.label },
        frequencyMhz: def.defaultFreqMhz,
      }));
      selectedIdx = 0;

      audio = new AudioService();

      // Preload clips if clip-based audio is configured.
      if (config.clips) {
        const manifest = buildAudioClipManifest(config.clips.baseUrl);
        audio.preloadClips(manifest).catch((err) => {
          console.warn("[CommsSubTask] Clip preload error:", err);
        });
      }

      startMs = performance.now();
    },

    step(_now: number, dt: number): void {
      if (!config || !activePrompt) {
        renderAll();
        return;
      }

      // Count down response window.
      activePrompt.elapsedMs += dt;
      if (activePrompt.elapsedMs >= config.responseTimeoutMs) {
        resolvePrompt(false); // MISS or CR
      }

      renderAll();
    },

    handleKeyDown(key: string, _now: number): boolean {
      if (!config) return false;
      const k = key.toLowerCase();

      if (k === config.keys.radioUp) {
        selectedIdx = (selectedIdx - 1 + radios.length) % radios.length;
        return true;
      }
      if (k === config.keys.radioDown) {
        selectedIdx = (selectedIdx + 1) % radios.length;
        return true;
      }

      if (k === config.keys.freqUp) {
        const r = radios[selectedIdx];
        if (r) {
          r.frequencyMhz = Math.min(
            config.frequencyRange.maxMhz,
            Math.round((r.frequencyMhz + config.frequencyRange.stepMhz) * 1000) / 1000,
          );
        }
        return true;
      }
      if (k === config.keys.freqDown) {
        const r = radios[selectedIdx];
        if (r) {
          r.frequencyMhz = Math.max(
            config.frequencyRange.minMhz,
            Math.round((r.frequencyMhz - config.frequencyRange.stepMhz) * 1000) / 1000,
          );
        }
        return true;
      }

      if (k === config.keys.confirm) {
        if (activePrompt) {
          resolvePrompt(true); // HIT or FA
        }
        return true;
      }

      return false;
    },

    handleScenarioEvent(event: ScenarioEvent): void {
      if (event.command === "prompt") {
        // Only one prompt active at a time; dismiss any previous one first.
        if (activePrompt) resolvePrompt(false);
        startPrompt(event.value);
      }
      if (event.command === "set" && event.path === "ownCallsign" && config) {
        config.ownCallsign = asString(event.value) ?? config.ownCallsign;
      }
    },

    stop(): CommsSubTaskResult {
      if (activePrompt) resolvePrompt(false);

      audio?.stopAll();
      audio?.dispose();
      audio = null;

      if (container) container.innerHTML = "";

      const elapsed = performance.now() - startMs;
      const result: CommsSubTaskResult = {
        elapsedMs: Math.round(elapsed),
        records: [...records],
        hitCount:  records.filter((r) => r.outcome === "HIT").length,
        missCount: records.filter((r) => r.outcome === "MISS").length,
        faCount:   records.filter((r) => r.outcome === "FA").length,
        crCount:   records.filter((r) => r.outcome === "CR").length,
      };

      // Reset.
      config = null;
      radios = [];
      selectedIdx = 0;
      activePrompt = null;
      records = [];
      promptIdxCounter = 0;
      canvas = null;
      ctx2d = null;
      container = null;

      return result;
    },

    getPerformance(): SubTaskPerformance {
      const targets   = records.filter((r) => r.isOwnCallsign);
      const nonTargets = records.filter((r) => !r.isOwnCallsign);
      const hits   = targets.filter((r) => r.outcome === "HIT").length;
      const misses = targets.filter((r) => r.outcome === "MISS").length;
      const fas    = nonTargets.filter((r) => r.outcome === "FA").length;
      const targetN = hits + misses;
      const hitRate = targetN > 0 ? hits / targetN : 1;
      const faRate  = nonTargets.length > 0 ? fas / nonTargets.length : 0;
      const score   = Math.max(0, Math.min(1, hitRate - faRate * 0.5));
      return { score, metrics: { hitRate, faRate } };
    },
  };
}
