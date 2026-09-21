import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowRight,
  Check,
  MessageSquare,
  UserPlus,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { useApp, useData } from "../lib/context";
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
  if (loading || !person) return <Loading />;
  const own = person.id === profile.id;
  return (
    <>
      <PageHeading
        eyebrow="RESEARCHER PROFILE"
        title={person.name}
        description={
          person.headline || "A member of the PaperBridge research community."
        }
      />
      <section className="card researcher-profile">
        <div className="researcher-profile-identity">
          <Avatar name={person.name} color={person.color} large />
          <div>
            <strong>{person.institution || "Independent researcher"}</strong>
            <p>
              {person.role === "endorser"
                ? "Participating endorser"
                : "Researcher"}
            </p>
          </div>
        </div>
        <h2>About the research</h2>
        <p className="researcher-bio">
          {person.bio || "This researcher has not added a bio yet."}
        </p>
        <div className="tags">
          {(person.categories || []).map((category: string) => (
            <Tag key={category}>
              {category} ·{" "}
              {CATEGORIES.find((c) => c.id === category)?.name || category}
            </Tag>
          ))}
        </div>
        <div className="button-row researcher-links">
          {person.arxivUrl && (
            <External href={person.arxivUrl}>arXiv author profile</External>
          )}
          {person.orcid && (
            <External
              href={"https://orcid.org/" + encodeURIComponent(person.orcid)}
            >
              ORCID · {person.orcid}
            </External>
          )}
        </div>
        {own && !person.publicProfile && (
          <p className="notice">
            Your profile is private. Other members cannot open this page. You
            can change its visibility in Settings.
          </p>
        )}
        {person.role === "endorser" && (
          <p className="notice">
            {person.acceptingRequests
              ? "Accepting endorsement requests."
              : "Endorsement requests are currently paused."}{" "}
            Eligibility is self-attested; confirm category-specific privileges
            on arXiv.
          </p>
        )}
        {actionError && <ErrorBox message={actionError} />}
        {follows.error && !own && <ErrorBox message={follows.error} />}
        <div className="button-row">
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
                {following ? <Check size={16} /> : <UserPlus size={16} />}
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
          <Link className="text-link" to="/community">
            Back to the community <ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </>
  );
}

export function Researchers({ onAuth }: { onAuth: () => void }) {
  const { profile } = useApp();
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
          {loading ? (
            <Loading />
          ) : error ? (
            <ErrorBox message={error} />
          ) : data?.length ? (
            <div className="people-grid">
              {data.map((p: any) => (
                <article className="person-card" key={p.id}>
                  <Avatar name={p.name} color={p.color} large />
                  <h2>
                    <Link
                      className="researcher-name"
                      to={"/researchers/" + encodeURIComponent(p.id)}
                    >
                      {p.name}
                    </Link>
                  </h2>
                  <p className="institution">
                    {p.institution || "Independent researcher"}
                  </p>
                  <p className="person-headline">
                    {p.headline ||
                      "Explore this researcher’s interests and background."}
                  </p>
                  <div className="tags">
                    {p.categories.map((c: string) => (
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
                  : "Help this research community grow"
              }
              action={
                <Link className="button" to="/settings">
                  Build your research profile <ArrowRight size={16} />
                </Link>
              }
            >
              {search || category
                ? "Try another category or a shorter name. Only profiles members choose to publish appear here."
                : "Introduce your research and choose whether to make your profile visible to other members."}
            </Empty>
          )}
        </>
      )}
    </>
  );
}
