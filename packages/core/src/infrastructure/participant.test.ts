import { describe, expect, it } from "vitest";
import { resolveParticipantIds } from "./participant";

describe("resolveParticipantIds", () => {
  it("resolves IDs from URL parameters", () => {
    const params = new URLSearchParams(
      "PROLIFIC_PID=P123&STUDY_ID=S456&SESSION_ID=SESS789&SONA_ID=SONA000",
    );
    const result = resolveParticipantIds(params);

    expect(result.participantId).toBe("P123");
    expect(result.studyId).toBe("S456");
    expect(result.sessionId).toBe("SESS789");
    expect(result.sonaId).toBe("SONA000");
  });

  it("falls back to generated IDs when parameters are missing", () => {
    const params = new URLSearchParams("");
    const result = resolveParticipantIds(params);

    expect(result.participantId).toMatch(/^P_[a-z0-9]+_[a-z0-9]+$/);
    expect(result.studyId).toMatch(/^S_[a-z0-9]+_[a-z0-9]+$/);
    expect(result.sessionId).toMatch(/^SESS_[a-z0-9]+_[a-z0-9]+$/);
    expect(result.sonaId).toBeNull();
  });

  it("respects custom candidate parameters", () => {
    const params = new URLSearchParams("custom_p=CP1&custom_s=CS1");
    const result = resolveParticipantIds(params, {
      participantParamCandidates: ["custom_p"],
      studyParamCandidates: ["custom_s"],
    });

    expect(result.participantId).toBe("CP1");
    expect(result.studyId).toBe("CS1");
    expect(result.sessionId).toMatch(/^SESS_[a-z0-9]+_[a-z0-9]+$/);
  });
});
