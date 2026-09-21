import { useState, lazy, Suspense } from "react";
import {
  Link,
  NavLink,
  Route,
  Routes,
  useNavigate,
  useLocation,
} from "react-router-dom";
import {
  Compass,
  FileText,
  Inbox,
  MessagesSquare,
  Users,
  Sparkles,
  Trophy,
  Settings,
  Bell,
  ArrowUpRight,
  ArrowRight,
  Menu,
  X,
  BookOpen,
  LogOut,
  ShieldCheck,
  PanelLeftClose,
  Plus,
} from "lucide-react";
import { useApp, useData } from "./lib/context";
import { Avatar, Modal, Empty, Loading } from "./components/ui";
import { AuthModal, Onboarding } from "./components/Auth";
import { Discover } from "./components/Discover";
import { notificationPath } from "./lib/notifications";
import { Landing } from "./components/Landing";
const Papers = lazy(() =>
  import("./components/Papers").then((m) => ({ default: m.Papers })),
);
const PaperDetail = lazy(() =>
  import("./components/Papers").then((m) => ({ default: m.PaperDetail })),
);
const Requests = lazy(() =>
  import("./components/Requests").then((m) => ({ default: m.Requests })),
);
const RequestDetail = lazy(() =>
  import("./components/Requests").then((m) => ({ default: m.RequestDetail })),
);
const Community = lazy(() =>
  import("./components/Social").then((m) => ({ default: m.Community })),
);
const Researchers = lazy(() =>
  import("./components/ResearcherProfile").then((m) => ({
    default: m.Researchers,
  })),
);
const ResearcherProfile = lazy(() =>
  import("./components/ResearcherProfile").then((m) => ({
    default: m.ResearcherProfile,
  })),
);
const Messages = lazy(() =>
  import("./components/Social").then((m) => ({ default: m.Messages })),
);
const Impact = lazy(() =>
  import("./components/Social").then((m) => ({ default: m.Impact })),
);
const SettingsPage = lazy(() =>
  import("./components/Settings").then((m) => ({ default: m.SettingsPage })),
);
const ReviewStudio = lazy(() =>
  import("./components/Settings").then((m) => ({ default: m.ReviewStudio })),
);
const nav = [
  ["/discover", "Find an endorser", Compass],
  ["/requests", "Endorsement requests", Inbox],
  ["/papers", "My manuscripts", FileText],
  ["/review", "Review studio", Sparkles],
  ["/community", "Community", Users],
  ["/messages", "Messages", MessagesSquare],
  ["/impact", "Community impact", Trophy],
] as const;
export default function App() {
  const {
      call,
      profile,
      profileError,
      refreshProfile,
      demo,
      startDemo,
      logout,
      user,
      toast,
    } = useApp(),
    navigate = useNavigate();
  const routeLocation = useLocation();
  const publicHome = routeLocation.pathname === "/" && !profile && !demo;
  const [authOpen, setAuthOpen] = useState(false),
    [mobile, setMobile] = useState(false),
    [legal, setLegal] = useState(false),
    [notices, setNotices] = useState(false);
  const [returnToAuth, setReturnToAuth] = useState(false);
  const [authIntent, setAuthIntent] = useState<{
    role: "researcher" | "endorser";
    mode: "signup" | "login";
  }>({ role: "researcher", mode: "signup" });
  const { data: notifications } = useData(
    "notifications.list",
    {},
    !!profile,
    30000,
  );
  function requireAuth(
    role: "researcher" | "endorser" = "researcher",
    mode: "signup" | "login" = "signup",
  ) {
    setAuthIntent({ role, mode });
    setAuthOpen(true);
  }
  return (
    <div className={`app ${publicHome ? "public-home" : ""}`}>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      {mobile && (
        <div className="sidebar-scrim" onClick={() => setMobile(false)} />
      )}
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <NavLink to="/" className="brand">
          <span className="brand-symbol">
            <BookOpen size={22} />
          </span>
          paperbridge<span className="brand-period">.</span>
        </NavLink>
        <button
          className="mobile-close icon-button"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        >
          <X />
        </button>
        <div className="workspace-label">YOUR RESEARCH, CONNECTED</div>
        <nav>
          {nav.map(([to, label, Icon], i) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setMobile(false)}
              className={({ isActive }) =>
                `${isActive ? "active" : ""} ${i === 4 ? "nav-divider" : ""}`
              }
            >
              <Icon size={19} />
              <span>{label}</span>
              {to === "/review" && <span className="nav-new">NEW</span>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-callout">
            <span className="small-mark">↗</span>
            <h3>
              Good research deserves
              <br />a way forward.
            </h3>
            <p>
              Help someone take their
              <br />
              next step.
            </p>
            <button
              onClick={() =>
                profile ? navigate("/settings") : requireAuth("endorser")
              }
            >
              Become an endorser <ArrowUpRight size={16} />
            </button>
          </div>
          <NavLink className="settings-link" to="/settings">
            <Settings size={18} />
            Settings & privacy
          </NavLink>
          <button className="legal-link" onClick={() => setLegal(true)}>
            Guidelines · Privacy · About
          </button>
          <div className="account">
            {profile ? (
              <>
                <Avatar name={profile.name} />
                <div>
                  <strong>{profile.name}</strong>
                  <small>
                    {profile.role === "endorser"
                      ? "Endorser workspace"
                      : "Researcher workspace"}
                  </small>
                </div>
                <button
                  className="icon-button"
                  title="Sign out"
                  onClick={() => {
                    logout();
                    navigate("/discover");
                  }}
                >
                  <LogOut size={16} />
                </button>
              </>
            ) : (
              <button
                className="button primary full"
                onClick={() => requireAuth()}
              >
                Join PaperBridge <ArrowRight size={16} />
              </button>
            )}
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-toggle"
              aria-label="Open navigation"
              onClick={() => setMobile(true)}
            >
              <Menu />
            </button>
            <span className="desktop-icon">
              <PanelLeftClose size={17} />
            </span>
            <span className="breadcrumb-divider">/</span> A little connection. A
            lot of possibility.
          </div>
          <div className="top-actions">
            <span className="independent">
              Independent minds. Shared progress.
            </span>
            {profile ? (
              <>
                <button
                  className="notification-button icon-button"
                  aria-label="Notifications"
                  onClick={() => setNotices(true)}
                >
                  <Bell size={19} />
                  {notifications?.some((x: any) => !x.read) && <i />}
                </button>
                <Avatar name={profile.name} />
              </>
            ) : (
              <button
                className="button compact"
                onClick={() => {
                  requireAuth("researcher", "login");
                }}
              >
                Sign in <ArrowUpRight size={15} />
              </button>
            )}
          </div>
        </header>
        {demo && (
          <div className="demo-banner">
            <span>INTERACTIVE DEMO</span> Fictional people and manuscripts.
            Changes stay in this session.
            <button
              onClick={() => {
                logout();
                navigate("/discover");
              }}
            >
              Exit demo <X size={14} />
            </button>
          </div>
        )}
        {user && !user.emailVerified && !demo && (
          <div className="verify-banner">
            Verify your email before sending requests or publishing posts. Check
            your inbox and spam folder.{" "}
            <button
              onClick={async () => {
                try {
                  const result = await call("auth.sendVerification");
                  toast(
                    result.alreadyVerified
                      ? "Your email is already verified. Refresh verification to continue."
                      : "Verification email queued. Check your inbox and spam folder shortly.",
                  );
                } catch (e: any) {
                  toast(e.message);
                }
              }}
            >
              Resend email
            </button>
            , then{" "}
            <button
              onClick={async () => {
                await user.reload();
                await user.getIdToken(true);
                toast("Verification status refreshed.");
                location.reload();
              }}
            >
              refresh verification
            </button>
            .
          </div>
        )}
        {user && profileError && !demo && (
          <div className="error-box" role="alert">
            {profileError}
            <div className="button-row">
              <button
                className="button"
                onClick={() =>
                  refreshProfile().catch((e: any) => toast(e.message))
                }
              >
                Retry loading profile
              </button>
              <button className="text-link" onClick={logout}>
                Sign out
              </button>
            </div>
          </div>
        )}
        <main id="main">
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route
                path="/"
                element={
                  demo || profile ? (
                    <Discover onAuth={requireAuth} />
                  ) : (
                    <Landing
                      onJoin={(role) =>
                        profile
                          ? navigate(
                              role === "endorser" ? "/settings" : "/papers",
                            )
                          : requireAuth(role)
                      }
                      onSignIn={() => requireAuth("researcher", "login")}
                      onPrivacy={() => setLegal(true)}
                    />
                  )
                }
              />
              <Route
                path="/discover"
                element={<Discover onAuth={requireAuth} />}
              />
              <Route
                path="/requests"
                element={<Requests onAuth={requireAuth} />}
              />
              <Route path="/requests/:id" element={<RequestDetail />} />
              <Route path="/papers" element={<Papers onAuth={requireAuth} />} />
              <Route path="/papers/:id" element={<PaperDetail />} />
              <Route
                path="/community"
                element={<Community onAuth={requireAuth} />}
              />
              <Route
                path="/researchers"
                element={<Researchers onAuth={requireAuth} />}
              />
              <Route
                path="/researchers/:id"
                element={<ResearcherProfile onAuth={requireAuth} />}
              />
              <Route
                path="/messages"
                element={<Messages onAuth={requireAuth} />}
              />
              <Route path="/impact" element={<Impact />} />
              <Route
                path="/settings"
                element={<SettingsPage onAuth={requireAuth} />}
              />
              <Route
                path="/review"
                element={<ReviewStudio onAuth={requireAuth} />}
              />
              <Route
                path="*"
                element={
                  <Empty
                    title="This page has moved"
                    action={
                      <NavLink to="/discover" className="button primary">
                        Find your way back
                      </NavLink>
                    }
                  >
                    Explore the community or return to your workspace.
                  </Empty>
                }
              />
            </Routes>
          </Suspense>
        </main>
        <footer>
          Built for curiosity. Open to everyone.
          <span>PaperBridge is independent of arXiv.</span>
        </footer>
      </div>
      <Onboarding authOpen={authOpen} />
      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        initialRole={authIntent.role}
        initialMode={authIntent.mode}
        onReadPolicy={() => {
          setReturnToAuth(true);
          setAuthOpen(false);
          setLegal(true);
        }}
      />
      <Modal
        open={legal}
        onClose={() => {
          setLegal(false);
          if (returnToAuth) setAuthOpen(true);
          setReturnToAuth(false);
        }}
        title="A thoughtful place for research"
        description="PaperBridge community guidelines and privacy"
      >
        <div className="legal-copy">
          <h3>Research is human</h3>
          <p>
            Be constructive, credit other people’s work, and respect a
            researcher’s decision to decline. Do not send bulk requests,
            impersonate someone, or trade payment for endorsements. Report
            unwanted messages using the report controls.
          </p>
          <h3>Endorsement happens on arXiv</h3>
          <p>
            PaperBridge facilitates introductions and manuscript discussions.
            Endorsement eligibility is self-attested and must be checked on
            arXiv. A willingness to help is not an official endorsement, peer
            review, or a promise of publication.
          </p>
          <a
            href="https://info.arxiv.org/help/endorsement.html"
            target="_blank"
            rel="noreferrer"
          >
            Read arXiv’s endorsement guidance ↗
          </a>
          <h3>Your work, your choice</h3>
          <p>
            Manuscripts are private by default. The endorser you request can
            access the manuscript during an active request. Withdrawal stops new
            access links; existing download links expire within 10 minutes. A
            recipient may have already downloaded a copy. Public posts and
            published profile details are visible to the community. Private
            messages and shared annotations are available to their participants
            and authorized service operators. Private notes are not shown to
            other researchers. Your email address is not published in the
            directory.
          </p>
          <h3>AI and your data</h3>
          <p>
            AI review requires your own provider key and explicit consent before
            manuscript text is sent to the providers selected for your review
            agents. Keys are encrypted on the server and are never returned to
            the browser. The selected provider’s data terms apply. AI findings
            are suggestions to verify, not proof or a plagiarism certification.
          </p>
          <h3>Account controls</h3>
          <p>
            Export your data, remove API keys, hide your public profile, or
            delete your account in Settings. Operational records may be retained
            for abuse prevention and email delivery diagnostics. The service
            uses Google Cloud and Firebase for identity, database and file
            storage; transactional email is sent through the configured delivery
            provider.
          </p>
          <h3>Report unwanted contact</h3>
          <p>
            Use Report on a community post or conversation to flag unwanted
            contact, impersonation, or inappropriate content for operator
            review. Use Block in a conversation to prevent new contact. A report
            does not remove content immediately, and no response time is
            guaranteed.
          </p>
          <p className="fine-print">Last updated September 21, 2026.</p>
        </div>
      </Modal>
      <Notifications
        open={notices}
        onClose={() => setNotices(false)}
        data={notifications || []}
      />
      {import.meta.env.DEV && !profile && !publicHome && (
        <button
          className="demo-floating"
          onClick={() => {
            startDemo();
            navigate("/discover");
          }}
        >
          Explore the interactive demo <ArrowUpRight size={15} />
        </button>
      )}
    </div>
  );
}
function Notifications({
  open,
  onClose,
  data,
}: {
  open: boolean;
  onClose: () => void;
  data: any[];
}) {
  const { call, refresh } = useApp();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Your notifications"
      description="Updates on your requests and conversations."
    >
      {data.length ? (
        <>
          <button
            className="text-link"
            onClick={async () => {
              await call("notifications.read");
              refresh();
            }}
          >
            Mark all as read
          </button>
          {data.map((n) => (
            <article className="notification" key={n.id}>
              <Bell size={17} />
              <div>
                <strong>{n.title || "Research update"}</strong>
                <p>{n.body}</p>
                {notificationPath(n.link) && (
                  <Link
                    className="text-link"
                    to={notificationPath(n.link)!}
                    onClick={onClose}
                  >
                    Open update <ArrowRight size={14} />
                  </Link>
                )}
                {n.emailStatus && (
                  <small className="email-status">
                    Email:{" "}
                    {n.emailStatus === "sent"
                      ? "accepted by delivery provider"
                      : n.emailStatus}
                    {n.emailIssue ? ` · ${n.emailIssue}` : ""}
                  </small>
                )}
              </div>
            </article>
          ))}
        </>
      ) : (
        <Empty title="You’re all caught up">
          New messages and request updates will appear here.
        </Empty>
      )}
    </Modal>
  );
}
