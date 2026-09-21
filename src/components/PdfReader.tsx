import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  getDocument,
  GlobalWorkerOptions,
  TextLayer,
  type PDFDocumentProxy,
} from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
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
import "./pdf-reader.css";

GlobalWorkerOptions.workerSrc = workerUrl;

export const PDF_EXTRACTION_LIMITS =
  "Text extraction covers up to 100 pages and 100,000 characters. Scanned pages need OCR, which is not included. The original PDF remains available in the reader.";

/** Extract bounded plain text for analysis without changing the original PDF. */
export async function extractPdfText(file: File): Promise<string> {
  const task = getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  try {
    const pdf = await task.promise;
    let result = "";
    for (
      let page = 1;
      page <= Math.min(pdf.numPages, 100) && result.length < 100_000;
      page++
    ) {
      const pdfPage = await pdf.getPage(page);
      const content = await pdfPage.getTextContent();
      const text = content.items
        .map((item) =>
          "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "",
        )
        .join("");
      if (text.trim()) result += `\n\n[Page ${page}]\n${text}`;
      pdfPage.cleanup();
    }
    return result.slice(0, 100_000).trim();
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

export function PdfReader({ paper }: { paper: any }) {
  const { call, profile, user, demo, refresh, toast } = useApp();
  const annotations = useData("annotation.list", { paperId: paper.id });
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
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
  const currentDocument = useRef("");
  const [quote, setQuote] = useState("");
  const [rects, setRects] = useState<Rect[]>([]);
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<"private" | "shared">("private");
  const [color, setColor] = useState("yellow");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState("");
  const [dimensions, setDimensions] = useState({ width: 612, height: 792 });
  const pageRef = useRef<HTMLDivElement>(null);
  const canvasHost = useRef<HTMLDivElement>(null);
  const textHost = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);
  const demoFallback = demo && !paper.downloadUrl;
  const readOnly =
    !!paper.currentVersion && (paper.version || 1) !== paper.currentVersion;
  const notes: any[] = (
    Array.isArray(annotations.data) ? annotations.data : []
  ).filter((n: any) => (n.paperVersion || 1) === (paper.version || 1));

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    if (currentDocument.current !== paper.id) {
      setPage(1);
      setQuote("");
      setRects([]);
      setBody("");
      currentDocument.current = paper.id;
    }
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
    setQuote("");
    setRects([]);
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
    setRects(demoFallback ? [] : selectedRects);
    setNoteError("");
  }

  async function saveNote() {
    if (!body.trim() && !quote) {
      setNoteError("Select a passage or write a note first.");
      return;
    }
    setSaving(true);
    setNoteError("");
    try {
      await call("annotation.save", {
        paperId: paper.id,
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
        window.getSelection()?.removeAllRanges();
        refresh();
        toast(
          visibility === "private"
            ? "Private note saved."
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
    <section className="pb-reader" aria-label="Manuscript reader">
      <div className="pb-reader-toolbar">
        <div className="pb-reader-pages">
          <button
            type="button"
            className="icon-button"
            aria-label="Previous PDF page"
            disabled={page <= 1 || rendering}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft size={18} />
          </button>
          <span>
            Page <strong>{page}</strong> of {pdf?.numPages || 1}
          </span>
          <button
            type="button"
            className="icon-button"
            aria-label="Next PDF page"
            disabled={!pdf || page >= pdf.numPages || rendering}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="pb-reader-pages">
          <button
            type="button"
            className="icon-button"
            aria-label="Zoom out"
            disabled={!pdf || zoom <= 0.5 || rendering}
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
          >
            <ZoomOut size={18} />
          </button>
          <span aria-label="PDF zoom">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            className="icon-button"
            aria-label="Zoom in"
            disabled={!pdf || zoom >= 2 || rendering}
            onClick={() => setZoom((z) => Math.min(2, z + 0.25))}
          >
            <ZoomIn size={18} />
          </button>
        </div>
      </div>
      <div className="pb-reader-layout">
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
                      readOnly ? "paper.version.get" : "paper.get",
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
                <Highlighter size={14} /> Select text to highlight it and add a
                note.
              </p>
              {rendering && (
                <p className="pb-reader-status" role="status">
                  Rendering page {page}…
                </p>
              )}
              <div
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
            {readOnly
              ? "You are reading a previous version. Switch to the current version to add notes. "
              : ""}
            Notes are private by default. Shared notes are visible to people
            participating in this paper’s requests.
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
              onChange={(e) => setBody(e.target.value)}
            />
            <div className="pb-note-options">
              <label>
                Visibility
                <select
                  value={visibility}
                  onChange={(e) =>
                    setVisibility(e.target.value as "private" | "shared")
                  }
                >
                  <option value="private">Private · only you</option>
                  <option value="shared">Shared · paper participants</option>
                </select>
              </label>
              <label>
                Color
                <select
                  value={color}
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
          {annotations.loading && <p role="status">Loading notes…</p>}
          {annotations.error && (
            <p className="error-box" role="alert">
              {annotations.error}
            </p>
          )}
          {!annotations.loading && notes.length === 0 && (
            <p className="pb-notes-empty">
              Your reading, with room for thought. Select a passage or write
              your first note.
            </p>
          )}
          <div className="pb-note-list">
            {notes.map((note) => (
              <article
                key={note.id}
                className="pb-note"
                style={
                  {
                    "--note-color": colors[note.color] || colors.yellow,
                  } as CSSProperties
                }
              >
                <div className="pb-note-meta">
                  <button
                    type="button"
                    className="text-link"
                    disabled={!pdf || note.page > pdf.numPages}
                    onClick={() => setPage(Math.max(1, note.page))}
                  >
                    Page {note.page}
                  </button>
                  <span>
                    {note.visibility === "shared" ? (
                      <>
                        <Users size={12} /> Shared
                      </>
                    ) : (
                      <>
                        <LockKeyhole size={12} /> Private
                      </>
                    )}
                  </span>
                  {(note.userId === (user?.uid || profile?.id) ||
                    note.ownerId === (user?.uid || profile?.id) ||
                    note.authorId === (user?.uid || profile?.id) ||
                    demo) && (
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="Delete note"
                      disabled={deleting === note.id}
                      onClick={() => void deleteNote(note.id)}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
                {note.quote && <blockquote>{note.quote}</blockquote>}
                {note.body && <p>{note.body}</p>}
              </article>
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
