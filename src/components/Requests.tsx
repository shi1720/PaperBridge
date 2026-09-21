import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowUpRight,
  ArrowLeft,
  Send,
  FileText,
  Check,
  ArrowRight,
  ShieldCheck,
  MessageSquare,
  Highlighter,
  GitBranch,
  Upload,
  LockKeyhole,
} from "lucide-react";
import { useApp, useData } from "../lib/context";
import { STATUS, date } from "../lib/types";
import {
  PageHeading,
  Empty,
  Loading,
  ErrorBox,
  Avatar,
  Tag,
  External,
  Modal,
} from "./ui";
import { PdfReader } from "./PdfReader";
import { UploadModal } from "./Papers";
import "./request-workspace.css";

export function Requests({ onAuth }: { onAuth: () => void }) {
  const { profile } = useApp();
  const { data, error, loading } = useData("request.list", {}, !!profile);
  const [tab, setTab] = useState("all");
  const requests = (data || []).filter(
    (r: any) =>
      tab === "all" ||
      (tab === "active"
        ? ["pending", "reviewing", "changes_requested", "accepted"].includes(
            r.status,
          )
        : ["declined", "withdrawn", "endorsed"].includes(r.status)),
  );
  return (
    <>
      <PageHeading
        eyebrow="CONNECTIONS THAT MOVE RESEARCH FORWARD"
        title={
          profile?.role === "endorser"
            ? "Your review desk."
            : "Your next steps, together."
        }
        description="Open a shared workspace for each manuscript: track the stage, read together, discuss feedback, and move the next revision forward."
        action={
          <Link to="/discover" className="button primary">
            Find an endorser <ArrowUpRight size={16} />
          </Link>
        }
      />
      <div className="stat-row">
        <div>
          <span>In conversation</span>
          <strong>
            {(data || [])
              .filter((r: any) =>
                ["reviewing", "changes_requested"].includes(r.status),
              )
              .length.toString()
              .padStart(2, "0")}
          </strong>
          <small>Thoughtful feedback in progress</small>
        </div>
        <div>
          <span>Awaiting a response</span>
          <strong>
            {(data || [])
              .filter((r: any) => r.status === "pending")
              .length.toString()
              .padStart(2, "0")}
          </strong>
          <small>Give researchers time to review</small>
        </div>
        <div>
          <span>Willing to endorse</span>
          <strong>
            {(data || [])
              .filter((r: any) => r.status === "accepted")
              .length.toString()
              .padStart(2, "0")}
          </strong>
          <small>Next stop: the official arXiv form</small>
        </div>
      </div>
      <div className="tabs">
        {["all", "active", "closed"].map((t) => (
          <button
            key={t}
            className={tab === t ? "active" : ""}
            onClick={() => setTab(t)}
          >
            {t === "all"
              ? "All requests"
              : t === "active"
                ? "In progress"
                : "Closed"}
          </button>
        ))}
      </div>
      {!profile ? (
        <Empty
          title="A conversation starts with your work"
          action={
            <button className="button primary" onClick={onAuth}>
              Create your account
            </button>
          }
        >
          Track your endorsement requests and feedback in one place.
        </Empty>
      ) : loading ? (
        <Loading />
      ) : error ? (
        <ErrorBox message={error} />
      ) : requests.length ? (
        <div className="request-list">
          {requests.map((r: any) => (
            <Link className="request-row" to={"/requests/" + r.id} key={r.id}>
              <div className="request-file">
                <FileText size={22} />
              </div>
              <div className="request-main">
                <div className="tags">
                  <Tag>{r.category}</Tag>
                  <span className={"status-badge " + r.status}>
                    {STATUS[r.status]}
                  </span>
                </div>
                <h3>{r.title}</h3>
                <p>
                  {r.requesterId === profile.id
                    ? `To ${r.reviewerName}`
                    : `From ${r.requesterName}`}
                  <span> · {date(r.createdAt)}</span>
                </p>
              </div>
              <ArrowUpRight size={21} />
            </Link>
          ))}
        </div>
      ) : (
        <Empty
          title="Your next conversation is waiting"
          action={
            <Link to="/discover" className="button primary">
              Explore researchers <ArrowRight size={16} />
            </Link>
          }
        >
          Choose an endorser in your field and send a thoughtful introduction
          with your manuscript.
        </Empty>
      )}
      <div className="info-strip subtle">
        <ShieldCheck size={18} />
        <p>
          “Willing to endorse” means a researcher has offered to help. Official
          endorsement is completed on arXiv and does not guarantee acceptance.
        </p>
      </div>
    </>
  );
}
const discussionDrafts = new Map<string, string>();
export function RequestDetail() {
  const { id } = useParams();
  const { profile } = useApp();
  return <RequestWorkspace key={`${profile?.id || "guest"}/${id}`} />;
}
function RequestWorkspace() {
  const { id } = useParams();
  const { profile, call, toast, refresh } = useApp();
  const {
    data: r,
    error,
    loading,
  } = useData("request.get", { id }, !!profile, 15000);
  const {
    data: messages,
    error: messageError,
    loading: messagesLoading,
  } = useData("request.messages", { id }, !!profile, 15000);
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = ["manuscript", "activity"].includes(searchParams.get("tab") || "")
    ? searchParams.get("tab")!
    : "discussion";
  const paperQuery = useData(
    "paper.get",
    { id: r?.paperId },
    !!profile && !!r?.paperId,
    30000,
  );
  const paper = paperQuery.data;
  const [revisionOpen, setRevisionOpen] = useState(false),
    [viewingVersion, setViewingVersion] = useState<any>(null),
    [loadingVersion, setLoadingVersion] = useState(false);
  const versionSequence = useRef(0);
  useEffect(
    () => () => {
      versionSequence.current++;
    },
    [],
  );
  useEffect(() => {
    versionSequence.current++;
    setViewingVersion(null);
    setLoadingVersion(false);
  }, [paper?.version, id]);
  function changeTab(value: string) {
    setSearchParams(value === "discussion" ? {} : { tab: value });
  }
  const discussionKey = `${profile?.id || "guest"}/${id}`;
  const [body, setBody] = useState(discussionDrafts.get(discussionKey) || ""),
    [busy, setBusy] = useState(false),
    [sending, setSending] = useState(false),
    [sendError, setSendError] = useState(""),
    [statusError, setStatusError] = useState(""),
    [next, setNext] = useState(""),
    [note, setNote] = useState("");
  useEffect(() => {
    discussionDrafts.delete(discussionKey);
    if (body.trim()) discussionDrafts.set(discussionKey, body);
    if (discussionDrafts.size > 50)
      discussionDrafts.delete(discussionDrafts.keys().next().value!);
  }, [discussionKey, body]);
  useEffect(() => {
    setStatusError("");
    setNote("");
  }, [next]);
  const reviewer = r?.reviewerId === profile?.id;
  const closed = ["declined", "withdrawn", "endorsed"].includes(r?.status);
  async function status(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !next) return;
    setBusy(true);
    setStatusError("");
    try {
      await call("request.status", { id, status: next, note });
      setNext("");
      setNote("");
      refresh();
      toast("Request updated.");
    } catch (e: any) {
      setStatusError(
        e.message || "The request could not be updated. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim() || sending || closed) return;
    setSending(true);
    setSendError("");
    try {
      await call("request.comment", { id, body: body.trim() });
      setBody("");
      discussionDrafts.delete(discussionKey);
      refresh();
      toast("Comment sent to this request.");
    } catch (e: any) {
      setSendError(
        e.message ||
          "Your comment could not be sent. Your draft is still here; try again.",
      );
    } finally {
      setSending(false);
    }
  }
  if (loading && !r) return <Loading />;
  if (error) return <ErrorBox message={error} />;
  if (!r)
    return (
      <Empty title="Request unavailable">
        Sign in to view your private request.
      </Empty>
    );
  return (
    <>
      <Link className="back-link" to="/requests">
        <ArrowLeft size={16} />
        All requests
      </Link>
      <PageHeading
        eyebrow="YOUR SHARED RESEARCH WORKSPACE"
        title={r.title}
        description={`${r.requesterName} → ${r.reviewerName} · Submitted ${date(r.createdAt)}`}
      />
      <section className="workspace-stage-card" aria-label="Review stages">
        <div className="workspace-current-stage">
          <div>
            <span className="overline">CURRENT STAGE</span>
            <span className={"status-badge " + r.status}>
              {STATUS[r.status]}
            </span>
          </div>
          <p>
            {r.status === "pending"
              ? "The researcher can accept the review and begin collaborating here."
              : r.status === "changes_requested"
                ? "Work through the feedback, upload a revision, then ask for another look."
                : r.status === "accepted"
                  ? "The researcher has offered to help. Complete the official endorsement on arXiv."
                  : closed
                    ? "This workspace preserves the conversation and its history."
                    : "Review the manuscript together. Shared notes and discussion stay with this request."}
          </p>
        </div>
        <ol className="workspace-stage-track">
          {[
            ["Request sent", "Introduction & manuscript"],
            ["Review together", "Notes, discussion & revisions"],
            ["Offer to endorse", "Researcher’s decision"],
            ["arXiv handoff", "Author reports completion"],
          ].map(([label, detail], index) => {
            const stage =
              r.status === "endorsed"
                ? 3
                : r.status === "accepted"
                  ? 2
                  : ["reviewing", "changes_requested"].includes(r.status)
                    ? 1
                    : 0;
            return (
              <li
                key={label}
                className={
                  index === stage &&
                  !["declined", "withdrawn"].includes(r.status)
                    ? "current"
                    : index < stage
                      ? "done"
                      : ""
                }
                aria-current={
                  index === stage &&
                  !["declined", "withdrawn"].includes(r.status)
                    ? "step"
                    : undefined
                }
              >
                <span>{index < stage ? <Check size={15} /> : index + 1}</span>
                <div>
                  <strong>{label}</strong>
                  <small>{detail}</small>
                </div>
              </li>
            );
          })}
        </ol>
      </section>
      <nav className="workspace-navigation" aria-label="Request workspace">
        {[
          ["discussion", "Discussion", MessageSquare],
          ["manuscript", "Manuscript & notes", Highlighter],
          ["activity", "Activity & revisions", GitBranch],
        ].map(([value, label, Icon]: any) => (
          <button
            key={value}
            id={"workspace-tab-" + value}
            aria-pressed={tab === value}
            onClick={() => changeTab(value)}
          >
            <Icon size={17} />
            {label}
          </button>
        ))}
        <span>
          <LockKeyhole size={13} /> Author & selected researcher
        </span>
      </nav>
      <div
        className={
          "request-detail-grid workspace-layout " +
          (tab === "manuscript" ? "document-active" : "")
        }
      >
        <section
          role="region"
          id={"workspace-panel-" + tab}
          aria-labelledby={"workspace-tab-" + tab}
        >
          {tab === "discussion" && (
            <>
              <div className="panel">
                <div className="panel-heading">
                  <h2>The introduction</h2>
                  <span className={"status-badge " + r.status}>
                    {STATUS[r.status]}
                  </span>
                </div>
                <p className="preserve-lines">{r.message}</p>
                <div className="button-row">
                  <Link
                    className="button"
                    to={"/requests/" + id + "?tab=manuscript"}
                  >
                    <FileText size={17} />
                    Read manuscript
                  </Link>
                  <Tag>{r.category}</Tag>
                </div>
              </div>
              <div className="panel conversation">
                <div className="panel-heading">
                  <h2>Discuss this manuscript</h2>
                  <span className="muted">In-app conversation</span>
                </div>
                {messageError && <ErrorBox message={messageError} />}
                {messagesLoading && !messages ? (
                  <Loading />
                ) : messages?.length ? (
                  messages.map((m: any) => (
                    <article
                      className={`message ${m.authorId === profile?.id ? "workspace-message-own" : ""}`}
                      key={m.id}
                    >
                      <Avatar
                        name={m.authorName || "Researcher"}
                        src={m.authorAvatarUrl}
                      />
                      <div>
                        <strong>{m.authorName || "Status update"}</strong>
                        <time
                          dateTime={new Date(m.createdAt).toISOString()}
                          title={new Date(m.createdAt).toLocaleString()}
                        >
                          {new Date(m.createdAt).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </time>
                        <p>{m.body}</p>
                        {m.status && (
                          <span className={"status-badge " + m.status}>
                            {STATUS[m.status]}
                          </span>
                        )}
                      </div>
                    </article>
                  ))
                ) : (
                  <p className="muted">
                    Ask a question, suggest an improvement, or share context for
                    your review.
                  </p>
                )}
                {closed && (
                  <p className="workspace-closed-notice">
                    <LockKeyhole size={16} />
                    This request is closed. The conversation is available to
                    read; new comments are disabled.
                  </p>
                )}
                {!closed && (
                  <form className="message-form" onSubmit={send}>
                    <textarea
                      required
                      disabled={sending}
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      rows={3}
                      maxLength={10000}
                      placeholder="Leave thoughtful feedback or ask a question…"
                      aria-label="Review comment"
                    />
                    {sendError && (
                      <p className="error-box" role="alert">
                        {sendError}
                      </p>
                    )}
                    <div>
                      <small>
                        {body
                          ? "Unsaved draft · kept as you navigate; reload clears it."
                          : "Only the author and selected endorser can see this."}
                      </small>
                      <button
                        className="button primary"
                        disabled={sending || !body.trim()}
                      >
                        <Send size={16} />
                        {sending ? "Sending…" : "Send"}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </>
          )}
          {tab === "manuscript" && (
            <div className="workspace-document">
              <div className="workspace-document-heading paper-detail-heading">
                <div>
                  <p className="overline">READ, ANNOTATE, REVISE</p>
                  <h2>One manuscript. A shared place to improve it.</h2>
                  <div className="tags">
                    <Tag>{r.category}</Tag>
                    <Tag>
                      Version {viewingVersion?.version || paper?.version || 1}
                    </Tag>
                  </div>
                </div>
                <div className="button-row">
                  {paper?.ownerId === profile?.id && !closed && (
                    <button
                      className="button"
                      onClick={() => setRevisionOpen(true)}
                    >
                      <Upload size={16} />
                      Upload revision
                    </button>
                  )}
                  <Link className="text-link" to={"/papers/" + r.paperId}>
                    Open manuscript workspace <ArrowUpRight size={15} />
                  </Link>
                </div>
              </div>
              <p className="workspace-note-boundary">
                <LockKeyhole size={15} /> Shared notes here belong to this
                request. Private notes are visible only to their author.
              </p>
              {paperQuery.error ? (
                <ErrorBox message={paperQuery.error} />
              ) : !paper ? (
                <Loading />
              ) : (
                <>
                  {paper.versions?.length > 1 && (
                    <div className="version-bar">
                      <label>
                        Manuscript version
                        <select
                          value={viewingVersion?.version || paper.version}
                          onChange={async (e) => {
                            const version = Number(e.target.value);
                            const sequence = ++versionSequence.current;
                            setLoadingVersion(true);
                            if (version === paper.version) {
                              setViewingVersion(null);
                              setLoadingVersion(false);
                              return;
                            }
                            try {
                              const previous = await call("paper.version.get", {
                                id: paper.id,
                                version,
                              });
                              if (sequence !== versionSequence.current) return;
                              setViewingVersion({
                                ...paper,
                                ...previous,
                                currentVersion: paper.version,
                              });
                            } catch (error: any) {
                              if (sequence === versionSequence.current)
                                toast(error.message);
                            } finally {
                              if (sequence === versionSequence.current)
                                setLoadingVersion(false);
                            }
                          }}
                        >
                          {[...paper.versions].reverse().map((v: any) => (
                            <option value={v.version} key={v.version}>
                              Version {v.version} · {date(v.updatedAt)}
                              {v.version === paper.version ? " · current" : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                      <small>
                        Notes stay with their manuscript version. Previous
                        versions are read-only.
                      </small>
                    </div>
                  )}
                  {loadingVersion && (
                    <p role="status" className="workspace-version-loading">
                      Opening manuscript version…
                    </p>
                  )}
                  <PdfReader
                    paper={
                      viewingVersion || {
                        ...paper,
                        currentVersion: paper.version || 1,
                      }
                    }
                    requestId={id}
                    readOnly={closed || loadingVersion}
                  />
                </>
              )}
            </div>
          )}
          {tab === "activity" && (
            <section className="panel workspace-activity">
              <h2>The review, step by step</h2>
              <p className="muted">
                Status decisions and manuscript revisions form the shared
                history of this request.
              </p>
              {messageError && <ErrorBox message={messageError} />}
              <ol>
                {[
                  {
                    id: "created",
                    createdAt: r.createdAt,
                    title: "Request sent",
                    body: `${r.requesterName} invited ${r.reviewerName} to review this manuscript.`,
                  },
                  ...(messages || [])
                    .filter((m: any) => m.status)
                    .map((m: any) => ({
                      ...m,
                      title: STATUS[m.status] || "Status updated",
                    })),
                  ...(paper?.versions || [])
                    .filter((v: any) => v.updatedAt >= r.createdAt)
                    .map((v: any) => ({
                      id: "version-" + v.version,
                      createdAt: v.updatedAt,
                      title: `Manuscript version ${v.version}`,
                      body:
                        v.version === paper.version
                          ? "Current version available in Manuscript & notes."
                          : "Earlier version preserved with its annotations.",
                    })),
                ]
                  .sort((a: any, b: any) => b.createdAt - a.createdAt)
                  .map((event: any) => (
                    <li key={event.id}>
                      <span className="workspace-event-dot">
                        <GitBranch size={16} />
                      </span>
                      <div>
                        <h3>{event.title}</h3>
                        <time>
                          {new Date(event.createdAt).toLocaleString()}
                        </time>
                        <p>{event.body}</p>
                      </div>
                    </li>
                  ))}
              </ol>
            </section>
          )}
        </section>
        <aside>
          <div className="panel next-steps">
            <p className="overline">THE NEXT STEP</p>
            <h3>
              {r.status === "accepted"
                ? "Take it to arXiv."
                : closed
                  ? "This chapter is closed."
                  : reviewer
                    ? "Make room for good research."
                    : "Give your work a conversation."}
            </h3>
            <p>
              {r.status === "accepted"
                ? "An offer to help is the start. The endorser must use arXiv’s official form to complete the endorsement."
                : closed
                  ? "The conversation and decisions remain in the activity history. Manuscript access for the reviewer ends when a request closes."
                  : reviewer
                    ? "Read the manuscript and check your current category eligibility on arXiv before offering to endorse."
                    : "Respond to feedback and keep the conversation focused. A researcher may need time to review your work."}
            </p>
            {r.endorsementUrl && (
              <External href={r.endorsementUrl}>
                Open official arXiv request
              </External>
            )}
            {!closed && (
              <div className="stack-actions">
                {reviewer ? (
                  <>
                    {r.status !== "reviewing" && (
                      <button
                        className="button primary"
                        onClick={() => setNext("reviewing")}
                      >
                        Start reviewing
                      </button>
                    )}
                    {r.status !== "accepted" && (
                      <button
                        className="button primary"
                        onClick={() => setNext("accepted")}
                      >
                        <Check size={16} />
                        Offer to endorse
                      </button>
                    )}
                    {r.status !== "changes_requested" && (
                      <button
                        className="button"
                        onClick={() => setNext("changes_requested")}
                      >
                        Request improvements
                      </button>
                    )}
                    <button
                      className="button"
                      onClick={() => setNext("declined")}
                    >
                      Decline request
                    </button>
                  </>
                ) : (
                  <>
                    {r.status === "accepted" && (
                      <button
                        className="button primary"
                        onClick={() => setNext("endorsed")}
                      >
                        Report arXiv completion
                      </button>
                    )}
                    {r.status === "changes_requested" && (
                      <button
                        className="button"
                        onClick={() => setNext("reviewing")}
                      >
                        Ready for another look
                      </button>
                    )}
                    <button
                      className="text-link danger"
                      onClick={() => setNext("withdrawn")}
                    >
                      Withdraw this request
                    </button>
                  </>
                )}
              </div>
            )}
            <p className="fine-print">
              Endorsement is not peer review. All reported completions are
              self-reported by the author.
            </p>
          </div>
        </aside>
      </div>
      {paper && (
        <UploadModal
          open={revisionOpen}
          onClose={() => setRevisionOpen(false)}
          existing={paper}
          onSaved={() => {
            setViewingVersion(null);
            refresh();
          }}
        />
      )}
      <Modal
        open={!!next}
        onClose={() => {
          if (!busy) setNext("");
        }}
        title={
          next === "accepted"
            ? "Offer to help with endorsement?"
            : next === "endorsed"
              ? "Report completed endorsement?"
              : next === "withdrawn"
                ? "Withdraw this request?"
                : "Update this request"
        }
        description={
          next === "accepted"
            ? "This records your willingness to help. You still need to complete the official arXiv endorsement."
            : next === "endorsed"
              ? "Confirm only after arXiv has recorded the endorsement. PaperBridge cannot independently verify completion."
              : next === "withdrawn"
                ? "This ends the review and stops new manuscript access links. Existing links expire within 10 minutes. Downloaded copies cannot be recalled."
                : "Leave a constructive note explaining the next step."
        }
      >
        <form onSubmit={status}>
          <label className="form">
            {next === "changes_requested" || next === "declined"
              ? "Explain your feedback"
              : "A note for the other researcher (optional)"}
            <textarea
              disabled={busy}
              value={note}
              maxLength={5000}
              required={next === "changes_requested" || next === "declined"}
              placeholder={
                next === "changes_requested"
                  ? "Describe the specific changes that would help the manuscript…"
                  : "Add context for the next step…"
              }
              onChange={(e) => setNote(e.target.value)}
              rows={4}
            />
          </label>
          {statusError && (
            <p className="error-box" role="alert">
              {statusError}
            </p>
          )}
          <div className="button-row">
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() => setNext("")}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="button primary"
              disabled={
                busy ||
                (["declined", "changes_requested"].includes(next) &&
                  !note.trim())
              }
            >
              {busy ? "Updating…" : "Confirm update"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
