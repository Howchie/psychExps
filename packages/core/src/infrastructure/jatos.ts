import { isAutoResponderEnabled } from "../runtime/autoresponder";
import type { JSONObject } from "../api/types";

declare global {
  interface Window {
    jatos?: {
      submitResultData: (payload: string | JSONObject) => Promise<void>;
      appendResultData?: (payload: string | JSONObject) => Promise<void>;
      endStudy: () => Promise<void>;
      endStudyAndRedirect: (url: string) => Promise<void>;
      onLoad?: (cb: () => void) => void;
      componentJsonInput?: JSONObject | string;
      studySessionData?: JSONObject | string;
      urlQueryParameters?: Record<string, unknown>;
    };
  }
}

declare const jatos: Window["jatos"] | undefined;

export function getJatosApi(): Window["jatos"] | undefined {
  if (typeof window === "undefined") return undefined;
  if (window.jatos) return window.jatos;
  try {
    return typeof jatos !== "undefined" ? jatos : undefined;
  } catch {
    return undefined;
  }
}

export function isJatosAvailable(): boolean {
  return typeof getJatosApi() !== "undefined";
}

function toObject(value: unknown): JSONObject | null {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as JSONObject;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as JSONObject;
    } catch {
      return null;
    }
  }
  return null;
}

export function readJatosSelectionInput(): JSONObject | null {
  const api = getJatosApi();
  if (!api) return null;
  const fromComponent = toObject(api.componentJsonInput);
  if (fromComponent) return fromComponent;
  return toObject(api.studySessionData);
}

function appendObjectEntriesToParams(params: URLSearchParams, source: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(source)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (entry == null) continue;
        params.append(key, String(entry));
      }
      continue;
    }
    params.append(key, String(value));
  }
}

/**
 * Returns launch query parameters preserved by JATOS across Publix redirects.
 * Falls back to an empty URLSearchParams if not available.
 */
export function readJatosUrlQueryParameters(): URLSearchParams {
  const api = getJatosApi();
  if (!api || !api.urlQueryParameters || typeof api.urlQueryParameters !== "object") {
    return new URLSearchParams();
  }
  const params = new URLSearchParams();
  appendObjectEntriesToParams(params, api.urlQueryParameters);
  return params;
}

export async function submitToJatos(payload: string | JSONObject): Promise<boolean> {
  const api = getJatosApi();
  if (!api) return false;
  try {
    await api.submitResultData(payload);
    return true;
  } catch (error) {
    console.error("JATOS submit failed", error);
    return false;
  }
}

export async function appendToJatos(payload: string | JSONObject): Promise<boolean> {
  const api = getJatosApi();
  if (!api || typeof api.appendResultData !== "function") return false;
  try {
    await api.appendResultData(payload);
    return true;
  } catch (error) {
    console.error("JATOS append failed", error);
    return false;
  }
}

export async function endJatosStudy(): Promise<void> {
  const api = getJatosApi();
  if (!api) return;
  try {
    await api.endStudy();
  } catch (error) {
    console.error("JATOS endStudy failed", error);
  }
}

export async function endJatosStudyAndRedirect(url: string): Promise<void> {
  const api = getJatosApi();
  if (isAutoResponderEnabled()) {
    console.log(`[AutoResponder] JATOS Redirecting to: ${url}`);
  }
  if (!api) return;
  try {
    if (typeof api.endStudyAndRedirect === "function") {
      if (!isAutoResponderEnabled()) {
        await api.endStudyAndRedirect(url);
      }
    } else {
      await api.endStudy();
      if (!isAutoResponderEnabled()) {
        window.location.assign(url);
      }
    }
  } catch (error) {
    console.error("JATOS endStudyAndRedirect failed", error);
    if (!isAutoResponderEnabled()) {
      window.location.assign(url);
    }
  }
}
