import { useEffect, useState } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail,
} from "firebase/auth";
import { auth, serviceReady, googleAuthEnabled } from "../lib/firebase";
import { useApp } from "../lib/context";
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
    [role, setRole] = useState("researcher"),
    [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setRole(initialRole);
      setError("");
    }
  }, [open, initialRole, initialMode]);
  async function finish() {
    await refreshProfile();
    onClose();
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mode === "reset") {
        await sendPasswordResetEmail(auth, email);
        toast("If an account exists, a password reset email is on its way.");
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
            institution: "Independent researcher",
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
      setError(e.message.replace("Firebase: ", ""));
    } finally {
      setBusy(false);
    }
  }
  async function google() {
    setBusy(true);
    setError("");
    try {
      const r = await signInWithPopup(auth, new GoogleAuthProvider());
      const p = await call("profile.get");
      if (!p)
        await call("profile.save", {
          profile: {
            name: r.user.displayName || "Researcher",
            role,
            institution: "Independent researcher",
            categories: [],
            acceptingRequests: false,
            weeklyCapacity: 2,
            publicProfile: true,
          },
        });
      await finish();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
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
      onClose={onClose}
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
          className={mode === "signup" ? "active" : ""}
          onClick={() => setMode("signup")}
        >
          Create account
        </button>
        <button
          className={mode === "login" ? "active" : ""}
          onClick={() => setMode("login")}
        >
          Sign in
        </button>
      </div>
      {mode === "signup" && (
        <div className="role-options">
          <button
            type="button"
            className={role === "researcher" ? "selected" : ""}
            onClick={() => setRole("researcher")}
          >
            <Microscope />
            <strong>I’m a researcher</strong>
            <small>Find support for your work</small>
          </button>
          <button
            type="button"
            className={role === "endorser" ? "selected" : ""}
            onClick={() => setRole("endorser")}
          >
            <GraduationCap />
            <strong>I can help endorse</strong>
            <small>Support emerging research</small>
          </button>
        </div>
      )}
      <form onSubmit={submit} className="form">
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
        <button disabled={busy} className="button primary">
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
            className="text-link"
            onClick={() => setMode("reset")}
          >
            Forgot password?
          </button>
        )}
      </form>
      {mode !== "reset" && googleAuthEnabled && (
        <button className="button google" disabled={busy} onClick={google}>
          Continue with Google
        </button>
      )}
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
    [role, setRole] = useState("researcher"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
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
        void logout();
      }}
      title="Let’s finish your research profile"
      description="Your sign-in is ready. Add a name and role to complete your workspace."
    >
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await call("profile.save", {
              profile: {
                name: name || user?.displayName || "Researcher",
                role,
                institution: "Independent researcher",
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
            onChange={(e) => setName(e.target.value)}
            placeholder={user?.displayName || "Your name"}
            maxLength={100}
          />
        </label>
        <label>
          Your role
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="researcher">Researcher</option>
            <option value="endorser">Researcher & endorser</option>
          </select>
        </label>
        {error && <ErrorBox message={error} />}
        <button className="button primary" disabled={busy}>
          {busy ? "Saving…" : "Complete profile"}
          <ArrowRight size={16} />
        </button>
        <button type="button" className="text-link" onClick={logout}>
          Sign out
        </button>
      </form>
    </Modal>
  );
}
