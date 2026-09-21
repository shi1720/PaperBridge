import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  type ReactNode,
} from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { auth, serverCall, serviceReady } from "./firebase";
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
export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null),
    [profile, setProfile] = useState<Profile | null>(null),
    [demo, setDemo] = useState(
      new URLSearchParams(location.search).get("demo") === "1" ||
        (!serviceReady && import.meta.env.PROD),
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
    if (demo) {
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
    profile: demo ? demoProfile : profile,
    demo,
    loading,
    profileError,
    call: demo ? demoCall : serverCall,
    refreshProfile,
    startDemo: () => {
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
  const { call, revision } = useApp();
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const key = JSON.stringify(payload);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (!enabled) {
      setLoading(false);
      setData(null);
      return;
    }
    setLoading(true);
    setError("");
    async function fetchData() {
      try {
        const result = await call(action, JSON.parse(key));
        if (active) {
          setData(result);
          setError("");
        }
      } catch (e: any) {
        if (active) setError(e.message || "Unable to load. Please try again.");
      } finally {
        if (active) {
          setLoading(false);
          if (interval)
            timer = setTimeout(() => {
              if (document.visibilityState === "visible") void fetchData();
              else timer = setTimeout(fetchData, interval);
            }, interval);
        }
      }
    }
    void fetchData();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [action, key, call, revision, enabled, interval]);
  return { data, error, loading };
}
