import { afterEach, describe, expect, it } from "vitest";
import { resolveSelection } from "./selection";
import type { CoreConfig } from "../api/types";

const CORE_CONFIG: CoreConfig = {
  selection: {
    taskId: "sft",
  },
  participant: {
    participantParamCandidates: ["PROLIFIC_PID", "SONA_ID", "participant", "survey_code"],
    studyParamCandidates: ["STUDY_ID", "study_id"],
    sessionParamCandidates: ["SESSION_ID", "session_id"],
  },
};

const originalWindow = globalThis.window;

afterEach(() => {
  if (originalWindow === undefined) {
    delete (globalThis as any).window;
    return;
  }
  (globalThis as any).window = originalWindow;
});

describe("resolveSelection", () => {
  it("uses JATOS urlQueryParameters when URL search params are not available after redirect", () => {
    (globalThis as any).window = {
      location: { search: "" },
      jatos: {
        componentJsonInput: {
          selection: {
            taskId: "nback",
          },
        },
        urlQueryParameters: {
          auto: "true",
          SONA_ID: "S12345",
          STUDY_ID: "STUDY_A",
          SESSION_ID: "SESSION_A",
          cc: "COMPLETE_ABC",
        },
      },
    };

    const selection = resolveSelection(CORE_CONFIG);
    expect(selection.platform).toBe("jatos");
    expect(selection.taskId).toBe("nback");
    expect(selection.source.task).toBe("jatos");
    expect(selection.auto).toBe(true);
    expect(selection.participant.participantId).toBe("S12345");
    expect(selection.participant.studyId).toBe("STUDY_A");
    expect(selection.participant.sessionId).toBe("SESSION_A");
    expect(selection.completionCode).toBe("COMPLETE_ABC");
  });

  it("reads JATOS config path from component JSON input aliases", () => {
    (globalThis as any).window = {
      location: { search: "" },
      jatos: {
        componentJsonInput: {
          taskId: "nback",
          configID: "nback/annikaHons",
        },
      },
    };

    const selection = resolveSelection(CORE_CONFIG);
    expect(selection.platform).toBe("jatos");
    expect(selection.taskId).toBe("nback");
    expect(selection.configPath).toBe("nback/annikaHons");
  });

  it("keeps real URL params as higher priority than JATOS query parameters when both exist", () => {
    (globalThis as any).window = {
      location: { search: "?SONA_ID=URL_ID&auto=false" },
      jatos: {
        componentJsonInput: {
          selection: {
            taskId: "nback",
          },
        },
        urlQueryParameters: {
          SONA_ID: "JATOS_ID",
          auto: "true",
        },
      },
    };

    const selection = resolveSelection(CORE_CONFIG);
    expect(selection.participant.participantId).toBe("URL_ID");
    expect(selection.auto).toBe(false);
  });
});
