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
 *   FA   = confirmed while audio is still playing, or other callsign confirmed
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
  /**
   * When true, the panel is displayed and audio plays but no key input is
   * accepted. Prompts are resolved automatically once audio finishes:
   * own-callsign prompts auto-select the correct radio/frequency (HIT),
   * other-callsign prompts resolve immediately as CR.
   */
  automated?: boolean;
  /**
   * When true, no audio is played. The panel still renders and, if
   * `automated` is also true, prompts resolve visually.
   * Combine with `automatedResponseDelayMs` to keep the INCOMING indicator
   * visible for a realistic duration before auto-resolving.
   */
  muteAudio?: boolean;
  /**
   * Minimum milliseconds to wait after audio finishes (or immediately, if
   * muted) before auto-resolving in automated mode. Default 0.
   * Set to e.g. 3000 when muted to give participants time to see the panel.
   */
  automatedResponseDelayMs?: number;
}

// ---------------------------------------------------------------------------
// Record types (for data export)
// ---------------------------------------------------------------------------

/**
 * Signal-detection outcomes, matching OpenMATB's get_sdt_value() categories:
 *   HIT           = own callsign, correct radio, correct frequency
 *   MISS          = own callsign, no response by timeout
 *   BAD_RADIO     = own callsign, responded but wrong radio (correct freq)
 *   BAD_FREQ      = own callsign, responded with correct radio but wrong freq
 *   BAD_RADIO_FREQ = own callsign, responded with wrong radio AND wrong freq
 *   FA            = confirmed when no target waiting (audio still playing OR other callsign)
 *   CR            = other callsign, no response (correct rejection)
 */
export type CommsOutcome = "HIT" | "MISS" | "BAD_RADIO" | "BAD_FREQ" | "BAD_RADIO_FREQ" | "FA" | "CR";

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
  /**
   * Signed deviation from target frequency in MHz (null = no response or FA).
   * Positive = tuned above target, negative = below. Rounded to 0.1 MHz.
   * Matches OpenMATB: round(currentfreq - targetfreq, 1).
   */
  freqDeviationMhz: number | null;
  responded: boolean;
  outcome: CommsOutcome;
  /**
   * Response time in ms from audio playback end to confirmation.
   * Matches OpenMATB: response_time is accumulated only after is_prompting = False.
   * Null if no response or if the confirmation occurred during audio playback.
   */
  rtMs: number | null;
}

export interface CommsSubTaskResult {
  elapsedMs: number;
  records: CommsPromptRecord[];
  hitCount: number;
  missCount: number;
  badRadioCount: number;
  badFreqCount: number;
  badRadioFreqCount: number;
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
  automated: boolean;
  muteAudio: boolean;
  automatedResponseDelayMs: number;
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
  /**
   * True once audio playback has finished.
   * Timeout and RT are measured from this point, matching OpenMATB's
   * is_prompting = False transition.
   */
  audioFinished: boolean;
  /**
   * Elapsed ms counted only after audioFinished = true.
   * Used for both timeout detection and RT logging.
   */
  audioElapsedMs: number;
  /**
   * Total elapsed ms since prompt started (used as fallback in case audio
   * completion callback never fires, e.g. synthesis failure).
   */
  totalElapsedMs: number;
  speechHandle: ReturnType<AudioService["speakText"]> | null;
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
 */
function buildPromptText(callsign: string, radioLabel: string, freqMhz: number): string {
  return `${callsign}, ${radioLabel}, ${toSpokenFrequency(freqMhz)}`;
}

/**
 * Build the clip ID sequence for a comms prompt (OpenMATB-style).
 */
function buildPromptClipSequence(callsign: string, radioId: string, freqMhz: number): string[] {
  const ids: string[] = [];

  // 20 silence clips.
  for (let i = 0; i < 20; i++) ids.push("empty");

  // Callsign announced twice.
  const callsignClips: string[] = [];
  for (const ch of callsign.toLowerCase()) {
    if (/[a-z0-9]/.test(ch)) callsignClips.push(ch);
  }
  ids.push(...callsignClips, ...callsignClips);

  // "radio" cue word then the radio clip ID.
  const radioClipId = radioId
    .toLowerCase()
    .replace(/^(com|nav)(\d)$/, "$1_$2");
  ids.push("radio");
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

  // Trailing silence.
  ids.push("empty");

  return ids;
}

/**
 * Build the AudioClipManifest for the English-male clip set.
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
    automated: raw.automated === true || raw.automated === "true",
    muteAudio: raw.muteAudio === true || raw.muteAudio === "true",
    automatedResponseDelayMs: toNonNegativeNumber(raw.automatedResponseDelayMs, 0),
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

  // Continuous frequency modulation — matches OpenMATB's held-key behaviour
  // (0.1 MHz per 80 ms update cycle).
  const heldKeys = new Set<string>();
  let freqModAccMs = 0;
  const MODULATION_INTERVAL_MS = 80;
  let keyUpListener: ((e: KeyboardEvent) => void) | null = null;

  // Maximum time to wait for audio completion before treating it as done.
  // Guards against speech-synthesis onEnd never firing (e.g. context suspend).
  const MAX_AUDIO_WAIT_MS = 15000;

  // ── Prompt helpers ──────────────────────────────────────────────────────

  function startPrompt(value: unknown): void {
    if (!config) return;
    const v = asObject(value) ?? {};
    const callsign     = asString(v.callsign) ?? config.ownCallsign;
    const radioId      = asString(v.radio)    ?? config.radios[0]?.id ?? "";
    const targetFreq   = toPositiveFloat(v.frequency, config.radios[0]?.defaultFreqMhz ?? 118.0);
    const isOwn        = callsign.toLowerCase() === config.ownCallsign.toLowerCase();

    const prompt: ActivePrompt = {
      callsign,
      targetRadioId: radioId,
      targetFreqMhz: targetFreq,
      isOwn,
      startMs:       performance.now() - startMs,
      promptIdx:     promptIdxCounter++,
      audioFinished: false,
      audioElapsedMs: 0,
      totalElapsedMs: 0,
      speechHandle:  null,
      usingClips:    false,
    };
    activePrompt = prompt;

    // Mark audio as finished on completion — timer and RT start from this point,
    // matching OpenMATB's response_time accumulation after is_prompting = False.
    const markAudioDone = (): void => {
      if (activePrompt === prompt) {
        prompt.audioFinished = true;
      }
    };

    if (config.muteAudio) {
      // Audio disabled — treat as immediately finished; visual display is
      // driven by automatedResponseDelayMs in step() when automated.
      prompt.audioFinished = true;
    } else if (config.clips && audio) {
      prompt.usingClips = true;
      const clipIds = buildPromptClipSequence(callsign, radioId, targetFreq);
      const gapMs = config.clips.gapMs ?? 0;
      audio.playSequence(clipIds, gapMs).then(markAudioDone).catch(markAudioDone);
    } else if (audio) {
      const radioDef = config.radios.find((r) => r.id === radioId);
      const radioLabel = radioDef?.label ?? radioId.toUpperCase();
      const promptText = buildPromptText(callsign, radioLabel, targetFreq);
      prompt.speechHandle = audio.speakText(promptText, {
        voiceNames: config.speech.voiceNames,
        lang:       config.speech.lang,
        rate:       config.speech.rate,
        pitch:      config.speech.pitch,
        onEnd:      markAudioDone,
      });
    } else {
      // No audio service — treat as immediately done.
      prompt.audioFinished = true;
    }
  }

  /**
   * Called when the participant confirms (Enter) after audio has finished.
   * Scores the response as HIT/MISS/BAD_RADIO/BAD_FREQ/FA/CR and closes the prompt.
   */
  function resolvePrompt(respondedNow: boolean): void {
    if (!activePrompt || !config) return;

    const p = activePrompt;
    const currentRadio = radios[selectedIdx];
    // RT is time from audio end to confirmation, matching OpenMATB.
    const rt = respondedNow ? Math.round(p.audioElapsedMs) : null;

    let outcome: CommsOutcome;
    let freqDeviation: number | null = null;

    if (p.isOwn) {
      if (respondedNow) {
        const selectedRadioId = currentRadio?.config.id ?? null;
        const enteredFreqMhz  = currentRadio?.frequencyMhz ?? null;
        const radioMatch = selectedRadioId === p.targetRadioId;
        freqDeviation = enteredFreqMhz !== null
          ? Math.round((enteredFreqMhz - p.targetFreqMhz) * 10) / 10
          : null;
        const freqMatch = freqDeviation === 0;
        if (radioMatch && freqMatch)       outcome = "HIT";
        else if (!radioMatch && freqMatch) outcome = "BAD_RADIO";
        else if (radioMatch && !freqMatch) outcome = "BAD_FREQ";
        else                               outcome = "BAD_RADIO_FREQ";
      } else {
        outcome = "MISS";
      }
    } else {
      outcome = respondedNow ? "FA" : "CR";
    }

    records.push({
      promptIdx:        p.promptIdx,
      callsign:         p.callsign,
      isOwnCallsign:    p.isOwn,
      targetRadio:      p.targetRadioId,
      targetFreqMhz:    p.targetFreqMhz,
      selectedRadio:    respondedNow ? (currentRadio?.config.id ?? null) : null,
      enteredFreqMhz:   respondedNow ? (currentRadio?.frequencyMhz ?? null) : null,
      freqDeviationMhz: freqDeviation,
      responded:        respondedNow,
      outcome,
      rtMs: rt,
    });

    if (p.usingClips) {
      audio?.stopAll();
    } else {
      p.speechHandle?.stop();
    }
    activePrompt = null;
  }

  /**
   * Called when Enter is pressed while audio is still playing.
   * Matches OpenMATB behaviour: pressing Enter before is_prompting transitions
   * to False is scored as a FA (no target is "waiting" yet), and the prompt
   * remains open so the participant can still respond correctly after audio ends.
   */
  function handleEarlyConfirm(): void {
    if (!activePrompt || !config) return;
    const p = activePrompt;
    const currentRadio = radios[selectedIdx];

    records.push({
      promptIdx:        p.promptIdx,
      callsign:         p.callsign,
      isOwnCallsign:    p.isOwn,
      targetRadio:      p.targetRadioId,
      targetFreqMhz:    p.targetFreqMhz,
      selectedRadio:    currentRadio?.config.id ?? null,
      enteredFreqMhz:   currentRadio?.frequencyMhz ?? null,
      freqDeviationMhz: null,
      responded:        true,
      outcome:          "FA",
      rtMs:             null,
    });
    // Prompt stays open — participant can still respond after audio ends.
  }

  // ── Rendering ─────────────────────────────────────────────────────────

  let handoverBanner: { text: string; isAuto: boolean; startMs: number } | null = null;
  const BANNER_MS = 2500;

  function drawHandoverBanner(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    if (!handoverBanner) return;
    const elapsed = performance.now() - handoverBanner.startMs;
    if (elapsed >= BANNER_MS) { handoverBanner = null; return; }
    const alpha = Math.max(0, 1 - elapsed / BANNER_MS);
    const color = handoverBanner.isAuto ? "rgba(56, 189, 248, 0.9)" : "rgba(251, 146, 60, 0.9)";
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
    ctx.fillRect(0, Math.round(h * 0.38), w, Math.round(h * 0.24));
    ctx.fillStyle = color;
    ctx.font = `bold ${Math.round(h * 0.1)}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(handoverBanner.text, w / 2, Math.round(h / 2));
    ctx.restore();
  }

  function renderAll(): void {
    if (!ctx2d || !canvas || !config) return;
    const w = canvas.width;
    const h = canvas.height;

    ctx2d.clearRect(0, 0, w, h);
    ctx2d.fillStyle = "#0d1117";
    ctx2d.fillRect(0, 0, w, h);

    // Automation accent: subtle left-edge bar when automated.
    if (config.automated) {
      ctx2d.fillStyle = "rgba(56, 189, 248, 0.35)";  // sky-400 at 35%
      ctx2d.fillRect(0, 0, 4, h);
    }

    // Header bar.
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

    // Callsign display — matches OpenMATB COMMS panel "Callsign: {owncallsign}" widget.
    const callsignBarH = Math.round(h * 0.06);
    ctx2d.fillStyle = "#1e293b";
    ctx2d.fillRect(0, headerH, w, callsignBarH);
    ctx2d.fillStyle = "#64748b";
    ctx2d.font = `${Math.round(callsignBarH * 0.55)}px monospace`;
    ctx2d.textAlign = "left";
    ctx2d.textBaseline = "middle";
    ctx2d.fillText(`Callsign: ${config.ownCallsign}`, 8, headerH + callsignBarH / 2);

    // Radios.
    const radioAreaTop = headerH + callsignBarH + 4;
    const radioAreaH = h - radioAreaTop - 24; // leave space for key hint
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

    // Key hint at bottom.
    ctx2d.fillStyle = "#475569";
    ctx2d.font = `${Math.max(9, Math.round(h * 0.035))}px monospace`;
    ctx2d.textAlign = "center";
    ctx2d.textBaseline = "bottom";
    ctx2d.fillText("↑↓ select  ←→ tune (hold)  Enter confirm", w / 2, h - 2);

    drawHandoverBanner(ctx2d, w, h);
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

      radios = config.radios.map((def) => ({
        config: { id: def.id, label: def.label },
        frequencyMhz: def.defaultFreqMhz,
      }));
      selectedIdx = 0;

      audio = new AudioService();

      if (config.clips) {
        const manifest = buildAudioClipManifest(config.clips.baseUrl);
        audio.preloadClips(manifest).catch((err) => {
          console.warn("[CommsSubTask] Clip preload error:", err);
        });
      }

      // Track key-up events to support continuous held-key frequency tuning,
      // matching OpenMATB's modulate_frequency() called every 80 ms while held.
      heldKeys.clear();
      freqModAccMs = 0;
      keyUpListener = (e: KeyboardEvent): void => {
        heldKeys.delete(e.key.toLowerCase());
      };
      document.addEventListener("keyup", keyUpListener);

      startMs = performance.now();
    },

    step(_now: number, dt: number): void {
      if (!config) {
        renderAll();
        return;
      }

      // Tick active prompt timers.
      if (activePrompt) {
        activePrompt.totalElapsedMs += dt;

        // Fallback: if audio completion never fires within MAX_AUDIO_WAIT_MS,
        // treat audio as done so the response window still opens.
        if (!activePrompt.audioFinished && activePrompt.totalElapsedMs >= MAX_AUDIO_WAIT_MS) {
          activePrompt.audioFinished = true;
        }

        if (activePrompt.audioFinished) {
          activePrompt.audioElapsedMs += dt;

          if (config.automated && activePrompt.audioElapsedMs >= config.automatedResponseDelayMs) {
            // Auto-respond: set correct state for own-callsign then resolve.
            if (activePrompt.isOwn) {
              const targetIdx = radios.findIndex((r) => r.config.id === activePrompt!.targetRadioId);
              if (targetIdx !== -1) {
                selectedIdx = targetIdx;
                radios[targetIdx]!.frequencyMhz = activePrompt.targetFreqMhz;
              }
            }
            resolvePrompt(activePrompt.isOwn); // HIT for own, CR for others
          } else if (!config.automated && activePrompt.audioElapsedMs >= config.responseTimeoutMs) {
            // Timeout: matches OpenMATB maxresponsedelay from audio-end.
            resolvePrompt(false); // MISS or CR
          }
        }
      }

      // Continuous frequency modulation — 0.1 MHz per 80 ms while key held,
      // matching OpenMATB's modulate_frequency() polled each update cycle.
      if (heldKeys.has(config.keys.freqUp) || heldKeys.has(config.keys.freqDown)) {
        freqModAccMs += dt;
        while (freqModAccMs >= MODULATION_INTERVAL_MS) {
          freqModAccMs -= MODULATION_INTERVAL_MS;
          const r = radios[selectedIdx];
          if (r) {
            if (heldKeys.has(config.keys.freqUp)) {
              r.frequencyMhz = Math.min(
                config.frequencyRange.maxMhz,
                Math.round((r.frequencyMhz + config.frequencyRange.stepMhz) * 1000) / 1000,
              );
            }
            if (heldKeys.has(config.keys.freqDown)) {
              r.frequencyMhz = Math.max(
                config.frequencyRange.minMhz,
                Math.round((r.frequencyMhz - config.frequencyRange.stepMhz) * 1000) / 1000,
              );
            }
          }
        }
      } else {
        freqModAccMs = 0;
      }

      renderAll();
    },

    handleKeyDown(key: string, _now: number): boolean {
      if (!config || config.automated) return false;
      const k = key.toLowerCase();

      // Track all key presses for continuous modulation.
      heldKeys.add(k);

      // Radio selection — clamped (not wrapped), matching OpenMATB's
      // keep_value_between(pos + delta, down=min_pos, up=max_pos).
      if (k === config.keys.radioUp) {
        selectedIdx = Math.max(0, selectedIdx - 1);
        return true;
      }
      if (k === config.keys.radioDown) {
        selectedIdx = Math.min(radios.length - 1, selectedIdx + 1);
        return true;
      }

      // Frequency keys: held-key modulation is handled in step(); just consume
      // the event here so the runner doesn't route it elsewhere.
      if (k === config.keys.freqUp || k === config.keys.freqDown) {
        return true;
      }

      if (k === config.keys.confirm) {
        if (activePrompt) {
          if (!activePrompt.audioFinished) {
            // Audio still playing: FA, prompt stays open (matches OpenMATB
            // pressing Enter while is_prompting = True → no waiting radio → FA).
            handleEarlyConfirm();
          } else {
            resolvePrompt(true);
          }
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
      if (event.command === "set" && event.path === "automated") {
        const newAutomated = event.value === true || event.value === "true";
        if (config && newAutomated !== config.automated) {
          config.automated = newAutomated;
          handoverBanner = { text: newAutomated ? "→ AUTO" : "→ MANUAL", isAuto: newAutomated, startMs: performance.now() };
        }
      }
    },

    stop(): CommsSubTaskResult {
      if (activePrompt) resolvePrompt(false);

      audio?.stopAll();
      audio?.dispose();
      audio = null;

      if (keyUpListener) {
        document.removeEventListener("keyup", keyUpListener);
        keyUpListener = null;
      }
      heldKeys.clear();

      if (container) container.innerHTML = "";

      const elapsed = performance.now() - startMs;
      const result: CommsSubTaskResult = {
        elapsedMs: Math.round(elapsed),
        records: [...records],
        hitCount:          records.filter((r) => r.outcome === "HIT").length,
        missCount:         records.filter((r) => r.outcome === "MISS").length,
        badRadioCount:     records.filter((r) => r.outcome === "BAD_RADIO").length,
        badFreqCount:      records.filter((r) => r.outcome === "BAD_FREQ").length,
        badRadioFreqCount: records.filter((r) => r.outcome === "BAD_RADIO_FREQ").length,
        faCount:           records.filter((r) => r.outcome === "FA").length,
        crCount:           records.filter((r) => r.outcome === "CR").length,
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
      freqModAccMs = 0;

      return result;
    },

    getPerformance(): SubTaskPerformance {
      const targets    = records.filter((r) => r.isOwnCallsign);
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
