import { useState, useEffect, useRef, lazy, Suspense } from "react";
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
  Home as HomeIcon,
} from "lucide-react";
import { useApp, useData } from "./lib/context";
import { Avatar, Modal, Empty, Loading } from "./components/ui";
import { AuthModal, Onboarding } from "./components/Auth";
import { Discover } from "./components/Discover";
import { Home } from "./components/Home";
import { NotificationsPage } from "./components/Notifications";
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
  ["/", "Overview", HomeIcon],
  ["/discover", "Find an endorser", Compass],
  ["/requests", "Endorsement requests", Inbox],
  ["/papers", "My manuscripts", FileText],
  ["/review", "Review studio", Sparkles],
  ["/community", "Community", Users],
  ["/messages", "Messages", MessagesSquare],
  ["/notifications", "Activity", Bell],
  ["/impact", "Community impact", Trophy],
] as const;
export default function App() {
  const {
      call,
      profile,
      loading,
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
    [legal, setLegal] = useState(false);
  const [returnToAuth, setReturnToAuth] = useState(false);
  const [compactNavigation, setCompactNavigation] = useState(
    () => window.matchMedia("(max-width: 1024px)").matches,
  );
  const sidebarRef = useRef<HTMLElement>(null);
  const navigationTrigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 1024px)");
    const update = () => {
      setCompactNavigation(query.matches);
      if (!query.matches) setMobile(false);
    };
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => setMobile(false), [routeLocation.pathname]);
  useEffect(() => {
    if (!mobile || !compactNavigation) return;
    const sidebar = sidebarRef.current;
    if (!sidebar) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = requestAnimationFrame(() => {
      sidebar.querySelector<HTMLButtonElement>(".mobile-close")?.focus();
    });
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobile(false);
      }
      if (event.key !== "Tab") return;
      const controls = Array.from(
        sidebar.querySelectorAll<HTMLElement>(
          'a[href], button:not(:disabled), [tabindex="0"]',
        ),
      ).filter((element) => element.getClientRects().length > 0);
      const current = controls.indexOf(document.activeElement as HTMLElement);
      const next = event.shiftKey
        ? (current - 1 + controls.length) % controls.length
        : (current + 1) % controls.length;
      event.preventDefault();
      controls[next]?.focus();
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKey);
      if (window.matchMedia("(max-width: 1024px)").matches)
        navigationTrigger.current?.focus();
    };
  }, [mobile, compactNavigation]);
  const [authIntent, setAuthIntent] = useState<{
    role: "researcher" | "endorser";
    mode: "signup" | "login";
  }>({ role: "researcher", mode: "signup" });
  const { data: notifications } = useData(
    "notifications.list",
    {},
    !!profile,
    15000,
  );
  const unreadCount = (notifications || []).filter((n: any) => !n.read).length;
  const currentPage =
    routeLocation.pathname === "/"
      ? "Overview"
      : nav.find(
          ([path]) => path !== "/" && routeLocation.pathname.startsWith(path),
        )?.[1] ||
        (routeLocation.pathname.startsWith("/researchers")
          ? "Researcher network"
          : "Settings & privacy");
  useEffect(() => {
    if (!routeLocation.hash) window.scrollTo({ top: 0, behavior: "instant" });
    document.title = publicHome
      ? "PaperBridge — Build a stronger paper. Find your path to arXiv."
      : `${currentPage} · PaperBridge`;
  }, [routeLocation.pathname, currentPage, publicHome]);
  function requireAuth(
    role: "researcher" | "endorser" = "researcher",
    mode: "signup" | "login" = "signup",
  ) {
    setMobile(false);
    setAuthIntent({ role, mode });
    setAuthOpen(true);
  }
  if (loading && !demo)
    return (
      <main id="main">
        <Loading />
      </main>
    );
  return (
    <div className={`app ${publicHome ? "public-home" : ""}`}>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      {mobile && (
        <div className="sidebar-scrim" onClick={() => setMobile(false)} />
      )}
      <aside
        id="workspace-navigation"
        ref={sidebarRef}
        className={`sidebar ${mobile ? "open" : ""}`}
        inert={compactNavigation && !mobile}
        role={compactNavigation && mobile ? "dialog" : undefined}
        aria-modal={compactNavigation && mobile ? true : undefined}
        aria-label="Workspace navigation"
      >
        <NavLink to="/" className="brand" onClick={() => setMobile(false)}>
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
        <nav aria-label="Main navigation">
          {nav.map(([to, label, Icon]) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              onClick={() => setMobile(false)}
              className={({ isActive }) =>
                `${isActive ? "active" : ""} ${to === "/community" ? "nav-divider" : ""}`
              }
            >
              <Icon size={19} />
              <span>{label}</span>
              {to === "/notifications" && unreadCount > 0 && (
                <span
                  className="nav-unread"
                  aria-label={`${unreadCount} unread updates`}
                >
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
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
              onClick={() => {
                setMobile(false);
                profile ? navigate("/settings") : requireAuth("endorser");
              }}
            >
              Become an endorser <ArrowUpRight size={16} />
            </button>
          </div>
          <NavLink
            className="settings-link"
            to="/settings"
            onClick={() => setMobile(false)}
          >
            <Settings size={18} />
            Settings & privacy
          </NavLink>
          <button
            className="legal-link"
            onClick={() => {
              setMobile(false);
              setLegal(true);
            }}
          >
            Guidelines · Privacy · About
          </button>
          <div className="account">
            {profile ? (
              <>
                <Avatar src={profile.avatarUrl} name={profile.name} />
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
      <div className="main-shell" inert={compactNavigation && mobile}>
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-toggle"
              ref={navigationTrigger}
              aria-label="Open navigation"
              aria-controls="workspace-navigation"
              aria-expanded={mobile}
              onClick={() => setMobile(true)}
            >
              <Menu />
            </button>
            <span className="desktop-icon" aria-hidden="true">
              <BookOpen size={17} />
            </span>
            <span className="breadcrumb-divider">/</span>
            <span className="current-page-name">{currentPage}</span>
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
                  onClick={() => navigate("/notifications")}
                >
                  <Bell size={19} />
                  {notifications?.some((x: any) => !x.read) && <i />}
                </button>
                <Link
                  to={`/researchers/${profile.id}`}
                  className="top-profile-link"
                  aria-label="View your profile"
                >
                  <Avatar src={profile.avatarUrl} name={profile.name} />
                </Link>
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
                    <Home />
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
              <Route
                path="/notifications"
                element={<NotificationsPage onAuth={requireAuth} />}
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
            recipient may have already downloaded a copy. Community post
            attachments and profile photos are shared with signed-in members
            according to their parent post or profile visibility. Access links
            expire within ten minutes; downloaded copies cannot be recalled.
            Public posts and published profile details are visible to the
            community. Private messages and shared annotations are available to
            their participants and authorized service operators. Private notes
            are not shown to other researchers. Shared notes created within a
            request are scoped to its author and selected researcher. The
            request discussion and revision history stay in the app; email
            provides notifications. Your email address is not published in the
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
