import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  FileText,
  Inbox,
  Bell,
  Compass,
  Plus,
  LockKeyhole,
  Sparkles,
  Check,
  Users,
  MessageSquare,
} from "lucide-react";
import { useApp, useData } from "../lib/context";
import { STATUS, date, type RecordData } from "../lib/types";
import { Loading, ErrorBox } from "./ui";
import "./home.css";

const activeStates = ["pending", "reviewing", "changes_requested", "accepted"];

function nextStep(request: RecordData, uid: string) {
  const reviewing = request.reviewerId === uid;
  if (request.status === "pending")
    return reviewing
      ? "Read the manuscript and reply to this invitation."
      : "Your request is with the researcher. You can add context in the discussion.";
  if (request.status === "changes_requested")
    return reviewing
      ? "Revisit the discussion when the author shares a revision."
      : "Review the feedback and prepare your next revision.";
  if (request.status === "accepted")
    return reviewing
      ? request.endorsementUrl
        ? "Complete the endorsement using the author’s official arXiv link."
        : "Ask the author for their official arXiv endorsement link."
      : "Coordinate the final step on arXiv, then report completion.";
  return "Continue the discussion and work through shared feedback.";
}

export function Home() {
  const { profile, refresh } = useApp();
  const papers = useData("paper.list", {}, !!profile);
  const requests = useData("request.list", {}, !!profile, 30000);
  const notices = useData("notifications.list", {}, !!profile, 30000);
  if (!profile) return null;
  const manuscripts: RecordData[] = papers.data || [];
  const active: RecordData[] = (requests.data || []).filter((r: RecordData) =>
    activeStates.includes(r.status),
  );
  const priority = (r: RecordData) =>
    r.reviewerId === profile.id
      ? r.status === "pending"
        ? 0
        : 1
      : r.status === "changes_requested" || r.status === "accepted"
        ? 0
        : 1;
  const queue = [...active].sort(
    (a, b) =>
      priority(a) - priority(b) ||
      (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt),
  );
  const unread = (notices.data || []).filter((n: RecordData) => !n.read).length;
  const endorser = profile.role === "endorser";
  const profileReady = !!profile.headline && profile.categories.length > 0;
  const checklist = [
    {
      done: profileReady,
      title: "Introduce your research",
      copy: "Add your fields and a short headline so people can find common ground.",
      to: "/settings",
    },
    {
      done: endorser
        ? profile.categories.length > 0 && !!profile.eligibilitySelfAttested
        : manuscripts.length > 0,
      title: endorser
        ? "Set your review availability"
        : "Add your first manuscript",
      copy: endorser
        ? "Choose your eligible categories and a capacity that fits your schedule."
        : "Upload a private PDF. Read, highlight, and keep notes in one place.",
      to: endorser ? "/settings" : "/papers?upload=1",
    },
    {
      done: (requests.data || []).length > 0,
      title: endorser
        ? "Your first review conversation"
        : "Find a relevant endorser",
      copy: endorser
        ? "New invitations will arrive in your requests and activity inbox."
        : "Explore researchers accepting requests in your arXiv category.",
      to: endorser ? "/requests" : "/discover",
    },
  ];
  return (
    <div className="workspace-home">
      <header className="home-welcome">
        <div>
          <p className="eyebrow">YOUR RESEARCH WORKSPACE</p>
          <h1>
            A little progress,
            <br />
            <em>every time you return.</em>
          </h1>
          <p>
            Welcome, {profile.name.split(" ")[0]}.{" "}
            {endorser
              ? "Your perspective can help someone take their next step."
              : "Pick up your manuscript, follow the feedback, and keep your ideas moving."}
          </p>
        </div>
        <Link
          className="button primary"
          to={endorser ? "/requests" : "/papers?upload=1"}
        >
          {endorser ? <Inbox size={18} /> : <Plus size={18} />}
          {endorser ? "Open your review desk" : "Add manuscript"}
        </Link>
      </header>

      <div className="home-stats" aria-label="Workspace overview">
        {[
          {
            icon: FileText,
            count: papers.error
              ? "—"
              : papers.loading
                ? "…"
                : manuscripts.length,
            label: "Your manuscripts",
            to: "/papers",
            hint: "Your drafts and notes",
          },
          {
            icon: Inbox,
            count: requests.error
              ? "—"
              : requests.loading
                ? "…"
                : active.length,
            label: "Active requests",
            to: "/requests",
            hint: "Conversations in progress",
          },
          {
            icon: Bell,
            count: notices.error ? "—" : notices.loading ? "…" : unread,
            label: "Unread updates",
            to: "/notifications",
            hint: "Feedback, messages, connections",
          },
        ].map(({ icon: Icon, count, label, to, hint }) => (
          <Link to={to} key={label} className="home-stat">
            <div>
              <Icon size={20} />
              <ArrowUpRight size={17} />
            </div>
            <strong>{count}</strong>
            <span>{label}</span>
            <small>{hint}</small>
          </Link>
        ))}
      </div>

      <div className="home-columns">
        <div className="home-main-column">
          <section className="home-panel">
            <div className="home-section-heading">
              <div>
                <p className="eyebrow">YOUR NEXT STEP</p>
                <h2>Keep the conversation moving.</h2>
              </div>
              <Link to="/requests" className="text-link">
                All requests <ArrowRight size={16} />
              </Link>
            </div>
            {requests.loading ? (
              <Loading />
            ) : requests.error ? (
              <>
                <ErrorBox message={requests.error} />
                <button className="button" onClick={refresh}>
                  Try again
                </button>
              </>
            ) : queue.length ? (
              <div className="home-request-list">
                {queue.slice(0, 3).map((r) => (
                  <Link
                    to={`/requests/${r.id}`}
                    key={r.id}
                    className="home-request"
                  >
                    <div className="home-request-meta">
                      <span className={`status ${r.status}`}>
                        {STATUS[r.status]}
                      </span>
                      <span>{r.category}</span>
                    </div>
                    <h3>{r.title}</h3>
                    <p>{nextStep(r, profile.id)}</p>
                    <div>
                      <span>
                        With{" "}
                        {r.reviewerId === profile.id
                          ? r.requesterName
                          : r.reviewerName}
                      </span>
                      <ArrowUpRight size={18} />
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="home-quiet-state">
                <span>
                  <Inbox size={24} />
                </span>
                <h3>
                  {endorser
                    ? "Your review desk is ready."
                    : "A good introduction starts here."}
                </h3>
                <p>
                  {endorser
                    ? "Publish your profile and set your availability. Incoming requests will appear here with a private manuscript and introduction."
                    : "Prepare a manuscript and choose a researcher in your field. Each request opens a shared space for reading, feedback, and revisions."}
                </p>
                <Link
                  className="text-link"
                  to={endorser ? "/settings" : "/discover"}
                >
                  {endorser
                    ? "Manage availability"
                    : "Explore potential endorsers"}{" "}
                  <ArrowRight size={16} />
                </Link>
              </div>
            )}
          </section>

          <section className="home-panel">
            <div className="home-section-heading">
              <div>
                <p className="eyebrow">ON YOUR DESK</p>
                <h2>Return to your research.</h2>
              </div>
              <Link to="/papers" className="text-link">
                View manuscripts <ArrowRight size={16} />
              </Link>
            </div>
            {papers.loading ? (
              <Loading />
            ) : papers.error ? (
              <>
                <ErrorBox message={papers.error} />
                <button className="button" onClick={refresh}>
                  Try again
                </button>
              </>
            ) : manuscripts.length ? (
              <div className="home-paper-list">
                {[...manuscripts]
                  .sort(
                    (a, b) =>
                      (b.updatedAt || b.createdAt) -
                      (a.updatedAt || a.createdAt),
                  )
                  .slice(0, 3)
                  .map((p) => (
                    <Link
                      to={`/papers/${p.id}`}
                      className="home-paper"
                      key={p.id}
                    >
                      <span className="home-paper-icon">
                        <FileText size={23} />
                      </span>
                      <div>
                        <h3>{p.title}</h3>
                        <span>
                          {p.category} · Version {p.version || 1} · Updated{" "}
                          {date(p.updatedAt || p.createdAt)}
                        </span>
                      </div>
                      <ArrowUpRight size={18} />
                    </Link>
                  ))}
              </div>
            ) : (
              <Link to="/papers?upload=1" className="home-upload">
                <Plus size={24} />
                <div>
                  <strong>Give your next paper a home.</strong>
                  <span>Upload a PDF to start reading and annotating.</span>
                </div>
                <ArrowRight size={18} />
              </Link>
            )}
            <p className="home-privacy">
              <LockKeyhole size={14} /> Manuscripts start private. You choose
              when to share them.
            </p>
          </section>
        </div>

        <aside className="home-side-column" aria-label="Research resources">
          {!checklist.every((item) => item.done) && (
            <section className="home-setup">
              <p className="eyebrow">MAKE YOURSELF AT HOME</p>
              <h2>A strong start.</h2>
              <ol>
                {checklist.map((item, index) => (
                  <li key={item.title}>
                    <span className={item.done ? "complete" : ""}>
                      {item.done ? <Check size={14} /> : index + 1}
                    </span>
                    <div>
                      <Link to={item.to}>
                        {item.title}
                        <ArrowUpRight size={14} />
                      </Link>
                      <p>{item.copy}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}
          <section className="home-review-card">
            <span className="home-resource-icon">
              <Sparkles size={22} />
            </span>
            <p className="eyebrow">A FRESH PERSPECTIVE</p>
            <h2>Make the next draft stronger.</h2>
            <p>
              Five AI specialists look at your evidence, attribution, methods,
              structure, and submission readiness.
            </p>
            <Link className="button" to="/review">
              Open review studio <ArrowUpRight size={16} />
            </Link>
            <small>
              Optional · Your provider key · Review before relying on findings
            </small>
          </section>
          <Link to="/community" className="home-community-card">
            <Users size={23} />
            <div>
              <strong>Research is a conversation.</strong>
              <p>
                Share a question. Find a collaborator. Learn from someone’s next
                draft.
              </p>
              <span>
                Visit the community <ArrowRight size={15} />
              </span>
            </div>
          </Link>
        </aside>
      </div>
      <div className="home-paths">
        <Link to="/discover">
          <Compass size={18} />
          <span>Find an endorser</span>
          <ArrowUpRight size={16} />
        </Link>
        <Link to="/researchers">
          <Users size={18} />
          <span>Meet researchers</span>
          <ArrowUpRight size={16} />
        </Link>
        <Link to="/messages">
          <MessageSquare size={18} />
          <span>Continue a conversation</span>
          <ArrowUpRight size={16} />
        </Link>
      </div>
    </div>
  );
}
