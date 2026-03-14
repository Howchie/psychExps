import { describe, expect, it } from "vitest";
import { attachSurveyResults, collectSurveyEntries, findFirstSurveyScore, parseSurveyDefinitions, toSurveyDefinition } from "./surveyPlan";

describe("surveyPlan helpers", () => {
  it("parses preset survey entries", () => {
    const parsed = toSurveyDefinition({ preset: "atwit", id: "atwit_custom" });
    expect(parsed?.id).toBe("atwit_custom");
    expect(parsed?.questions.length).toBeGreaterThan(0);
  });

  it("parses inline survey entries", () => {
    const parsed = toSurveyDefinition({
      id: "inline_1",
      title: "Inline Survey",
      questions: [
        {
          id: "q1",
          type: "single_choice",
          prompt: "Question",
          options: [{ value: 1, label: "One" }],
        },
      ],
    });
    expect(parsed?.id).toBe("inline_1");
    expect(parsed?.title).toBe("Inline Survey");
    expect(parsed?.questions).toHaveLength(1);
  });

  it("parses arrays and ignores invalid entries", () => {
    const parsed = parseSurveyDefinitions([
      { preset: "atwit" },
      { questions: [] },
      null,
      "invalid",
    ]);
    expect(parsed).toHaveLength(2);
  });

  it("collects survey entries from scoped array and singleton aliases", () => {
    const entries = collectSurveyEntries(
      {
        surveys: {
          betweenTrial: [{ preset: "atwit" }],
        },
        survey: { preset: "nasa_tlx" },
      },
      { arrayKey: "betweenTrial", singletonKey: "survey" },
    );
    expect(entries).toHaveLength(2);
  });

  it("attaches survey results and resolves first score", () => {
    const base = { trial_index: 1 };
    const surveys = [
      { surveyId: "atwit", surveyTitle: null, startedAtIso: "", completedAtIso: "", durationMs: 0, answers: {}, scores: { overall: 7 } },
      { surveyId: "nasa_tlx", surveyTitle: null, startedAtIso: "", completedAtIso: "", durationMs: 0, answers: {}, scores: { raw_tlx: 54 } },
    ];
    const withSurveys = attachSurveyResults(base, surveys as any);
    expect((withSurveys as any).surveys).toHaveLength(2);
    expect(findFirstSurveyScore(surveys as any, "overall")).toBe(7);
    expect(findFirstSurveyScore(surveys as any, "raw_tlx")).toBe(54);
  });
});
