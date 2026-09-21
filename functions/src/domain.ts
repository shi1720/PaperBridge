import { CATEGORY_IDS } from "./categories";
/** Domain validation is shared by callable handlers and executable regression tests. */
export class DomainError extends Error {
  constructor(
    public code:
      "invalid-argument" | "permission-denied" | "failed-precondition",
    message: string,
  ) {
    super(message);
  }
}
export const ACTIVE_STATUSES = [
  "pending",
  "reviewing",
  "changes_requested",
  "accepted",
];
export const STATUSES = [
  ...ACTIVE_STATUSES,
  "declined",
  "withdrawn",
  "endorsed",
];
export function text(
  value: unknown,
  name: string,
  max: number,
  required = true,
): string {
  if (typeof value !== "string") {
    if (!required && value == null) return "";
    throw new DomainError("invalid-argument", `${name} must be text.`);
  }
  const result = value.trim();
  if (required && !result)
    throw new DomainError("invalid-argument", `${name} is required.`);
  if (result.length > max)
    throw new DomainError(
      "invalid-argument",
      `${name} exceeds ${max} characters.`,
    );
  return result;
}
export function identifier(value: unknown, name = "ID"): string {
  const result = text(value, name, 128);
  if (!/^[a-zA-Z0-9_-]+$/.test(result))
    throw new DomainError("invalid-argument", `Invalid ${name}.`);
  return result;
}
export function category(value: unknown): string {
  const result = text(value, "Category", 60);
  if (!CATEGORY_IDS.has(result))
    throw new DomainError("invalid-argument", "Choose a valid arXiv category.");
  return result;
}
export function stringArray(
  value: unknown,
  name: string,
  maxItems: number,
  maxLength: number,
): string[] {
  if (!Array.isArray(value) || value.length > maxItems)
    throw new DomainError("invalid-argument", `Invalid ${name}.`);
  return [...new Set(value.map((v) => text(v, name, maxLength)))];
}
export function number(
  value: unknown,
  name: string,
  min: number,
  max: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    throw new DomainError(
      "invalid-argument",
      `${name} must be between ${min} and ${max}.`,
    );
  return value;
}
export function arxivUrl(value: unknown, endorsement = false): string {
  const result = text(value, "arXiv URL", 1000, false);
  if (!result) return "";
  let url: URL;
  try {
    url = new URL(result);
  } catch {
    throw new DomainError("invalid-argument", "Enter a valid arXiv URL.");
  }
  if (
    url.protocol !== "https:" ||
    !["arxiv.org", "www.arxiv.org"].includes(url.hostname) ||
    url.username ||
    url.password
  )
    throw new DomainError("invalid-argument", "Use an https://arxiv.org URL.");
  if (endorsement && !url.pathname.startsWith("/auth/"))
    throw new DomainError(
      "invalid-argument",
      "Use the endorsement URL provided by arXiv.",
    );
  return result;
}
export function weekStart(time = Date.now()): number {
  const date = new Date(time);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.getTime();
}
export function canReadPaper(
  paper: { ownerId: string; visibility: string },
  uid: string,
  requests: Array<{ reviewerId: string; status: string }>,
): boolean {
  return (
    paper.ownerId === uid ||
    paper.visibility === "public" ||
    requests.some(
      (r) => r.reviewerId === uid && ACTIVE_STATUSES.includes(r.status),
    )
  );
}
export function checkTransition(
  current: string,
  next: string,
  actor: "requester" | "reviewer",
): void {
  const requester: Record<string, string[]> = {
    pending: ["withdrawn"],
    reviewing: ["withdrawn"],
    changes_requested: ["reviewing", "withdrawn"],
    accepted: ["endorsed", "withdrawn"],
  };
  const reviewer: Record<string, string[]> = {
    pending: ["reviewing", "accepted", "declined", "changes_requested"],
    reviewing: ["accepted", "declined", "changes_requested"],
    changes_requested: ["reviewing", "accepted", "declined"],
    accepted: ["reviewing", "changes_requested", "declined"],
  };
  if (!(actor === "requester" ? requester : reviewer)[current]?.includes(next))
    throw new DomainError(
      "failed-precondition",
      `Cannot change ${current} to ${next} as ${actor}.`,
    );
}
export function storagePath(
  value: unknown,
  uid: string,
  paperId: string,
): string {
  const result = text(value, "File path", 500, false);
  if (
    result &&
    (!result.startsWith(`papers/${uid}/${paperId}/`) ||
      result.split("/").length !== 4 ||
      result.includes("..") ||
      !result.toLowerCase().endsWith(".pdf"))
  )
    throw new DomainError(
      "invalid-argument",
      "Use a PDF uploaded to this paper’s private folder.",
    );
  return result;
}
export function profileInput(input: any) {
  if (!input || !["researcher", "endorser"].includes(input.role))
    throw new DomainError("invalid-argument", "Choose researcher or endorser.");
  const categories = stringArray(
    input.categories ?? [],
    "Categories",
    30,
    60,
  ).map(category);
  const acceptingRequests = input.acceptingRequests === true;
  const eligibilitySelfAttested = input.eligibilitySelfAttested === true;
  if (
    acceptingRequests &&
    (input.role !== "endorser" ||
      !eligibilitySelfAttested ||
      !categories.length)
  )
    throw new DomainError(
      "failed-precondition",
      "Confirm your category eligibility and select categories before accepting requests.",
    );
  const orcid = text(input.orcid, "ORCID", 100, false).replace(
    /^https:\/\/orcid\.org\//,
    "",
  );
  if (orcid && !/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(orcid))
    throw new DomainError(
      "invalid-argument",
      "Enter a valid ORCID identifier.",
    );
  return {
    name: text(input.name, "Name", 100),
    role: input.role,
    headline: text(input.headline, "Headline", 180, false),
    institution: text(input.institution, "Institution", 180, false),
    bio: text(input.bio, "Biography", 3000, false),
    categories,
    acceptingRequests,
    weeklyCapacity: Math.floor(
      number(input.weeklyCapacity ?? 3, "Weekly capacity", 1, 50),
    ),
    eligibilitySelfAttested,
    arxivUrl: arxivUrl(input.arxivUrl),
    orcid,
    publicProfile: input.publicProfile !== false,
  };
}

/** Advisory PDF observations supplied by the browser; never evidence of verification. */
export function pdfAnalysisInput(input: any): any {
  if (input == null) return null;
  if (
    input.version !== 1 ||
    !Array.isArray(input.pages) ||
    typeof input.textTruncated !== "boolean"
  )
    throw new DomainError("invalid-argument", "Invalid PDF analysis metadata.");
  const integer = (value: any, label: string, low: number, high: number) => {
    const n = number(value, label, low, high);
    if (!Number.isInteger(n))
      throw new DomainError(
        "invalid-argument",
        `${label} must be a whole number.`,
      );
    return n;
  };
  const totalPages = integer(input.totalPages, "PDF page count", 1, 10000);
  const scannedPages = integer(
    input.scannedPages,
    "Analyzed page count",
    0,
    Math.min(totalPages, 100),
  );
  if (input.pages.length !== scannedPages)
    throw new DomainError(
      "invalid-argument",
      "PDF analysis page coverage does not match its pages.",
    );
  const pages = input.pages.map((p: any, index: number) => {
    if (!p || p.page !== index + 1)
      throw new DomainError(
        "invalid-argument",
        "PDF analysis pages must be sequential.",
      );
    const bounds =
      p.textBounds == null
        ? null
        : {
            left: number(p.textBounds.left, "Text left", -100000, 100000),
            top: number(p.textBounds.top, "Text top", -100000, 100000),
            right: number(p.textBounds.right, "Text right", -100000, 100000),
            bottom: number(p.textBounds.bottom, "Text bottom", -100000, 100000),
          };
    if (bounds && (bounds.right < bounds.left || bounds.bottom < bounds.top))
      throw new DomainError(
        "invalid-argument",
        "PDF text bounds are reversed.",
      );
    return {
      page: p.page,
      width: number(p.width, "Page width", 0.01, 20000),
      height: number(p.height, "Page height", 0.01, 20000),
      textCharacters: integer(p.textCharacters, "Page text count", 0, 10000000),
      minFontSize: number(p.minFontSize, "Minimum font size", 0, 1000),
      medianFontSize: number(p.medianFontSize, "Median font size", 0, 1000),
      textBounds: bounds,
    };
  });
  return {
    version: 1,
    totalPages,
    scannedPages,
    extractedCharacters: integer(
      input.extractedCharacters,
      "Extracted text count",
      0,
      100000,
    ),
    textTruncated: input.textTruncated,
    pages,
  };
}
