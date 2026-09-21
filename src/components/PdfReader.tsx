import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  getDocument,
  GlobalWorkerOptions,
  TextLayer,
  type PDFDocumentProxy,
} from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  Search,
  PanelLeft,
  PanelRight,
  Maximize2,
  Minimize2,
  ScanLine,
  Download,
  Check,
  RotateCcw,
  MessageSquare,
  Send,
  Pencil,
  FileText,
  ChevronLeft,
  ChevronRight,
  Highlighter,
  LockKeyhole,
  Trash2,
  Users,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useApp, useData } from "../lib/context";
import { Avatar } from "./ui";
import "./pdf-reader.css";
import { analyzePdfPage, type PdfAnalysis } from "../lib/pdf-analysis";
import {
  readerDraftKey,
  readReaderDraft,
  rememberReaderDraft,
  type PageDraft,
} from "../lib/reader-drafts";

GlobalWorkerOptions.workerSrc = workerUrl;

export const PDF_EXTRACTION_LIMITS =
  "Text extraction covers up to 100 pages and 100,000 characters. Scanned pages need OCR, which is not included. The original PDF remains available in the reader.";

/** Extract bounded plain text for analysis without changing the original PDF. */
export async function extractPdfText(file: File): Promise<string> {
  return (await extractPdfManuscript(file)).text;
}

export async function extractPdfManuscript(file: File): Promise<{
  text: string;
  pdfAnalysis: PdfAnalysis;
}> {
  const task = getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  try {
    const pdf = await task.promise;
    let result = "";
    let textTruncated = false;
    const pages: PdfAnalysis["pages"] = [];
    for (let page = 1; page <= Math.min(pdf.numPages, 100); page++) {
      const pdfPage = await pdf.getPage(page);
      const content = await pdfPage.getTextContent();
      const text = content.items
        .map((item) =>
          "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "",
        )
        .join("");
      pages.push(
        analyzePdfPage(
          page,
          pdfPage.getViewport({ scale: 1 }),
          content.items.filter((item) => "str" in item),
        ),
      );
      if (text.trim()) {
        const next = `\n\n[Page ${page}]\n${text}`;
        if (result.length + next.length > 100_000) textTruncated = true;
        result += next.slice(0, Math.max(0, 100_000 - result.length));
      }
      pdfPage.cleanup();
    }
    const text = result.trim();
    return {
      text,
      pdfAnalysis: {
        version: 1,
        totalPages: pdf.numPages,
        scannedPages: pages.length,
        extractedCharacters: text.length,
        textTruncated,
        pages,
      },
    };
  } finally {
    await task.destroy();
  }
}

type Rect = { x: number; y: number; width: number; height: number };
const colors: Record<string, string> = {
  yellow: "#f6d74e",
  green: "#85cfb3",
  pink: "#eea3bd",
};
const message = (e: unknown) =>
  e instanceof Error ? e.message : "Something went wrong. Please try again.";

export function PdfReader(props: {
  paper: any;
  requestId?: string;
  readOnly?: boolean;
}) {
  const { user, profile, demo } = useApp();
  const draftKey = readerDraftKey(
    (demo ? profile?.id : user?.uid || profile?.id) || "guest",
    props.paper.id,
    props.paper.version || 1,
    props.requestId,
  );
  return <ReaderWorkspace key={draftKey} {...props} draftKey={draftKey} />;
}

function ReaderWorkspace({
  draftKey,
  paper,
  requestId,
  readOnly: locked = false,
}: {
  paper: any;
  requestId?: string;
  readOnly?: boolean;
  draftKey: string;
}) {
  const { call, profile, user, demo, refresh, toast } = useApp();
  const annotations = useData(
    "annotation.list",
    { paperId: paper.id, ...(requestId ? { requestId } : {}) },
    true,
    15000,
  );
  const restored = useRef(readReaderDraft(draftKey)).current;
  const restoredPage = restored?.page || 1;
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(restoredPage);
  const [zoom, setZoom] = useState(1);
  const [loading, setLoading] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState("");
  const [noteError, setNoteError] = useState("");
  const [retry, setRetry] = useState(0);
  const [freshUrl, setFreshUrl] = useState<{
    id: string;
    url: string;
    version: number;
  } | null>(null);
  const [quote, setQuote] = useState(
    restored?.pages[restoredPage]?.quote || "",
  );
  const [rects, setRects] = useState<Rect[]>(
    restored?.pages[restoredPage]?.rects || [],
  );
  const [body, setBody] = useState(restored?.pages[restoredPage]?.body || "");
  const [visibility, setVisibility] = useState<"private" | "shared">(
    restored?.visibility || "private",
  );
  const [color, setColor] = useState(restored?.color || "yellow");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState("");
  const [dimensions, setDimensions] = useState({ width: 612, height: 792 });
  const pageRef = useRef<HTMLDivElement>(null);
  const canvasHost = useRef<HTMLDivElement>(null);
  const textHost = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);
  const demoFallback = demo && !paper.downloadUrl;
  const historical =
    !!paper.currentVersion && (paper.version || 1) !== paper.currentVersion;
  const readOnly = locked || historical;
  const [navOpen, setNavOpen] = useState(false),
    [navTab, setNavTab] = useState<"pages" | "search">("pages"),
    [focusReading, setFocusReading] = useState(false),
    [fullscreen, setFullscreen] = useState(false),
    [fitWidth, setFitWidth] = useState(true),
    [pageInput, setPageInput] = useState(String(restoredPage)),
    [noteSearch, setNoteSearch] = useState(""),
    [noteFilter, setNoteFilter] = useState("all"),
    [searchQuery, setSearchQuery] = useState(""),
    [activeSearch, setActiveSearch] = useState(""),
    [searchHits, setSearchHits] = useState<
      { page: number; snippet: string; count: number }[]
    >([]),
    [searchProgress, setSearchProgress] = useState(0),
    [searching, setSearching] = useState(false);
  const readerRef = useRef<HTMLElement>(null),
    scrollRef = useRef<HTMLDivElement>(null),
    searchSequence = useRef(0),
    draftPages = useRef<Record<number, PageDraft>>(restored?.pages || {});
  const [anchor, setAnchor] = useState<{
    noteId: string;
    page: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    rememberReaderDraft(draftKey, {
      page,
      pages: { ...draftPages.current, [page]: { body, quote, rects } },
      visibility,
      color,
    });
  }, [draftKey, page, body, quote, rects, visibility, color]);

  useEffect(() => {
    if (!anchor || rendering || anchor.page !== page) return;
    scrollRef.current?.scrollTo({
      top: Math.max(
        0,
        anchor.y * dimensions.height - scrollRef.current.clientHeight * 0.25,
      ),
      behavior: "smooth",
    });
  }, [anchor, rendering, page, dimensions.height]);

  const notes: any[] = (
    Array.isArray(annotations.data) ? annotations.data : []
  ).filter((n: any) => (n.paperVersion || 1) === (paper.version || 1));

  const filteredNotes = notes.filter(
    (n) =>
      (noteFilter === "all" ||
        (noteFilter === "page" && n.page === page) ||
        (noteFilter === "open" && !n.resolved) ||
        (noteFilter === "resolved" && n.resolved) ||
        noteFilter === n.visibility) &&
      (!noteSearch ||
        `${n.body || ""} ${n.quote || ""} ${n.authorName || ""} ${(n.replies || []).map((r: any) => r.body).join(" ")}`
          .toLowerCase()
          .includes(noteSearch.toLowerCase())),
  );
  function goToPage(next: number) {
    if (saving) return;
    const target = Math.max(
      1,
      Math.min(
        pdf?.numPages || 1,
        Number.isFinite(next) ? Math.trunc(next) : 1,
      ),
    );
    setPageInput(String(target));
    if (target === page) return;
    draftPages.current[page] = { body, quote, rects };
    const draft = draftPages.current[target];
    setBody(draft?.body || "");
    setQuote(draft?.quote || "");
    setRects(draft?.rects || []);
    setPage(target);
    setPageInput(String(target));
    setNoteError("");
  }
  async function searchDocument(e: React.FormEvent) {
    e.preventDefault();
    if (!pdf || !searchQuery.trim()) return;
    const sequence = ++searchSequence.current,
      query = searchQuery.trim().toLowerCase();
    setActiveSearch(query);
    setSearchHits([]);
    setSearching(true);
    setSearchProgress(0);
    const results: { page: number; snippet: string; count: number }[] = [];
    try {
      for (let number = 1; number <= pdf.numPages; number++) {
        if (sequence !== searchSequence.current) return;
        const pdfPage = await pdf.getPage(number);
        const content = await pdfPage.getTextContent();
        const text = content.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" ");
        const lower = text.toLowerCase(),
          index = lower.indexOf(query);
        if (index >= 0)
          results.push({
            page: number,
            snippet:
              (index > 50 ? "…" : "") +
              text.slice(Math.max(0, index - 50), index + query.length + 110) +
              (index + query.length + 110 < text.length ? "…" : ""),
            count: lower.split(query).length - 1,
          });
        if (sequence === searchSequence.current) {
          setSearchProgress(number);
          setSearchHits([...results]);
        }
      }
    } catch (e) {
      if (sequence === searchSequence.current)
        setNoteError(`Document search could not finish. ${message(e)}`);
    } finally {
      if (sequence === searchSequence.current) setSearching(false);
    }
  }
  function exportNotes() {
    const text =
      `# Notes: ${paper.title || "Manuscript"}\nVersion ${paper.version || 1}${requestId ? ` · Request ${requestId}` : ""}\nExported ${new Date().toISOString()}\n\n` +
      filteredNotes
        .map(
          (n) =>
            `## Page ${n.page} · ${n.visibility} · ${n.resolved ? "Resolved" : "Open"}\n${n.authorName || "Researcher"} · ${n.createdAt ? new Date(n.createdAt).toLocaleString() : ""}\n\n${n.quote ? "> " + n.quote.replace(/\n/g, "\n> ") + "\n\n" : ""}${n.body || ""}\n${(n.replies || []).map((r: any) => `\n- ${r.authorName || "Researcher"}: ${r.body}`).join("")}`,
        )
        .join("\n\n---\n\n");
    const url = URL.createObjectURL(
      new Blob([text], { type: "text/markdown;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(paper.title || "manuscript").replace(/[^a-z0-9-]+/gi, "-").slice(0, 80)}-notes.md`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await readerRef.current?.requestFullscreen();
    } catch {
      toast(
        "Full screen is not available in this browser. Use focus reading to expand the document.",
      );
    }
  }
  useEffect(() => {
    const change = () =>
      setFullscreen(document.fullscreenElement === readerRef.current);
    document.addEventListener("fullscreenchange", change);
    return () => document.removeEventListener("fullscreenchange", change);
  }, []);
  useEffect(() => {
    if (!pdf || !fitWidth || !scrollRef.current) return;
    let active = true;
    const host = scrollRef.current;
    const fit = () => {
      void pdf
        .getPage(page)
        .then((p) => {
          if (active) {
            const natural = p.getViewport({ scale: 1 });
            setZoom(
              Math.max(
                0.25,
                Math.min(2.5, (host.clientWidth - 16) / natural.width),
              ),
            );
          }
        })
        .catch(() => {});
    };
    const observer = new ResizeObserver(fit);
    observer.observe(host);
    fit();
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [pdf, page, fitWidth, focusReading, navOpen, fullscreen]);
  useEffect(() => {
    if (rendering || !textHost.current) return;
    for (const span of textHost.current.querySelectorAll("span"))
      span.classList.toggle(
        "pb-search-match",
        !!activeSearch &&
          (span.textContent || "").toLowerCase().includes(activeSearch),
      );
  }, [activeSearch, rendering, page]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      searchSequence.current++;
    };
  }, []);
  useEffect(() => {
    let active = true;
    setPdf(null);
    setError("");
    if (!paper.downloadUrl) {
      setLoading(false);
      return;
    }
    setLoading(true);
    // downloadUrl is a short-lived authorized URL returned by paper.get.
    // Never mint a persistent Firebase Storage download token here.
    const task = getDocument({
      url:
        freshUrl &&
        freshUrl.id === paper.id &&
        freshUrl.version === (paper.version || 1)
          ? freshUrl.url
          : paper.downloadUrl,
    });
    task.promise
      .then((document) => {
        if (active) setPdf(document);
      })
      .catch((e) => {
        if (active) setError(`Unable to open this PDF. ${message(e)}`);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      void task.destroy();
    };
  }, [paper.id, paper.storagePath, paper.updatedAt, paper.version, retry]);

  useEffect(() => {
    if (!pdf || !canvasHost.current || !textHost.current) return;
    let active = true;
    let renderTask:
      | ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]>
      | undefined;
    let layer: TextLayer | undefined;
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    const textContainer = document.createElement("div");
    textContainer.className = "pb-text-layer";
    canvasHost.current.replaceChildren(canvas);
    textHost.current.replaceChildren(textContainer);
    setRendering(true);
    setError("");
    (async () => {
      const pdfPage = await pdf.getPage(page);
      if (!active) return;
      const viewport = pdfPage.getViewport({ scale: zoom });
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      setDimensions({ width: viewport.width, height: viewport.height });
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      textContainer.style.setProperty(
        "--total-scale-factor",
        String(viewport.scale * viewport.userUnit),
      );
      textContainer.style.setProperty("--scale-round-x", "1px");
      textContainer.style.setProperty("--scale-round-y", "1px");
      renderTask = pdfPage.render({
        canvas,
        viewport,
        transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
      });
      layer = new TextLayer({
        textContentSource: pdfPage.streamTextContent(),
        container: textContainer,
        viewport,
      });
      await Promise.all([renderTask.promise, layer.render()]);
    })()
      .catch((e) => {
        if (active) setError(`Unable to render this page. ${message(e)}`);
      })
      .finally(() => {
        if (active) setRendering(false);
      });
    return () => {
      active = false;
      renderTask?.cancel();
      layer?.cancel();
    };
  }, [pdf, page, zoom]);

  function captureSelection() {
    if (readOnly || saving) return;
    const selection = window.getSelection();
    const container = pageRef.current;
    if (
      !container ||
      !selection ||
      selection.isCollapsed ||
      !selection.rangeCount
    )
      return;
    const range = selection.getRangeAt(0);
    if (
      !container.contains(range.startContainer) ||
      !container.contains(range.endContainer)
    )
      return;
    const text = selection.toString().trim();
    if (!text) return;
    if (text.length > 2000) {
      setNoteError("Choose a shorter passage (up to 2,000 characters).");
      return;
    }
    const box = container.getBoundingClientRect();
    const selectedRects = Array.from(range.getClientRects())
      .map((r) => {
        const left = Math.max(r.left, box.left),
          top = Math.max(r.top, box.top);
        const right = Math.min(r.right, box.right),
          bottom = Math.min(r.bottom, box.bottom);
        return {
          x: (left - box.left) / box.width,
          y: (top - box.top) / box.height,
          width: Math.max(0, right - left) / box.width,
          height: Math.max(0, bottom - top) / box.height,
        };
      })
      .filter((r) => r.width > 0 && r.height > 0)
      .slice(0, 50);
    setQuote(text);
    setFocusReading(false);
    setAnchor(null);
    setRects(demoFallback ? [] : selectedRects);
    setNoteError("");
  }

  async function saveNote() {
    if (readOnly || saving) return;
    if (!body.trim() && !quote) {
      setNoteError("Select a passage or write a note first.");
      return;
    }
    setSaving(true);
    setNoteError("");
    try {
      await call("annotation.save", {
        paperId: paper.id,
        ...(requestId ? { requestId } : {}),
        paperVersion: paper.version || 1,
        page,
        quote,
        body: body.trim(),
        color,
        visibility,
        rects,
      });
      if (mounted.current) {
        setQuote("");
        setRects([]);
        setBody("");
        delete draftPages.current[page];
        window.getSelection()?.removeAllRanges();
        refresh();
        toast(
          visibility === "private"
            ? "Private note saved."
            : requestId
              ? "Note shared in this request."
              : "Note shared with this paper’s participants.",
        );
      }
    } catch (e) {
      if (mounted.current) setNoteError(message(e));
    } finally {
      if (mounted.current) setSaving(false);
    }
  }

  async function deleteNote(id: string) {
    setDeleting(id);
    setNoteError("");
    try {
      await call("annotation.delete", { id });
      refresh();
    } catch (e) {
      setNoteError(message(e));
    } finally {
      setDeleting("");
    }
  }

  return (
    <section
      ref={readerRef}
      className={`pb-reader pb-reader-v2 ${focusReading ? "pb-focus-reading" : ""} ${navOpen ? "pb-nav-open" : ""}`}
      aria-label="Manuscript reader"
    >
      <div className="pb-document-bar">
        <FileText size={17} />
        <div>
          <strong>{paper.fileName || paper.title || "Manuscript"}</strong>
          <small>
            Version {paper.version || 1} ·{" "}
            {requestId ? "Private request workspace" : "Manuscript workspace"}
          </small>
        </div>
        {readOnly && <span className="pb-readonly-badge">Read only</span>}
      </div>
      <div className="pb-reader-toolbar">
        <div className="pb-reader-pages">
          <button
            type="button"
            className="icon-button"
            aria-label="Toggle page sidebar"
            aria-pressed={navOpen}
            onClick={() => setNavOpen((v) => !v)}
          >
            <PanelLeft size={18} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Search document"
            onClick={() => {
              setNavOpen(true);
              setNavTab("search");
            }}
          >
            <Search size={17} />
          </button>
          <span className="pb-toolbar-divider" />
          <button
            type="button"
            className="icon-button"
            aria-label="Previous PDF page"
            disabled={page <= 1 || rendering || saving}
            onClick={() => goToPage(page - 1)}
          >
            <ChevronLeft size={18} />
          </button>
          <form
            className="pb-page-jump"
            onSubmit={(e) => {
              e.preventDefault();
              goToPage(Number(pageInput) || 1);
            }}
          >
            <label className="sr-only" htmlFor={`page-jump-${paper.id}`}>
              Jump to page
            </label>
            <input
              id={`page-jump-${paper.id}`}
              type="number"
              min={1}
              max={pdf?.numPages || 1}
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              onBlur={() => {
                goToPage(Number(pageInput) || 1);
                setPageInput(
                  String(
                    Math.max(
                      1,
                      Math.min(pdf?.numPages || 1, Number(pageInput) || 1),
                    ),
                  ),
                );
              }}
              disabled={!pdf || saving}
            />
            <span>of {pdf?.numPages || 1}</span>
          </form>
          <button
            type="button"
            className="icon-button"
            aria-label="Next PDF page"
            disabled={!pdf || page >= pdf.numPages || rendering || saving}
            onClick={() => goToPage(page + 1)}
          >
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="pb-reader-pages">
          <button
            type="button"
            className="icon-button"
            aria-label="Zoom out"
            disabled={!pdf || zoom <= 0.25 || rendering}
            onClick={() => {
              setFitWidth(false);
              setZoom((z) => Math.max(0.25, z - 0.2));
            }}
          >
            <ZoomOut size={17} />
          </button>
          <span aria-label="PDF zoom">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            className="icon-button"
            aria-label="Zoom in"
            disabled={!pdf || zoom >= 3 || rendering}
            onClick={() => {
              setFitWidth(false);
              setZoom((z) => Math.min(3, z + 0.2));
            }}
          >
            <ZoomIn size={17} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Fit page width"
            aria-pressed={fitWidth}
            disabled={!pdf}
            onClick={() => setFitWidth(true)}
          >
            <ScanLine size={18} />
          </button>
          <span className="pb-toolbar-divider" />
          <button
            type="button"
            className="icon-button"
            aria-label={focusReading ? "Show notes" : "Focus reading"}
            aria-pressed={focusReading}
            onClick={() => setFocusReading((v) => !v)}
          >
            <PanelRight size={18} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label={fullscreen ? "Exit full screen" : "Full screen reader"}
            onClick={() => void toggleFullscreen()}
          >
            {fullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
          </button>
        </div>
      </div>
      <div className="pb-reader-layout">
        {navOpen && (
          <aside
            className="pb-reader-navigation"
            aria-label="Document navigation"
          >
            <div className="pb-nav-tabs">
              <button
                type="button"
                className={navTab === "pages" ? "active" : ""}
                onClick={() => setNavTab("pages")}
              >
                Pages
              </button>
              <button
                type="button"
                className={navTab === "search" ? "active" : ""}
                onClick={() => setNavTab("search")}
              >
                Find in PDF
              </button>
            </div>
            {navTab === "pages" ? (
              <div className="pb-page-thumbnails">
                {pdf ? (
                  Array.from({ length: pdf.numPages }, (_, i) => (
                    <PdfThumbnail
                      key={i + 1}
                      pdf={pdf}
                      number={i + 1}
                      selected={page === i + 1}
                      notes={notes.filter((n) => n.page === i + 1).length}
                      disabled={saving}
                      onSelect={() => goToPage(i + 1)}
                    />
                  ))
                ) : (
                  <p>Open a PDF to browse its pages.</p>
                )}
              </div>
            ) : (
              <div className="pb-document-search">
                <form onSubmit={searchDocument}>
                  <label htmlFor={`pdf-search-${paper.id}`}>
                    Find in this document
                  </label>
                  <div>
                    <input
                      id={`pdf-search-${paper.id}`}
                      type="search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search a word or phrase"
                    />
                    <button
                      type="submit"
                      className="icon-button"
                      aria-label="Run document search"
                      disabled={!pdf || !searchQuery.trim() || searching}
                    >
                      <Search size={16} />
                    </button>
                  </div>
                </form>
                {searching ? (
                  <p role="status">
                    Searching page {searchProgress} of {pdf?.numPages}…
                  </p>
                ) : activeSearch ? (
                  <p>
                    {searchHits.length}{" "}
                    {searchHits.length === 1 ? "page" : "pages"} found
                  </p>
                ) : (
                  <p>Search selectable text across the whole PDF.</p>
                )}
                <div className="pb-search-results">
                  {searchHits.map((hit) => (
                    <button
                      type="button"
                      key={hit.page}
                      className={hit.page === page ? "selected" : ""}
                      onClick={() => goToPage(hit.page)}
                    >
                      <strong>
                        Page {hit.page}
                        <span>
                          {hit.count} {hit.count === 1 ? "match" : "matches"}
                        </span>
                      </strong>
                      <p>{hit.snippet}</p>
                    </button>
                  ))}
                </div>
                <small>
                  Scanned images without a text layer are not searchable.
                </small>
              </div>
            )}
          </aside>
        )}
        <div className="pb-reader-view">
          {loading && (
            <p className="pb-reader-status" role="status">
              Opening your manuscript…
            </p>
          )}
          {error && (
            <div className="error-box" role="alert">
              {error}
              <button
                type="button"
                className="text-link"
                onClick={async () => {
                  try {
                    const fresh = await call(
                      historical ? "paper.version.get" : "paper.get",
                      { id: paper.id, version: paper.version || 1 },
                    );
                    setFreshUrl({
                      id: paper.id,
                      url: fresh.downloadUrl,
                      version: paper.version || 1,
                    });
                    setRetry((n) => n + 1);
                  } catch (e) {
                    setError(message(e));
                  }
                }}
              >
                Reload manuscript
              </button>
            </div>
          )}
          {error && paper.text && (
            <details className="pb-text-fallback">
              <summary>Read extracted text instead</summary>
              <p className="muted">
                Text fallback · layout, equations, and images may be missing.{" "}
                {PDF_EXTRACTION_LIMITS}
              </p>
              <div className="pb-demo-text">{paper.text}</div>
            </details>
          )}
          {!paper.downloadUrl && !demoFallback && (
            <div className="pb-reader-status">
              A protected PDF link is unavailable. Reopen this paper to request
              a fresh link.
            </div>
          )}
          {(pdf || demoFallback) && (
            <>
              <p className="pb-reader-hint">
                <Highlighter size={14} />{" "}
                {readOnly
                  ? "Read-only view · existing notes remain available."
                  : "Select a passage to highlight it, or add a page note. Your drafts stay here as you move around this workspace."}
              </p>
              {rendering && (
                <p className="pb-reader-status" role="status">
                  Rendering page {page}…
                </p>
              )}
              <div
                ref={scrollRef}
                className="pb-reader-scroll"
                tabIndex={0}
                aria-label="Scrollable manuscript page"
              >
                <div
                  ref={pageRef}
                  className={`pb-pdf-page ${demoFallback ? "pb-demo-page" : ""}`}
                  style={
                    demoFallback
                      ? undefined
                      : { width: dimensions.width, height: dimensions.height }
                  }
                  onPointerUp={captureSelection}
                  onKeyUp={captureSelection}
                >
                  {demoFallback ? (
                    <>
                      <span className="pb-demo-label">
                        Demo manuscript · text preview
                      </span>
                      <h2>{paper.title}</h2>
                      <p className="muted">{paper.authors}</p>
                      <h3>Abstract</h3>
                      <p>{paper.abstract}</p>
                      <h3>Manuscript excerpt</h3>
                      <div className="pb-demo-text">
                        {paper.text ||
                          "This demonstration contains an abstract only. Upload your own PDF in a connected account for faithful page rendering and text highlights."}
                      </div>
                    </>
                  ) : (
                    <>
                      <div ref={canvasHost} />
                      <div className="pb-highlight-layer" aria-hidden="true">
                        {notes
                          .filter((n) => n.page === page)
                          .flatMap((n) =>
                            (Array.isArray(n.rects) ? n.rects : []).map(
                              (r: Rect, index: number) => (
                                <span
                                  key={`${n.id}-${index}`}
                                  className={
                                    anchor?.noteId === n.id
                                      ? "pb-highlight-active"
                                      : undefined
                                  }
                                  style={highlightStyle(r, n.color)}
                                />
                              ),
                            ),
                          )}
                        {rects.map((r, i) => (
                          <span
                            key={`selection-${i}`}
                            style={highlightStyle(r, color)}
                          />
                        ))}
                      </div>
                      <div ref={textHost} className="pb-text-host" />
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
        <aside className="pb-notes" aria-label="Manuscript notes">
          <div className="pb-notes-heading">
            <Highlighter size={18} />
            <h3>Notes & highlights</h3>
            <span>{notes.length}</span>
          </div>
          <p className="muted pb-notes-help">
            {historical
              ? "Previous version · switch to the current manuscript to contribute."
              : locked
                ? "This request is closed. Available notes and replies are read-only."
                : requestId
                  ? "Choose private notes for yourself or share feedback with the other researcher in this request."
                  : "Private notes are only for you. Shared notes are visible to this paper’s request participants."}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void saveNote();
            }}
            className="pb-note-form"
          >
            {quote && (
              <div className="pb-selection">
                <blockquote>{quote}</blockquote>
                <button
                  type="button"
                  className="text-link"
                  onClick={() => {
                    setQuote("");
                    setRects([]);
                    window.getSelection()?.removeAllRanges();
                  }}
                >
                  Clear selection
                </button>
              </div>
            )}
            <label htmlFor={`note-${paper.id}`}>Your note · page {page}</label>
            <textarea
              id={`note-${paper.id}`}
              rows={3}
              maxLength={4000}
              placeholder="A question, observation, or suggestion…"
              value={body}
              disabled={saving || readOnly}
              onChange={(e) => setBody(e.target.value)}
            />
            {(body || quote) && (
              <small className="pb-draft-status">
                Unsaved draft · kept as you navigate; reload clears it
              </small>
            )}
            <div className="pb-note-options">
              <label>
                Visibility
                <select
                  aria-label="Visibility"
                  value={visibility}
                  disabled={saving || readOnly}
                  onChange={(e) =>
                    setVisibility(e.target.value as "private" | "shared")
                  }
                >
                  <option value="private">Private · only you</option>
                  <option value="shared">
                    {requestId
                      ? "Shared in this request"
                      : "Shared · paper participants"}
                  </option>
                </select>
              </label>
              <label>
                Color
                <select
                  value={color}
                  disabled={saving || readOnly}
                  onChange={(e) => setColor(e.target.value)}
                >
                  <option value="yellow">Yellow</option>
                  <option value="green">Green</option>
                  <option value="pink">Pink</option>
                </select>
              </label>
            </div>
            {noteError && (
              <p className="error-box" role="alert">
                {noteError}
              </p>
            )}
            <button
              type="submit"
              className="button primary"
              disabled={
                saving ||
                readOnly ||
                (!quote && !body.trim()) ||
                (!pdf && !demoFallback)
              }
            >
              {saving
                ? "Saving…"
                : quote
                  ? "Save highlight & note"
                  : "Save note"}
            </button>
          </form>
          <div className="pb-notes-divider">
            <span>REVIEW NOTES</span>
            <button
              type="button"
              className="text-link"
              onClick={exportNotes}
              disabled={!filteredNotes.length}
            >
              <Download size={13} />
              Export
            </button>
          </div>
          <div className="pb-note-filters">
            <label className="pb-note-search">
              <Search size={14} />
              <input
                aria-label="Search notes"
                value={noteSearch}
                onChange={(e) => setNoteSearch(e.target.value)}
                placeholder="Find a note or reply"
              />
            </label>
            <select
              aria-label="Filter notes"
              value={noteFilter}
              onChange={(e) => setNoteFilter(e.target.value)}
            >
              <option value="all">All notes</option>
              <option value="page">This page</option>
              <option value="open">Open notes</option>
              <option value="resolved">Resolved notes</option>
              <option value="private">Private notes</option>
              <option value="shared">Shared notes</option>
            </select>
          </div>
          <p className="pb-note-counts">
            {notes.filter((n) => !n.resolved).length} open ·{" "}
            {notes.filter((n) => n.resolved).length} resolved ·{" "}
            {filteredNotes.length} shown
          </p>
          {annotations.loading && !annotations.data && (
            <p role="status">Loading notes…</p>
          )}
          {annotations.error && (
            <p className="error-box" role="alert">
              {annotations.error}
            </p>
          )}
          {!annotations.loading && !filteredNotes.length && (
            <div className="pb-notes-empty">
              <MessageSquare size={23} />
              <strong>
                {notes.length
                  ? "No notes match this view."
                  : "Start with a specific observation."}
              </strong>
              <p>
                {notes.length
                  ? "Try another filter or a shorter search."
                  : "Highlight a passage, ask a question, or explain what would strengthen the argument."}
              </p>
            </div>
          )}
          <div className="pb-note-list">
            {filteredNotes.map((note) => (
              <AnnotationCard
                key={note.id}
                note={note}
                currentPage={page}
                canJump={!!pdf && !saving && note.page <= pdf.numPages}
                onJump={() => {
                  goToPage(note.page);
                  setAnchor({
                    noteId: note.id,
                    page: note.page,
                    y: note.rects?.[0]?.y || 0,
                  });
                  pageRef.current?.scrollIntoView({
                    block: "nearest",
                    behavior: "smooth",
                  });
                }}
                readOnly={readOnly}
                own={
                  note.authorId ===
                  (demo ? profile?.id : user?.uid || profile?.id)
                }
                onDelete={() => void deleteNote(note.id)}
                deleting={deleting === note.id}
              />
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}

function highlightStyle(r: Rect, color: string): CSSProperties {
  return {
    left: `${r.x * 100}%`,
    top: `${r.y * 100}%`,
    width: `${r.width * 100}%`,
    height: `${r.height * 100}%`,
    backgroundColor: colors[color] || colors.yellow,
  };
}

function PdfThumbnail({
  pdf,
  number,
  selected,
  notes,
  disabled,
  onSelect,
}: {
  pdf: PDFDocumentProxy;
  number: number;
  selected: boolean;
  notes: number;
  disabled: boolean;
  onSelect: () => void;
}) {
  const button = useRef<HTMLButtonElement>(null),
    canvas = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!button.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "150px" },
    );
    observer.observe(button.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    let alive = true;
    let task:
      | ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]>
      | undefined;
    void pdf
      .getPage(number)
      .then((p) => {
        if (!alive || !canvas.current) return;
        const base = p.getViewport({ scale: 1 });
        const viewport = p.getViewport({ scale: 100 / base.width });
        canvas.current.width = viewport.width;
        canvas.current.height = viewport.height;
        task = p.render({ canvas: canvas.current, viewport });
        return task.promise;
      })
      .catch(() => {});
    return () => {
      alive = false;
      task?.cancel();
    };
  }, [pdf, number, visible]);
  return (
    <button
      ref={button}
      type="button"
      className={`pb-thumbnail ${selected ? "selected" : ""}`}
      aria-label={`Go to page ${number}`}
      aria-current={selected ? "page" : undefined}
      disabled={disabled}
      onClick={onSelect}
    >
      <div>
        <canvas ref={canvas} aria-hidden="true" />
      </div>
      <span>
        Page {number}
        {notes > 0 && (
          <small>
            {notes} {notes === 1 ? "note" : "notes"}
          </small>
        )}
      </span>
    </button>
  );
}
function AnnotationCard({
  note,
  currentPage,
  canJump,
  onJump,
  readOnly,
  own,
  onDelete,
  deleting,
}: {
  note: any;
  currentPage: number;
  canJump: boolean;
  onJump: () => void;
  readOnly: boolean;
  own: boolean;
  onDelete: () => void;
  deleting: boolean;
}) {
  const { call, refresh } = useApp();
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(note.body || "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [reply, setReply] = useState(""),
    [expanded, setExpanded] = useState(false),
    [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || readOnly || !own || (!editBody.trim() && !note.quote)) return;
    setBusy("edit");
    setError("");
    try {
      await call("annotation.save", {
        id: note.id,
        paperId: note.paperId,
        paperVersion: note.paperVersion || 1,
        requestId: note.requestId || null,
        page: note.page,
        quote: note.quote || "",
        body: editBody.trim(),
        color: note.color,
        visibility: note.visibility,
        rects: note.rects || [],
      });
      setEditing(false);
      refresh();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy("");
    }
  }
  async function mutate(action: "reply" | "resolve") {
    if (busy || readOnly) return;
    setBusy(action);
    setError("");
    try {
      await call(
        `annotation.${action}`,
        action === "reply"
          ? { id: note.id, body: reply.trim() }
          : { id: note.id, resolved: !note.resolved },
      );
      if (action === "reply") setReply("");
      refresh();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy("");
    }
  }
  const dateLabel = (value: number) =>
    new Date(value).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  return (
    <article
      className={`pb-note ${note.resolved ? "is-resolved" : ""} ${currentPage === note.page ? "is-current-page" : ""}`}
      style={
        { "--note-color": colors[note.color] || colors.yellow } as CSSProperties
      }
    >
      <div className="pb-note-meta">
        <button
          type="button"
          className="text-link"
          disabled={!canJump}
          onClick={onJump}
        >
          Page {note.page}
        </button>
        <span>
          {note.visibility === "shared" ? (
            <>
              <Users size={12} />
              Shared
            </>
          ) : (
            <>
              <LockKeyhole size={12} />
              Private
            </>
          )}
        </span>
        {own && (
          <button
            type="button"
            className="icon-button"
            aria-label="Delete note"
            disabled={readOnly || deleting || !!busy}
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
      <div className="pb-note-author">
        <Avatar
          name={note.authorName || "Researcher"}
          src={note.authorAvatarUrl}
        />
        <strong>{note.authorName || (own ? "You" : "Researcher")}</strong>
        {note.createdAt && <time>{dateLabel(note.createdAt)}</time>}
      </div>
      {note.quote && <blockquote>{note.quote}</blockquote>}
      {editing ? (
        <form className="pb-note-edit" onSubmit={saveEdit}>
          <label htmlFor={`edit-note-${note.id}`}>Edit your note</label>
          <textarea
            id={`edit-note-${note.id}`}
            value={editBody}
            rows={4}
            maxLength={10000}
            disabled={!!busy}
            onChange={(e) => setEditBody(e.target.value)}
            autoFocus
          />
          <div className="button-row">
            <button
              type="button"
              className="button compact"
              disabled={!!busy}
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
            <button
              className="button primary compact"
              disabled={!!busy || (!editBody.trim() && !note.quote)}
            >
              {busy === "edit" ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      ) : note.body ? (
        <p>{note.body}</p>
      ) : null}
      {confirmDelete && (
        <div className="pb-note-delete" role="alert">
          <p>Delete this note and its replies? This cannot be undone.</p>
          <div className="button-row">
            <button
              type="button"
              className="button compact"
              disabled={deleting}
              onClick={() => setConfirmDelete(false)}
            >
              Keep note
            </button>
            <button
              type="button"
              className="button compact danger"
              disabled={deleting || !!busy}
              onClick={onDelete}
            >
              {deleting ? "Deleting…" : "Delete permanently"}
            </button>
          </div>
        </div>
      )}
      {note.resolved && (
        <div className="pb-resolved-label">
          <Check size={13} />
          Resolved{note.resolvedByName && ` by ${note.resolvedByName}`}
        </div>
      )}
      <div className="pb-note-actions">
        {own && !readOnly && !editing && (
          <button
            type="button"
            className="text-link"
            disabled={!!busy || deleting}
            onClick={() => {
              setEditBody(note.body || "");
              setEditing(true);
            }}
          >
            <Pencil size={13} />
            Edit
          </button>
        )}
        <button
          type="button"
          className="text-link"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          <MessageSquare size={13} />
          {note.replies?.length
            ? `${note.replies.length} ${note.replies.length === 1 ? "reply" : "replies"}`
            : "Reply"}
        </button>
        <button
          type="button"
          className="text-link"
          disabled={readOnly || !!busy}
          onClick={() => void mutate("resolve")}
        >
          {note.resolved ? <RotateCcw size={13} /> : <Check size={13} />}{" "}
          {busy === "resolve"
            ? "Updating…"
            : note.resolved
              ? "Reopen"
              : "Resolve"}
        </button>
      </div>
      {expanded && (
        <div className="pb-note-thread">
          {(note.replies || []).map((item: any) => (
            <div className="pb-note-reply" key={item.id}>
              <strong>{item.authorName || "Researcher"}</strong>
              <time>{item.createdAt ? dateLabel(item.createdAt) : ""}</time>
              <p>{item.body}</p>
            </div>
          ))}
          {readOnly ? (
            <p className="pb-thread-closed">
              Replies are read only in this view.
            </p>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void mutate("reply");
              }}
            >
              <label className="sr-only" htmlFor={`reply-note-${note.id}`}>
                Reply to note on page {note.page}
              </label>
              <textarea
                id={`reply-note-${note.id}`}
                value={reply}
                disabled={!!busy}
                onChange={(e) => setReply(e.target.value)}
                rows={2}
                maxLength={5000}
                required
                placeholder="Clarify, respond, or suggest a next step…"
              />
              <button
                className="button compact"
                disabled={!!busy || !reply.trim()}
              >
                {busy === "reply" ? "Sending…" : "Send reply"}
                <Send size={13} />
              </button>
            </form>
          )}
        </div>
      )}
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
    </article>
  );
}
