const fallbackId = (prefix) => {
    const rand = Math.floor(Math.random() * 1e10).toString(36);
    return `${prefix}_${Date.now().toString(36)}_${rand}`;
};
const firstNonEmpty = (params, candidates) => {
    for (const key of candidates) {
        const raw = params.get(key);
        if (raw && raw.trim())
            return raw.trim();
    }
    return null;
};
export function resolveParticipantIds(params, cfg) {
    const participantCandidates = cfg?.participantParamCandidates ?? [
        "PROLIFIC_PID",
        "SONA_ID",
        "participant",
        "survey_code",
    ];
    const studyCandidates = cfg?.studyParamCandidates ?? ["STUDY_ID", "study_id"];
    const sessionCandidates = cfg?.sessionParamCandidates ?? ["SESSION_ID", "session_id"];
    const participantId = firstNonEmpty(params, participantCandidates) ?? fallbackId("P");
    const studyId = firstNonEmpty(params, studyCandidates) ?? fallbackId("S");
    const sessionId = firstNonEmpty(params, sessionCandidates) ?? fallbackId("SESS");
    const sonaId = params.get("SONA_ID");
    return {
        participantId,
        studyId,
        sessionId,
        sonaId,
    };
}
//# sourceMappingURL=participant.js.map