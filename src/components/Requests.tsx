import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowUpRight,
  ArrowLeft,
  Send,
  FileText,
  Check,
  Clock,
  ArrowRight,
  Inbox,
  ShieldCheck,
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
        description="Follow each conversation from a first introduction to the arXiv handoff."
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
export function RequestDetail() {
  const { id } = useParams();
  const { profile, call, toast, refresh } = useApp();
  const {
    data: r,
    error,
    loading,
  } = useData("request.get", { id }, !!profile, 15000);
  const { data: messages } = useData(
    "request.messages",
    { id },
    !!profile,
    15000,
  );
  const [body, setBody] = useState(""),
    [busy, setBusy] = useState(false),
    [next, setNext] = useState(""),
    [note, setNote] = useState("");
  const reviewer = r?.reviewerId === profile?.id;
  const closed = ["declined", "withdrawn", "endorsed"].includes(r?.status);
  async function status() {
    setBusy(true);
    try {
      await call("request.status", { id, status: next, note });
      setNext("");
      setNote("");
      refresh();
      toast("Request updated.");
    } catch (e: any) {
      toast(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    try {
      await call("request.comment", { id, body });
      setBody("");
      refresh();
    } catch (e: any) {
      toast(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <Loading />;
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
        eyebrow="PRIVATE REVIEW CONVERSATION"
        title={r.title}
        description={`${r.requesterName} → ${r.reviewerName} · Submitted ${date(r.createdAt)}`}
      />
      <div className="request-detail-grid">
        <section>
          <div className="panel">
            <div className="panel-heading">
              <h2>The introduction</h2>
              <span className={"status-badge " + r.status}>
                {STATUS[r.status]}
              </span>
            </div>
            <p className="preserve-lines">{r.message}</p>
            <div className="button-row">
              <Link className="button" to={"/papers/" + r.paperId}>
                <FileText size={17} />
                Read manuscript
              </Link>
              <Tag>{r.category}</Tag>
            </div>
          </div>
          <div className="panel conversation">
            <div className="panel-heading">
              <h2>Make the work stronger</h2>
              <span className="muted">Private conversation</span>
            </div>
            {messages?.length ? (
              messages.map((m: any) => (
                <article className="message" key={m.id}>
                  <Avatar name={m.authorName || "Researcher"} />
                  <div>
                    <strong>{m.authorName || "Status update"}</strong>
                    <time>{date(m.createdAt)}</time>
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
            {!closed && (
              <form className="message-form" onSubmit={send}>
                <textarea
                  required
                  disabled={busy}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={3}
                  maxLength={10000}
                  placeholder="Leave thoughtful feedback or ask a question…"
                  aria-label="Review comment"
                />
                <div>
                  <small>
                    Only the author and selected endorser can see this.
                  </small>
                  <button
                    className="button primary"
                    disabled={busy || !body.trim()}
                  >
                    <Send size={16} />
                    Send
                  </button>
                </div>
              </form>
            )}
          </div>
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
      <Modal
        open={!!next}
        onClose={() => setNext("")}
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
        <label className="form">
          A note for the other researcher
          <textarea
            disabled={busy}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
          />
        </label>
        <div className="button-row">
          <button className="button" onClick={() => setNext("")}>
            Cancel
          </button>
          <button className="button primary" onClick={status} disabled={busy}>
            {busy ? "Updating…" : "Confirm update"}
          </button>
        </div>
      </Modal>
    </>
  );
}
