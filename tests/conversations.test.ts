import { describe, expect, it } from "vitest";
import {
  mergeConversationMessages,
  reconcileConversationSnapshot,
} from "../src/lib/conversations";

describe("conversation polling races", () => {
  it("retains a send acknowledged after the poll started and deduplicates its next echo", () => {
    const older = { id: "a", createdAt: 1, body: "Earlier message" };
    const sent = { id: "b", createdAt: 2, body: "Just sent" };
    const stalePoll = mergeConversationMessages([older, sent], [older]);
    expect(stalePoll).toEqual([older, sent]);
    expect(mergeConversationMessages(stalePoll, [older, sent])).toEqual([
      older,
      sent,
    ]);
  });
  it("orders incoming messages while updating canonical fields", () => {
    expect(
      mergeConversationMessages(
        [{ id: "a", createdAt: 2, body: "Old" }],
        [
          { id: "b", createdAt: 1, body: "First" },
          { id: "a", createdAt: 2, body: "Canonical" },
        ],
      ),
    ).toEqual([
      { id: "b", createdAt: 1, body: "First" },
      { id: "a", createdAt: 2, body: "Canonical" },
    ]);
  });
  it("bounds the window while retaining the newest message", () => {
    const current = Array.from({ length: 500 }, (_, i) => ({
      id: `m${i}`,
      createdAt: i,
    }));
    const next = mergeConversationMessages(current, [
      { id: "new", createdAt: 500 },
    ]);
    expect(next).toHaveLength(500);
    expect(next[0].createdAt).toBe(1);
    expect(next.at(-1)?.id).toBe("new");
  });
});

describe("authoritative conversation snapshots", () => {
  it("removes deleted messages while preserving only sends acknowledged after a poll started", () => {
    const deleted = {
      id: "deleted",
      createdAt: 1,
      body: "Removed server-side",
    };
    const present = { id: "present", createdAt: 2, body: "Existing message" };
    const recent = {
      id: "recent",
      createdAt: 3,
      body: "Acknowledged after fetch began",
    };
    const result = reconcileConversationSnapshot(
      [deleted, present, recent],
      [present],
      new Set([recent.id]),
    );
    expect(result).toEqual([present, recent]);
    expect(
      reconcileConversationSnapshot(result, [present, recent], new Set()),
    ).toEqual([present, recent]);
    expect(reconcileConversationSnapshot(result, [present], new Set())).toEqual(
      [present],
    );
  });
  it("an empty authoritative snapshot removes all old local messages", () => {
    expect(
      reconcileConversationSnapshot(
        [{ id: "old", createdAt: 1 }],
        [],
        new Set(),
      ),
    ).toEqual([]);
  });
});
