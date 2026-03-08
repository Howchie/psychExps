import { downloadCsv, downloadJson, inferCsvFromPayload } from "../infrastructure/data";
import { endJatosStudy, submitToJatos } from "../infrastructure/jatos";
import { resolveTemplate } from "../infrastructure/redirect";
import type { CoreConfig, SelectionContext } from "../api/types";

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

function resolveDataSettings(coreConfig: CoreConfig): {
  localSave: boolean;
  filePrefix: string;
  localSaveFormat: "csv" | "json" | "both";
} {
  const data = coreConfig.data;
  const rawFormat = data?.localSaveFormat;
  const localSaveFormat = rawFormat === "json" || rawFormat === "both" ? rawFormat : "csv";
  return {
    localSave: data?.localSave !== false,
    filePrefix: data?.filePrefix?.trim() || "experiments",
    localSaveFormat,
  };
}

export async function finalizeTaskRun(args: FinalizeTaskRunArgs): Promise<FinalizeTaskRunResult> {
  const { localSave, filePrefix, localSaveFormat } = resolveDataSettings(args.coreConfig);

  if (localSave) {
    if (localSaveFormat !== "json") {
      const csvContents =
        args.csv?.contents ?? inferCsvFromPayload(args.payload);
      if (csvContents != null) {
        downloadCsv(csvContents, filePrefix, args.selection, args.csv?.suffix ?? "trials");
      }
    }

    if (localSaveFormat !== "csv") {
      downloadJson(args.payload, filePrefix, args.selection);
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
