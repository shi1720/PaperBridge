import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  Search,
  ArrowUpRight,
  ArrowRight,
  SlidersHorizontal,
  Check,
  Bookmark,
  Globe,
  Clock,
  ShieldCheck,
  Plus,
  MessageSquare,
  ChevronRight,
} from "lucide-react";
import { useApp, useData } from "../lib/context";
import { CATEGORIES } from "../lib/categories";
import { Avatar, Modal, Empty, Loading, ErrorBox, Tag, External } from "./ui";
import type { Profile } from "../lib/types";
export function Discover({ onAuth }: { onAuth: () => void }) {
  const { profile, demo, call, toast, refresh } = useApp();
  const navigate = useNavigate();
  const [querySearch, setQuerySearch] = useState("");
  const [search, setSearch] = useState(""),
    [category, setCategory] = useState(""),
    [available, setAvailable] = useState(true),
    [selected, setSelected] = useState<Profile | null>(null),
    [request, setRequest] = useState<Profile | null>(null),
    [saved, setSaved] = useState<string[]>([]),
    [followingBusy, setFollowingBusy] = useState<string[]>([]);
  const follows = useData("follow.list", {}, !!profile);
  useEffect(() => {
    if (follows.data)
      setSaved(
        Array.isArray(follows.data)
          ? follows.data
          : (follows.data.following || []).map((f: any) => f.followingId),
      );
  }, [follows.data]);
  const { data, error, loading } = useData(
    "directory.list",
    { category, search: querySearch },
    !!profile,
  );
  useEffect(() => {
    const timer = setTimeout(() => setQuerySearch(search), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const people = (Array.isArray(data) ? data : data?.profiles || []).filter(
    (p: Profile) => !available || p.acceptingRequests,
  );
  const categories = [
    ["", "All disciplines"],
    ["cs.LG", "Machine learning"],
    ["cs.AI", "Artificial intelligence"],
    ["cs.CL", "Language & NLP"],
    ["cs.CV", "Computer vision"],
    ["math.CO", "Combinatorics"],
  ];
  async function follow(p: Profile) {
    if (!profile) {
      onAuth();
      return;
    }
    if (followingBusy.includes(p.id)) return;
    setFollowingBusy((current) => [...current, p.id]);
    try {
      const result = await call("follow.toggle", { id: p.id });
      const following =
        typeof result.following === "boolean"
          ? result.following
          : !saved.includes(p.id);
      setSaved((s) =>
        following ? [...new Set([...s, p.id])] : s.filter((x) => x !== p.id),
      );
      refresh();
      toast(following ? "Following " + p.name : "Unfollowed " + p.name);
    } catch (e: any) {
      toast(e.message);
    } finally {
      setFollowingBusy((current) => current.filter((id) => id !== p.id));
    }
  }
  return (
    <>
      <section className="discovery-hero">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="tiny-spark">✳</span> GREAT RESEARCH STARTS WITH A
            CONNECTION
          </p>
          <h1>
            Independent research.
            <br />
            <em>Shared possibility.</em>
          </h1>
          <p>
            Find an endorser who understands your field.
            <br />
            Get thoughtful feedback. Move your research forward.
          </p>
          <div className="hero-actions">
            <button
              className="button primary"
              onClick={() =>
                profile
                  ? document.getElementById("directory-search")?.focus()
                  : onAuth()
              }
            >
              Find potential endorsers <ArrowRight size={17} />
            </button>
            <Link to="/papers" className="text-link">
              Prepare a manuscript <ArrowUpRight size={16} />
            </Link>
          </div>
          <div className="hero-footnote">
            <ShieldCheck size={15} /> Open to researchers, with or without an
            institution.
          </div>
        </div>
        <div
          className="hero-art"
          aria-label="Connect your ideas to the research community"
        >
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="orbit-center">
            <BookMark />
          </div>
          <div className="orbit-label label-top">
            <span className="mini-icon violet">∑</span>A fresh perspective
          </div>
          <div className="orbit-label label-right">
            <span className="mini-icon peach">↗</span>Your next chapter
          </div>
          <div className="orbit-label label-bottom">
            <span className="mini-icon lime">✳</span>A shared curiosity
          </div>
          <span className="orbit-dot dot-one" />
          <span className="orbit-dot dot-two" />
          <span className="art-caption">BRIDGING IDEAS & PEOPLE</span>
        </div>
      </section>
      <div className="content-columns">
        <section className="directory">
          <div className="section-heading">
            <div>
              <div className="overline">FIND YOUR PEOPLE</div>
              <h2>
                Meet your next collaborator
                <span className="heading-dot">.</span>
              </h2>
            </div>
            <span className="count-pill">
              {demo
                ? "Demo community"
                : !profile
                  ? "Member directory"
                  : loading
                    ? "Loading profiles…"
                    : error
                      ? "Directory unavailable"
                      : `${people.length} ${people.length === 1 ? "researcher" : "researchers"}`}
            </span>
          </div>
          <div className="search-line">
            <div className="search-field">
              <Search size={18} />
              <input
                id="directory-search"
                aria-label="Search researchers"
                placeholder="Search by name, institution, or research interest"
                value={search}
                disabled={!profile}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button aria-label="Clear search" onClick={() => setSearch("")}>
                  ×
                </button>
              )}
            </div>
            <label className="filter-select">
              <SlidersHorizontal size={17} />
              <select
                aria-label="Choose discipline"
                value={category}
                disabled={!profile}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="">All categories</option>
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.id} · {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="category-tabs">
            {categories.map(([id, name]) => (
              <button
                key={id}
                className={category === id ? "active" : ""}
                disabled={!profile}
                onClick={() => setCategory(id)}
              >
                {name}
              </button>
            ))}
          </div>
          <div className="result-meta">
            <span>
              {search || category
                ? "Matching your interests"
                : "A good connection can change what comes next."}
            </span>
            <label className="switch-label">
              <input
                type="checkbox"
                checked={available}
                disabled={!profile}
                onChange={(e) => setAvailable(e.target.checked)}
              />
              <span className="switch" />
              Accepting requests
            </label>
          </div>
          {!profile ? (
            <Empty
              title="Find a connection in your field"
              action={
                <button className="button primary" onClick={onAuth}>
                  Create an account or sign in <ArrowRight size={16} />
                </button>
              }
            >
              This directory contains profiles published by participating
              researchers. Sign in to browse their categories and availability,
              or create your profile to participate. No institutional
              affiliation is required.
            </Empty>
          ) : loading ? (
            <Loading />
          ) : error ? (
            <ErrorBox message={error} />
          ) : people.length ? (
            <div className="people-grid">
              {people.map((p: Profile) => (
                <article className="person-card" key={p.id}>
                  <div className="person-top">
                    <Avatar
                      src={p.avatarUrl}
                      name={p.name}
                      color={p.color}
                      large
                    />
                    <button
                      aria-label={`${saved.includes(p.id) ? "Unfollow" : "Follow"} ${p.name}`}
                      aria-pressed={saved.includes(p.id)}
                      disabled={followingBusy.includes(p.id)}
                      className={`icon-button save ${saved.includes(p.id) ? "saved" : ""}`}
                      onClick={() => follow(p)}
                    >
                      <Bookmark
                        size={19}
                        fill={saved.includes(p.id) ? "currentColor" : "none"}
                      />
                    </button>
                  </div>
                  <button
                    className="person-name"
                    onClick={() => setSelected(p)}
                  >
                    {p.name}
                    <ArrowUpRight size={16} />
                  </button>
                  <p className="institution">
                    {p.institution || "Independent researcher"}
                  </p>
                  <p className="person-headline">
                    {p.headline ||
                      p.bio ||
                      "Open to thoughtful research connections."}
                  </p>
                  <div className="tags">
                    {p.categories.slice(0, 3).map((c) => (
                      <Tag key={c}>{c}</Tag>
                    ))}
                  </div>
                  <div className="person-footer">
                    <span
                      className={
                        p.acceptingRequests ? "availability" : "paused"
                      }
                    >
                      {p.acceptingRequests ? (
                        <>
                          <span className="status-dot" />
                          Open to requests
                        </>
                      ) : (
                        <>
                          <Clock size={13} />
                          Currently paused
                        </>
                      )}
                    </span>
                    <button
                      className="connect-button"
                      onClick={() => (profile ? setRequest(p) : onAuth())}
                      disabled={!p.acceptingRequests}
                    >
                      Request review <ArrowUpRight size={15} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <Empty
              title={
                search || category
                  ? "No matching researchers yet"
                  : available
                    ? "No researchers accepting requests yet"
                    : "No endorser profiles listed yet"
              }
              action={
                <div className="empty-actions">
                  <button
                    className="button primary"
                    onClick={() => (profile ? navigate("/settings") : onAuth())}
                  >
                    Update your researcher profile <Plus size={16} />
                  </button>
                  {(search || category) && (
                    <button
                      className="button"
                      onClick={() => {
                        setSearch("");
                        setCategory("");
                        setAvailable(false);
                      }}
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              }
            >
              {search || category
                ? "Try another category or include researchers who have paused requests."
                : "Profiles will appear here when members publish them. You can prepare your manuscript now or update your own research interests and availability."}
            </Empty>
          )}
          <div className="directory-note">
            <Globe size={16} />
            <span>
              Expertise matters more than affiliation. Independent researchers
              are welcome here.
            </span>
          </div>
        </section>
        <aside className="right-rail">
          <section className="journey-card">
            <div className="rail-icon">
              <ArrowUpRight size={23} />
            </div>
            <span className="overline">YOUR FIRST CONNECTION</span>
            <h3>
              A clearer path
              <br />
              to endorsement.
            </h3>
            <p>
              Less cold outreach.
              <br />
              More meaningful conversation.
            </p>
            <ol>
              <li>
                <span>01</span>
                <div>
                  <strong>Find your field</strong>
                  <small>Discover people with relevant expertise.</small>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <strong>Share your work</strong>
                  <small>A manuscript, a question, a conversation.</small>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <strong>Take the next step</strong>
                  <small>Complete endorsement on arXiv.</small>
                </div>
              </li>
            </ol>
            <a
              className="text-link"
              href="https://info.arxiv.org/help/endorsement.html"
              target="_blank"
              rel="noreferrer"
            >
              How endorsement works <ArrowUpRight size={15} />
            </a>
          </section>
          <section className="rail-card">
            <div className="rail-title">
              <span className="purple-spark">✳</span>
              <span>Give your paper a fresh pair of eyes.</span>
            </div>
            <p>
              Check evidence, attribution, and methods in your private review
              studio.
            </p>
            <Link to="/review" className="text-link">
              Open review studio <ArrowUpRight size={15} />
            </Link>
            <span className="byok-label">YOUR MODELS. YOUR API KEYS.</span>
          </section>
          <p className="rail-disclaimer">
            A connection here is a beginning. Endorsement eligibility is
            self-attested and confirmed on arXiv. Endorsement is not peer
            review.
          </p>
        </aside>
      </div>
      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.name || "Researcher"}
        description={selected?.institution}
      >
        {selected && (
          <div className="profile-detail">
            <Avatar
              src={selected.avatarUrl}
              name={selected.name}
              color={selected.color}
              large
            />
            <h3>{selected.headline}</h3>
            <p>{selected.bio}</p>
            <div className="tags">
              {selected.categories.map((c) => (
                <Tag key={c}>{c}</Tag>
              ))}
            </div>
            <p className="notice">
              Endorsement eligibility is self-attested. Confirm current
              privileges on arXiv.
            </p>
            {selected.arxivUrl && (
              <External href={selected.arxivUrl}>arXiv author profile</External>
            )}
            <Link
              className="text-link"
              to={`/researchers/${selected.id}`}
              onClick={() => setSelected(null)}
            >
              View full researcher profile <ArrowUpRight size={16} />
            </Link>
            <div className="button-row">
              <button
                className="button primary"
                disabled={!selected.acceptingRequests}
                onClick={() => {
                  if (!profile) onAuth();
                  else {
                    setRequest(selected);
                    setSelected(null);
                  }
                }}
              >
                Request endorsement support <ArrowRight size={16} />
              </button>
              <button
                className="button"
                onClick={async () => {
                  if (!profile) {
                    onAuth();
                    return;
                  }
                  try {
                    const chat = await call("chat.open", {
                      userId: selected.id,
                    });
                    setSelected(null);
                    navigate("/messages?chat=" + chat.id);
                  } catch (e: any) {
                    toast(e.message);
                  }
                }}
              >
                <MessageSquare size={16} />
                Message
              </button>
            </div>
          </div>
        )}
      </Modal>
      <RequestModal
        person={request}
        onClose={() => setRequest(null)}
        onDone={(id) => {
          setRequest(null);
          refresh();
          navigate("/requests/" + id);
        }}
      />
    </>
  );
}
function BookMark() {
  return (
    <svg
      viewBox="0 0 68 68"
      width="68"
      height="68"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 18C22 14 28 17 34 21C40 17 47 14 57 18V49C46 45 40 48 34 52C28 48 21 45 12 49V18Z"
        stroke="currentColor"
        strokeWidth="2.5"
      />
      <path
        d="M34 21V52M20 26L27 28M20 33L27 35M42 28L49 26M42 35L49 33"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}
function RequestModal({
  person,
  onClose,
  onDone,
}: {
  person: Profile | null;
  onClose: () => void;
  onDone: (id: string) => void;
}) {
  const { call } = useApp();
  const { data: papers } = useData("paper.list", {}, !!person);
  const [paperId, setPaperId] = useState(""),
    [message, setMessage] = useState(""),
    [url, setUrl] = useState(""),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    setPaperId("");
    setMessage("");
    setUrl("");
    setConsent(false);
    setError("");
  }, [person?.id]);
  const matches = (papers || []).filter((p: any) =>
    person?.categories.includes(p.category),
  );
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await call("request.create", {
        paperId,
        reviewerId: person?.id,
        message,
        endorsementUrl: url,
      });
      onDone(r.id);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open={!!person}
      onClose={onClose}
      title={`Request endorsement support from ${person?.name || "a researcher"}`}
      description="Share a manuscript in their category, introduce your work, and add your arXiv endorsement link if you have one."
    >
      {matches.length ? (
        <form className="form" onSubmit={submit}>
          <label>
            Your manuscript
            <select
              required
              value={paperId}
              onChange={(e) => setPaperId(e.target.value)}
            >
              <option value="">Choose a manuscript in their field</option>
              {matches.map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            A short introduction
            <textarea
              required
              minLength={30}
              maxLength={3000}
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Introduce your background, your contribution, and the feedback you’re looking for."
            />
          </label>
          <label>
            arXiv endorsement link <span className="optional">optional</span>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://arxiv.org/auth/endorse?…"
            />
            <small>Only you and this endorser can see this link.</small>
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              required
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            I agree to share this manuscript privately with {person?.name} for
            this request.
          </label>
          {error && <ErrorBox message={error} />}
          <button className="button primary" disabled={busy || !consent}>
            {busy ? "Sending request…" : "Send endorsement request"}
            <ArrowRight size={16} />
          </button>
          <p className="fine-print">
            The recipient can accept a conversation or decline. Official
            endorsement takes place on arXiv.
          </p>
        </form>
      ) : (
        <Empty
          title="Prepare your manuscript first"
          action={
            <Link onClick={onClose} to="/papers" className="button primary">
              Add a manuscript
            </Link>
          }
        >
          Choose a category that matches this endorser’s fields:{" "}
          {person?.categories.join(", ")}.
        </Empty>
      )}
    </Modal>
  );
}
