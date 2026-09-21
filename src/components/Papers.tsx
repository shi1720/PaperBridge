import { useEffect, useRef, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { ref, uploadBytesResumable } from "firebase/storage";
import {
  Plus,
  Upload,
  FileText,
  ArrowUpRight,
  Lock,
  MoreHorizontal,
  ArrowLeft,
  Trash2,
  Sparkles,
} from "lucide-react";
import { useApp, useData } from "../lib/context";
import { storage } from "../lib/firebase";
import { CATEGORIES } from "../lib/categories";
import { PageHeading, Empty, Loading, ErrorBox, Modal, Tag } from "./ui";
import { date } from "../lib/types";
import { PdfReader, extractPdfText } from "./PdfReader";
export function Papers({ onAuth }: { onAuth: () => void }) {
  const { profile } = useApp();
  const [upload, setUpload] = useState(false);
  const { data, error, loading } = useData("paper.list", {}, !!profile);
  return (
    <>
      <PageHeading
        eyebrow="YOUR PRIVATE WORKSPACE"
        title="Ideas, becoming papers."
        description="A home for your manuscripts, notes, and next steps."
        action={
          <button
            className="button primary"
            onClick={() => (profile ? setUpload(true) : onAuth())}
          >
            <Plus size={17} />
            Add manuscript
          </button>
        }
      />
      <div className="info-strip">
        <Lock size={18} />
        <div>
          <strong>Private by default.</strong> Your unpublished work is shared
          only when you choose an endorser.
        </div>
      </div>
      {!profile ? (
        <Empty
          title="Give your research a home"
          action={
            <button className="button primary" onClick={onAuth}>
              Create your workspace
            </button>
          }
        >
          Upload a PDF, collect feedback, and keep your notes together.
        </Empty>
      ) : loading ? (
        <Loading />
      ) : error ? (
        <ErrorBox message={error} />
      ) : data?.length ? (
        <div className="manuscript-grid">
          {data.map((p: any) => (
            <Link to={"/papers/" + p.id} key={p.id} className="manuscript-card">
              <div className="paper-preview" aria-hidden="true">
                <div className="paper-sheet">
                  <div className="paper-mini-title">{p.title}</div>
                  <div className="paper-mini-author">{p.authors}</div>
                  <div className="paper-mini-abstract">{p.abstract}</div>
                  <div className="paper-lines" />
                </div>
                <span className="pdf-label">PDF</span>
              </div>
              <div className="manuscript-body">
                <div className="tags">
                  <Tag>{p.category}</Tag>
                  <span className="privacy-label">
                    <Lock size={12} />
                    Private
                  </span>
                </div>
                <h3>{p.title}</h3>
                <p>{p.authors}</p>
                <div className="manuscript-bottom">
                  <span>Updated {date(p.updatedAt || p.createdAt)}</span>
                  <ArrowUpRight size={19} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <Empty
          title="Every paper starts with an idea"
          action={
            <button className="button primary" onClick={() => setUpload(true)}>
              <Upload size={16} />
              Upload your first manuscript
            </button>
          }
        >
          Add a PDF and a short abstract. Your research stays private until you
          decide to share it.
        </Empty>
      )}
      <UploadModal open={upload} onClose={() => setUpload(false)} />
    </>
  );
}
function UploadModal({
  open,
  onClose,
  existing,
}: {
  open: boolean;
  onClose: () => void;
  existing?: any;
}) {
  const { profile, user, demo, call, refresh, toast } = useApp();
  const navigate = useNavigate();
  const uploadDraft = useRef<{
    id: string;
    file: File | null;
    storagePath: string;
    text: string;
  }>({ id: "", file: null, storagePath: "", text: "" });
  const [title, setTitle] = useState(""),
    [abstract, setAbstract] = useState(""),
    [authors, setAuthors] = useState(""),
    [category, setCategory] = useState("cs.LG"),
    [file, setFile] = useState<File | null>(null),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    if (open) {
      setTitle(existing?.title || "");
      setAbstract(existing?.abstract || "");
      setAuthors(existing?.authors || "");
      setCategory(existing?.category || "cs.LG");
      setFile(null);
      uploadDraft.current = {
        id: existing?.id || crypto.randomUUID(),
        file: null,
        storagePath: existing?.storagePath || "",
        text: existing?.text || "",
      };
      setError("");
    }
  }, [open, existing?.id]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file && !demo) {
      setError("Choose a PDF manuscript.");
      return;
    }
    setBusy(true);
    setError("");
    const id = uploadDraft.current.id || existing?.id || crypto.randomUUID();
    try {
      let text = uploadDraft.current.text,
        storagePath = uploadDraft.current.storagePath;
      if (file && file !== uploadDraft.current.file) {
        if (file.size > 20 * 1024 * 1024)
          throw new Error("Choose a PDF smaller than 20 MB.");
        setProgress("Reading your PDF…");
        text = await extractPdfText(file);
        if (!demo) {
          storagePath = `papers/${user!.uid}/${id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
          await new Promise<void>((resolve, reject) => {
            const task = uploadBytesResumable(ref(storage, storagePath), file, {
              contentType: "application/pdf",
            });
            task.on(
              "state_changed",
              (s) =>
                setProgress(
                  `Uploading ${Math.round((s.bytesTransferred / s.totalBytes) * 100)}%`,
                ),
              reject,
              () => resolve(),
            );
          });
        }
      }
      uploadDraft.current = { id, file, text, storagePath };
      setProgress("Saving your manuscript…");
      const paper = await call("paper.save", {
        paper: {
          id,
          ...(existing ? { expectedVersion: existing.version || 1 } : {}),
          title,
          abstract,
          authors: authors || profile?.name,
          category,
          storagePath,
          fileName: file?.name || existing?.fileName || "Demo manuscript",
          text,
          visibility: "private",
        },
      });
      refresh();
      toast(
        existing
          ? "Revision saved. Active reviewers will be notified."
          : "Manuscript saved privately.",
      );
      onClose();
      navigate("/papers/" + paper.id);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        existing ? "A stronger next version" : "Make room for your next idea"
      }
      description={
        existing
          ? "Upload a revised PDF. Existing notes stay attached to the version they refer to."
          : "Add a manuscript to your private workspace."
      }
    >
      <form className="form" onSubmit={submit}>
        <label className="upload-zone">
          <Upload size={28} />
          <strong>{file ? file.name : "Choose your manuscript PDF"}</strong>
          <span>PDF · up to 20 MB</span>
          <input
            aria-label="Manuscript PDF"
            type="file"
            accept="application/pdf,.pdf"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </label>
        <label>
          Paper title
          <input
            required
            minLength={8}
            maxLength={250}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Give your research a clear, descriptive title"
          />
        </label>
        <label>
          Authors
          <input
            value={authors}
            onChange={(e) => setAuthors(e.target.value)}
            placeholder={profile?.name}
          />
        </label>
        <label>
          arXiv category
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.id} · {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Abstract
          <textarea
            required
            minLength={50}
            maxLength={10000}
            rows={4}
            value={abstract}
            onChange={(e) => setAbstract(e.target.value)}
            placeholder="What question does your work address, and what did you find?"
          />
        </label>
        <p className="fine-print">
          <Lock size={13} /> Private manuscript. Text extraction for AI review
          covers up to 100 pages / 100,000 characters; figures and equations may
          need manual review. No manuscript is sent to AI on upload.
        </p>
        {error && <ErrorBox message={error} />}
        <button disabled={busy} className="button primary">
          {busy
            ? progress
            : existing
              ? "Save revised manuscript"
              : "Save manuscript"}
          <ArrowUpRight size={16} />
        </button>
      </form>
    </Modal>
  );
}
export function PaperDetail() {
  const { id } = useParams();
  const { call, toast, refresh, profile } = useApp();
  const navigate = useNavigate();
  const {
    data: paper,
    error,
    loading,
  } = useData("paper.get", { id }, !!profile);
  const [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [revisionOpen, setRevisionOpen] = useState(false),
    [viewingVersion, setViewingVersion] = useState<any>(null);
  useEffect(() => {
    setViewingVersion(null);
  }, [paper?.version, id]);
  if (loading && !paper) return <Loading />;
  if (error) return <ErrorBox message={error} />;
  if (!paper)
    return (
      <Empty title="Manuscript unavailable">
        Sign in to the account that owns this manuscript or has an active review
        request.
      </Empty>
    );
  return (
    <>
      <Link to="/papers" className="back-link">
        <ArrowLeft size={16} />
        My manuscripts
      </Link>
      <div className="paper-detail-heading">
        <div>
          <div className="tags">
            <Tag>{paper.category}</Tag>
            <Tag>Version {paper.version || 1}</Tag>
            <span className="privacy-label">
              <Lock size={13} />
              Private manuscript
            </span>
          </div>
          <h1>{paper.title}</h1>
          <p className="muted">
            {paper.authors} · Added {date(paper.createdAt)}
          </p>
        </div>
        <div className="button-row">
          <Link to={"/review?paper=" + id} className="button">
            <Sparkles size={16} />
            Run a review
          </Link>
          {paper.ownerId === profile?.id && (
            <button className="button" onClick={() => setRevisionOpen(true)}>
              <Upload size={16} />
              Upload revision
            </button>
          )}
          {paper.ownerId === profile?.id && (
            <button
              className="icon-button danger"
              aria-label="Delete manuscript"
              onClick={() => setConfirm(true)}
            >
              <Trash2 size={18} />
            </button>
          )}
        </div>
      </div>
      {paper.versions?.length > 1 && (
        <div className="version-bar">
          <label>
            Manuscript version
            <select
              value={viewingVersion?.version || paper.version}
              onChange={async (e) => {
                const version = Number(e.target.value);
                if (version === paper.version) {
                  setViewingVersion(null);
                  return;
                }
                try {
                  const previous = await call("paper.version.get", {
                    id,
                    version,
                  });
                  setViewingVersion({
                    ...paper,
                    ...previous,
                    currentVersion: paper.version,
                  });
                } catch (e: any) {
                  toast(e.message);
                }
              }}
            >
              {[...paper.versions].reverse().map((v: any) => (
                <option key={v.version} value={v.version}>
                  Version {v.version} · {date(v.updatedAt)}
                  {v.version === paper.version ? " · current" : ""}
                </option>
              ))}
            </select>
          </label>
          <p className="fine-print">
            Highlights stay with their manuscript version. Prior versions are
            read-only.
          </p>
        </div>
      )}
      <PdfReader
        paper={
          viewingVersion || { ...paper, currentVersion: paper.version || 1 }
        }
      />
      <UploadModal
        open={revisionOpen}
        onClose={() => setRevisionOpen(false)}
        existing={paper}
      />
      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Delete this manuscript?"
        description="This removes all manuscript versions and notes, and withdraws active requests. Downloaded copies cannot be recalled."
      >
        <div className="button-row">
          <button className="button" onClick={() => setConfirm(false)}>
            Keep manuscript
          </button>
          <button
            className="button danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await call("paper.delete", { id });
                refresh();
                navigate("/papers");
                toast("Manuscript deleted.");
              } catch (e: any) {
                toast(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Delete manuscript
          </button>
        </div>
      </Modal>
    </>
  );
}
