export function getJatosApi() {
    if (typeof window === "undefined")
        return undefined;
    if (window.jatos)
        return window.jatos;
    try {
        return typeof jatos !== "undefined" ? jatos : undefined;
    }
    catch {
        return undefined;
    }
}
export function isJatosAvailable() {
    return typeof getJatosApi() !== "undefined";
}
function toObject(value) {
    if (value && typeof value === "object" && !Array.isArray(value))
        return value;
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed)
            return null;
        try {
            const parsed = JSON.parse(trimmed);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
                return parsed;
        }
        catch {
            return null;
        }
    }
    return null;
}
export function readJatosSelectionInput() {
    const api = getJatosApi();
    if (!api)
        return null;
    const fromComponent = toObject(api.componentJsonInput);
    if (fromComponent)
        return fromComponent;
    return toObject(api.studySessionData);
}
function appendObjectEntriesToParams(params, source) {
    for (const [key, value] of Object.entries(source)) {
        if (value == null)
            continue;
        if (Array.isArray(value)) {
            for (const entry of value) {
                if (entry == null)
                    continue;
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
export function readJatosUrlQueryParameters() {
    const api = getJatosApi();
    if (!api || !api.urlQueryParameters || typeof api.urlQueryParameters !== "object") {
        return new URLSearchParams();
    }
    const params = new URLSearchParams();
    appendObjectEntriesToParams(params, api.urlQueryParameters);
    return params;
}
export async function submitToJatos(payload) {
    const api = getJatosApi();
    if (!api)
        return false;
    try {
        await api.submitResultData(payload);
        return true;
    }
    catch (error) {
        console.error("JATOS submit failed", error);
        return false;
    }
}
export async function appendToJatos(payload) {
    const api = getJatosApi();
    if (!api || typeof api.appendResultData !== "function")
        return false;
    try {
        await api.appendResultData(payload);
        return true;
    }
    catch (error) {
        console.error("JATOS append failed", error);
        return false;
    }
}
export async function endJatosStudy() {
    const api = getJatosApi();
    if (!api)
        return;
    try {
        await api.endStudy();
    }
    catch (error) {
        console.error("JATOS endStudy failed", error);
    }
}
//# sourceMappingURL=jatos.js.map