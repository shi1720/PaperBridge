/** Library/history responses intentionally exclude large private manuscript/report bodies. */
export function paperListItem(paper: Record<string, any>): Record<string, any> {
  const { text, versions, pdfAnalysis, ...metadata } = paper;
  return {
    ...metadata,
    version: paper.version || 1,
    pdfAnalysis: pdfAnalysis
      ? {
          version: 1,
          totalPages: pdfAnalysis.totalPages,
          scannedPages: pdfAnalysis.scannedPages,
          extractedCharacters: pdfAnalysis.extractedCharacters,
          textTruncated: pdfAnalysis.textTruncated,
        }
      : null,
    // Compute this from existing documents so legacy manuscripts need no migration.
    textCharacterCount: typeof text === "string" ? text.length : 0,
  };
}

export function aiJobListItem(
  id: string,
  job: Record<string, any>,
): Record<string, any> {
  return {
    id,
    ownerId: job.ownerId,
    paperId: job.paperId,
    title: job.title || "",
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt || job.createdAt,
  };
}
