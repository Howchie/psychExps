/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { finalizeTaskRun } from "./lifecycle";
import { downloadCsv, downloadJson, inferCsvFromPayload } from "../infrastructure/data";
import { appendToJatos, endJatosStudy, submitToJatos, uploadResultFileToJatos } from "../infrastructure/jatos";

vi.mock("../infrastructure/data", () => ({
  downloadCsv: vi.fn(),
  downloadJson: vi.fn(),
  inferCsvFromPayload: vi.fn(() => null),
}));

vi.mock("../infrastructure/jatos", () => ({
  submitToJatos: vi.fn(async () => false),
  appendToJatos: vi.fn(async () => false),
  uploadResultFileToJatos: vi.fn(async () => false),
  endJatosStudy: vi.fn(async () => undefined),
}));

vi.mock("../infrastructure/redirect", () => ({
  resolveTemplate: vi.fn(() => null),
}));

const baseSelection = {
  platform: "local" as const,
  taskId: "sft",
  participant: {
    participantId: "p1",
    studyId: "s1",
    sessionId: "sess1",
  },
  source: {
    task: "default" as const,
  },
};

const baseCoreConfig = {
  selection: { taskId: "sft" },
  data: {
    localSave: true,
    filePrefix: "experiments",
  },
};

describe("finalizeTaskRun local save format", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(uploadResultFileToJatos).mockResolvedValue(false);
  });

  it("defaults to CSV local save and does not write JSON", async () => {
    await finalizeTaskRun({
      coreConfig: baseCoreConfig,
      selection: baseSelection,
      payload: { ok: true },
      csv: { contents: "a,b\n1,2", suffix: "trials" },
    });

    expect(downloadCsv).toHaveBeenCalledTimes(1);
    expect(downloadJson).not.toHaveBeenCalled();
  });

  it("infers CSV from payload when explicit csv is not provided", async () => {
    vi.mocked(inferCsvFromPayload).mockReturnValueOnce("x,y\n3,4");

    await finalizeTaskRun({
      coreConfig: baseCoreConfig,
      selection: baseSelection,
      payload: { records: [{ x: 3, y: 4 }] },
    });

    expect(inferCsvFromPayload).toHaveBeenCalledTimes(1);
    expect(downloadCsv).toHaveBeenCalledTimes(1);
    expect(downloadJson).not.toHaveBeenCalled();
  });

  it("supports JSON-only local save mode", async () => {
    await finalizeTaskRun({
      coreConfig: {
        ...baseCoreConfig,
        data: {
          ...baseCoreConfig.data,
          localSaveFormat: "json",
        },
      },
      selection: baseSelection,
      payload: { ok: true },
      csv: { contents: "a,b\n1,2" },
    });

    expect(downloadCsv).not.toHaveBeenCalled();
    expect(downloadJson).toHaveBeenCalledTimes(1);
  });

  it("supports dual local save mode", async () => {
    await finalizeTaskRun({
      coreConfig: {
        ...baseCoreConfig,
        data: {
          ...baseCoreConfig.data,
          localSaveFormat: "both",
        },
      },
      selection: baseSelection,
      payload: { ok: true },
      csv: { contents: "a,b\n1,2" },
    });

    expect(downloadCsv).toHaveBeenCalledTimes(1);
    expect(downloadJson).toHaveBeenCalledTimes(1);
  });

  it("downloads extra CSV outputs when provided", async () => {
    await finalizeTaskRun({
      coreConfig: baseCoreConfig,
      selection: baseSelection,
      payload: { ok: true },
      csv: { contents: "a,b\n1,2", suffix: "trials" },
      extraCsvs: [
        { contents: "x,y\n3,4", suffix: "events" },
        { contents: "m,n\n5,6", suffix: "drt_rows" },
      ],
    });

    expect(downloadCsv).toHaveBeenCalledTimes(3);
    expect(downloadCsv).toHaveBeenNthCalledWith(1, "a,b\n1,2", "experiments", baseSelection, "trials");
    expect(downloadCsv).toHaveBeenNthCalledWith(2, "x,y\n3,4", "experiments", baseSelection, "events");
    expect(downloadCsv).toHaveBeenNthCalledWith(3, "m,n\n5,6", "experiments", baseSelection, "drt_rows");
  });

  it("does not re-submit to JATOS when a sink already handled it", async () => {
    await finalizeTaskRun({
      coreConfig: baseCoreConfig,
      selection: baseSelection,
      payload: { ok: true },
      csv: { contents: "a,b\n1,2" },
      jatosHandledBySink: true,
    });

    expect(submitToJatos).not.toHaveBeenCalled();
    expect(endJatosStudy).toHaveBeenCalledTimes(1);
  });

  it("uses reduced submit fallback when full JATOS payload submit fails", async () => {
    vi.mocked(uploadResultFileToJatos).mockResolvedValue(true);
    vi.mocked(submitToJatos)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    await finalizeTaskRun({
      coreConfig: baseCoreConfig,
      selection: baseSelection,
      payload: {
        records: [{ a: 1 }],
        events: [{ type: "trial_end" }],
        moduleResults: { drt: { hits: 2 } },
      },
    });

    expect(submitToJatos).toHaveBeenCalledTimes(2);
    expect(appendToJatos).not.toHaveBeenCalled();
    expect(endJatosStudy).toHaveBeenCalledTimes(1);
  });

  it("uses append fallback when both full and reduced JATOS submits fail", async () => {
    vi.mocked(uploadResultFileToJatos).mockResolvedValue(true);
    vi.mocked(submitToJatos).mockResolvedValue(false);
    vi.mocked(appendToJatos).mockResolvedValueOnce(true);

    await finalizeTaskRun({
      coreConfig: baseCoreConfig,
      selection: baseSelection,
      payload: {
        records: [{ a: 1 }],
        events: [{ type: "trial_end" }],
      },
    });

    expect(submitToJatos).toHaveBeenCalledTimes(2);
    expect(appendToJatos).toHaveBeenCalledTimes(1);
    expect(endJatosStudy).toHaveBeenCalledTimes(1);
  });

  it("submits reduced payload first when full payload is above JATOS soft limit", async () => {
    vi.mocked(uploadResultFileToJatos).mockResolvedValue(true);
    vi.mocked(submitToJatos).mockResolvedValueOnce(true);

    const oversizedPayload = {
      records: new Array(12_000).fill({ a: "x".repeat(400) }),
      events: [{ type: "trial_end" }],
      moduleResults: { drt: { hits: 2 } },
    };

    await finalizeTaskRun({
      coreConfig: baseCoreConfig,
      selection: baseSelection,
      payload: oversizedPayload,
    });

    expect(submitToJatos).toHaveBeenCalledTimes(1);
    const submitted = vi.mocked(submitToJatos).mock.calls[0]?.[0] as Record<string, unknown>;
    expect(submitted.payloadReducedForJatos).toBe(true);
    expect(submitted.payloadStoredViaResultFiles).toBe(true);
    expect(Array.isArray(submitted.uploadedResultFiles)).toBe(true);
    expect(submitted.recordCount).toBe(12_000);
    expect(submitted.records).toBeUndefined();
  });
});
