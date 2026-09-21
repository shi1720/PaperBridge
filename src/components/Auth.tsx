import { useEffect, useState } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
} from "firebase/auth";
import { auth, serviceReady, googleAuthEnabled } from "../lib/firebase";
import { useApp } from "../lib/context";
import { authErrorMessage } from "../lib/auth-errors";
import { Modal, ErrorBox } from "./ui";
import { GraduationCap, Microscope, ArrowRight } from "lucide-react";
export function AuthModal({
  open,
  onClose,
  initialRole = "researcher",
  initialMode = "signup",
  onReadPolicy,
}: {
  open: boolean;
  onClose: () => void;
  initialRole?: "researcher" | "endorser";
  initialMode?: "signup" | "login";
  onReadPolicy: () => void;
}) {
  const { call, refreshProfile, toast } = useApp();
  const [mode, setMode] = useState<"signup" | "login" | "reset">("signup"),
    [role, setRole] = useState<"" | "researcher" | "endorser">(""),
    [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [googleBusy, setGoogleBusy] = useState(false),
    [success, setSuccess] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setError("");
      setSuccess("");
    }
  }, [open, initialRole, initialMode]);
  useEffect(() => setRole(""), [initialRole]);
  async function finish() {
    await refreshProfile();
    onClose();
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "signup" && !role) {
      setError("Choose researcher or endorser before creating your account.");
      return;
    }
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      if (mode === "reset") {
        await call("auth.sendPasswordReset", { email });
        setSuccess(
          "If an account exists, a password reset email is on its way. Check your inbox and spam folder.",
        );
        setMode("login");
      } else if (mode === "login") {
        await signInWithEmailAndPassword(auth, email, password);
        await finish();
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
        await call("profile.save", {
          profile: {
            name,
            role,
            headline: "",
            institution: "",
            bio: "",
            categories: [],
            acceptingRequests: false,
            weeklyCapacity: 2,
            publicProfile: true,
            arxivUrl: "",
            orcid: "",
          },
        });
        await call("auth.sendVerification");
        toast(
          "Account created. Verification email queued; check your inbox and spam folder shortly.",
        );
        await finish();
      }
    } catch (e: any) {
      setError(
        e.code?.startsWith("auth/")
          ? authErrorMessage(e)
          : e.message || authErrorMessage(e),
      );
    } finally {
      setBusy(false);
    }
  }
  async function google() {
    if (mode === "signup" && !role) {
      setError("Choose researcher or endorser before continuing with Google.");
      return;
    }
    setBusy(true);
    setGoogleBusy(true);
    setError("");
    setSuccess("");
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      // Called directly from the button click to preserve browser user activation.
      const r = await signInWithPopup(auth, provider);
      const p = await call("profile.get");
      // A first-time user can enter through Sign in too. Leave that profile
      // uncreated until Onboarding collects an explicit role after OAuth.
      if (!p && mode === "signup" && role)
        await call("profile.save", {
          profile: {
            name: r.user.displayName || "Researcher",
            role,
            institution: "",
            categories: [],
            acceptingRequests: false,
            weeklyCapacity: 2,
            publicProfile: true,
          },
        });
      await finish();
    } catch (e: any) {
      setError(
        e.code?.startsWith("auth/")
          ? authErrorMessage(e)
          : "Google sign-in succeeded, but your profile could not load. Try again to finish setting up your workspace.",
      );
    } finally {
      setBusy(false);
      setGoogleBusy(false);
    }
  }
  if (!serviceReady)
    return (
      <Modal
        open={open}
        onClose={onClose}
        title="Account registration is not open yet"
        description="PaperBridge is preparing to welcome researchers and endorsers."
      >
        <p className="notice">
          Account services are not available yet. You can read about the
          research workflow and privacy controls while we finish setup. No
          account has been created and no manuscript has been collected.
        </p>
        <button className="button primary" onClick={onClose}>
          Back to PaperBridge <ArrowRight size={16} />
        </button>
      </Modal>
    );
  return (
    <Modal
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      title={
        mode === "signup"
          ? "Your next chapter starts here"
          : mode === "reset"
            ? "Reset your password"
            : "Welcome back"
      }
      description="A place for researchers, with or without an institution."
    >
      <div className="segmented">
        <button
          disabled={busy}
          className={mode === "signup" ? "active" : ""}
          onClick={() => setMode("signup")}
        >
          Create account
        </button>
        <button
          disabled={busy}
          className={mode === "login" ? "active" : ""}
          onClick={() => setMode("login")}
        >
          Sign in
        </button>
      </div>
      {mode === "signup" && (
        <fieldset
          className="auth-role-choice"
          aria-describedby="auth-role-help"
        >
          <legend>Choose your role · required</legend>
          <p id="auth-role-help" className="auth-role-help">
            {role
              ? `Selected: ${role === "endorser" ? "Researcher & endorser" : "Researcher"}. This role will be used for Google or email signup.`
              : "Select researcher or endorser before continuing with Google or email. Endorsers can also use all researcher features."}
          </p>
          <div className="role-options">
            <button
              type="button"
              disabled={busy}
              aria-pressed={role === "researcher"}
              className={role === "researcher" ? "selected" : ""}
              onClick={() => setRole("researcher")}
            >
              <Microscope />
              <strong>I’m a researcher</strong>
              <small>Find support for your work</small>
            </button>
            <button
              type="button"
              disabled={busy}
              aria-pressed={role === "endorser"}
              className={role === "endorser" ? "selected" : ""}
              onClick={() => setRole("endorser")}
            >
              <GraduationCap />
              <strong>I can help endorse</strong>
              <small>Researcher & endorser · Support emerging research</small>
            </button>
          </div>
        </fieldset>
      )}
      {mode !== "reset" && googleAuthEnabled && (
        <>
          <button
            type="button"
            className="button google"
            aria-describedby={mode === "signup" ? "auth-role-help" : undefined}
            disabled={busy || (mode === "signup" && !role)}
            onClick={google}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.89-1.74 2.98-4.31 2.98-7.36Z"
              />
              <path
                fill="#34A853"
                d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.04.97-3.38.97-2.61 0-4.83-1.77-5.62-4.15H3.04v2.59A10 10 0 0 0 12 22Z"
              />
              <path
                fill="#FBBC05"
                d="M6.38 13.9a6 6 0 0 1 0-3.8V7.51H3.04a10 10 0 0 0 0 8.98l3.34-2.59Z"
              />
              <path
                fill="#EA4335"
                d="M12 5.95c1.47 0 2.79.51 3.82 1.51l2.87-2.86A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.96 5.51l3.34 2.59C7.17 7.72 9.39 5.95 12 5.95Z"
              />
            </svg>
            {googleBusy ? "Connecting to Google…" : "Continue with Google"}
          </button>
          <div className="auth-divider">
            <span>or continue with email</span>
          </div>
        </>
      )}
      <form onSubmit={submit} className="form">
        {success && (
          <p className="notice" role="status">
            {success}
          </p>
        )}
        {mode === "signup" && (
          <label>
            Full name
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              maxLength={100}
            />
          </label>
        )}
        <label>
          Email address
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </label>
        {mode !== "reset" && (
          <label>
            Password
            <input
              type="password"
              required
              minLength={10}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={
                mode === "signup" ? "new-password" : "current-password"
              }
            />
            {mode === "signup" && <small>Use at least 10 characters.</small>}
          </label>
        )}
        {error && <ErrorBox message={error} />}
        <button
          disabled={busy || (mode === "signup" && !role)}
          className="button primary"
        >
          {busy
            ? "Please wait…"
            : mode === "signup"
              ? "Create your account"
              : mode === "reset"
                ? "Send reset link"
                : "Sign in"}
          <ArrowRight size={16} />
        </button>
        {mode === "login" && (
          <button
            type="button"
            disabled={busy}
            className="text-link"
            onClick={() => setMode("reset")}
          >
            Forgot password?
          </button>
        )}
      </form>
      <p className="fine-print">
        By creating an account, you agree to follow the community guidelines.
        Review how your profile and research data are handled before joining.
      </p>
      <button
        type="button"
        className="text-link"
        disabled={busy}
        onClick={onReadPolicy}
      >
        Read guidelines & privacy <ArrowRight size={15} />
      </button>
      <p className="fine-print">PaperBridge is independent of arXiv.</p>
    </Modal>
  );
}
export function Onboarding({ authOpen }: { authOpen: boolean }) {
  const {
    user,
    profile,
    loading,
    profileError,
    demo,
    call,
    refreshProfile,
    logout,
  } = useApp();
  const [name, setName] = useState(""),
    [role, setRole] = useState<"" | "researcher" | "endorser">(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    setName(user?.displayName || "");
    setRole("");
    setError("");
  }, [user?.uid, user?.displayName]);
  const open =
    serviceReady &&
    !!user &&
    !profile &&
    !profileError &&
    !loading &&
    !demo &&
    !authOpen;
  return (
    <Modal
      open={open}
      onClose={() => {
        if (!busy) void logout();
      }}
      title="Let’s finish your research profile"
      description="Google or email sign-in is ready. Choose researcher or endorser to finish creating your account."
    >
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!role) {
            setError("Choose researcher or endorser to complete your profile.");
            return;
          }
          setBusy(true);
          setError("");
          try {
            await call("profile.save", {
              profile: {
                name: name || user?.displayName || "Researcher",
                role,
                institution: "",
                categories: [],
                acceptingRequests: false,
                weeklyCapacity: 2,
                publicProfile: true,
              },
            });
            await refreshProfile();
          } catch (e: any) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Full name
          <input
            required
            value={name}
            disabled={busy}
            onChange={(e) => setName(e.target.value)}
            placeholder={user?.displayName || "Your name"}
            maxLength={100}
          />
        </label>
        <label>
          Your role · required
          <select
            required
            disabled={busy}
            value={role}
            onChange={(e) =>
              setRole(e.target.value as "" | "researcher" | "endorser")
            }
          >
            <option value="" disabled>
              Select researcher or endorser
            </option>
            <option value="researcher">Researcher</option>
            <option value="endorser">Researcher & endorser</option>
          </select>
        </label>
        {error && <ErrorBox message={error} />}
        <button className="button primary" disabled={busy || !role}>
          {busy ? "Saving…" : "Complete profile"}
          <ArrowRight size={16} />
        </button>
        <button
          type="button"
          className="text-link"
          disabled={busy}
          onClick={logout}
        >
          Sign out
        </button>
      </form>
    </Modal>
  );
}
