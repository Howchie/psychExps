import { downloadCsv, downloadJson } from "./data";
import { endJatosStudy, submitToJatos } from "./jatos";
import { resolveTemplate } from "./redirect";
import type { CoreConfig, SelectionContext } from "./types";

export interface FinalizeTaskRunArgs {
  coreConfig: CoreConfig;
  selection: SelectionContext;
  payload: unknown;
  csv?: {
    contents: string;
    suffix?: string;
  } | null;
  completionStatus?: "complete" | "incomplete";
  endJatosOnSubmit?: boolean;
}

export interface FinalizeTaskRunResult {
  submittedToJatos: boolean;
  redirected: boolean;
}

function resolveDataSettings(coreConfig: CoreConfig): { localSave: boolean; filePrefix: string } {
  const data = coreConfig.data;
  return {
    localSave: data?.localSave !== false,
    filePrefix: data?.filePrefix?.trim() || "experiments",
  };
}

export async function finalizeTaskRun(args: FinalizeTaskRunArgs): Promise<FinalizeTaskRunResult> {
  const { localSave, filePrefix } = resolveDataSettings(args.coreConfig);

  if (localSave) {
    downloadJson(args.payload, filePrefix, args.selection);
    if (args.csv?.contents) {
      downloadCsv(args.csv.contents, filePrefix, args.selection, args.csv.suffix ?? "trials");
    }
  }

  const submittedToJatos = await submitToJatos(args.payload as Record<string, unknown>);
  if (submittedToJatos && args.endJatosOnSubmit !== false) {
    await endJatosStudy();
  }

  const redirectCfg = args.coreConfig.completion?.redirect;
  const template =
    args.completionStatus === "incomplete"
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
