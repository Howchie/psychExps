export function isJatosAvailable() {
    return typeof window !== "undefined" && typeof window.jatos !== "undefined";
}
export function readJatosSelectionInput() {
    if (!isJatosAvailable())
        return null;
    return (window.jatos?.componentJsonInput ?? window.jatos?.studySessionData ?? null);
}
export async function submitToJatos(payload) {
    if (!isJatosAvailable())
        return false;
    try {
        await window.jatos.submitResultData(payload);
        return true;
    }
    catch (error) {
        console.error("JATOS submit failed", error);
        return false;
    }
}
export async function endJatosStudy() {
    if (!isJatosAvailable())
        return;
    try {
        await window.jatos.endStudy();
    }
    catch (error) {
        console.error("JATOS endStudy failed", error);
    }
}
//# sourceMappingURL=jatos.js.map