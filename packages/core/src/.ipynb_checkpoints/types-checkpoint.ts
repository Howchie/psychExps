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

export interface CoreConfig {
  selection: CoreSelectionDefaults;
  participant?: CoreParticipantConfig;
  completion?: CoreCompletionConfig;
  data?: CoreDataConfig;
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

export interface TaskAdapterContext {
  container: HTMLElement;
  selection: SelectionContext;
  coreConfig: CoreConfig;
  taskConfig: JSONObject;
}

export interface TaskAdapter {
  manifest: TaskManifest;
  launch(context: TaskAdapterContext): Promise<void>;
}
