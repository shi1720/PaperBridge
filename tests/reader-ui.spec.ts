import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

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
  const accessibility = await new AxeBuilder({ page })
    .include(".pb-note-list")
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(
    accessibility.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact || ""),
    ),
  ).toEqual([]);
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

test("notes can be edited without losing their discussion and deletion requires a deliberate action", async ({
  page,
}) => {
  await page.goto("http://localhost:5173/papers/demo-paper?demo=1");
  await expect(page.locator(".pb-pdf-page canvas")).toBeVisible();
  await page
    .getByLabel("Your note · page 1", { exact: true })
    .fill("Original baseline observation.");
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  const note = page.locator(".pb-note").first();
  await note.getByRole("button", { name: "Reply", exact: true }).click();
  await note
    .getByLabel("Reply to note on page 1")
    .fill("Keep this discussion attached.");
  await note.getByRole("button", { name: "Send reply", exact: true }).click();
  await expect(note).toContainText("Keep this discussion attached.");
  await note.getByRole("button", { name: "Edit", exact: true }).click();
  await note
    .getByLabel("Edit your note", { exact: true })
    .fill("Revised baseline observation.");
  await note.getByRole("button", { name: "Save changes", exact: true }).click();
  const edited = page
    .locator(".pb-note")
    .filter({ hasText: "Revised baseline observation." });
  await expect(edited).toHaveCount(1);
  await expect(edited).toContainText("Keep this discussion attached.");
  await expect(
    page.getByText("Original baseline observation.", { exact: true }),
  ).toHaveCount(0);
  await edited
    .getByRole("button", { name: "Delete note", exact: true })
    .click();
  await expect(edited).toContainText("Delete this note and its replies?");
  await edited.getByRole("button", { name: "Keep note", exact: true }).click();
  await expect(edited).toBeVisible();
  await edited
    .getByRole("button", { name: "Delete note", exact: true })
    .click();
  await edited
    .getByRole("button", { name: "Delete permanently", exact: true })
    .click();
  await expect(edited).toHaveCount(0);
});

test("request drafts survive switching between manuscript, discussion and activity", async ({
  page,
}, testInfo) => {
  await page.goto("http://localhost:5173/requests/demo-request?demo=1");
  const comment = page.getByRole("textbox", { name: "Review comment" });
  await comment.fill("Discussion draft awaiting a figure reference.");
  await page
    .getByRole("button", { name: "Manuscript & notes", exact: true })
    .click();
  await expect(page.locator(".pb-pdf-page canvas")).toBeVisible();
  const draft = page.getByLabel("Your note · page 1", { exact: true });
  await draft.fill("Review the uncertainty in this figure.");
  await page
    .getByRole("button", { name: "Activity & revisions", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Manuscript & notes", exact: true })
    .click();
  await expect(draft).toHaveValue("Review the uncertainty in this figure.");
  await page.getByRole("button", { name: "Discussion", exact: true }).click();
  await expect(comment).toHaveValue(
    "Discussion draft awaiting a figure reference.",
  );
  await page
    .getByRole("button", { name: "Manuscript & notes", exact: true })
    .click();
  await expect(draft).toHaveValue("Review the uncertainty in this figure.");
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(
    page.locator(".pb-note").filter({ hasText: "Review the uncertainty" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Discussion", exact: true }).click();
  await page
    .getByRole("button", { name: "Manuscript & notes", exact: true })
    .click();
  await expect(draft).toHaveValue("");
  await expect(page.locator(".pb-pdf-page canvas")).toBeVisible();
  await expect(page.getByText(/Rendering page/)).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("reader-workspace.png"),
    fullPage: true,
  });
});

test("selecting a PDF passage in focus mode opens notes and saves an anchored highlight", async ({
  page,
}) => {
  await page.goto("http://localhost:5173/papers/demo-paper?demo=1");
  await expect(page.locator(".pb-text-layer")).toContainText("Sparse pathways");
  await page
    .getByRole("button", { name: "Focus reading", exact: true })
    .click();
  await expect(
    page.getByRole("complementary", { name: "Manuscript notes" }),
  ).not.toBeVisible();
  const text = page
    .locator(".pb-text-layer span")
    .filter({ hasText: "Sparse pathways" })
    .first();
  await expect(text).toBeVisible();
  await expect(page.getByText(/Rendering page/)).toHaveCount(0);
  await text.evaluate((element) => {
    const selection = window.getSelection()!;
    const range = document.createRange();
    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.locator(".pb-pdf-page").dispatchEvent("pointerup");
  await expect(
    page.getByRole("complementary", { name: "Manuscript notes" }),
  ).toBeVisible();
  await expect(page.locator(".pb-selection")).toContainText("Sparse pathways");
  await page
    .getByRole("button", { name: "Save highlight & note", exact: true })
    .click();
  const highlight = page
    .locator(".pb-note")
    .filter({ hasText: "Sparse pathways" });
  await expect(highlight).toBeVisible();
  await expect(
    page.locator(".pb-highlight-layer > span").first(),
  ).toBeVisible();
  await highlight.getByRole("button", { name: "Page 1", exact: true }).click();
  await expect(page.locator(".pb-highlight-active").first()).toBeVisible();
});
