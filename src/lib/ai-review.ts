export const reviewAgents: Record<string, string> = {
  evidence: "Evidence lens",
  originality: "Attribution lens",
  reviewer: "Methods & robustness",
  formatting: "Formatting & structure",
  readiness: "Submission readiness",
};
export const reviewStages = [...Object.keys(reviewAgents), "synthesis"];
export const recommendedReviewModel = "gpt-6-astra";
export function modelReasoningOptions(
  provider: string,
  model: string,
): string[] {
  return provider === "openai" &&
    /^gpt-6-astra(?:-\d{4}-\d{2}-\d{2})?$/.test(model)
    ? ["low", "medium", "high", "xhigh", "max"]
    : [];
}
export function reviewMarkdown(job: any): string {
  const scope = job.scope || {};
  const lines = [
    `# ${job.title || "Manuscript review"}`,
    "",
    `Status: ${job.status}`,
    `Created: ${new Date(job.createdAt).toISOString()}`,
    `Coverage: ${scope.mode || "legacy"}; ${scope.reviewedCharacters || 0} of ${scope.totalCharacters || 0} stored text characters.`,
    `PDF pages scanned: ${scope.scannedPages ?? "unknown"} of ${scope.totalPages ?? "unknown"}. Source coverage: ${scope.sourceCoverage || "unknown"}.`,
    "No visual inspection or endorsement decision. Findings require human judgment.",
    "",
  ];
  for (const name of ["synthesis", ...Object.keys(reviewAgents)]) {
    const result = job.results?.[name];
    lines.push(
      `## ${name === "synthesis" ? "Prioritized revision plan" : reviewAgents[name]}`,
      "",
    );
    if (!result) {
      lines.push(
        job.errors?.find((e: any) => e.agent === name)?.message ||
          "No completed result.",
        "",
      );
      continue;
    }
    lines.push(
      `${result.provider} / ${result.model}; reasoning: ${result.reasoningEffort || "provider default"}`,
      "",
      result.summary,
      "",
    );
    for (const f of result.findings || []) {
      lines.push(
        `### [${f.severity}] ${f.title}`,
        "",
        ...String(f.quote)
          .split("\n")
          .map((line: string) => `> ${line}`),
        "",
        f.explanation,
        "",
        `**Next step:** ${f.recommendation}`,
        "",
      );
      for (const id of f.sourceIds || [])
        lines.push(`Source: https://doi.org/${encodeURIComponent(id)}`);
    }
    if (result.limitations?.length)
      lines.push(
        "Limitations:",
        ...result.limitations.map((l: string) => `- ${l}`),
        "",
      );
  }
  if (job.pdfAnalysis?.warnings?.length)
    lines.push(
      "## PDF extraction diagnostics",
      ...job.pdfAnalysis.warnings.map((w: string) => `- ${w}`),
      "",
    );
  return lines.join("\n");
}
export function downloadReview(job: any, format: "markdown" | "json") {
  const content =
    format === "json" ? JSON.stringify(job, null, 2) : reviewMarkdown(job);
  const url = URL.createObjectURL(
    new Blob([content], {
      type:
        format === "json" ? "application/json" : "text/markdown;charset=utf-8",
    }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `paperbridge-review-${String(job.id || "report")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 80)}.${format === "json" ? "json" : "md"}`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
