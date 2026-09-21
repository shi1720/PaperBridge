import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
const fixtures = vi.hoisted(() => ({
  profile: null as any,
  papers: [] as any[],
}));
vi.mock("../src/lib/context", () => ({
  useApp: () => ({ profile: fixtures.profile }),
  useData: (action: string) => ({
    data: action === "paper.list" ? fixtures.papers : null,
    loading: false,
    error: "",
  }),
}));
import { ReviewResults, ReviewStudio } from "../src/components/Settings";
const result = {
  summary: "A cautious synthesis.",
  provider: "openai",
  model: "gpt-live-test",
  usage: { inputTokens: 120, outputTokens: 55 },
  findings: [
    {
      title: "Causal overstatement",
      severity: "high",
      quote: "Our results prove causation.",
      explanation: "The design is observational.",
      recommendation: "Describe an association.",
      sourceIds: ["10.1000/example"],
    },
  ],
  limitations: ["This is not a plagiarism scan."],
};
const job = {
  id: "job-1",
  title: "Actual backend manuscript title",
  status: "partial",
  createdAt: 1,
  promptVersion: "test-v1",
  scope: { reviewedCharacters: 32000, totalCharacters: 55000, truncated: true },
  results: { synthesis: result },
  errors: [
    {
      agent: "originality",
      code: "rate_limit",
      message: "Provider quota or rate limit reached.",
    },
  ],
  metadata: {
    sources: [
      {
        id: "10.1000/example",
        title: "A scholarly record",
        authors: ["A. Scholar"],
        year: 2025,
        matchedBy: "doi",
      },
    ],
    lookups: [{ kind: "doi", value: "10.1000/example", status: "found" }],
    limitations: ["Bibliographic metadata only."],
  },
};
describe("AI review UI backend contract", () => {
  it("renders actual title, synthesis, quoted evidence, model usage, coverage and metadata source links", () => {
    const html = renderToStaticMarkup(
      <ReviewResults job={job} lens="synthesis" onLens={() => {}} />,
    );
    for (const text of [
      "Actual backend manuscript title",
      "A cautious synthesis.",
      "Our results prove causation.",
      "gpt-live-test",
      "120 input tokens",
      "32,000 of 55,000",
      "A scholarly record",
      "Bibliographic metadata only.",
    ])
      expect(html).toContain(text);
    expect(html).toContain("https://doi.org/10.1000%2Fexample");
    expect(html).not.toContain("javascript:");
  });
  it("surfaces array-shaped stage failures and incomplete review instead of success or indefinite pending", () => {
    const html = renderToStaticMarkup(
      <ReviewResults job={job} lens="originality" onLens={() => {}} />,
    );
    expect(html).toContain("Some stages failed");
    expect(html).toContain(
      "Attribution lens: Provider quota or rate limit reached.",
    );
    expect(html).toContain("rate_limit");
    expect(html).not.toContain("This stage is still pending");
  });
  it("does not certify validity when a model returns no accepted findings", () => {
    const html = renderToStaticMarkup(
      <ReviewResults
        job={{
          ...job,
          status: "completed",
          results: { synthesis: { ...result, findings: [] } },
          errors: [],
        }}
        lens="synthesis"
        onLens={() => {}}
      />,
    );
    expect(html).toContain(
      "does not establish correctness, originality, or endorsement eligibility",
    );
  });
  it("Configure AI navigates directly to AI settings and unauthenticated review is gated", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <ReviewStudio onAuth={() => {}} />
      </MemoryRouter>,
    );
    expect(html).toContain("/settings?tab=ai");
    expect(html).toContain("Create your workspace");
    expect(html).not.toContain("Start a research review");
  });
});

it("shows extracted character counts from a paper summary without downloading manuscript text", () => {
  fixtures.profile = { id: "author" };
  fixtures.papers = [
    { id: "paper-count", title: "Private manuscript", textCharacterCount: 451 },
  ];
  try {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/review?paper=paper-count"]}>
        <ReviewStudio onAuth={() => {}} />
      </MemoryRouter>,
    );
    expect(html).toContain("451 extracted");
    expect(html).toContain('aria-label="Manuscript"');
  } finally {
    fixtures.profile = null;
    fixtures.papers = [];
  }
});

it("shows coverage choices, five specialists, extraction blockers and bounded cost disclosure", () => {
  fixtures.profile = { id: "author" };
  fixtures.papers = [
    {
      id: "truncated",
      title: "Partial extraction",
      textCharacterCount: 100000,
      pdfAnalysis: { totalPages: 150, scannedPages: 100, textTruncated: true },
    },
  ];
  try {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/review?paper=truncated"]}>
        <ReviewStudio onAuth={() => {}} />
      </MemoryRouter>,
    );
    expect(html).toContain("Full mode is unavailable");
    expect(html).toContain("100 of 150 PDF pages scanned");
    expect(html).toContain("Formatting &amp; structure");
    expect(html).toContain("Submission readiness");
    expect(html).toContain('aria-label="Review coverage"');
    expect(html).toContain("No automatic paid retries");
  } finally {
    fixtures.profile = null;
    fixtures.papers = [];
  }
});
it("progress exposes failed-stage details while other stages are still running", () => {
  const html = renderToStaticMarkup(
    <ReviewResults
      job={{
        ...job,
        status: "running",
        errors: [],
        stages: {
          evidence: { status: "running" },
          formatting: {
            status: "failed",
            error: { message: "Provider quota reached." },
          },
        },
      }}
      lens="formatting"
      onLens={() => {}}
    />,
  );
  expect(html).toContain('aria-label="Review stage progress"');
  expect(html).toContain("Provider quota reached.");
  expect(html).toContain("Export revision plan");
});
