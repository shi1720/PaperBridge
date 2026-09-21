/** PDF extraction observations, not a visual inspection or venue compliance verdict. */
export type PdfPageAnalysis = {
  page: number;
  width: number;
  height: number;
  textCharacters: number;
  minFontSize: number;
  medianFontSize: number;
  textBounds: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  } | null;
};
export type PdfAnalysis = {
  version: 1;
  totalPages: number;
  scannedPages: number;
  extractedCharacters: number;
  textTruncated: boolean;
  pages: PdfPageAnalysis[];
};
type TextItem = {
  str: string;
  width: number;
  height: number;
  transform: number[];
};
const rounded = (n: number) => Math.round(n * 100) / 100;

export function analyzePdfPage(
  page: number,
  viewport: { width: number; height: number; transform: number[] },
  items: TextItem[],
): PdfPageAnalysis {
  const sizes: { size: number; weight: number }[] = [];
  let left = Infinity,
    top = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  for (const item of items) {
    if (!item.str.trim() || item.transform.length !== 6) continue;
    const [a, b, c, d, e, f] = item.transform;
    const [va, vb, vc, vd, ve, vf] = viewport.transform;
    const size = Math.hypot(c, d) || item.height;
    if (Number.isFinite(size) && size > 0 && size < 1000)
      sizes.push({ size, weight: item.str.trim().length });
    // Estimate the text item's rectangle, then transform all corners for rotated pages.
    const baseline = Math.hypot(a, b) || 1;
    const dx = (a / baseline) * item.width,
      dy = (b / baseline) * item.width;
    for (const [x, y] of [
      [e, f],
      [e + dx, f + dy],
      [e + c, f + d],
      [e + dx + c, f + dy + d],
    ]) {
      const px = va * x + vc * y + ve,
        py = vb * x + vd * y + vf;
      if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
      left = Math.min(left, px);
      right = Math.max(right, px);
      top = Math.min(top, py);
      bottom = Math.max(bottom, py);
    }
  }
  sizes.sort((x, y) => x.size - y.size);
  const midpoint = sizes.reduce((sum, item) => sum + item.weight, 0) / 2;
  let weight = 0,
    median = 0;
  for (const item of sizes) {
    weight += item.weight;
    if (weight >= midpoint) {
      median = item.size;
      break;
    }
  }
  return {
    page,
    width: rounded(viewport.width),
    height: rounded(viewport.height),
    textCharacters: items.reduce((sum, item) => sum + item.str.length, 0),
    minFontSize: rounded(sizes[0]?.size || 0),
    medianFontSize: rounded(median),
    textBounds: Number.isFinite(left)
      ? {
          left: rounded(left),
          top: rounded(top),
          right: rounded(right),
          bottom: rounded(bottom),
        }
      : null,
  };
}
