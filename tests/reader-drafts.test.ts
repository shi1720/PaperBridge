import { describe, expect, it } from "vitest";
import {
  readerDraftKey,
  readReaderDraft,
  rememberReaderDraft,
  type ReaderDraft,
} from "../src/lib/reader-drafts";

const draft: ReaderDraft = {
  page: 2,
  pages: { 2: { body: "Check the baseline", quote: "", rects: [] } },
  color: "green",
  visibility: "private",
};
describe("private reader draft continuity", () => {
  it("isolates accounts, request workspaces, and manuscript revisions", () => {
    const key = readerDraftKey("alice", "paper", 1, "request-a");
    rememberReaderDraft(key, draft);
    expect(readReaderDraft(key)?.pages[2].body).toBe("Check the baseline");
    expect(
      readReaderDraft(readerDraftKey("bob", "paper", 1, "request-a")),
    ).toBeUndefined();
    expect(
      readReaderDraft(readerDraftKey("alice", "paper", 2, "request-a")),
    ).toBeUndefined();
    expect(
      readReaderDraft(readerDraftKey("alice", "paper", 1, "request-b")),
    ).toBeUndefined();
    expect(
      readReaderDraft(readerDraftKey("alice", "paper", 1)),
    ).toBeUndefined();
  });
  it("removes saved or cleared drafts while preserving drafts on other pages", () => {
    const key = readerDraftKey("alice", "paper-cleanup", 1);
    rememberReaderDraft(key, {
      ...draft,
      pages: {
        1: { body: "", quote: "Selected passage", rects: [] },
        2: { body: "", quote: "", rects: [] },
      },
    });
    expect(Object.keys(readReaderDraft(key)!.pages)).toEqual(["1"]);
    rememberReaderDraft(key, { ...draft, pages: {} });
    expect(readReaderDraft(key)).toBeUndefined();
  });
  it("bounds draft retention across a long research session", () => {
    const first = readerDraftKey("limit-test", "paper-0", 1);
    rememberReaderDraft(first, draft);
    for (let i = 1; i <= 50; i++)
      rememberReaderDraft(readerDraftKey("limit-test", `paper-${i}`, 1), draft);
    expect(readReaderDraft(first)).toBeUndefined();
    expect(
      readReaderDraft(readerDraftKey("limit-test", "paper-50", 1)),
    ).toBeDefined();
  });
});
