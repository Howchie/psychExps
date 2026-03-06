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
  variantId: string;
  configPath?: string | null;
  overrides?: JSONObject | null;
  auto?: boolean | null;
  participant: ParticipantIds;
  completionCode?: string | null;
  source: {
    task: "jatos" | "url" | "default";
    variant: "jatos" | "url" | "default";
  };
}

export interface CoreSelectionDefaults {
  taskId: string;
  variantId: string;
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
}

export interface AutoResponderRangeConfig {
  minMs?: number;
  maxMs?: number;
}

export interface AutoResponderConfig {
  enabled?: boolean;
  seed?: string | number;
  continueDelayMs?: AutoResponderRangeConfig;
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

export interface CoreConfig {
  selection: CoreSelectionDefaults;
  participant?: CoreParticipantConfig;
  completion?: CoreCompletionConfig;
  data?: CoreDataConfig;
  autoresponder?: AutoResponderConfig;
  ui?: CoreUiConfig;
}

export interface TaskVariantManifest {
  id: string;
  label: string;
  configPath?: string;
}

export interface TaskManifest {
  taskId: string;
  label: string;
  variants: TaskVariantManifest[];
}

export interface TaskRegistry {
  tasks: TaskManifest[];
}

import type { VariableResolver } from "../infrastructure/variables";

export interface TaskAdapterContext {
  container: HTMLElement;
  selection: SelectionContext;
  coreConfig: CoreConfig;
  taskConfig: JSONObject;
  resolver: VariableResolver;
}


