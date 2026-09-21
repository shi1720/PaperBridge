import { it, expect } from "vitest";
import {
  reviewMarkdown,
  modelReasoningOptions,
  reviewStages,
} from "../src/lib/ai-review";
it("exports findings, failed stages, reasoning and coverage without claiming a complete scan", () => {
  const text = reviewMarkdown({
    id: "job",
    title: "Study",
    status: "partial",
    createdAt: 0,
    scope: {
      mode: "partial",
      reviewedCharacters: 32000,
      totalCharacters: 90000,
      sourceCoverage: "incomplete",
      scannedPages: 100,
      totalPages: 120,
    },
    results: {
      synthesis: {
        model: "gpt-6-astra",
        provider: "openai",
        reasoningEffort: "medium",
        summary: "Revise claims.",
        findings: [
          {
            title: "Claim scope",
            severity: "high",
            quote: "All adults benefit.",
            explanation: "Sample was limited.",
            recommendation: "Limit the conclusion.",
            sourceIds: [],
          },
        ],
        limitations: ["Extracted text only."],
      },
    },
    errors: [{ agent: "formatting", message: "Timed out." }],
    pdfAnalysis: { warnings: ["Missing pages."] },
  });
  for (const fragment of [
    "partial",
    "32000 of 90000",
    "100 of 120",
    "medium",
    "All adults benefit.",
    "Limit the conclusion.",
    "Timed out.",
    "Missing pages.",
  ])
    expect(text).toContain(fragment);
  expect(reviewStages).toHaveLength(6);
});
it("reasoning controls are only exposed for verified model capabilities", () => {
  expect(modelReasoningOptions("openai", "gpt-6-astra")).toContain("medium");
  expect(modelReasoningOptions("openai", "gpt-6-astra")).not.toContain("none");
  expect(modelReasoningOptions("openai", "gpt-6-astra-2026-09-01")).toContain(
    "max",
  );
  expect(modelReasoningOptions("openai", "gpt-4.1")).toEqual([]);
  expect(modelReasoningOptions("anthropic", "claude-test")).toEqual([]);
});
