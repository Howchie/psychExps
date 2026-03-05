export function resolveTemplate(template, selection) {
    if (!template)
        return "";
    const replacements = {
        participantId: selection.participant.participantId,
        studyId: selection.participant.studyId,
        sessionId: selection.participant.sessionId,
        PROLIFIC_PID: selection.participant.participantId,
        STUDY_ID: selection.participant.studyId,
        SESSION_ID: selection.participant.sessionId,
        survey_code: selection.completionCode ?? "",
        taskId: selection.taskId,
        variantId: selection.variantId,
    };
    return template.replace(/\{([^}]+)\}/g, (_, token) => replacements[token] ?? "");
}
//# sourceMappingURL=redirect.js.map