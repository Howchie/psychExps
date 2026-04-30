import { downloadCsv, downloadJson, inferCsvFromPayload } from "../infrastructure/data";
import { appendToJatos, endJatosStudy, endJatosStudyAndRedirect, submitToJatos } from "../infrastructure/jatos";
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
  extraCsvs?: Array<{
    contents: string;
    suffix?: string;
  }>;
  completionStatus?: "complete" | "incomplete";
  endJatosOnSubmit?: boolean;
  jatosHandledBySink?: boolean;
}

export interface FinalizeTaskRunResult {
  submittedToJatos: boolean;
  redirected: boolean;
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function buildReducedJatosPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const records = Array.isArray(payload.records) ? payload.records : [];
  const events = Array.isArray(payload.events) ? payload.events : [];
  const moduleResults = asObject(payload.moduleResults);
  return {
    ...payload,
    records: undefined,
    events: undefined,
    moduleResults: undefined,
    recordCount: records.length,
    eventCount: events.length,
    moduleResultKeys: moduleResults ? Object.keys(moduleResults) : [],
    payloadReducedForJatos: true,
  };
}

async function submitToJatosWithFallback(payload: unknown): Promise<boolean> {
  const payloadObject = asObject(payload);
  if (!payloadObject) return submitToJatos({ payload });

  if (await submitToJatos(payloadObject)) return true;

  const reducedPayload = buildReducedJatosPayload(payloadObject);
  if (await submitToJatos(reducedPayload)) return true;

  const appendEnvelope = {
    kind: "finalize_fallback",
    ts: new Date().toISOString(),
    data: reducedPayload,
  };
  return appendToJatos(`${JSON.stringify(appendEnvelope)}\n`);
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
      const extraCsvs = Array.isArray(args.extraCsvs) ? args.extraCsvs : [];
      for (const csv of extraCsvs) {
        if (!csv || typeof csv.contents !== "string" || csv.contents.length === 0) continue;
        downloadCsv(csv.contents, filePrefix, args.selection, csv.suffix ?? "trials_extra");
      }
    }

    if (localSaveFormat !== "csv") {
      downloadJson(args.payload, filePrefix, args.selection);
    }
  }

  const submittedToJatos = args.jatosHandledBySink
    ? true
    : await submitToJatosWithFallback(args.payload);

  const redirectCfg = args.coreConfig.completion?.redirect;
  const template =
    args.completionStatus === "incomplete"
      ? redirectCfg?.incompleteUrlTemplate
      : redirectCfg?.completeUrlTemplate;
  const redirectEnabled = Boolean(redirectCfg?.enabled && template);

  if (submittedToJatos && args.endJatosOnSubmit !== false) {
    if (redirectEnabled) {
      const resolved = resolveTemplate(template, args.selection);
      if (resolved) {
        await endJatosStudyAndRedirect(resolved);
        return { submittedToJatos, redirected: true };
      }
    }
    await endJatosStudy();
  }

  if (redirectEnabled) {
    const resolved = resolveTemplate(template, args.selection);
    if (resolved) {
      window.location.assign(resolved);
      return { submittedToJatos, redirected: true };
    }
  }

  return { submittedToJatos, redirected: false };
}
