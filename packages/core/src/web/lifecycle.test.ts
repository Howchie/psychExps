/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { finalizeTaskRun } from "./lifecycle";
import { downloadCsv, downloadJson, inferCsvFromPayload } from "../infrastructure/data";
import { endJatosStudy, submitToJatos } from "../infrastructure/jatos";

vi.mock("../infrastructure/data", () => ({
  downloadCsv: vi.fn(),
  downloadJson: vi.fn(),
  inferCsvFromPayload: vi.fn(() => null),
}));

vi.mock("../infrastructure/jatos", () => ({
  submitToJatos: vi.fn(async () => false),
  endJatosStudy: vi.fn(async () => undefined),
}));

vi.mock("../infrastructure/redirect", () => ({
  resolveTemplate: vi.fn(() => null),
}));

const baseSelection = {
  platform: "local" as const,
  taskId: "sft",
  variantId: "default",
  participant: {
    participantId: "p1",
    studyId: "s1",
    sessionId: "sess1",
  },
  source: {
    task: "default" as const,
    variant: "default" as const,
  },
};

const baseCoreConfig = {
  selection: { taskId: "sft", variantId: "default" },
  data: {
    localSave: true,
    filePrefix: "experiments",
  },
};

describe("finalizeTaskRun local save format", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
