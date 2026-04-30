export type Platform = "jatos" | "prolific" | "sona" | "local";

export type JSONObject = Record<string, unknown>;

export interface ParticipantIds {
  participantId: string;
  studyId: string;
  sessionId: string;
  sonaId?: string | null;
}

export interface SelectionContext {
  platform: Platform;
  taskId: string;
  configPath?: string | null;
  overrides?: JSONObject | null;
  auto?: boolean | null;
  participant: ParticipantIds;
  completionCode?: string | null;
  source: {
    task: "jatos" | "url" | "default";
  };
}

export interface CoreSelectionDefaults {
  taskId: string;
}

export interface CoreParticipantConfig {
  participantParamCandidates?: string[];
  studyParamCandidates?: string[];
  sessionParamCandidates?: string[];
}

export interface CoreRedirectConfig {
  enabled: boolean;
  completeUrlTemplate?: string;
  incompleteUrlTemplate?: string;
}

export interface CoreCompletionConfig {
  ethics?: {
    enabled: boolean;
    htmlPath?: string;
    consentKey?: string;
    declineKey?: string;
  };
  debrief?: {
    enabled: boolean;
    htmlPath?: string;
  };
  redirect?: CoreRedirectConfig;
}

export interface CoreDataConfig {
  localSave: boolean;
  filePrefix: string;
  localSaveFormat?: "csv" | "json" | "both";
}

export interface AutoResponderRangeConfig {
  minMs?: number;
  maxMs?: number;
  distribution?: "uniform" | "normal";
  meanMs?: number;
  sdMs?: number;
  truncate?: boolean;
}

export interface AutoResponderConfig {
  enabled?: boolean;
  jsPsychSimulationMode?: "data-only" | "visual";
  seed?: string | number;
  continueDelayMs?: AutoResponderRangeConfig;
  surveySubmitDelayMs?: AutoResponderRangeConfig;
  responseRtMs?: {
    meanMs?: number;
    sdMs?: number;
    minMs?: number;
    maxMs?: number;
  };
  timeoutRate?: number;
  errorRate?: number;
  interActionDelayMs?: AutoResponderRangeConfig;
  holdDurationMs?: AutoResponderRangeConfig;
  maxTrialDurationMs?: number;
}

export interface CoreUiConfig {
  pageBackground?: string;
}

export interface CoreEegConfig {
  enabled?: boolean;
  /**
   * Base URL for the local EEG bridge process.
   * Example: http://127.0.0.1:8787
   */
  bridgeUrl?: string;
  /**
   * If true, experiment launch is blocked when bridge health check fails.
   */
  requireBridge?: boolean;
  /**
   * Session event types to forward to the EEG bridge.
   * Defaults to trial/task boundaries when omitted.
   */
  eventTypes?: string[];
  /**
   * If true, include session event payload data in forwarded EEG events.
   */
  includeEventPayload?: boolean;
}

export interface CoreConfig {
  selection: CoreSelectionDefaults;
  participant?: CoreParticipantConfig;
  completion?: CoreCompletionConfig;
  data?: CoreDataConfig;
  autoresponder?: AutoResponderConfig;
  ui?: CoreUiConfig;
  eeg?: CoreEegConfig;
}

export interface TaskManifest {
  taskId: string;
  label: string;
}

export interface TaskRegistry {
  tasks: TaskManifest[];
}

import type { EventLogger } from "../infrastructure/events";
import type { VariableResolver } from "../infrastructure/variables";
import type { TaskModuleRunner } from "./taskModule";

export interface TaskAdapterContext {
  container: HTMLElement;
  selection: SelectionContext;
  coreConfig: CoreConfig;
  taskConfig: JSONObject;
  rawTaskConfig: JSONObject;
  resolver: VariableResolver;
  moduleRunner: TaskModuleRunner;
  eventLogger: EventLogger;
}
