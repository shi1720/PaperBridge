import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Link,
  useNavigate,
  useSearchParams,
  useLocation,
} from "react-router-dom";
import {
  ArrowLeft,
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Bookmark,
  FileText,
  Pencil,
  Lightbulb,
  Link2,
  Search,
  HelpCircle,
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
import { date, type MediaAsset, type PostType } from "../lib/types";
import {
  mergeConversationMessages,
  reconcileConversationSnapshot,
} from "../lib/conversations";
import { MediaPicker, PostAttachments } from "./CommunityMedia";
import "./community.css";
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
export const POST_TYPES: { id: PostType; label: string; prompt: string }[] = [
  {
    id: "update",
    label: "Research update",
    prompt:
      "What are you exploring, testing, or learning? Share the context behind your work…",
  },
  {
    id: "question",
    label: "Ask a question",
    prompt:
      "What question could another researcher help you think through? Include what you have tried…",
  },
  {
    id: "paper",
    label: "Share a paper",
    prompt:
      "Introduce the paper. What is the main contribution, and what would you like readers to notice?",
  },
  {
    id: "milestone",
    label: "Milestone",
    prompt:
      "A first result, a new preprint, a lesson from a failed experiment. What moved your research forward?",
  },
];
const typeLabel = (type: string) =>
  POST_TYPES.find((t) => t.id === type)?.label || "Research update";
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
            disabled={busy}
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
  const location = useLocation();
  const focusId = /^#post-([a-zA-Z0-9_-]+)$/.exec(location.hash)?.[1];
  const follows = useData("follow.list", {}, !!profile);
  const papers = useData("paper.list", {}, !!profile);
  const [tab, setTab] = useState<"all" | "following" | "saved">("all"),
    [pageCursors, setPageCursors] = useState<
      Array<{ createdAt: number; id: string } | null>
    >([null]),
    [body, setBody] = useState(""),
    [postType, setPostType] = useState<PostType>("update"),
    [typeFilter, setTypeFilter] = useState("all"),
    [attachments, setAttachments] = useState<MediaAsset[]>([]),
    [uploading, setUploading] = useState(false),
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
  const { data, error, loading } = useData(
    "feed.list",
    {
      following: tab === "following",
      saved: tab === "saved",
      includePageInfo: true,
      ...(pageCursors.at(-1) ? { cursor: pageCursors.at(-1) } : {}),
    },
    !!profile && !focusId,
  );
  const focused = useData("feed.get", { id: focusId }, !!profile && !!focusId);
  useEffect(() => {
    if (!focusId || focused.data?.id !== focusId) return;
    const frame = requestAnimationFrame(() => {
      document
        .getElementById(`post-${focusId}`)
        ?.scrollIntoView({ block: "start", behavior: "instant" });
    });
    return () => cancelAnimationFrame(frame);
  }, [focusId, focused.data?.id]);
  const loadedPosts = focusId
    ? focused.data
      ? [focused.data]
      : []
    : list(Array.isArray(data) ? data : data?.posts);
  const hasMore = !focusId && !!data?.hasMore && !!data?.nextCursor;
  const posts = loadedPosts.filter(
    (p) =>
      focusId ||
      typeFilter === "all" ||
      (p.postType || "update") === typeFilter,
  );
  const feedError = focusId ? focused.error : error;
  const feedLoading = focusId ? focused.loading : loading;
  async function publish(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setComposeError("");
    try {
      await call("feed.post", {
        body: body.trim(),
        postType,
        mediaIds: attachments.map((a) => a.id),
        arxivUrl: arxivUrl.trim(),
        ...(paperId ? { paperId } : {}),
      });
      setBody("");
      setArxivUrl("");
      setPaperId("");
      setAttachments([]);
      setPostType("update");
      setPageCursors([null]);
      if (focusId) navigate("/community");
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
        title={
          focusId ? "Research in conversation." : "Your research community."
        }
        description={
          focusId
            ? "Read the context, add a perspective, and help an idea move forward."
            : "Share papers and research updates, discuss ideas, follow researchers, and take the conversation into private messages."
        }
        action={
          profile ? (
            <div className="button-row">
              <Link className="button primary" to="/researchers">
                <Users size={16} />
                Find researchers
              </Link>
              <button
                className="button"
                onClick={() => {
                  setPageCursors([null]);
                  refresh();
                }}
              >
                <RefreshCw size={16} />
                Refresh
              </button>
            </div>
          ) : undefined
        }
      />
      {!profile ? (
        <SignInCard onAuth={onAuth} title="Find your research community">
          Sign in to share your work, follow researchers, and take part in
          thoughtful conversations.
        </SignInCard>
      ) : (
        <div className="social-layout community-v2">
          <section className="social-feed">
            {!focusId && (
              <form className="card social-composer form" onSubmit={publish}>
                <div className="social-author">
                  <Avatar name={profile.name} src={profile.avatarUrl} />
                  <div>
                    <strong>What are you working on?</strong>
                    <small>
                      A question can be the start of a collaboration.
                    </small>
                    <Link
                      className="text-link"
                      to={"/researchers/" + encodeURIComponent(profile.id)}
                    >
                      View your research profile
                    </Link>
                  </div>
                </div>
                <div
                  className="post-type-choices"
                  role="group"
                  aria-label="Post type"
                >
                  {POST_TYPES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      aria-pressed={postType === t.id}
                      className={postType === t.id ? "selected" : ""}
                      disabled={busy || uploading}
                      onClick={() => setPostType(t.id)}
                    >
                      {t.id === "update" ? (
                        <Lightbulb size={14} />
                      ) : t.id === "question" ? (
                        <HelpCircle size={14} />
                      ) : t.id === "paper" ? (
                        <FileText size={14} />
                      ) : (
                        <Trophy size={14} />
                      )}{" "}
                      {t.label}
                    </button>
                  ))}
                </div>
                <label className="sr-only" htmlFor="post-body">
                  Your community post
                </label>
                <textarea
                  id="post-body"
                  required
                  disabled={busy}
                  maxLength={10000}
                  rows={4}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={
                    POST_TYPES.find((t) => t.id === postType)?.prompt
                  }
                />
                <MediaPicker
                  value={attachments}
                  onChange={setAttachments}
                  disabled={busy}
                  onBusy={setUploading}
                />
                <details className="post-link-options">
                  <summary>Add a research link or public manuscript</summary>
                  <div className="social-attachments">
                    <label>
                      arXiv paper link{" "}
                      <span className="optional">optional</span>
                      <input
                        type="url"
                        disabled={busy}
                        value={arxivUrl}
                        onChange={(e) => setArxivUrl(e.target.value)}
                        placeholder="https://arxiv.org/abs/…"
                      />
                    </label>
                    {list(papers.data).some(
                      (p) => p.visibility === "public",
                    ) && (
                      <label>
                        Attach a public manuscript
                        <select
                          disabled={busy}
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
                </details>
                <div className="social-compose-footer">
                  <span className="fine-print">
                    <Users size={14} /> Visible to signed-in community members.
                    Attachments are shared with your post. Keep confidential
                    drafts private.
                  </span>
                  <button
                    className="button primary"
                    disabled={busy || uploading || !body.trim()}
                  >
                    {busy
                      ? "Publishing…"
                      : uploading
                        ? "Uploading…"
                        : "Publish post"}
                    <ArrowUpRight size={16} />
                  </button>
                </div>
                {composeError && <ErrorBox message={composeError} />}
              </form>
            )}
            {focusId && (
              <div className="notice">
                <strong>Discussion from your notification</strong>
                <Link className="text-link" to="/community">
                  Back to the community feed <ArrowRight size={15} />
                </Link>
              </div>
            )}
            <div className="social-feed-heading">
              <div
                id="community-feed-start"
                className="category-tabs"
                role="group"
                aria-label="Feed filter"
              >
                <button
                  className={tab === "all" ? "active" : ""}
                  aria-pressed={tab === "all" && !focusId}
                  onClick={() => {
                    setTab("all");
                    setPageCursors([null]);
                    if (focusId) navigate("/community");
                  }}
                >
                  Community
                </button>
                <button
                  className={tab === "following" ? "active" : ""}
                  aria-pressed={tab === "following" && !focusId}
                  onClick={() => {
                    setTab("following");
                    setPageCursors([null]);
                    if (focusId) navigate("/community");
                  }}
                >
                  Following <span>{following.size}</span>
                </button>
                <button
                  className={tab === "saved" ? "active" : ""}
                  aria-pressed={tab === "saved" && !focusId}
                  onClick={() => {
                    setTab("saved");
                    setPageCursors([null]);
                    if (focusId) navigate("/community");
                  }}
                >
                  <Bookmark size={14} /> Saved
                </button>
              </div>
              <label className="community-type-filter">
                <span className="sr-only">Filter post type</span>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  disabled={!!focusId}
                >
                  <option value="all">All post types</option>
                  {POST_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="community-feed-context">
              {focusId
                ? "One conversation, in focus"
                : tab === "saved"
                  ? "Your private reading list · recent saved posts"
                  : tab === "following"
                    ? "Recent posts from your connections"
                    : "Recent ideas, questions, papers, and progress"}
            </p>
            {feedError && <ErrorBox message={feedError} />}{" "}
            {tab === "following" && follows.error && (
              <ErrorBox message={follows.error} />
            )}{" "}
            {feedLoading && !(focusId ? focused.data : data) ? (
              <Loading />
            ) : feedError ? null : posts.length ? (
              posts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  openDiscussion={!!focusId}
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
            ) : !feedError ? (
              <Empty
                title={
                  hasMore
                    ? "More research is ahead"
                    : pageCursors.length > 1
                      ? "No posts on this page"
                      : tab === "saved"
                        ? "A reading list for your research"
                        : typeFilter !== "all"
                          ? "Make space for this kind of conversation"
                          : tab === "following"
                            ? "Bring your people into focus"
                            : "Every research community starts with a question"
                }
                action={
                  typeFilter !== "all" ? (
                    <button
                      className="button"
                      onClick={() => setTypeFilter("all")}
                    >
                      Show all post types <ArrowRight size={16} />
                    </button>
                  ) : tab === "saved" ? (
                    <button
                      className="button"
                      onClick={() => {
                        setTab("all");
                        setPageCursors([null]);
                      }}
                    >
                      Explore community posts <ArrowRight size={16} />
                    </button>
                  ) : tab === "following" ? (
                    <Link className="button" to="/researchers">
                      Discover researchers <ArrowRight size={16} />
                    </Link>
                  ) : (
                    <button
                      className="button"
                      onClick={() => {
                        setPostType("question");
                        document.getElementById("post-body")?.focus();
                      }}
                    >
                      Share a research question <Plus size={16} />
                    </button>
                  )
                }
              >
                {hasMore
                  ? "There are no matching visible posts in this part of the feed. Continue browsing to see earlier conversations."
                  : pageCursors.length > 1
                    ? "Return to the previous page or refresh to see the newest community updates."
                    : tab === "saved"
                      ? "Save useful papers, questions, and ideas from any post. Your reading list is private to you."
                      : typeFilter !== "all"
                        ? "No posts of this type in the current view. Choose another filter, or share something you are working on."
                        : tab === "following"
                          ? "Posts from the researchers you follow will appear here."
                          : "A good question, an interesting preprint, a lesson learned: make room for someone else to build on it."}
              </Empty>
            ) : null}
            {!focusId && (hasMore || pageCursors.length > 1) && (
              <nav
                className="community-pagination"
                aria-label="Community feed pages"
              >
                {pageCursors.length > 1 && (
                  <button
                    className="button"
                    disabled={feedLoading}
                    onClick={() => {
                      setPageCursors((cursors) => cursors.slice(0, -1));
                      document
                        .getElementById("community-feed-start")
                        ?.scrollIntoView({ block: "start" });
                    }}
                  >
                    <ArrowLeft size={16} />
                    Previous page
                  </button>
                )}
                <span>Page {pageCursors.length}</span>
                {hasMore && (
                  <button
                    className="button"
                    disabled={feedLoading}
                    onClick={() => {
                      setPageCursors((cursors) => [
                        ...cursors,
                        data.nextCursor,
                      ]);
                      document
                        .getElementById("community-feed-start")
                        ?.scrollIntoView({ block: "start" });
                    }}
                  >
                    Next posts
                    <ArrowRight size={16} />
                  </button>
                )}
              </nav>
            )}
          </section>
          <aside className="right-rail">
            <section className="rail-card">
              <div className="rail-icon">
                <MessageCircle size={24} />
              </div>
              <h3>Make your research visible.</h3>
              <p>
                Research is richer when we make our thinking visible. Ask
                specific questions. Share context. Give thoughtful credit.
              </p>
              <div className="community-starters">
                <button
                  type="button"
                  onClick={() => {
                    setPostType("question");
                    document.getElementById("post-body")?.focus();
                  }}
                >
                  <HelpCircle size={16} />
                  <span>
                    Ask a precise question
                    <small>Invite another perspective</small>
                  </span>
                  <ArrowUpRight size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPostType("paper");
                    document.getElementById("post-body")?.focus();
                  }}
                >
                  <FileText size={16} />
                  <span>
                    Share a paper<small>Add the context behind it</small>
                  </span>
                  <ArrowUpRight size={14} />
                </button>
              </div>
              <div className="social-rail-stat">
                <strong>{following.size}</strong>
                <span>researchers you follow</span>
              </div>
              <Link to="/researchers" className="text-link">
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

export function PostCard({
  post,
  following,
  followUnavailable = false,
  openDiscussion = false,
  onFollow,
  onReport,
  onDelete,
  onMessage,
}: {
  post: Row;
  following: boolean;
  followUnavailable?: boolean;
  openDiscussion?: boolean;
  onFollow: () => Promise<void>;
  onReport: () => void;
  onDelete: () => void;
  onMessage: () => void;
}) {
  const { profile, call, refresh, toast } = useApp();
  const [open, setOpen] = useState(openDiscussion),
    [comment, setComment] = useState(""),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [editing, setEditing] = useState(false);
  const comments = useData("feed.comments", { id: post.id }, open, 30000);
  useEffect(() => {
    if (openDiscussion) setOpen(true);
  }, [openDiscussion]);
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
    <article className="card social-post" id={"post-" + post.id}>
      <header className="social-post-header">
        <div className="social-author">
          <Avatar
            name={post.authorName || "Researcher"}
            src={post.authorAvatarUrl}
          />
          <div>
            <Link
              className="researcher-name"
              to={"/researchers/" + encodeURIComponent(post.authorId)}
            >
              {post.authorName || "Researcher"}
            </Link>
            {post.authorHeadline && <small>{post.authorHeadline}</small>}
            <time dateTime={new Date(post.createdAt).toISOString()}>
              {time(post.createdAt)}
            </time>
          </div>
        </div>
        {post.authorId !== profile?.id ? (
          <button
            className="button compact"
            disabled={!!busy || followUnavailable}
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
      <div className="post-meta-row">
        <span className={`post-kind ${post.postType || "update"}`}>
          {typeLabel(post.postType)}
        </span>
        {post.updatedAt > post.createdAt && <small>Edited</small>}
      </div>
      <p className="social-post-body">{post.body}</p>
      <PostAttachments assets={post.attachments || []} />
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
        <button
          type="button"
          className={`icon-button ${post.saved ? "saved" : ""}`}
          disabled={!!busy}
          aria-label={post.saved ? "Unsave post" : "Save post"}
          aria-pressed={!!post.saved}
          title={post.saved ? "Remove from saved" : "Save for later"}
          onClick={() =>
            act("save", async () => {
              await call("feed.save", { id: post.id });
              refresh();
            })
          }
        >
          <Bookmark size={16} fill={post.saved ? "currentColor" : "none"} />
        </button>
        <button
          className="icon-button"
          aria-label="Copy link to post"
          title="Copy discussion link"
          onClick={() =>
            act("share", async () => {
              await navigator.clipboard.writeText(
                `${location.origin}/community#post-${encodeURIComponent(post.id)}`,
              );
              toast(
                "Discussion link copied. Members can open it after signing in.",
              );
            })
          }
        >
          <Link2 size={16} />
        </button>
        {post.authorId === profile?.id && (
          <button
            type="button"
            className="icon-button"
            aria-label="Edit post"
            title="Edit post"
            disabled={!!busy}
            onClick={() => setEditing(true)}
          >
            <Pencil size={16} />
          </button>
        )}
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
                <Avatar
                  name={c.authorName || "Researcher"}
                  src={c.authorAvatarUrl}
                />
                <div>
                  <Link
                    className="researcher-name"
                    to={"/researchers/" + encodeURIComponent(c.authorId)}
                  >
                    {c.authorName || "Researcher"}
                  </Link>
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
              disabled={!!busy}
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
      <PostEditModal
        post={post}
        open={editing}
        onClose={() => setEditing(false)}
      />
    </article>
  );
}

export function Messages({ onAuth }: { onAuth: () => void }) {
  const { profile, call, refresh, toast, demo } = useApp();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get("chat") || "";
  const chats = useData("chat.list", {}, !!profile, 15000);
  const blocks = useData("block.list", {}, !!profile && !demo);
  const [messages, setMessages] = useState<Row[]>([]),
    [loadedFor, setLoadedFor] = useState(""),
    [messageError, setMessageError] = useState(""),
    [loading, setLoading] = useState(false),
    [drafts, setDrafts] = useState<Record<string, string>>({}),
    [conversationSearch, setConversationSearch] = useState(""),
    [atBottom, setAtBottom] = useState(true),
    [newMessages, setNewMessages] = useState(0),
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
  const [peopleQuery, setPeopleQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setPeopleQuery(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const people = useData(
    "directory.list",
    { scope: "researchers", search: peopleQuery },
    !!profile && newChat,
  );
  const end = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  const nearBottom = useRef(true);
  const latestRead = useRef<Record<string, number>>({});
  const readInFlight = useRef(false);
  const sendSequence = useRef(0);
  const acknowledgedSends = useRef(new Map<string, number>());
  const draft = drafts[selectedId] || "";
  const setDraft = (value: string) =>
    setDrafts((previous) => ({ ...previous, [selectedId]: value }));
  const chat = list(chats.data).find((c) => c.id === selectedId),
    otherId =
      chat?.members?.find((id: string) => id !== profile?.id) || chat?.otherId,
    otherName = chat?.names?.[otherId] || chat?.name || "Researcher";
  const blocked = demo
    ? demoBlocked.includes(otherId)
    : list(blocks.data).some((b) => b.targetId === otherId);
  useEffect(() => {
    setMessageError("");
    nearBottom.current = true;
    setAtBottom(true);
    setNewMessages(0);
  }, [selectedId]);
  useEffect(() => {
    if (!selectedId || !profile) {
      setMessages([]);
      return;
    }
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let polling = false;
    setLoading(true);
    setLoadedFor("");
    setMessages([]);
    async function poll() {
      clearTimeout(timer);
      if (polling || stopped) return;
      if (document.visibilityState === "hidden") return;
      polling = true;
      const startedAfterSend = sendSequence.current;
      try {
        const rows = await call("chat.messages", { id: selectedId });
        if (!stopped) {
          const newerSends = new Set(
            [...acknowledgedSends.current]
              .filter(([, sequence]) => sequence > startedAfterSend)
              .map(([id]) => id),
          );
          setMessages((current) =>
            reconcileConversationSnapshot(
              current as any[],
              list(rows) as any[],
              newerSends,
            ),
          );
          for (const [id, sequence] of acknowledgedSends.current) {
            if (sequence <= startedAfterSend)
              acknowledgedSends.current.delete(id);
          }
          setLoadedFor(selectedId);
          setMessageError("");
        }
      } catch (e: any) {
        if (!stopped) setMessageError(e.message);
      } finally {
        polling = false;
        if (!stopped) {
          setLoading(false);
          timer = setTimeout(poll, 15000);
        }
      }
    }
    const resume = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", resume);
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [selectedId, profile?.id, call, tick]);
  useEffect(() => {
    if (!messages.length) return;
    if (nearBottom.current) {
      end.current?.scrollIntoView({ behavior: "auto", block: "nearest" });
      setNewMessages(0);
    } else {
      setNewMessages((count) => count + 1);
    }
  }, [messages.at(-1)?.id, selectedId]);
  const latestMessageAt =
    loadedFor === selectedId ? messages.at(-1)?.createdAt || 0 : 0;
  useEffect(() => {
    if (
      !selectedId ||
      !atBottom ||
      !latestMessageAt ||
      document.visibilityState === "hidden" ||
      readInFlight.current
    )
      return;
    if ((latestRead.current[selectedId] || 0) >= latestMessageAt) return;
    let active = true;
    readInFlight.current = true;
    void call("chat.read", { id: selectedId, through: latestMessageAt })
      .then(() => {
        latestRead.current[selectedId] = latestMessageAt;
        if (active) refresh();
      })
      .catch(() => {
        // Keep the unread state intact; the next poll will retry.
      })
      .finally(() => {
        readInFlight.current = false;
      });
    return () => {
      active = false;
    };
  }, [selectedId, latestMessageAt, atBottom, call, messages]);
  async function send(e: FormEvent) {
    e.preventDefault();
    if (!selectedId || !draft.trim() || busy || blocked) return;
    const conversationId = selectedId;
    setBusy(true);
    setMessageError("");
    try {
      const sent = await call("chat.send", {
        id: conversationId,
        body: draft.trim(),
      });
      acknowledgedSends.current.set(sent.id, ++sendSequence.current);
      setDrafts((previous) => ({ ...previous, [conversationId]: "" }));
      if (selectedRef.current === conversationId) {
        nearBottom.current = true;
        setAtBottom(true);
        setMessages((rows) => mergeConversationMessages(rows as any[], [sent]));
      }
      refresh();
    } catch (e: any) {
      if (selectedRef.current === conversationId) setMessageError(e.message);
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
      `${p.name} ${p.headline || ""} ${p.institution || ""}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const visibleChats = list(chats.data).filter((conversation) => {
    const other =
      conversation.members?.find((id: string) => id !== profile?.id) ||
      conversation.otherId;
    return `${conversation.names?.[other] || conversation.name || "Researcher"} ${conversation.lastMessage || ""}`
      .toLowerCase()
      .includes(conversationSearch.trim().toLowerCase());
  });
  return (
    <>
      <PageHeading
        eyebrow="ONE GOOD CONVERSATION"
        title="Your research, in dialogue."
        description="A private place to ask, clarify, and build a working connection."
        action={
          profile ? (
            <button
              className="button primary"
              disabled={busy}
              onClick={() => setNewChat(true)}
            >
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
          <div
            className={`chat-layout chat-v2 card ${selectedId ? "has-conversation" : ""}`}
          >
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
              <label className="chat-search">
                <Search size={16} />
                <input
                  aria-label="Search conversations"
                  placeholder="Search conversations"
                  value={conversationSearch}
                  onChange={(event) =>
                    setConversationSearch(event.target.value)
                  }
                />
              </label>
              {chats.error && <ErrorBox message={chats.error} />}{" "}
              {chats.loading && !chats.data ? (
                <Loading />
              ) : visibleChats.length ? (
                visibleChats.map((c) => {
                  const other =
                    c.members?.find((id: string) => id !== profile.id) ||
                    c.otherId;
                  const name = c.names?.[other] || c.name || "Researcher";
                  return (
                    <button
                      key={c.id}
                      disabled={busy}
                      className={`chat-list-item ${selectedId === c.id ? "active" : ""} ${c.unreadCount > 0 ? "unread" : ""}`}
                      aria-current={selectedId === c.id ? "true" : undefined}
                      onClick={() => setParams({ chat: c.id })}
                    >
                      <Avatar name={name} src={c.avatarUrls?.[other]} />
                      <div>
                        <strong>{name}</strong>
                        <p>{c.lastMessage || "Start with a hello."}</p>
                      </div>
                      <span className="chat-list-meta">
                        <time>{date(c.updatedAt || c.createdAt)}</time>
                        {c.unreadCount > 0 && (
                          <span
                            className="chat-unread-count"
                            aria-label={`${c.unreadCount} unread messages`}
                          >
                            {c.unreadCount > 99 ? "99+" : c.unreadCount}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })
              ) : (
                <div className="chat-sidebar-empty">
                  <MessageSquare size={24} />
                  <p>
                    {conversationSearch
                      ? "No conversations match your search."
                      : "A new connection starts with hello."}
                  </p>
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
                    <button
                      className="icon-button chat-back"
                      aria-label="Back to conversations"
                      onClick={() => setParams({})}
                    >
                      <ArrowLeft size={19} />
                    </button>
                    <div className="social-author">
                      <Avatar
                        name={otherName}
                        src={chat?.avatarUrls?.[otherId]}
                      />
                      <div>
                        {otherId ? (
                          <Link
                            className="researcher-name"
                            to={`/researchers/${encodeURIComponent(otherId)}`}
                          >
                            {otherName}
                          </Link>
                        ) : (
                          <strong>{otherName}</strong>
                        )}
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
                    ref={scroller}
                    role="log"
                    aria-live="polite"
                    aria-label="Conversation messages"
                    onScroll={(event) => {
                      const element = event.currentTarget;
                      const bottom =
                        element.scrollHeight -
                          element.scrollTop -
                          element.clientHeight <
                        80;
                      nearBottom.current = bottom;
                      setAtBottom(bottom);
                      if (bottom) setNewMessages(0);
                    }}
                  >
                    {loading || (loadedFor !== selectedId && !messageError) ? (
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
                  {!atBottom && newMessages > 0 && (
                    <button
                      className="chat-new-messages"
                      onClick={() => {
                        nearBottom.current = true;
                        setAtBottom(true);
                        setNewMessages(0);
                        end.current?.scrollIntoView({
                          behavior: "smooth",
                          block: "nearest",
                        });
                      }}
                    >
                      New messages <ArrowDown size={15} />
                    </button>
                  )}
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
                      disabled={busy || blocked || !chat}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(event) => {
                        if (
                          (event.ctrlKey || event.metaKey) &&
                          event.key === "Enter" &&
                          !event.nativeEvent.isComposing
                        ) {
                          event.preventDefault();
                          event.currentTarget.form?.requestSubmit();
                        }
                      }}
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
                  <p className="chat-compose-hint">
                    Enter for a new line · Ctrl or ⌘ + Enter to send. Drafts
                    stay here while you switch conversations.
                  </p>
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
        onClose={() => {
          if (!opening) {
            setNewChat(false);
            setOpenError("");
          }
        }}
        title="Start a conversation"
        description="Choose a researcher and introduce your work with care."
      >
        <form className="form" onSubmit={open}>
          <label>
            Find a researcher
            <input
              value={search}
              disabled={opening}
              onChange={(e) => {
                setSearch(e.target.value);
                setRecipient("");
              }}
              placeholder="Search name, institution, or research interests"
            />
          </label>
          {people.error && <ErrorBox message={people.error} />}
          <label>
            Researcher
            <select
              required
              value={recipient}
              disabled={opening || people.loading}
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
          {people.loading ? (
            <Loading />
          ) : !available.length && !people.error ? (
            <p className="muted">
              No matching public profiles yet. Try a different name or
              institution.
            </p>
          ) : null}
          {openError && <ErrorBox message={openError} />}
          <button
            className="button primary"
            disabled={opening || people.loading || !recipient}
          >
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
            <Link className="button" to="/researchers">
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
                    <Avatar name={p.name} src={p.avatarUrl} color={p.color} />
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
                  <Link className="button" to="/researchers">
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

function PostEditModal({
  post,
  open,
  onClose,
}: {
  post: Row;
  open: boolean;
  onClose: () => void;
}) {
  const { call, refresh, toast } = useApp();
  const [body, setBody] = useState(post.body),
    [type, setType] = useState<PostType>(post.postType || "update"),
    [assets, setAssets] = useState<MediaAsset[]>(post.attachments || []),
    [uploading, setUploading] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (open) {
      setBody(post.body);
      setType(post.postType || "update");
      setAssets(post.attachments || []);
      setError("");
    }
  }, [open, post.id]);
  const originalIds = (post.attachments || []).map((a: MediaAsset) => a.id);
  function close() {
    if (busy || uploading) return;
    for (const asset of assets)
      if (!originalIds.includes(asset.id))
        void call("media.remove", { id: asset.id }).catch(() => {});
    onClose();
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy || uploading) return;
    setBusy(true);
    setError("");
    try {
      await call("feed.edit", {
        id: post.id,
        body: body.trim(),
        postType: type,
        mediaIds: assets.map((a) => a.id),
      });
      onClose();
      refresh();
      toast("Post updated.");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open={open}
      onClose={close}
      title="Edit your post"
      description="Update the text and attachments. Existing likes and discussion stay with the post."
    >
      <form className="form" onSubmit={save}>
        <label>
          Post type
          <select
            aria-label="Post type"
            value={type}
            disabled={busy || uploading}
            onChange={(e) => setType(e.target.value as PostType)}
          >
            {POST_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Your post
          <textarea
            aria-label="Your post"
            value={body}
            required
            maxLength={10000}
            rows={5}
            disabled={busy}
            onChange={(e) => setBody(e.target.value)}
          />
        </label>
        <MediaPicker
          value={assets}
          onChange={setAssets}
          disabled={busy}
          onBusy={setUploading}
          originalIds={originalIds}
        />
        <p className="fine-print">
          Files attached here are shared with signed-in community members. Keep
          confidential manuscript drafts in your private workspace.
        </p>
        {error && <ErrorBox message={error} />}
        <div className="button-row">
          <button
            type="submit"
            className="button primary"
            disabled={busy || uploading || !body.trim()}
          >
            {busy ? "Saving…" : uploading ? "Uploading…" : "Save changes"}
          </button>
          <button
            type="button"
            className="button"
            disabled={busy || uploading}
            onClick={close}
          >
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}
