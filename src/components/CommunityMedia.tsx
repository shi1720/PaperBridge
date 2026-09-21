import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  ImagePlus,
  LoaderCircle,
  Upload,
  X,
  ZoomIn,
} from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { useApp } from "../lib/context";
import { uploadMedia, validateMediaFile, MEDIA_LIMITS } from "../lib/firebase";
import type { MediaAsset } from "../lib/types";
import { ErrorBox, Modal } from "./ui";
import "./media.css";
export const fileSize = (size: number) =>
  size >= 1024 * 1024
    ? `${(size / 1024 / 1024).toFixed(1)} MiB`
    : `${Math.max(1, Math.round(size / 1024))} KiB`;

export function MediaPicker({
  value,
  onChange,
  disabled = false,
  onBusy,
  originalIds = [],
}: {
  value: MediaAsset[];
  onChange: (assets: MediaAsset[]) => void;
  disabled?: boolean;
  onBusy: (busy: boolean) => void;
  originalIds?: string[];
}) {
  const { call, demo } = useApp();
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{
      name: string;
      progress: number;
    } | null>(null),
    [error, setError] = useState(""),
    [dragging, setDragging] = useState(false);
  const locked = disabled || !!pending;
  async function add(files: File[]) {
    if (locked || !files.length) return;
    setError("");
    setDragging(false);
    if (demo) {
      setError(
        "Sign in with a real account to share files. The development preview does not upload files.",
      );
      return;
    }
    if (files.length + value.length > MEDIA_LIMITS.count) {
      setError(
        "Attach up to four files per post. Remove a file before adding another.",
      );
      return;
    }
    try {
      for (const file of files) validateMediaFile(file, "community");
    } catch (e: any) {
      setError(e.message);
      return;
    }
    onBusy(true);
    const next = [...value];
    try {
      for (const file of files) {
        setPending({ name: file.name, progress: 0 });
        const asset = await uploadMedia(file, "community", (progress) =>
          setPending({ name: file.name, progress }),
        );
        next.push(asset);
        onChange([...next]);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setPending(null);
      onBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  function remove(asset: MediaAsset) {
    onChange(value.filter((a) => a.id !== asset.id));
    if (!originalIds.includes(asset.id))
      void call("media.remove", { id: asset.id }).catch(() => {});
  }
  return (
    <div className="media-picker">
      {!!value.length && (
        <div className="media-drafts">
          {value.map((asset) => (
            <div className={`media-draft ${asset.kind}`} key={asset.id}>
              {asset.kind === "image" ? (
                <img src={asset.url} alt={asset.fileName} />
              ) : (
                <FileText size={25} />
              )}
              <div>
                <strong>{asset.fileName}</strong>
                <small>
                  {asset.kind === "pdf" ? "PDF" : "Image"} ·{" "}
                  {fileSize(asset.size)}
                </small>
              </div>
              <button
                type="button"
                className="icon-button"
                disabled={locked}
                aria-label={`Remove ${asset.fileName}`}
                onClick={() => remove(asset)}
              >
                <X size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div
        className={`media-dropzone ${dragging ? "dragging" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          if (!locked) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          void add(Array.from(e.dataTransfer.files));
        }}
      >
        <input
          type="file"
          ref={input}
          className="sr-only"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          multiple
          disabled={locked || value.length >= 4}
          aria-label="Attach images or PDFs"
          onChange={(e) => void add(Array.from(e.target.files || []))}
        />
        <button
          type="button"
          className="media-add-button"
          disabled={locked || value.length >= 4}
          onClick={() => input.current?.click()}
        >
          <ImagePlus size={19} />
          <span>
            {value.length >= 4 ? "Four files attached" : "Add images or PDFs"}
            <small>or drop files here</small>
          </span>
          <Upload size={15} />
        </button>
        <p>Up to 4 files · images 8 MiB each · PDFs 20 MiB each</p>
      </div>
      {pending && (
        <div className="media-progress" role="status">
          <progress value={pending.progress} max={100} />
          <span>
            {pending.progress < 100
              ? `Uploading ${pending.name} · ${pending.progress}%`
              : `Preparing ${pending.name}…`}
          </span>
        </div>
      )}
      {error && <ErrorBox message={error} />}
    </div>
  );
}

function CommunityPdf({ asset }: { asset: MediaAsset }) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null),
    [page, setPage] = useState(1),
    [error, setError] = useState(""),
    [rendering, setRendering] = useState(true);
  const canvas = useRef<HTMLCanvasElement>(null),
    container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let alive = true;
    let task: ReturnType<typeof import("pdfjs-dist").getDocument> | undefined;
    setError("");
    setPdf(null);
    setPage(1);
    setRendering(true);
    void import("pdfjs-dist")
      .then(({ getDocument, GlobalWorkerOptions }) => {
        if (!alive) return;
        GlobalWorkerOptions.workerSrc = workerUrl;
        task = getDocument({ url: asset.url });
        return task.promise.then((doc) => {
          if (alive) setPdf(doc);
        });
      })
      .catch(() => {
        if (alive) {
          setError(
            "This PDF could not be displayed. Reopen the attachment to refresh access, or download the file.",
          );
          setRendering(false);
        }
      });
    return () => {
      alive = false;
      void task?.destroy();
    };
  }, [asset.url]);
  useEffect(() => {
    if (!pdf) return;
    let alive = true;
    let renderTask:
      | ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]>
      | undefined;
    setRendering(true);
    void pdf
      .getPage(page)
      .then((p) => {
        if (!alive || !canvas.current) return;
        const base = p.getViewport({ scale: 1 });
        const scale = Math.min(
          1.6,
          (container.current?.clientWidth || 650) / base.width,
        );
        const viewport = p.getViewport({ scale });
        const ratio = Math.min(devicePixelRatio || 1, 2);
        canvas.current.width = Math.floor(viewport.width * ratio);
        canvas.current.height = Math.floor(viewport.height * ratio);
        canvas.current.style.width = `${viewport.width}px`;
        canvas.current.style.height = `${viewport.height}px`;
        renderTask = p.render({
          canvas: canvas.current,
          viewport,
          transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined,
        });
        return renderTask.promise;
      })
      .then(() => {
        if (alive) setRendering(false);
      })
      .catch((e) => {
        if (alive && e?.name !== "RenderingCancelledException") {
          setError(
            "This page could not be rendered. Download the PDF to read it.",
          );
          setRendering(false);
        }
      });
    return () => {
      alive = false;
      renderTask?.cancel();
    };
  }, [pdf, page]);
  return (
    <div className="community-pdf">
      <div className="community-pdf-toolbar">
        <button
          type="button"
          className="icon-button"
          disabled={!pdf || page <= 1 || rendering}
          aria-label="Previous PDF page"
          onClick={() => setPage((p) => p - 1)}
        >
          <ChevronLeft size={18} />
        </button>
        <span>
          Page {page} {pdf && `of ${pdf.numPages}`}
        </span>
        <button
          type="button"
          className="icon-button"
          disabled={!pdf || page >= pdf.numPages || rendering}
          aria-label="Next PDF page"
          onClick={() => setPage((p) => p + 1)}
        >
          <ChevronRight size={18} />
        </button>
        <a
          className="text-link"
          href={asset.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Download size={15} /> Download PDF
        </a>
      </div>
      {rendering && (
        <p role="status" className="media-loading">
          <LoaderCircle size={16} className="spin" />
          Loading PDF…
        </p>
      )}
      {error && <ErrorBox message={error} />}
      <div className="community-pdf-canvas" ref={container}>
        <canvas ref={canvas} aria-label={`${asset.fileName}, page ${page}`} />
      </div>
    </div>
  );
}

function ProtectedMediaImage({ asset }: { asset: MediaAsset }) {
  const { call } = useApp();
  const [url, setUrl] = useState(asset.url),
    [unavailable, setUnavailable] = useState(false);
  const attempted = useRef(false),
    mounted = useRef(true);
  useEffect(() => {
    attempted.current = false;
    setUrl(asset.url);
    setUnavailable(false);
  }, [asset.id, asset.url]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function refreshExpiredImage() {
    if (attempted.current) {
      setUnavailable(true);
      return;
    }
    attempted.current = true;
    try {
      const fresh = await call("media.get", { id: asset.id });
      if (mounted.current) setUrl(fresh.url);
    } catch {
      if (mounted.current) setUnavailable(true);
    }
  }
  return unavailable ? (
    <span className="media-image-unavailable">
      Preview unavailable · open attachment to retry
    </span>
  ) : (
    <img
      src={url}
      alt={asset.fileName}
      loading="lazy"
      onError={() => void refreshExpiredImage()}
    />
  );
}

export function PostAttachments({ assets }: { assets: MediaAsset[] }) {
  const { call } = useApp();
  const [selected, setSelected] = useState<MediaAsset | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState("");
  async function open(asset: MediaAsset) {
    setBusy(asset.id);
    setError("");
    try {
      const fresh = await call("media.get", { id: asset.id });
      setSelected({ ...asset, ...fresh });
    } catch (e: any) {
      setError(
        e.message ||
          "Unable to open this attachment. Refresh the post and try again.",
      );
    } finally {
      setBusy("");
    }
  }
  if (!assets?.length) return null;
  const images = assets.filter((a) => a.kind === "image"),
    pdfs = assets.filter((a) => a.kind === "pdf");
  return (
    <>
      <div className={`post-image-grid count-${images.length}`}>
        {images.map((asset, i) => (
          <button
            type="button"
            key={asset.id}
            disabled={!!busy}
            onClick={() => void open(asset)}
            className="post-image"
            aria-label={`View image ${i + 1}: ${asset.fileName}`}
          >
            <ProtectedMediaImage asset={asset} />
            <span>
              <ZoomIn size={16} />
              {busy === asset.id ? "Opening…" : "View image"}
            </span>
          </button>
        ))}
      </div>
      {pdfs.map((asset) => (
        <button
          key={asset.id}
          type="button"
          className="post-pdf-card"
          onClick={() => void open(asset)}
          disabled={!!busy}
        >
          <span className="pdf-file-icon">
            <FileText size={24} />
            <small>PDF</small>
          </span>
          <span>
            <strong>{asset.fileName}</strong>
            <small>{fileSize(asset.size)} · Open document</small>
          </span>
          <ChevronRight size={19} />
        </button>
      ))}
      {error && <ErrorBox message={error} />}
      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.fileName || "Attachment"}
        description="Shared with signed-in community members."
      >
        {selected?.kind === "image" ? (
          <div className="community-lightbox">
            <img src={selected.url} alt={selected.fileName} />
            <a
              className="text-link"
              href={selected.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Download size={16} />
              Open image
            </a>
          </div>
        ) : (
          selected && <CommunityPdf asset={selected} />
        )}
      </Modal>
    </>
  );
}
