import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  type ReactNode,
} from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { auth, serverCall } from "./firebase";
import { demoCall, demoProfile } from "./demo";
import type { Profile } from "./types";
type Context = {
  user: User | null;
  profile: Profile | null;
  demo: boolean;
  loading: boolean;
  profileError: string;
  call: (a: string, p?: any) => Promise<any>;
  refreshProfile: () => Promise<void>;
  startDemo: () => void;
  logout: () => Promise<void>;
  toast: (s: string) => void;
  revision: number;
  refresh: () => void;
};
const AppContext = createContext<Context>(null!);
// Fictional fixtures are strictly a local development/testing capability.
const demoAllowed = import.meta.env.DEV;
export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null),
    [profile, setProfile] = useState<Profile | null>(null),
    [demo, setDemo] = useState(
      demoAllowed && new URLSearchParams(location.search).get("demo") === "1",
    ),
    [loading, setLoading] = useState(true),
    [profileError, setProfileError] = useState(""),
    [notice, setNotice] = useState(""),
    [revision, setRevision] = useState(0);
  const profileSequence = useRef(0);
  useEffect(
    () =>
      onAuthStateChanged(auth, async (u) => {
        const sequence = ++profileSequence.current;
        setUser(u);
        setProfile(null);
        setProfileError("");
        setLoading(!!u);
        if (!u) return;
        try {
          const result = await serverCall("profile.get");
          if (sequence === profileSequence.current) setProfile(result);
        } catch (e: any) {
          if (sequence === profileSequence.current)
            setProfileError(
              e.message || "Your profile could not load. Try again.",
            );
        } finally {
          if (sequence === profileSequence.current) setLoading(false);
        }
      }),
    [],
  );
  useEffect(() => {
    if (notice) {
      const t = setTimeout(() => setNotice(""), 5500);
      return () => clearTimeout(t);
    }
  }, [notice]);
  async function refreshProfile() {
    if (demoAllowed && demo) {
      setProfile({ ...demoProfile });
      return;
    }
    if (!auth.currentUser) return;
    const sequence = ++profileSequence.current;
    try {
      const result = await serverCall("profile.get");
      if (sequence === profileSequence.current) {
        setProfile(result);
        setProfileError("");
      }
    } catch (e: any) {
      if (sequence === profileSequence.current) setProfileError(e.message);
      throw e;
    } finally {
      if (sequence === profileSequence.current) setLoading(false);
    }
  }
  const value: Context = {
    user,
    profile: demoAllowed && demo ? demoProfile : profile,
    demo: demoAllowed && demo,
    loading,
    profileError,
    call: demoAllowed && demo ? demoCall : serverCall,
    refreshProfile,
    startDemo: () => {
      if (!demoAllowed) return;
      setDemo(true);
      setRevision((n) => n + 1);
    },
    logout: async () => {
      setDemo(false);
      await signOut(auth);
      setRevision((n) => n + 1);
    },
    toast: setNotice,
    revision,
    refresh: () => setRevision((n) => n + 1),
  };
  return (
    <AppContext.Provider value={value}>
      {children}
      {notice && (
        <div className="toast" role="status">
          {notice}
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            ×
          </button>
        </div>
      )}
    </AppContext.Provider>
  );
}
export const useApp = () => useContext(AppContext);
export function useData(
  action: string,
  payload: any = {},
  enabled = true,
  interval = 0,
) {
  const { call, revision, profile, demo, user } = useApp();
  const key = JSON.stringify(payload);
  const scope = JSON.stringify([
    action,
    key,
    demo ? "demo" : user?.uid || profile?.id || "anonymous",
    enabled,
  ]);
  const [state, setState] = useState<{
    scope: string;
    data: any;
    error: string;
    loading: boolean;
  }>({
    scope: "",
    data: null,
    error: "",
    loading: enabled,
  });
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (!enabled) {
      setState({ scope, data: null, error: "", loading: false });
      return;
    }
    // Refresh in place, but never expose a previous record/account's data or error.
    setState((previous) =>
      previous.scope === scope
        ? {
            ...previous,
            error: "",
            loading:
              previous.loading || (!!previous.error && previous.data === null),
          }
        : { scope, data: null, error: "", loading: true },
    );
    let fetching = false;
    async function fetchData() {
      if (fetching || !active) return;
      fetching = true;
      clearTimeout(timer);
      try {
        const result = await call(action, JSON.parse(key));
        if (active)
          setState({ scope, data: result, error: "", loading: false });
      } catch (e: any) {
        if (active)
          setState((previous) => ({
            scope,
            data: previous.scope === scope ? previous.data : null,
            error: e.message || "Unable to load. Please try again.",
            loading: false,
          }));
      } finally {
        fetching = false;
        if (active && interval)
          timer = setTimeout(() => {
            if (document.visibilityState === "visible") void fetchData();
          }, interval);
      }
    }
    function resume() {
      if (document.visibilityState === "visible") void fetchData();
    }
    if (interval) {
      window.addEventListener("focus", resume);
      window.addEventListener("online", resume);
      document.addEventListener("visibilitychange", resume);
    }
    void fetchData();
    return () => {
      active = false;
      clearTimeout(timer);
      window.removeEventListener("focus", resume);
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [action, key, call, revision, enabled, interval, scope]);
  return state.scope === scope && enabled
    ? { data: state.data, error: state.error, loading: state.loading }
    : { data: null, error: "", loading: enabled };
}
