import { describe, it, expect } from "vitest";
import { analyzePdfPage } from "../src/lib/pdf-analysis";

describe("PDF extraction observations", () => {
  it("weights body font sizes by text and transforms bounds into page coordinates", () => {
    const page = analyzePdfPage(
      1,
      { width: 612, height: 792, transform: [1, 0, 0, -1, 0, 792] },
      [
        {
          str: "Title",
          width: 60,
          height: 20,
          transform: [20, 0, 0, 20, 50, 740],
        },
        {
          str: "A substantially longer paragraph of body text.",
          width: 260,
          height: 11,
          transform: [11, 0, 0, 11, 50, 700],
        },
      ],
    );
    expect(page.medianFontSize).toBe(11);
    expect(page.minFontSize).toBe(11);
    expect(page.textBounds).toEqual({
      left: 50,
      top: 32,
      right: 310,
      bottom: 92,
    });
  });
  it("records image-only pages without inventing text or font measurements", () => {
    const page = analyzePdfPage(
      4,
      { width: 612, height: 792, transform: [1, 0, 0, -1, 0, 792] },
      [],
    );
    expect(page).toMatchObject({
      page: 4,
      textCharacters: 0,
      minFontSize: 0,
      medianFontSize: 0,
      textBounds: null,
    });
  });
  it("preserves out-of-page bounds and handles page rotation", () => {
    const page = analyzePdfPage(
      1,
      { width: 792, height: 612, transform: [0, 1, 1, 0, 0, 0] },
      [
        {
          str: "Text",
          width: 60,
          height: 12,
          transform: [12, 0, 0, 12, -5, 740],
        },
      ],
    );
    expect(page.textBounds).toEqual({
      left: 740,
      top: -5,
      right: 752,
      bottom: 55,
    });
  });
});
