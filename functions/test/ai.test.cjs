const { test } = require("node:test");
const assert = require("node:assert/strict");
const c = require("../lib/ai-core.js");
test("encrypted provider key authenticates user and provider binding and detects tamper", () => {
  const secret = Buffer.alloc(32, 7).toString("base64");
  const e = c.encryptKey("test-secret", secret, "alice:openai");
  assert.equal(c.decryptKey(e, secret, "alice:openai"), "test-secret");
  assert.throws(() => c.decryptKey(e, secret, "bob:openai"));
  assert.throws(() =>
    c.decryptKey(
      { ...e, tag: Buffer.alloc(16).toString("base64") },
      secret,
      "alice:openai",
    ),
  );
  assert.equal(JSON.stringify(e).includes("test-secret"), false);
});
test("review rejects invented quotations and fabricated source ids", () => {
  const finding = {
    title: "Concern",
    severity: "high",
    quote: "The sample had ten participants.",
    explanation: "Power is limited",
    recommendation: "Report uncertainty",
    sourceIds: ["real"],
  };
  const raw = {
    summary: "Review",
    findings: [
      finding,
      { ...finding, quote: "Invented quote" },
      { ...finding, sourceIds: ["fake"] },
    ],
    limitations: [],
  };
  const r = c.parseReview(
    JSON.stringify(raw),
    finding.quote,
    new Set(["real"]),
  );
  assert.equal(r.findings.length, 1);
  assert.equal(r.limitations.length, 2);
  assert.throws(() => c.parseReview("not json", "", new Set()));
});
test("PDF layout whitespace preserves valid quotes without accepting altered claims", () => {
  const quote = "We ran five random seeds and report the best run.";
  const finding = {
    title: "Report all seeds",
    severity: "medium",
    quote,
    explanation: "Best-run reporting omits variation.",
    recommendation: "Report every run.",
    sourceIds: [],
  };
  const manuscript =
    "Method\nWe ran five random seeds\n and report the best\u00a0run.\nResults";
  const result = c.parseReview(
    JSON.stringify({
      summary: "Review",
      limitations: [],
      findings: [
        finding,
        { ...finding, quote: quote.replace("five", "fifty") },
        {
          ...finding,
          quote: "We ran five random seeds and report the mean run.",
        },
        { ...finding, quote: "We ran five random seeds…report the best run." },
        { ...finding, sourceIds: ["invented-source"] },
      ],
    }),
    manuscript,
    new Set(),
  );
  assert.deepEqual(result.findings, [finding]);
  assert.equal(result.limitations.length, 2);
});
test("presentation quote marks are removed only around a verified excerpt", () => {
  const quote = "We ran five random seeds and report the best run.";
  const finding = {
    title: "Concern",
    severity: "medium",
    quote,
    explanation: "Report variability",
    recommendation: "Show all runs",
    sourceIds: [],
  };
  const result = c.parseReview(
    JSON.stringify({
      summary: "Review",
      limitations: [],
      findings: [
        { ...finding, quote: '"' + quote + '"' },
        { ...finding, quote: "“" + quote + "”" },
        { ...finding, quote: "“" + quote.replace("five", "fifty") + "”" },
        { ...finding, quote: "“" + quote + '"' },
        { ...finding, quote: '""' },
      ],
    }),
    quote,
    new Set(),
  );
  assert.deepEqual(result.findings, [finding, finding]);
  assert.equal(result.limitations.length, 1);
});
test("full input is never silently truncated and partial mode is explicit; DOI extraction bounded", () => {
  assert.equal(c.manuscriptExcerpt("x".repeat(100000)).text.length, 100000);
  assert.throws(() => c.manuscriptExcerpt("x".repeat(100001)), /100,000/);
  assert.throws(() => c.manuscriptExcerpt("text", "unknown"), /coverage/);
  const e = c.manuscriptExcerpt("x".repeat(40000), "partial");
  assert.equal(e.text.length, 32000);
  assert.equal(e.truncated, true);
  assert.equal(e.totalCharacters, 40000);
  assert.deepEqual(c.extractDois("ref 10.1000/abc. ref 10.1000/abc."), [
    "10.1000/abc",
  ]);
});
test("provider authentication errors never echo response text", async () => {
  const original = global.fetch;
  global.fetch = async () =>
    new Response("sensitive-key manuscript", { status: 401 });
  try {
    await assert.rejects(
      c.discoverModels("openai", "secret"),
      (e) => e.code === "authentication" && !e.message.includes("sensitive"),
    );
  } finally {
    global.fetch = original;
  }
});
test("OpenAI adapter caps output and disables storage; parses only message text", async () => {
  const original = global.fetch;
  global.fetch = async (url, options) => {
    const b = JSON.parse(options.body);
    assert.equal(b.store, false);
    assert.match(b.input, /JSON/);
    assert.equal(b.max_output_tokens, 6000);
    assert.equal(options.redirect, "error");
    return new Response(
      JSON.stringify({
        status: "completed",
        output: [{ content: [{ type: "output_text", text: "{}" }] }],
        usage: { input_tokens: 20, output_tokens: 5 },
      }),
    );
  };
  try {
    const r = await c.generate(
      { provider: "openai", model: "gpt-test" },
      "secret",
      "json",
      "data",
    );
    assert.equal(r.text, "{}");
    assert.equal(r.usage.inputTokens, 20);
  } finally {
    global.fetch = original;
  }
});
test("metadata opt-out performs no network call", async () => {
  const original = global.fetch;
  global.fetch = () => {
    throw new Error("network forbidden");
  };
  try {
    const r = await c.collectMetadata("10.1000/abc", "title", false);
    assert.equal(r.sources.length, 0);
    assert.match(r.limitations[0], /disabled/);
  } finally {
    global.fetch = original;
  }
});
test("metadata only requests fixed host with encoded DOI and no redirects", async () => {
  const original = global.fetch;
  global.fetch = async (url, options) => {
    assert.equal(new URL(url).hostname, "api.crossref.org");
    assert.equal(options.redirect, "error");
    return new Response(JSON.stringify({ message: { items: [] } }));
  };
  try {
    await c.collectMetadata("https://evil.test/10.1000/abc", "title", true);
  } finally {
    global.fetch = original;
  }
});
test("all agents prohibit instruction following and misconduct verdicts", () => {
  for (const p of Object.values(c.PROMPTS)) {
    assert.match(p, /UNTRUSTED DATA/);
    assert.match(p, /plagiarism verdict/);
    assert.match(p, /EXACT verbatim quote/);
  }
});
test("Anthropic adapter uses headers and handles truncation explicitly", async () => {
  const original = global.fetch;
  global.fetch = async (url, options) => {
    assert.equal(options.headers["x-api-key"], "secret");
    assert.equal(options.headers["anthropic-version"], "2023-06-01");
    assert.equal(JSON.parse(options.body).max_tokens, 6000);
    return new Response(
      JSON.stringify({
        stop_reason: "max_tokens",
        content: [{ type: "text", text: "partial" }],
      }),
    );
  };
  try {
    await assert.rejects(
      c.generate(
        { provider: "anthropic", model: "claude-test" },
        "secret",
        "json",
        "data",
      ),
      (e) => e.code === "incomplete",
    );
  } finally {
    global.fetch = original;
  }
});
test("Gemini adapter authenticates in headers, selects JSON and extracts usage", async () => {
  const original = global.fetch;
  global.fetch = async (url, options) => {
    assert.ok(!url.includes("secret"));
    assert.equal(options.headers["x-goog-api-key"], "secret");
    const b = JSON.parse(options.body);
    assert.equal(b.generationConfig.responseMimeType, "application/json");
    assert.equal(b.generationConfig.maxOutputTokens, 6000);
    return new Response(
      JSON.stringify({
        candidates: [
          { finishReason: "STOP", content: { parts: [{ text: "{}" }] } },
        ],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 4,
          thoughtsTokenCount: 2,
        },
      }),
    );
  };
  try {
    const r = await c.generate(
      { provider: "gemini", model: "gemini-test" },
      "secret",
      "json",
      "data",
    );
    assert.equal(r.text, "{}");
    assert.equal(r.usage.reasoningTokens, 2);
  } finally {
    global.fetch = original;
  }
});
test("Gemini catalog paginates and filters out models without text generation", async () => {
  const original = global.fetch;
  let calls = 0;
  global.fetch = async (url) => {
    calls++;
    return new Response(
      JSON.stringify(
        calls === 1
          ? {
              models: [
                {
                  name: "models/gemini-test",
                  supportedGenerationMethods: ["generateContent"],
                },
                {
                  name: "models/embed",
                  supportedGenerationMethods: ["embedContent"],
                },
              ],
              nextPageToken: "next",
            }
          : {
              models: [
                {
                  name: "models/gemini-test-2",
                  supportedGenerationMethods: ["generateContent"],
                },
              ],
            },
      ),
    );
  };
  try {
    const m = await c.discoverModels("gemini", "secret");
    assert.deepEqual(
      m.map((x) => x.id),
      ["gemini-test", "gemini-test-2"],
    );
    assert.equal(calls, 2);
  } finally {
    global.fetch = original;
  }
});

test("Astra medium uses structured output, increased reasoning budget and reports reasoning usage", async () => {
  const original = global.fetch;
  global.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.model, "gpt-6-astra");
    assert.deepEqual(body.reasoning, { effort: "medium" });
    assert.equal(body.max_output_tokens, 12000);
    assert.equal(body.text.format.type, "json_schema");
    assert.equal(body.text.format.strict, true);
    assert.equal(body.temperature, undefined);
    return new Response(
      JSON.stringify({
        status: "completed",
        model: "gpt-6-astra-2026-09-01",
        output: [{ content: [{ type: "output_text", text: "{}" }] }],
        usage: {
          input_tokens: 100,
          output_tokens: 1000,
          output_tokens_details: { reasoning_tokens: 800 },
        },
      }),
    );
  };
  try {
    const r = await c.generate(
      { provider: "openai", model: "gpt-6-astra" },
      "secret",
      "instructions",
      "manuscript",
    );
    assert.equal(r.usage.reasoningTokens, 800);
    assert.equal(r.model, "gpt-6-astra-2026-09-01");
    assert.throws(
      () =>
        c.normalizeConfig({
          provider: "openai",
          model: "gpt-6-astra",
          reasoningEffort: "none",
        }),
      /does not support/,
    );
    assert.throws(
      () =>
        c.normalizeConfig({
          provider: "anthropic",
          model: "claude-test",
          reasoningEffort: "medium",
        }),
      /does not support/,
    );
  } finally {
    global.fetch = original;
  }
});
test("PDF diagnostics separate measured extraction limits from visual inspection", () => {
  assert.equal(c.pdfDiagnostics(null).sourceCoverage, "unknown");
  const result = c.pdfDiagnostics({
    version: 1,
    totalPages: 3,
    scannedPages: 2,
    textTruncated: true,
    pages: [
      {
        page: 1,
        width: 600,
        height: 800,
        textCharacters: 10,
        medianFontSize: 7,
        textBounds: { left: -5, top: 0, right: 590, bottom: 790 },
      },
      {
        page: 2,
        width: 600,
        height: 800,
        textCharacters: 1500,
        medianFontSize: 12,
      },
    ],
  });
  assert.equal(result.sourceCoverage, "incomplete");
  assert.equal(result.visualInspection, false);
  assert.equal(result.warnings.length, 4);
  assert.match(c.PROMPTS.formatting, /never claim you visually inspected/);
  assert.match(c.PROMPTS.readiness, /not a pass\/fail certification/);
});
test("bounded specialists run in parallel without exceeding concurrency", async () => {
  let active = 0,
    maxActive = 0;
  const completed = [];
  await c.runBounded(c.AGENTS, 3, async (name) => {
    active++;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    completed.push(name);
    active--;
  });
  assert.equal(maxActive, 3);
  assert.deepEqual(completed.sort(), [...c.AGENTS].sort());
});
