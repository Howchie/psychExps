import { downloadCsv, downloadJson } from "../infrastructure/data";
import { endJatosStudy, submitToJatos } from "../infrastructure/jatos";
import { resolveTemplate } from "../infrastructure/redirect";
function resolveDataSettings(coreConfig) {
    const data = coreConfig.data;
    return {
        localSave: data?.localSave !== false,
        filePrefix: data?.filePrefix?.trim() || "experiments",
    };
}
export async function finalizeTaskRun(args) {
    const { localSave, filePrefix } = resolveDataSettings(args.coreConfig);
    if (localSave) {
        downloadJson(args.payload, filePrefix, args.selection);
        if (args.csv?.contents) {
            downloadCsv(args.csv.contents, filePrefix, args.selection, args.csv.suffix ?? "trials");
        }
    }
    const submittedToJatos = await submitToJatos(args.payload);
    if (submittedToJatos && args.endJatosOnSubmit !== false) {
        await endJatosStudy();
    }
    const redirectCfg = args.coreConfig.completion?.redirect;
    const template = args.completionStatus === "incomplete"
        ? redirectCfg?.incompleteUrlTemplate
        : redirectCfg?.completeUrlTemplate;
    const redirectEnabled = Boolean(redirectCfg?.enabled && template);
    if (redirectEnabled) {
        const resolved = resolveTemplate(template, args.selection);
        if (resolved) {
            window.location.assign(resolved);
            return { submittedToJatos, redirected: true };
        }
    }
    return { submittedToJatos, redirected: false };
}
//# sourceMappingURL=lifecycle.js.map