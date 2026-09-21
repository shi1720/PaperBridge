// Reproducible fictional manuscript fixture. No external publication content.
const fs = require("node:fs");
const lines = [
  ["PaperBridge | FICTIONAL DEMONSTRATION MANUSCRIPT", 10, 740],
  ["Sparse pathways for interpretable language models", 20, 690],
  ["Alex Morgan | Independent researcher", 11, 660],
  ["ABSTRACT", 12, 612],
  [
    "We investigate sparse activation pathways in compact language models.",
    11,
    590,
  ],
  [
    "This fictional manuscript demonstrates private review and annotations.",
    11,
    570,
  ],
  [
    "The example study compares two synthetic benchmarks. No real research",
    11,
    550,
  ],
  [
    "result is claimed, and this document should not be cited as evidence.",
    11,
    530,
  ],
  ["1. RESEARCH QUESTION", 12, 480],
  [
    "Can a constrained activation pathway help a reader understand which",
    11,
    458,
  ],
  [
    "features influence a model output? Interpretability is treated as a",
    11,
    438,
  ],
  [
    "measurable research question, rather than a guarantee of correctness.",
    11,
    418,
  ],
  ["2. PROPOSED EVALUATION", 12, 368],
  [
    "Compare a sparse pathway with a dense baseline under matched training",
    11,
    346,
  ],
  [
    "conditions. Report uncertainty across seeds, ablate the sparsity budget,",
    11,
    326,
  ],
  [
    "and test whether results transfer beyond the synthetic benchmarks.",
    11,
    306,
  ],
  ["3. LIMITATIONS AND OPEN QUESTIONS", 12, 256],
  ["Two synthetic benchmarks cannot establish general performance.", 11, 234],
  [
    "External evaluation, stronger baselines, and human assessment remain",
    11,
    214,
  ],
  [
    "necessary. Correlation between sparsity and interpretation does not",
    11,
    194,
  ],
  ["establish a causal relationship.", 11, 174],
  [
    "Select a sentence to highlight it and add a private or shared note.",
    10,
    106,
  ],
  ["Demo only | Not submitted to arXiv | 1", 9, 65],
];
const escape = (s) => s.replace(/[\\()]/g, "\\$&");
const content = lines
  .map(
    ([t, size, y]) =>
      `BT /F1 ${size} Tf 0.15 0.22 0.17 rg 50 ${y} Td (${escape(t)}) Tj ET`,
  )
  .join("\n");
const objects = [
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
];
let out = "%PDF-1.4\n",
  offsets = [0];
objects.forEach((o, i) => {
  offsets.push(Buffer.byteLength(out));
  out += `${i + 1} 0 obj\n${o}\nendobj\n`;
});
const start = Buffer.byteLength(out);
out +=
  "xref\n0 6\n0000000000 65535 f \n" +
  offsets
    .slice(1)
    .map((x) => String(x).padStart(10, "0") + " 00000 n \n")
    .join("");
out += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
fs.writeFileSync("public/demo-manuscript.pdf", out);
