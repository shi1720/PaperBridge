export type HighlightRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};
export type PageDraft = { body: string; quote: string; rects: HighlightRect[] };
export type ReaderDraft = {
  page: number;
  pages: Record<number, PageDraft>;
  visibility: "private" | "shared";
  color: string;
};

// Deliberately memory-only: private manuscript excerpts never enter browser storage.
// A draft survives workspace navigation, and disappears when this tab is reloaded.
const drafts = new Map<string, ReaderDraft>();
export function readerDraftKey(
  userId: string,
  paperId: string,
  version: number,
  requestId?: string,
) {
  return JSON.stringify([userId, paperId, version, requestId || null]);
}
export function readReaderDraft(key: string): ReaderDraft | undefined {
  return drafts.get(key);
}
export function rememberReaderDraft(key: string, draft: ReaderDraft) {
  const pages = Object.fromEntries(
    Object.entries(draft.pages).filter(
      ([, value]) => value.body.trim() || value.quote,
    ),
  );
  drafts.delete(key);
  if (!Object.keys(pages).length) return;
  drafts.set(key, { ...draft, pages });
  // Bound retained drafts during long browsing sessions.
  if (drafts.size > 50) drafts.delete(drafts.keys().next().value!);
}
