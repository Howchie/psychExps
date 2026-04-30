import type { SelectionContext } from "../api/types";

export function resolveTemplate(template: string | undefined, selection: SelectionContext): string {
  if (!template) return "";
  const replacements: Record<string, string> = {
    participantId: selection.participant.participantId,
    studyId: selection.participant.studyId,
    sessionId: selection.participant.sessionId,
    PROLIFIC_PID: selection.participant.participantId,
    STUDY_ID: selection.participant.studyId,
    SESSION_ID: selection.participant.sessionId,
    survey_code: selection.completionCode ?? "",
    taskId: selection.taskId,
    configPath: selection.configPath ?? "",
  };

  return template.replace(/\{([^}]+)\}/g, (_, token: string) => replacements[token] ?? "");
}
