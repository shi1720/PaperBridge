import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  Flag,
  Heart,
  MessageCircle,
  MessageSquare,
  Plus,
  RefreshCw,
  Send,
  Shield,
  Trash2,
  Trophy,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useApp, useData } from "../lib/context";
import { date } from "../lib/types";
import {
  Avatar,
  Empty,
  ErrorBox,
  External,
  Loading,
  Modal,
  PageHeading,
  Tag,
} from "./ui";
type Row = Record<string, any>;
type ReportTarget = { id: string; type: string; name: string };
const list = (value: any): Row[] => (Array.isArray(value) ? value : []);
const time = (value: number) =>
  new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

function SignInCard({
  onAuth,
  title,
  children,
}: {
  onAuth: () => void;
  title: string;
  children: string;
}) {
  return (
    <Empty
      title={title}
      action={
        <button className="button primary" onClick={onAuth}>
          Join the conversation <ArrowRight size={16} />
        </button>
      }
    >
      {children}
    </Empty>
  );
}
function ReportModal({
  target,
  onClose,
}: {
  target: ReportTarget | null;
  onClose: () => void;
}) {
  const { call, toast, demo } = useApp();
  const [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    setReason("");
    setError("");
  }, [target?.id]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!target) return;
    setBusy(true);
    setError("");
    try {
      await call("report.create", {
        targetId: target.id,
        targetType: target.type,
        reason,
      });
      toast(
        demo
          ? "Demo report recorded in this preview."
          : "Report submitted for review.",
      );
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open={!!target}
      onClose={() => {
        if (!busy) onClose();
      }}
      title="Report a concern"
      description={`Tell us what happened with ${target?.name || "this content"}.`}
    >
      <form className="form" onSubmit={submit}>
        <p className="notice">
          Reports are private. Include enough context to help us assess unwanted
          contact, impersonation, or inappropriate content.
        </p>
        <label>
          What should we know?
          <textarea
            autoFocus
            required
            minLength={10}
            maxLength={3000}
            rows={5}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Describe the concern and any relevant context…"
          />
        </label>
        {error && <ErrorBox message={error} />}
        <button className="button primary" disabled={busy}>
          {busy ? "Submitting…" : "Submit report"}
          <Flag size={16} />
        </button>
      </form>
    </Modal>
  );
}

export function Community({ onAuth }: { onAuth: () => void }) {
  const { profile, call, refresh, toast, demo } = useApp();
  const navigate = useNavigate();
  const { data, error, loading } = useData("feed.list", {}, !!profile);
  const follows = useData("follow.list", {}, !!profile);
  const papers = useData("paper.list", {}, !!profile);
  const [tab, setTab] = useState<"all" | "following">("all"),
    [body, setBody] = useState(""),
    [arxivUrl, setArxivUrl] = useState(""),
    [paperId, setPaperId] = useState(""),
    [busy, setBusy] = useState(false),
    [composeError, setComposeError] = useState(""),
    [report, setReport] = useState<ReportTarget | null>(null),
    [deleteId, setDeleteId] = useState<string | null>(null),
    [deleting, setDeleting] = useState(false);
  const following = new Set<string>(
    (Array.isArray(follows.data)
      ? follows.data
      : list(follows.data?.following).map((f) => f.followingId)) as string[],
  );
  const posts = list(data).filter(
    (p) => tab === "all" || following.has(p.authorId),
  );
  async function publish(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setComposeError("");
    try {
      await call("feed.post", {
        body: body.trim(),
        arxivUrl: arxivUrl.trim(),
        ...(paperId ? { paperId } : {}),
      });
      setBody("");
      setArxivUrl("");
      setPaperId("");
      refresh();
      toast(
        demo
          ? "Your post was added to this demo."
          : "Your post is now visible to the community.",
      );
    } catch (e: any) {
      setComposeError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await call("feed.delete", { id: deleteId });
      setDeleteId(null);
      refresh();
      toast("Post deleted.");
    } catch (e: any) {
      toast(e.message);
    } finally {
      setDeleting(false);
    }
  }
  async function message(authorId: string) {
    try {
      const chat = await call("chat.open", { userId: authorId });
      navigate("/messages?chat=" + encodeURIComponent(chat.id));
    } catch (e: any) {
      toast(e.message);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="THE RESEARCH COMMONS"
        title="Ideas grow in conversation."
        description="Share a question, a paper, or something you learned along the way."
        action={
          profile ? (
            <button className="button" onClick={refresh}>
              <RefreshCw size={16} />
              Refresh
            </button>
          ) : undefined
        }
      />
      {!profile ? (
        <SignInCard onAuth={onAuth} title="Find your research community">
          Sign in to share your work, follow researchers, and take part in
          thoughtful conversations.
        </SignInCard>
      ) : (
        <div className="social-layout">
          <section className="social-feed">
            <form className="card social-composer form" onSubmit={publish}>
              <div className="social-author">
                <Avatar name={profile.name} />
                <div>
                  <strong>What are you working on?</strong>
                  <small>A question can be the start of a collaboration.</small>
                </div>
              </div>
              <label className="sr-only" htmlFor="post-body">
                Your community post
              </label>
              <textarea
                id="post-body"
                required
                maxLength={10000}
                rows={4}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Share an idea, ask for a perspective, or celebrate a small research milestone…"
              />
              <div className="social-attachments">
                <label>
                  arXiv paper link <span className="optional">optional</span>
                  <input
                    type="url"
                    value={arxivUrl}
                    onChange={(e) => setArxivUrl(e.target.value)}
                    placeholder="https://arxiv.org/abs/…"
                  />
                </label>
                {list(papers.data).some((p) => p.visibility === "public") && (
                  <label>
                    Attach a public manuscript
                    <select
                      value={paperId}
                      onChange={(e) => setPaperId(e.target.value)}
                    >
                      <option value="">No manuscript</option>
                      {list(papers.data)
                        .filter((p) => p.visibility === "public")
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.title}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
              </div>
              <div className="social-compose-footer">
                <span className="fine-print">
                  <Users size={14} /> Visible to signed-in community members.
                  Keep unpublished details private.
                </span>
                <button
                  className="button primary"
                  disabled={busy || !body.trim()}
                >
                  {busy ? "Publishing…" : "Publish post"}
                  <ArrowUpRight size={16} />
                </button>
              </div>
              {composeError && <ErrorBox message={composeError} />}
            </form>
            <div className="social-feed-heading">
              <div
                className="category-tabs"
                role="group"
                aria-label="Feed filter"
              >
                <button
                  className={tab === "all" ? "active" : ""}
                  onClick={() => setTab("all")}
                >
                  Community
                </button>
                <button
                  className={tab === "following" ? "active" : ""}
                  onClick={() => setTab("following")}
                >
                  Following <span>{following.size}</span>
                </button>
              </div>
              <span className="muted">Latest conversations</span>
            </div>
            {error && <ErrorBox message={error} />}{" "}
            {tab === "following" && follows.error && (
              <ErrorBox message={follows.error} />
            )}{" "}
            {loading && !data ? (
              <Loading />
            ) : posts.length ? (
              posts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  following={following.has(post.authorId)}
                  onFollow={async () => {
                    await call("follow.toggle", { id: post.authorId });
                    refresh();
                  }}
                  onReport={() =>
                    setReport({ id: post.id, type: "post", name: "this post" })
                  }
                  onDelete={() => setDeleteId(post.id)}
                  onMessage={() => message(post.authorId)}
                />
              ))
            ) : (
              <Empty
                title={
                  tab === "following"
                    ? "Bring your people into focus"
                    : "Start the first conversation"
                }
                action={
                  tab === "following" ? (
                    <Link className="button" to="/discover">
                      Discover researchers <ArrowRight size={16} />
                    </Link>
                  ) : (
                    <button
                      className="button"
                      onClick={() =>
                        document.getElementById("post-body")?.focus()
                      }
                    >
                      Share a research question <Plus size={16} />
                    </button>
                  )
                }
              >
                {tab === "following"
                  ? "Posts from the researchers you follow will appear here."
                  : "A good question, an interesting preprint, a lesson learned: make room for someone else to build on it."}
              </Empty>
            )}
          </section>
          <aside className="right-rail">
            <section className="rail-card">
              <div className="rail-icon">
                <MessageCircle size={24} />
              </div>
              <h3>A commons for curious minds.</h3>
              <p>
                Research is richer when we make our thinking visible. Ask
                specific questions. Share context. Give thoughtful credit.
              </p>
              <div className="social-rail-stat">
                <strong>{following.size}</strong>
                <span>researchers you follow</span>
              </div>
              <Link to="/discover" className="text-link">
                Find your people <ArrowUpRight size={16} />
              </Link>
            </section>
            <section className="rail-card">
              <Shield size={21} />
              <h3>Constructive by design</h3>
              <p>
                Challenge ideas with evidence. Respect confidential work and
                requests to stop contact. Use report controls when something
                feels wrong.
              </p>
              <p className="fine-print">
                Public posts do not make a private manuscript public. Only
                manuscripts you have made public can be attached.
              </p>
            </section>
          </aside>
        </div>
      )}
      <ReportModal target={report} onClose={() => setReport(null)} />
      <Modal
        open={!!deleteId}
        onClose={() => {
          if (!deleting) setDeleteId(null);
        }}
        title="Delete this post?"
        description="The post, its comments, and likes will be removed."
      >
        <div className="button-row">
          <button
            className="button danger"
            disabled={deleting}
            onClick={remove}
          >
            {deleting ? "Deleting…" : "Delete post"}
          </button>
          <button
            className="button"
            disabled={deleting}
            onClick={() => setDeleteId(null)}
          >
            Keep post
          </button>
        </div>
      </Modal>
    </>
  );
}

function PostCard({
  post,
  following,
  onFollow,
  onReport,
  onDelete,
  onMessage,
}: {
  post: Row;
  following: boolean;
  onFollow: () => Promise<void>;
  onReport: () => void;
  onDelete: () => void;
  onMessage: () => void;
}) {
  const { profile, call, refresh } = useApp();
  const [open, setOpen] = useState(false),
    [comment, setComment] = useState(""),
    [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  const comments = useData("feed.comments", { id: post.id }, open);
  async function act(name: string, fn: () => Promise<any>) {
    setBusy(name);
    setError("");
    try {
      await fn();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }
  async function reply(e: FormEvent) {
    e.preventDefault();
    await act("comment", async () => {
      await call("feed.comment", { id: post.id, body: comment.trim() });
      setComment("");
      refresh();
    });
  }
  return (
    <article className="card social-post">
      <header className="social-post-header">
        <div className="social-author">
          <Avatar name={post.authorName || "Researcher"} />
          <div>
            <strong>{post.authorName || "Researcher"}</strong>
            {post.authorHeadline && <small>{post.authorHeadline}</small>}
            <time dateTime={new Date(post.createdAt).toISOString()}>
              {time(post.createdAt)}
            </time>
          </div>
        </div>
        {post.authorId !== profile?.id ? (
          <button
            className="button compact"
            disabled={!!busy}
            onClick={() => act("follow", onFollow)}
            aria-pressed={following}
          >
            {following ? <Check size={14} /> : <UserPlus size={14} />}{" "}
            {following ? "Following" : "Follow"}
          </button>
        ) : (
          <Tag>Your post</Tag>
        )}
      </header>
      <p className="social-post-body">{post.body}</p>
      {post.paperId && (
        <Link className="social-paper-link" to={"/papers/" + post.paperId}>
          <BookOpen size={20} />
          <span>{post.paperTitle || "Read attached manuscript"}</span>
          <ArrowUpRight size={17} />
        </Link>
      )}
      {post.arxivUrl && (
        <div className="social-external">
          <External href={post.arxivUrl}>Read paper on arXiv</External>
        </div>
      )}
      <div className="social-post-actions">
        <button
          className={`social-action ${post.liked ? "liked" : ""}`}
          disabled={!!busy}
          aria-pressed={!!post.liked}
          onClick={() =>
            act("like", async () => {
              await call("feed.like", { id: post.id });
              refresh();
            })
          }
        >
          <Heart size={17} fill={post.liked ? "currentColor" : "none"} />
          {post.likeCount ?? post.likes ?? 0}
          <span>Like</span>
        </button>
        <button
          className="social-action"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <MessageCircle size={17} />
          {post.commentCount || 0}
          <span>Discuss</span>
        </button>
        <div className="social-action-spacer" />
        {post.authorId !== profile?.id && (
          <button
            className="icon-button"
            title="Message researcher"
            aria-label={`Message ${post.authorName}`}
            onClick={onMessage}
          >
            <MessageSquare size={16} />
          </button>
        )}
        <button
          className="icon-button"
          title={post.authorId === profile?.id ? "Delete post" : "Report post"}
          aria-label={
            post.authorId === profile?.id ? "Delete post" : "Report post"
          }
          onClick={post.authorId === profile?.id ? onDelete : onReport}
        >
          {post.authorId === profile?.id ? (
            <Trash2 size={16} />
          ) : (
            <Flag size={16} />
          )}
        </button>
      </div>
      {error && <ErrorBox message={error} />}{" "}
      {open && (
        <section className="social-comments" aria-label="Post discussion">
          {comments.error && <ErrorBox message={comments.error} />}{" "}
          {comments.loading && !comments.data ? (
            <Loading />
          ) : (
            list(comments.data).map((c) => (
              <div className="social-comment" key={c.id}>
                <Avatar name={c.authorName || "Researcher"} />
                <div>
                  <strong>{c.authorName || "Researcher"}</strong>
                  <p>{c.body}</p>
                  <time>{time(c.createdAt)}</time>
                </div>
              </div>
            ))
          )}
          {!comments.loading && !list(comments.data).length && (
            <p className="muted">Be the first to offer a perspective.</p>
          )}
          <form className="form social-reply" onSubmit={reply}>
            <label className="sr-only" htmlFor={"reply-" + post.id}>
              Add a thoughtful reply
            </label>
            <textarea
              id={"reply-" + post.id}
              required
              maxLength={5000}
              rows={2}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add a thoughtful reply…"
            />
            <button
              className="button compact"
              disabled={!!busy || !comment.trim()}
            >
              {busy === "comment" ? "Sending…" : "Reply"}
              <Send size={14} />
            </button>
          </form>
        </section>
      )}
    </article>
  );
}

export function Messages({ onAuth }: { onAuth: () => void }) {
  const { profile, call, refresh, toast, demo } = useApp();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get("chat") || "";
  const chats = useData("chat.list", {}, !!profile);
  const people = useData("directory.list", {}, !!profile);
  const blocks = useData("block.list", {}, !!profile && !demo);
  const [messages, setMessages] = useState<Row[]>([]),
    [messageError, setMessageError] = useState(""),
    [loading, setLoading] = useState(false),
    [draft, setDraft] = useState(""),
    [busy, setBusy] = useState(false),
    [tick, setTick] = useState(0),
    [newChat, setNewChat] = useState(false),
    [recipient, setRecipient] = useState(""),
    [search, setSearch] = useState(""),
    [opening, setOpening] = useState(false),
    [openError, setOpenError] = useState(""),
    [report, setReport] = useState<ReportTarget | null>(null),
    [blockPrompt, setBlockPrompt] = useState(false),
    [blocking, setBlocking] = useState(false),
    [demoBlocked, setDemoBlocked] = useState<string[]>([]);
  const end = useRef<HTMLDivElement>(null);
  const chat = list(chats.data).find((c) => c.id === selectedId),
    otherId =
      chat?.members?.find((id: string) => id !== profile?.id) || chat?.otherId,
    otherName = chat?.names?.[otherId] || chat?.name || "Researcher";
  const blocked = demo
    ? demoBlocked.includes(otherId)
    : list(blocks.data).some((b) => b.targetId === otherId);
  useEffect(() => {
    setDraft("");
    setMessageError("");
  }, [selectedId]);
  useEffect(() => {
    if (!selectedId || !profile) {
      setMessages([]);
      return;
    }
    let stopped = false,
      timer: ReturnType<typeof setTimeout>;
    setLoading(true);
    setMessages([]);
    async function poll() {
      if (document.visibilityState === "hidden") {
        timer = setTimeout(poll, 15000);
        return;
      }
      try {
        const rows = await call("chat.messages", { id: selectedId });
        if (!stopped) {
          setMessages(list(rows));
          setMessageError("");
        }
      } catch (e: any) {
        if (!stopped) setMessageError(e.message);
      } finally {
        if (!stopped) {
          setLoading(false);
          timer = setTimeout(poll, 15000);
        }
      }
    }
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [selectedId, profile?.id, call, tick]);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages.length, selectedId]);
  async function send(e: FormEvent) {
    e.preventDefault();
    if (!selectedId) return;
    setBusy(true);
    setMessageError("");
    try {
      const sent = await call("chat.send", {
        id: selectedId,
        body: draft.trim(),
      });
      setMessages((rows) => [...rows, sent]);
      setDraft("");
      refresh();
    } catch (e: any) {
      setMessageError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function open(e: FormEvent) {
    e.preventDefault();
    setOpening(true);
    setOpenError("");
    try {
      const opened = await call("chat.open", { userId: recipient });
      setParams({ chat: opened.id });
      setNewChat(false);
      setRecipient("");
      refresh();
    } catch (e: any) {
      setOpenError(e.message);
    } finally {
      setOpening(false);
    }
  }
  async function toggleBlock() {
    setBlocking(true);
    try {
      const result = await call("block.toggle", { userId: otherId });
      if (demo)
        setDemoBlocked((v) =>
          v.includes(otherId)
            ? v.filter((x) => x !== otherId)
            : [...v, otherId],
        );
      toast(
        demo
          ? "Demo contact preference updated."
          : result.blocked
            ? "Researcher blocked. New contact is prevented."
            : "Researcher unblocked.",
      );
      setBlockPrompt(false);
      refresh();
    } catch (e: any) {
      toast(e.message);
    } finally {
      setBlocking(false);
    }
  }
  const available = list(people.data).filter(
    (p) =>
      p.id !== profile?.id &&
      `${p.name} ${p.headline || ""}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <>
      <PageHeading
        eyebrow="ONE GOOD CONVERSATION"
        title="Your research, in dialogue."
        description="A private place to ask, clarify, and build a working connection."
        action={
          profile ? (
            <button className="button primary" onClick={() => setNewChat(true)}>
              <Plus size={16} />
              New conversation
            </button>
          ) : undefined
        }
      />
      {!profile ? (
        <SignInCard onAuth={onAuth} title="Make room for a conversation">
          Sign in to message researchers and continue your collaborations
          privately.
        </SignInCard>
      ) : (
        <>
          <div className="chat-layout card">
            <aside className="chat-sidebar">
              <div className="chat-sidebar-heading">
                <strong>Conversations</strong>
                <button
                  className="icon-button"
                  title="Refresh conversations"
                  aria-label="Refresh conversations"
                  onClick={() => {
                    refresh();
                    setTick((t) => t + 1);
                  }}
                >
                  <RefreshCw size={16} />
                </button>
              </div>
              {chats.error && <ErrorBox message={chats.error} />}{" "}
              {chats.loading && !chats.data ? (
                <Loading />
              ) : list(chats.data).length ? (
                list(chats.data).map((c) => {
                  const other =
                    c.members?.find((id: string) => id !== profile.id) ||
                    c.otherId;
                  const name = c.names?.[other] || c.name || "Researcher";
                  return (
                    <button
                      key={c.id}
                      disabled={busy}
                      className={`chat-list-item ${selectedId === c.id ? "active" : ""}`}
                      onClick={() => setParams({ chat: c.id })}
                    >
                      <Avatar name={name} />
                      <div>
                        <strong>{name}</strong>
                        <p>{c.lastMessage || "Start with a hello."}</p>
                      </div>
                      <time>{date(c.updatedAt || c.createdAt)}</time>
                    </button>
                  );
                })
              ) : (
                <div className="chat-sidebar-empty">
                  <MessageSquare size={24} />
                  <p>A new connection starts with hello.</p>
                  <button
                    className="text-link"
                    onClick={() => setNewChat(true)}
                  >
                    Start a conversation <ArrowRight size={15} />
                  </button>
                </div>
              )}
            </aside>
            <section className="chat-thread">
              {selectedId ? (
                <>
                  <header className="chat-thread-header">
                    <div className="social-author">
                      <Avatar name={otherName} />
                      <div>
                        <strong>{otherName}</strong>
                        <small>
                          {blocked
                            ? "Contact blocked"
                            : "Private conversation · refreshes every 15 seconds"}
                        </small>
                      </div>
                    </div>
                    {chat && (
                      <div className="button-row">
                        <button
                          className="icon-button"
                          title="Report conversation"
                          aria-label="Report conversation"
                          onClick={() =>
                            setReport({
                              id: selectedId,
                              type: "chat",
                              name: "this conversation",
                            })
                          }
                        >
                          <Flag size={16} />
                        </button>
                        <button
                          className="icon-button"
                          disabled={!demo && (blocks.loading || !!blocks.error)}
                          title={
                            blocked ? "Unblock researcher" : "Block researcher"
                          }
                          aria-label={
                            blocked ? "Unblock researcher" : "Block researcher"
                          }
                          onClick={() => setBlockPrompt(true)}
                        >
                          <Shield size={17} />
                        </button>
                      </div>
                    )}
                  </header>
                  <div
                    className="chat-messages"
                    aria-live="polite"
                    aria-label="Conversation messages"
                  >
                    {loading ? (
                      <Loading />
                    ) : messages.length ? (
                      messages.map((m) => (
                        <div
                          key={m.id}
                          className={`chat-bubble ${m.authorId === profile.id ? "mine" : ""}`}
                        >
                          <p>{m.body}</p>
                          <time>{time(m.createdAt)}</time>
                        </div>
                      ))
                    ) : (
                      !messageError && (
                        <div className="chat-welcome">
                          <MessageCircle size={30} />
                          <h3>Start with what brings you here.</h3>
                          <p>
                            A brief introduction and one clear question make a
                            thoughtful first message.
                          </p>
                        </div>
                      )
                    )}
                    <div ref={end} />
                  </div>
                  {messageError && <ErrorBox message={messageError} />}{" "}
                  {blocks.error && (
                    <ErrorBox
                      message={
                        "Contact preferences could not load: " + blocks.error
                      }
                    />
                  )}
                  <form className="chat-compose" onSubmit={send}>
                    <label className="sr-only" htmlFor="message-body">
                      Your message
                    </label>
                    <textarea
                      id="message-body"
                      required
                      maxLength={10000}
                      rows={2}
                      value={draft}
                      disabled={blocked || !chat}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder={
                        blocked
                          ? "Unblock this researcher to send a message."
                          : "Write a thoughtful message…"
                      }
                    />
                    <button
                      className="button primary"
                      disabled={busy || blocked || !chat || !draft.trim()}
                      aria-label="Send message"
                    >
                      {busy ? (
                        "Sending…"
                      ) : (
                        <>
                          <Send size={17} />
                          <span>Send</span>
                        </>
                      )}
                    </button>
                  </form>
                </>
              ) : (
                <Empty
                  title="A fresh perspective is a message away"
                  action={
                    <button className="button" onClick={() => setNewChat(true)}>
                      Start a conversation <ArrowRight size={16} />
                    </button>
                  }
                >
                  Choose a conversation or connect with someone in your research
                  community.
                </Empty>
              )}
            </section>
          </div>
          <p className="fine-print chat-privacy">
            <Shield size={14} /> Messages are visible to the participants and
            authorized service operators. Keep sensitive data and API keys out
            of chat.
          </p>
        </>
      )}
      <Modal
        open={newChat}
        onClose={() => setNewChat(false)}
        title="Start a conversation"
        description="Choose a researcher and introduce your work with care."
      >
        <form className="form" onSubmit={open}>
          <label>
            Find a researcher
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or research interests"
            />
          </label>
          {people.error && <ErrorBox message={people.error} />}
          <label>
            Researcher
            <select
              required
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
            >
              <option value="">Select a researcher</option>
              {available.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.institution || "Independent researcher"}
                </option>
              ))}
            </select>
          </label>
          {!available.length && (
            <p className="muted">No matching public profiles yet.</p>
          )}
          {openError && <ErrorBox message={openError} />}
          <button className="button primary" disabled={opening || !recipient}>
            {opening ? "Opening…" : "Open conversation"}
            <ArrowRight size={16} />
          </button>
        </form>
      </Modal>
      <ReportModal target={report} onClose={() => setReport(null)} />
      <Modal
        open={blockPrompt}
        onClose={() => setBlockPrompt(false)}
        title={`${blocked ? "Unblock" : "Block"} ${otherName}?`}
        description={
          blocked
            ? "Allow new messages and requests again."
            : "Block new messages, requests and follows. Existing messages remain available."
        }
      >
        <div className="button-row">
          <button
            className="button primary"
            disabled={blocking}
            onClick={toggleBlock}
          >
            {blocking
              ? "Updating…"
              : blocked
                ? "Unblock researcher"
                : "Block researcher"}
          </button>
          <button className="button" onClick={() => setBlockPrompt(false)}>
            Cancel
          </button>
        </div>
      </Modal>
    </>
  );
}

export function Impact() {
  const { profile, demo, refresh } = useApp();
  const [period, setPeriod] = useState<"week" | "all">("week");
  const { data, error, loading } = useData(
    "leaderboard.list",
    { period },
    !!profile,
  );
  const people = list(data);
  const total = people.reduce(
    (sum, p) => sum + Number(p.endorsements ?? p.count ?? 0),
    0,
  );
  return (
    <>
      <PageHeading
        eyebrow="PROGRESS IS A SHARED EFFORT"
        title="A little time. A lasting difference."
        description="Recognizing the researchers who help someone else take their next step."
        action={
          profile ? (
            <button className="button" onClick={refresh}>
              <RefreshCw size={16} />
              Refresh
            </button>
          ) : undefined
        }
      />
      <div className="impact-intro">
        <div>
          <span className="rail-icon">
            <Trophy size={27} />
          </span>
          <h2>Good research needs generous people.</h2>
          <p>
            Every thoughtful introduction, manuscript conversation, and piece of
            feedback helps make independent research more connected.
          </p>
        </div>
        <Link to="/settings" className="button primary">
          Make room for a researcher <ArrowUpRight size={16} />
        </Link>
      </div>
      {!profile ? (
        <Empty
          title="Meet the people making a difference"
          action={
            <Link className="button" to="/discover">
              Explore the community <ArrowRight size={16} />
            </Link>
          }
        >
          Sign in to see community contributions and connect with researchers.
        </Empty>
      ) : (
        <>
          <div className="impact-metrics">
            <div className="card">
              <span>Reported completions shown</span>
              <strong>{total}</strong>
              <small>
                {demo
                  ? "Illustrative demo activity"
                  : period === "week"
                    ? "Since Monday, 00:00 UTC"
                    : "Across all time"}
              </small>
            </div>
            <div className="card">
              <span>Researchers recognized</span>
              <strong>{people.length}</strong>
              <small>Public profiles in this view</small>
            </div>
            <div className="card impact-values">
              <Users size={24} />
              <strong>Shared progress</strong>
              <small>Contribution is more than a count.</small>
            </div>
          </div>
          <section className="card impact-board">
            <div className="section-heading">
              <div>
                <p className="overline">COMMUNITY CONTRIBUTIONS</p>
                <h2>People opening doors</h2>
              </div>
              <div
                className="category-tabs"
                role="group"
                aria-label="Contribution period"
              >
                <button
                  className={period === "week" ? "active" : ""}
                  onClick={() => setPeriod("week")}
                >
                  This week
                </button>
                <button
                  className={period === "all" ? "active" : ""}
                  onClick={() => setPeriod("all")}
                >
                  All time
                </button>
              </div>
            </div>
            {error && <ErrorBox message={error} />}{" "}
            {loading ? (
              <Loading />
            ) : people.length ? (
              <ol className="impact-list">
                {people.map((p, index) => (
                  <li key={p.id}>
                    <span className={`impact-rank ${index < 3 ? "top" : ""}`}>
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <Avatar name={p.name} color={p.color} />
                    <div className="impact-person">
                      <strong>{p.name}</strong>
                      <p>{p.institution || "Independent researcher"}</p>
                      <div className="tags">
                        {(p.categories || []).slice(0, 3).map((c: string) => (
                          <Tag key={c}>{c}</Tag>
                        ))}
                      </div>
                    </div>
                    <div className="impact-count">
                      <strong>{p.endorsements ?? p.count ?? 0}</strong>
                      <small>
                        reported{" "}
                        {(p.endorsements ?? p.count ?? 0) === 1
                          ? "completion"
                          : "completions"}
                      </small>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <Empty
                title="The first contributions are still ahead"
                action={
                  <Link className="button" to="/discover">
                    Make a connection <ArrowRight size={16} />
                  </Link>
                }
              >
                Once authors report completed endorsements, contributing
                researchers with public profiles will appear here.
              </Empty>
            )}
          </section>
          <div className="notice impact-note">
            <Shield size={19} />
            <div>
              <strong>Recognition, with context.</strong>
              <p>
                These counts reflect completion reported by authors in
                PaperBridge. They are not independently verified by arXiv, a
                measure of research quality, or proof of endorsement
                eligibility. The list shows up to 50 public profiles. There are
                no rewards for accepting requests or guarantees of endorsement.
              </p>
            </div>
          </div>
        </>
      )}
    </>
  );
}
