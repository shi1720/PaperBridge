/** Library/history responses intentionally exclude large private manuscript/report bodies. */
export function paperListItem(paper: Record<string, any>): Record<string, any> {
  const { text, versions, ...metadata } = paper;
  return {
    ...metadata,
    version: paper.version || 1,
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
