import { test, expect } from "@playwright/test";

test("reader keeps drafts through zoom and supports searchable, resolved note discussions", async ({
  page,
}) => {
  await page.goto("http://localhost:5173/papers/demo-paper?demo=1");
  await expect(page.locator(".pb-pdf-page canvas")).toBeVisible();
  const draft = page.getByLabel("Your note · page 1", { exact: true });
  await draft.fill(
    "Explain the baseline selection before generalizing this result.",
  );
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(draft).toHaveValue(
    "Explain the baseline selection before generalizing this result.",
  );
  await page
    .getByRole("button", { name: "Focus reading", exact: true })
    .click();
  await expect(
    page.getByRole("complementary", { name: "Manuscript notes" }),
  ).not.toBeVisible();
  await page.getByRole("button", { name: "Show notes", exact: true }).click();
  await expect(draft).toHaveValue(
    "Explain the baseline selection before generalizing this result.",
  );
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  const note = page
    .locator(".pb-note")
    .filter({ hasText: "Explain the baseline selection" });
  await expect(note).toBeVisible();
  await note.getByRole("button", { name: "Reply", exact: true }).click();
  await page
    .getByLabel("Reply to note on page 1", { exact: true })
    .fill("Compare a dense baseline under the same training budget.");
  await page.getByRole("button", { name: "Send reply", exact: true }).click();
  await expect(note).toContainText("Compare a dense baseline");
  await note.getByRole("button", { name: "Resolve", exact: true }).click();
  await expect(note).toContainText("Resolved by");
  await page.getByLabel("Filter notes", { exact: true }).selectOption("open");
  await expect(note).toHaveCount(0);
  await page
    .getByLabel("Filter notes", { exact: true })
    .selectOption("resolved");
  await page.getByLabel("Search notes", { exact: true }).fill("dense baseline");
  await expect(note).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/-notes\.md$/);
  await page
    .getByRole("button", { name: "Search document", exact: true })
    .click();
  await page
    .getByLabel("Find in this document", { exact: true })
    .fill("sparse");
  await page
    .getByRole("button", { name: "Run document search", exact: true })
    .click();
  await expect(page.locator(".pb-search-results button").first()).toContainText(
    "Page 1",
  );
  await expect(
    page.locator(".pb-text-layer .pb-search-match").first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Pages", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Go to page 1", exact: true }),
  ).toHaveAttribute("aria-current", "page");
});
