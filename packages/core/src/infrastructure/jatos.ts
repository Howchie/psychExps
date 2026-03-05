import type { JSONObject } from "../api/types";

declare global {
  interface Window {
    jatos?: {
      submitResultData: (payload: string | JSONObject) => Promise<void>;
      endStudy: () => Promise<void>;
      componentJsonInput?: JSONObject;
      studySessionData?: JSONObject;
    };
  }
}

export function isJatosAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.jatos !== "undefined";
}

export function readJatosSelectionInput(): JSONObject | null {
  if (!isJatosAvailable()) return null;
  return (window.jatos?.componentJsonInput ?? window.jatos?.studySessionData ?? null) as JSONObject | null;
}

export async function submitToJatos(payload: string | JSONObject): Promise<boolean> {
  if (!isJatosAvailable()) return false;
  try {
    await window.jatos!.submitResultData(payload);
    return true;
  } catch (error) {
    console.error("JATOS submit failed", error);
    return false;
  }
}

export async function endJatosStudy(): Promise<void> {
  if (!isJatosAvailable()) return;
  try {
    await window.jatos!.endStudy();
  } catch (error) {
    console.error("JATOS endStudy failed", error);
  }
}
