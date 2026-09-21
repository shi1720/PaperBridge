import { useEffect, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  ArrowRight,
  Check,
  MessageSquare,
  UserPlus,
  Search,
  SlidersHorizontal,
  MessageCircle,
  BookOpen,
  MapPin,
  ArrowLeft,
} from "lucide-react";
import { useApp, useData } from "../lib/context";
import { PostAttachments } from "./CommunityMedia";
import { date } from "../lib/types";
import "./community.css";
import { CATEGORIES } from "../lib/categories";
import {
  Avatar,
  Empty,
  ErrorBox,
  External,
  Loading,
  PageHeading,
  Tag,
} from "./ui";

export function ResearcherProfile({ onAuth }: { onAuth: () => void }) {
  const { id } = useParams();
  const { profile, call, refresh } = useApp();
  const navigate = useNavigate();
  const {
    data: person,
    error,
    loading,
  } = useData("profile.get", { id }, !!profile && !!id);
  const follows = useData("follow.list", {}, !!profile);
  const activity = useData("feed.list", { authorId: id }, !!profile && !!id);
  const [busy, setBusy] = useState(""),
    [actionError, setActionError] = useState("");
  const following = Array.isArray(follows.data)
    ? follows.data.includes(id)
    : (follows.data?.following || []).some((f: any) => f.followingId === id);
  async function act(action: "follow" | "message") {
    setBusy(action);
    setActionError("");
    try {
      if (action === "follow") {
        await call("follow.toggle", { id });
        refresh();
      } else {
        const chat = await call("chat.open", { userId: id });
        navigate("/messages?chat=" + encodeURIComponent(chat.id));
      }
    } catch (e: any) {
      setActionError(e.message);
    } finally {
      setBusy("");
    }
  }
  if (!profile)
    return (
      <Empty
        title="Meet the researcher behind the work"
        action={
          <button className="button primary" onClick={onAuth}>
            Sign in or create a profile <ArrowRight size={16} />
          </button>
        }
      >
        Sign in to view participating researchers’ profiles, follow their
        updates, and start a conversation.
      </Empty>
    );
  if (error)
    return (
      <>
        <ErrorBox message={error} />
        <Link className="text-link" to="/community">
          Back to the research community
        </Link>
      </>
    );
  if (!person || (loading && person.id !== id)) return <Loading />;
  const own = person.id === profile.id;
  return (
    <>
      <Link className="back-link" to="/researchers">
        <ArrowLeft size={16} />
        All researchers
      </Link>
      <div className="profile-social-layout">
        <section className="card researcher-profile-v2">
          <div className="researcher-profile-cover" aria-hidden="true" />
          <div className="researcher-profile-main">
            <div className="researcher-profile-identity">
              <Avatar
                name={person.name}
                src={person.avatarUrl}
                color={person.color}
                large
              />
              <div>
                <h1>{person.name}</h1>
                <p>
                  {person.role === "endorser"
                    ? "Researcher · Participating endorser"
                    : "Researcher"}
                </p>
              </div>
            </div>
            {person.headline && (
              <p className="profile-headline">{person.headline}</p>
            )}
            <p className="profile-institution">
              <MapPin size={14} />
              {person.institution || "Independent researcher"}
            </p>
            <div className="button-row profile-social-actions">
              {own ? (
                <Link className="button primary" to="/settings">
                  Edit your research profile <ArrowRight size={16} />
                </Link>
              ) : (
                <>
                  <button
                    className="button primary"
                    disabled={!!busy || follows.loading || !!follows.error}
                    aria-pressed={following}
                    onClick={() => act("follow")}
                  >
                    {following ? <Check size={16} /> : <UserPlus size={16} />}{" "}
                    {busy === "follow"
                      ? "Updating…"
                      : following
                        ? "Following"
                        : "Follow researcher"}
                  </button>
                  <button
                    className="button"
                    disabled={!!busy}
                    onClick={() => act("message")}
                  >
                    <MessageSquare size={16} />
                    {busy === "message" ? "Opening…" : "Message researcher"}
                  </button>
                </>
              )}
            </div>
            {own && follows.data && (
              <div className="profile-network-summary">
                <Link to="/researchers?network=following">
                  <strong>
                    {Array.isArray(follows.data)
                      ? follows.data.length
                      : follows.data.following?.length || 0}
                  </strong>{" "}
                  following <ArrowRight size={13} />
                </Link>
                {!Array.isArray(follows.data) && (
                  <span>
                    <strong>{follows.data.followers?.length || 0}</strong>{" "}
                    followers
                  </span>
                )}
              </div>
            )}
            {actionError && <ErrorBox message={actionError} />}{" "}
            {follows.error && !own && <ErrorBox message={follows.error} />}
            <h3>ABOUT THE RESEARCH</h3>
            <p className="researcher-bio">
              {person.bio || "This researcher has not added a bio yet."}
            </p>
            {!!person.categories?.length && (
              <>
                <h3>RESEARCH INTERESTS</h3>
                <div className="tags">
                  {person.categories.map((category: string) => (
                    <Tag key={category}>
                      {category} ·{" "}
                      {CATEGORIES.find((c) => c.id === category)?.name ||
                        category}
                    </Tag>
                  ))}
                </div>
              </>
            )}
            {(person.arxivUrl || person.orcid) && (
              <>
                <h3>RESEARCH ELSEWHERE</h3>
                <div className="button-row researcher-links">
                  {person.arxivUrl && (
                    <External href={person.arxivUrl}>
                      arXiv author profile
                    </External>
                  )}
                  {person.orcid && (
                    <External
                      href={
                        "https://orcid.org/" + encodeURIComponent(person.orcid)
                      }
                    >
                      ORCID · {person.orcid}
                    </External>
                  )}
                </div>
              </>
            )}
            {own && !person.publicProfile && (
              <p className="notice">
                Your profile is private. Other members cannot open this page.
                You can change its visibility in Settings.
              </p>
            )}
            {person.role === "endorser" && (
              <div className="notice">
                {person.acceptingRequests
                  ? "Accepting endorsement requests."
                  : "Endorsement requests are currently paused."}{" "}
                Eligibility is self-attested; confirm category-specific
                privileges on arXiv.
                {!own && person.acceptingRequests && (
                  <Link
                    className="text-link profile-endorsement-link"
                    to="/discover"
                  >
                    Explore endorsement support <ArrowRight size={14} />
                  </Link>
                )}
              </div>
            )}
          </div>
        </section>
        <section
          className="card profile-activity"
          aria-label="Researcher activity"
        >
          <div className="profile-activity-heading">
            <MessageCircle size={20} />
            <h2>Research in the open</h2>
          </div>
          <p className="fine-print">Recent posts shared with the community</p>
          {activity.loading ? (
            <Loading />
          ) : activity.error ? (
            <ErrorBox message={activity.error} />
          ) : activity.data?.length ? (
            activity.data.slice(0, 6).map((post: any) => (
              <article className="profile-activity-post" key={post.id}>
                <div className="post-meta-row">
                  <span className={`post-kind ${post.postType || "update"}`}>
                    {{
                      update: "Research update",
                      question: "Question",
                      paper: "Paper",
                      milestone: "Milestone",
                    }[post.postType as string] || "Research update"}
                  </span>
                  <time className="profile-post-date">
                    {date(post.createdAt)}
                  </time>
                </div>
                <p>{post.body}</p>
                <PostAttachments assets={post.attachments || []} />
                <div className="button-row">
                  <span>
                    {post.commentCount || 0}{" "}
                    {(post.commentCount || 0) === 1 ? "reply" : "replies"}
                  </span>
                  <Link
                    className="text-link"
                    to={"/community#post-" + encodeURIComponent(post.id)}
                  >
                    Open discussion <ArrowRight size={14} />
                  </Link>
                </div>
              </article>
            ))
          ) : (
            <div className="profile-activity-empty">
              <BookOpen size={26} />
              <h3>
                {own
                  ? "Let people in on your process."
                  : "The conversation is still ahead."}
              </h3>
              <p>
                {own
                  ? "Share a question, a useful paper, or a small step forward. Your posts will appear here."
                  : "This researcher has not shared any community posts yet."}
              </p>
              {own && (
                <Link className="button" to="/community">
                  Share your first update <ArrowRight size={15} />
                </Link>
              )}
            </div>
          )}
          {!!activity.data?.length && (
            <Link className="text-link profile-more-community" to="/community">
              Explore more research conversations <ArrowRight size={15} />
            </Link>
          )}
        </section>
      </div>
    </>
  );
}

export function Researchers({ onAuth }: { onAuth: () => void }) {
  const { profile } = useApp();
  const [params, setParams] = useSearchParams();
  const network = params.get("network") === "following" ? "following" : "all";
  const follows = useData("follow.list", {}, !!profile);
  const following = new Set<string>(
    Array.isArray(follows.data)
      ? follows.data
      : (follows.data?.following || []).map((item: any) => item.followingId),
  );
  const [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const { data, error, loading } = useData(
    "directory.list",
    { scope: "researchers", search: query, category },
    !!profile,
  );
  const people = (Array.isArray(data) ? data : []).filter(
    (person: any) => network === "all" || following.has(person.id),
  );
  return (
    <>
      <PageHeading
        eyebrow="MEET THE RESEARCH COMMUNITY"
        title="People behind the papers."
        description="Discover public profiles from researchers and endorsers. Explore their work, follow their updates, or start a conversation."
        action={
          <Link className="button" to="/community">
            Open community feed <ArrowRight size={16} />
          </Link>
        }
      />
      {!profile ? (
        <Empty
          title="Build your research network"
          action={
            <button className="button primary" onClick={onAuth}>
              Create a profile or sign in <ArrowRight size={16} />
            </button>
          }
        >
          Connect with participating researchers across institutions and
          independent research. Profiles are visible to signed-in members when
          their owners choose to publish them.
        </Empty>
      ) : (
        <>
          <div
            className="category-tabs researcher-network-tabs"
            role="group"
            aria-label="Researcher network"
          >
            <button
              className={network === "all" ? "active" : ""}
              aria-pressed={network === "all"}
              onClick={() => setParams({})}
            >
              Discover people
            </button>
            <button
              className={network === "following" ? "active" : ""}
              aria-pressed={network === "following"}
              onClick={() => setParams({ network: "following" })}
            >
              Following <span>{following.size}</span>
            </button>
          </div>
          <div className="search-line">
            <label className="search-field">
              <Search size={18} />
              <input
                aria-label="Search community researchers"
                placeholder="Name, institution, or research headline"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <label className="filter-select">
              <SlidersHorizontal size={17} />
              <select
                aria-label="Filter research category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="">All research categories</option>
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.id} · {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="fine-print">
            Looking for endorsement support?{" "}
            <Link className="text-link" to="/discover">
              Find potential endorsers accepting requests.
            </Link>
          </p>
          {loading || (network === "following" && follows.loading) ? (
            <Loading />
          ) : error || (network === "following" && follows.error) ? (
            <ErrorBox message={error || follows.error} />
          ) : people.length ? (
            <div className="people-grid researchers-v2">
              {people.map((p: any) => (
                <article className="person-card" key={p.id}>
                  <Avatar
                    src={p.avatarUrl}
                    name={p.name}
                    color={p.color}
                    large
                  />
                  <h2>
                    <Link
                      className="researcher-name"
                      to={"/researchers/" + encodeURIComponent(p.id)}
                    >
                      {p.name}
                    </Link>
                  </h2>
                  <span className="post-kind">
                    {p.role === "endorser"
                      ? "Researcher · Endorser"
                      : "Researcher"}
                  </span>
                  <p className="institution">
                    {p.institution || "Independent researcher"}
                  </p>
                  <p className="person-headline">
                    {p.headline ||
                      "Explore this researcher’s interests and background."}
                  </p>
                  <div className="tags">
                    {(p.categories || []).map((c: string) => (
                      <Tag key={c}>{c}</Tag>
                    ))}
                  </div>
                  <Link
                    className="text-link"
                    to={"/researchers/" + encodeURIComponent(p.id)}
                  >
                    View research profile <ArrowRight size={16} />
                  </Link>
                </article>
              ))}
            </div>
          ) : (
            <Empty
              title={
                search || category
                  ? "No matching public profiles"
                  : network === "following"
                    ? "Your research circle starts here"
                    : "Help this research community grow"
              }
              action={
                network === "following" ? (
                  <button className="button" onClick={() => setParams({})}>
                    Discover researchers <ArrowRight size={16} />
                  </button>
                ) : (
                  <Link className="button" to="/settings">
                    Build your research profile <ArrowRight size={16} />
                  </Link>
                )
              }
            >
              {network === "following"
                ? "Follow researchers from their profiles or community posts. Matching public profiles from your connections appear here."
                : search || category
                  ? "Try another category or a shorter name. Only profiles members choose to publish appear here."
                  : "Introduce your research and choose whether to make your profile visible to other members."}
            </Empty>
          )}
        </>
      )}
    </>
  );
}
