import { downloadCsv, downloadJson, inferCsvFromPayload } from "../infrastructure/data";
import { appendToJatos, endJatosStudy, endJatosStudyAndRedirect, submitToJatos, uploadResultFileToJatos } from "../infrastructure/jatos";
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
  const jsPsychData = Array.isArray(payload.jsPsychData) ? payload.jsPsychData : [];
  const drtRows = Array.isArray(payload.drt_rows) ? payload.drt_rows : [];
  return {
    ...payload,
    records: undefined,
    events: undefined,
    moduleResults: undefined,
    jsPsychData: undefined,
    drt_rows: undefined,
    recordCount: records.length,
    eventCount: events.length,
    moduleResultKeys: moduleResults ? Object.keys(moduleResults) : [],
    jsPsychDataCount: jsPsychData.length,
    drtRowCount: drtRows.length,
    payloadReducedForJatos: true,
  };
}

const JATOS_RESULTDATA_SOFT_LIMIT_BYTES = 4_500_000;
const JATOS_RESULTFILE_FIELD_KEYS = ["records", "events", "moduleResults", "jsPsychData", "drt_rows"] as const;

function estimateJsonBytes(value: unknown): number {
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

async function submitToJatosWithFallback(payload: unknown): Promise<boolean> {
  const payloadObject = asObject(payload);
  if (!payloadObject) return submitToJatos({ payload });

  const payloadBytes = estimateJsonBytes(payloadObject);
  if (payloadBytes > JATOS_RESULTDATA_SOFT_LIMIT_BYTES) {
    const { payload: reducedPayload, missingCriticalKeys } = await buildResultFileBackedPayload(payloadObject);
    if (missingCriticalKeys.length > 0) {
      console.error(`JATOS persistence failed: could not upload critical result fields: ${missingCriticalKeys.join(", ")}`);
      return false;
    }
    if (await submitToJatos(reducedPayload)) return true;
  }

  if (await submitToJatos(payloadObject)) return true;

  const { payload: reducedPayload, missingCriticalKeys } = await buildResultFileBackedPayload(payloadObject);
  if (missingCriticalKeys.length > 0) {
    console.error(`JATOS persistence failed: could not upload critical result fields: ${missingCriticalKeys.join(", ")}`);
    return false;
  }
  if (await submitToJatos(reducedPayload)) return true;

  const appendEnvelope = {
    kind: "finalize_fallback",
    ts: new Date().toISOString(),
    data: reducedPayload,
  };
  return appendToJatos(`${JSON.stringify(appendEnvelope)}\n`);
}

function buildResultFileName(prefix: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${stamp}_${rand}.json`;
}

async function buildResultFileBackedPayload(payload: Record<string, unknown>): Promise<{
  payload: Record<string, unknown>;
  missingCriticalKeys: string[];
}> {
  const reduced = buildReducedJatosPayload(payload);
  const uploadedResultFiles: Array<{
    key: string;
    filename: string;
    approxBytes: number;
  }> = [];
  const missingCriticalKeys: string[] = [];

  for (const key of JATOS_RESULTFILE_FIELD_KEYS) {
    if (!(key in payload)) continue;
    const value = payload[key];
    if (value === undefined) continue;
    const filename = buildResultFileName(key);
    const ok = await uploadResultFileToJatos(value as Blob | string | object, filename);
    if (!ok) {
      missingCriticalKeys.push(key);
      continue;
    }
    uploadedResultFiles.push({
      key,
      filename,
      approxBytes: estimateJsonBytes(value),
    });
  }

  if (uploadedResultFiles.length > 0) {
    return {
      payload: {
        ...reduced,
        uploadedResultFiles,
        payloadStoredViaResultFiles: true,
      },
      missingCriticalKeys,
    };
  }
  return { payload: reduced, missingCriticalKeys };
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
    if (args.selection.platform === "jatos" && !submittedToJatos) {
      console.error("Skipping redirect because JATOS submission did not succeed.");
      return { submittedToJatos, redirected: false };
    }
    const resolved = resolveTemplate(template, args.selection);
    if (resolved) {
      window.location.assign(resolved);
      return { submittedToJatos, redirected: true };
    }
  }

  return { submittedToJatos, redirected: false };
}
