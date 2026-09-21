const { test } = require("node:test");
const assert = require("node:assert/strict");
const sharp = require("sharp");
const { normalizeMedia, MEDIA_LIMITS } = require("../lib/media.js");
const { pdfAnalysisInput } = require("../lib/domain.js");
test("images are fully decoded and rebuilt without EXIF or trailing source payload; avatar is square", async () => {
  const source = await sharp({
    create: { width: 40, height: 12, channels: 3, background: "#ffa600" },
  })
    .jpeg()
    .withMetadata({ exif: { IFD0: { Copyright: "PRIVATE-EXIF-MARKER" } } })
    .toBuffer();
  const result = await normalizeMedia(
    Buffer.concat([source, Buffer.from("UNTRUSTED-TRAILING-MARKER")]),
    "image/jpeg",
    "avatar",
  );
  assert.equal(result.contentType, "image/webp");
  assert.equal(result.width, 512);
  assert.equal(result.height, 512);
  const metadata = await sharp(result.body).metadata();
  assert.equal(metadata.exif, undefined);
  assert.equal(result.body.includes(Buffer.from("UNTRUSTED")), false);
});
test("rejects SVG, MIME spoofing, malformed images, excessive image bytes and invalid/incomplete PDFs", async () => {
  const png = await sharp({
    create: { width: 2, height: 2, channels: 3, background: "#fff" },
  })
    .png()
    .toBuffer();
  for (const [body, type, purpose] of [
    [Buffer.from("<svg/>"), "image/svg+xml", "avatar"],
    [png, "image/jpeg", "community"],
    [Buffer.from("garbage"), "image/png", "community"],
    [Buffer.alloc(MEDIA_LIMITS.avatar + 1), "image/png", "avatar"],
    [Buffer.from("%PDF-1.7 incomplete"), "application/pdf", "community"],
    [Buffer.from("%PDF-1.7\n%%EOF"), "application/pdf", "avatar"],
  ])
    await assert.rejects(
      normalizeMedia(body, type, purpose),
      (e) => e.code === "invalid-argument",
    );
  const pdf = await normalizeMedia(
    Buffer.from("%PDF-1.7\n%%EOF"),
    "application/pdf",
    "community",
  );
  assert.equal(pdf.kind, "pdf");
});
test("PDF observations preserve bounded outside-page coordinates and reject inconsistent/nonfinite coverage", () => {
  const good = {
    version: 1,
    totalPages: 2,
    scannedPages: 1,
    extractedCharacters: 12,
    textTruncated: true,
    pages: [
      {
        page: 1,
        width: 612,
        height: 792,
        textCharacters: 12,
        minFontSize: 8,
        medianFontSize: 12,
        textBounds: { left: -3, top: 10, right: 615, bottom: 794 },
      },
    ],
  };
  assert.deepEqual(pdfAnalysisInput(good), good);
  assert.equal(pdfAnalysisInput(null), null);
  for (const bad of [
    { ...good, scannedPages: 3 },
    { ...good, extractedCharacters: 100001 },
    { ...good, pages: [{ ...good.pages[0], width: Infinity }] },
    { ...good, pages: [{ ...good.pages[0], page: 2 }] },
  ])
    assert.throws(
      () => pdfAnalysisInput(bad),
      (e) => e.code === "invalid-argument",
    );
});
