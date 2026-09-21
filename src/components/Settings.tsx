import { useEffect, useRef, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import {
  Settings,
  KeyRound,
  ShieldCheck,
  Download,
  Trash2,
  Save,
  Plus,
  X,
  Sparkles,
  ArrowRight,
  ArrowUpRight,
  Check,
  BookOpen,
  ScanSearch,
  FlaskConical,
  MessageSquare,
  Play,
  RefreshCw,
  Lock,
} from "lucide-react";
import { useApp, useData } from "../lib/context";
import { CATEGORIES } from "../lib/categories";
import { PageHeading, Empty, Loading, ErrorBox, Modal, Tag } from "./ui";
import { ProfilePhotoEditor } from "./ProfilePhotoEditor";
import {
  reviewAgents as agentNames,
  reviewStages,
  recommendedReviewModel,
  modelReasoningOptions,
  downloadReview,
} from "../lib/ai-review";
import "./ai-review.css";
export function SettingsPage({ onAuth }: { onAuth: () => void }) {
  const { profile, call, refreshProfile, toast, demo, logout } = useApp();
  const [tab, setTab] = useState(
      new URLSearchParams(location.search).get("tab") === "ai"
        ? "ai"
        : "profile",
    ),
    [form, setForm] = useState<any>(profile),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false),
    [deleteText, setDeleteText] = useState("");
  const previousProfile = useRef(profile);
  useEffect(() => {
    const before = previousProfile.current;
    setForm((current: any) => {
      if (!current || !profile || current.id !== profile.id) return profile;
      // A separately saved photo must not discard an unfinished bio or headline.
      const edited = Object.fromEntries(
        Object.entries(current).filter(
          ([key, value]) =>
            !["avatarId", "avatarUrl"].includes(key) &&
            JSON.stringify(value) !== JSON.stringify(before?.[key]),
        ),
      );
      return { ...profile, ...edited };
    });
    previousProfile.current = profile;
  }, [profile]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await call("profile.save", { profile: form });
      await refreshProfile();
      toast("Your profile is saved.");
    } catch (e: any) {
      toast(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function download() {
    try {
      const data = await call("account.export");
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "paperbridge-export.json";
      a.click();
      URL.revokeObjectURL(url);
      toast("Your data export is ready.");
    } catch (e: any) {
      toast(e.message);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="MAKE YOURSELF AT HOME"
        title="Your research. Your choices."
        description="Shape your profile, set your availability, and keep control of your data."
        action={
          profile ? (
            <Link
              className="button"
              to={"/researchers/" + encodeURIComponent(profile.id)}
            >
              View your profile <ArrowUpRight size={16} />
            </Link>
          ) : undefined
        }
      />
      <div className="tabs settings-tabs" aria-label="Settings sections">
        {[
          ["profile", "Research profile"],
          ["ai", "AI & API keys"],
          ["privacy", "Privacy & account"],
        ].map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {!profile ? (
        <Empty
          title="Make PaperBridge yours"
          action={
            <button className="button primary" onClick={onAuth}>
              Sign in or create an account
            </button>
          }
        >
          Your profile, review preferences, and privacy controls live here.
        </Empty>
      ) : tab === "ai" ? (
        <AISettings />
      ) : tab === "privacy" ? (
        <div className="settings-layout">
          <section className="panel">
            <h2>Control your footprint</h2>
            <div className="settings-item">
              <div>
                <h3>Export your data</h3>
                <p>
                  Download your profile, manuscripts, requests, notes and
                  activity as JSON. API keys are never included.
                </p>
              </div>
              <button className="button" onClick={download}>
                <Download size={16} />
                Export
              </button>
            </div>
            <div className="settings-item">
              <div>
                <h3>Public profile</h3>
                <p>
                  Choose whether other researchers can discover you. Your email
                  address stays private.
                </p>
              </div>
              <label className="switch-label">
                <input
                  aria-label="Public profile"
                  type="checkbox"
                  checked={form?.publicProfile ?? true}
                  onChange={async (e) => {
                    const value = e.target.checked;
                    try {
                      await call("profile.save", {
                        profile: { ...form, publicProfile: value },
                      });
                      await refreshProfile();
                      toast("Visibility updated.");
                    } catch (e: any) {
                      toast(e.message);
                    }
                  }}
                />
                <span className="switch" />
              </label>
            </div>
            <div className="settings-item">
              <div>
                <h3>Delete your account</h3>
                <p>
                  Remove your account, uploaded files, private notes, and saved
                  provider keys. Shared records are anonymized. You’ll need to
                  have signed in within the last five minutes.
                </p>
              </div>
              <button
                className="button danger"
                onClick={() => setConfirm(true)}
              >
                <Trash2 size={16} />
                Delete
              </button>
            </div>
          </section>
          <aside className="rail-card">
            <ShieldCheck />
            <h3>Private by design</h3>
            <p>
              Your unpublished work is shared only with the reviewers you
              choose. AI review requires separate permission every time.
            </p>
            <p>
              Withdrawing a request revokes access. Previously downloaded copies
              cannot be recalled.
            </p>
          </aside>
        </div>
      ) : (
        <form className="settings-layout" onSubmit={save}>
          <section className="panel form">
            <ProfilePhotoEditor />
            <h2>The person behind the research</h2>
            <div className="form-grid">
              <label>
                Full name
                <input
                  required
                  maxLength={100}
                  value={form?.name || ""}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
              <label>
                Your role
                <select
                  value={form?.role}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      role: e.target.value,
                      acceptingRequests: false,
                    })
                  }
                >
                  <option value="researcher">Researcher</option>
                  <option value="endorser">Researcher & endorser</option>
                </select>
              </label>
            </div>
            <label>
              Research headline
              <input
                maxLength={180}
                value={form?.headline || ""}
                onChange={(e) => setForm({ ...form, headline: e.target.value })}
                placeholder="What questions keep you curious?"
              />
            </label>
            <label>
              Institution or affiliation
              <input
                maxLength={180}
                value={form?.institution || ""}
                onChange={(e) =>
                  setForm({ ...form, institution: e.target.value })
                }
                placeholder="Independent researcher is welcome here"
              />
            </label>
            <label>
              About your research
              <textarea
                maxLength={3000}
                rows={4}
                value={form?.bio || ""}
                onChange={(e) => setForm({ ...form, bio: e.target.value })}
              />
            </label>
            <label>
              Research categories
              <select
                value=""
                onChange={(e) => {
                  if (
                    e.target.value &&
                    !form.categories.includes(e.target.value)
                  )
                    setForm({
                      ...form,
                      categories: [...form.categories, e.target.value],
                    });
                }}
              >
                <option value="">Add a category</option>
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.id} · {c.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="tags">
              {form?.categories?.map((c: string) => (
                <span className="tag removable" key={c}>
                  {c}
                  <button
                    type="button"
                    aria-label={"Remove " + c}
                    onClick={() =>
                      setForm({
                        ...form,
                        categories: form.categories.filter(
                          (x: string) => x !== c,
                        ),
                      })
                    }
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
            <div className="form-grid">
              <label>
                arXiv author profile
                <input
                  type="url"
                  value={form?.arxivUrl || ""}
                  onChange={(e) =>
                    setForm({ ...form, arxivUrl: e.target.value })
                  }
                  placeholder="https://arxiv.org/a/…"
                />
              </label>
              <label>
                ORCID identifier
                <input
                  value={form?.orcid || ""}
                  onChange={(e) => setForm({ ...form, orcid: e.target.value })}
                  placeholder="0000-0000-0000-0000"
                />
              </label>
            </div>
            <button className="button primary" disabled={busy}>
              <Save size={16} />
              {busy ? "Saving…" : "Save your profile"}
            </button>
          </section>
          <aside>
            <section className="panel availability-settings">
              <div className="rail-icon">
                <Settings size={22} />
              </div>
              <h3>Make space on your terms.</h3>
              <p>
                Set the pace that works for you. New requests stop when you
                pause or reach capacity.
              </p>
              {form?.role === "endorser" ? (
                <>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={!!form.eligibilitySelfAttested}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          eligibilitySelfAttested: e.target.checked,
                          acceptingRequests:
                            e.target.checked && form.acceptingRequests,
                        })
                      }
                    />
                    I have checked my current arXiv endorsement eligibility for
                    the categories I selected.
                  </label>
                  <label className="switch-label">
                    <input
                      type="checkbox"
                      checked={form.acceptingRequests}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          acceptingRequests: e.target.checked,
                        })
                      }
                    />
                    <span className="switch" />
                    Accepting new requests
                  </label>
                  <label>
                    Weekly request limit
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={form.weeklyCapacity || 3}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          weeklyCapacity: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                  <p className="fine-print">
                    Eligibility is self-attested, not verified by PaperBridge.
                    Categories and endorsement domains are not always identical.
                  </p>
                </>
              ) : (
                <p className="notice">
                  Switch your role to “Researcher & endorser” to make yourself
                  available.
                </p>
              )}
              <a
                href="https://info.arxiv.org/help/endorsement.html"
                target="_blank"
                rel="noreferrer"
                className="text-link"
              >
                Check arXiv eligibility <ArrowUpRight size={15} />
              </a>
            </section>
          </aside>
        </form>
      )}
      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Delete your PaperBridge account?"
        description="This permanently removes your account and private research data. Download an export first if you need a copy."
      >
        <label className="form">
          Type DELETE to confirm
          <input
            value={deleteText}
            onChange={(e) => setDeleteText(e.target.value)}
          />
        </label>
        <div className="button-row">
          <button className="button" onClick={() => setConfirm(false)}>
            Keep my account
          </button>
          <button
            disabled={deleteText !== "DELETE" || busy || demo}
            className="button danger"
            onClick={async () => {
              setBusy(true);
              try {
                const result = await call("account.delete");
                await logout();
                setConfirm(false);
                toast(
                  result.pending
                    ? "Account deletion started. Remaining work will finish automatically."
                    : "Your account has been deleted.",
                );
              } catch (e: any) {
                toast(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Delete permanently
          </button>
        </div>
        {demo && (
          <p className="fine-print">
            Account deletion is unavailable in the demo.
          </p>
        )}
      </Modal>
    </>
  );
}
const providers: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Google Gemini",
};
type Catalog = { models: { id: string; name: string }[]; fetchedAt: number };
function AISettings() {
  const { call, toast, refresh, demo } = useApp();
  const { data, error, loading } = useData("ai.settings");
  const [provider, setProvider] = useState("openai"),
    [key, setKey] = useState(""),
    [busy, setBusy] = useState(false),
    [models, setModels] = useState<Record<string, Catalog>>({}),
    [agents, setAgents] = useState<any>({}),
    [catalogBusy, setCatalogBusy] = useState<Record<string, boolean>>({}),
    [catalogErrors, setCatalogErrors] = useState<Record<string, string>>({}),
    [actionError, setActionError] = useState("");
  const keys = (data?.keys || []) as { provider: string; updatedAt: number }[];
  const keySignature = JSON.stringify(keys);
  const connected = new Set(keys.map((k) => k.provider));
  useEffect(() => {
    if (data?.agents) setAgents(data.agents);
  }, [data]);
  async function loadModels(p: string) {
    setCatalogBusy((v) => ({ ...v, [p]: true }));
    setCatalogErrors((v) => ({ ...v, [p]: "" }));
    try {
      const r = await call("ai.models", { provider: p });
      setModels((m) => ({
        ...m,
        [p]: { models: r.models || [], fetchedAt: r.fetchedAt || Date.now() },
      }));
    } catch (e: any) {
      setCatalogErrors((v) => ({ ...v, [p]: e.message }));
    } finally {
      setCatalogBusy((v) => ({ ...v, [p]: false }));
    }
  }
  useEffect(() => {
    if (demo) return;
    for (const k of keys) void loadModels(k.provider);
  }, [keySignature, call, demo]);
  async function saveKey(e: React.FormEvent) {
    e.preventDefault();
    if (demo) return;
    setBusy(true);
    setActionError("");
    const submittedKey = key;
    setKey("");
    try {
      const result = await call("ai.key.save", { provider, key: submittedKey });
      setModels((m) => ({
        ...m,
        [provider]: { models: result.models || [], fetchedAt: Date.now() },
      }));
      refresh();
      toast("API key validated and stored encrypted.");
    } catch (e: any) {
      setActionError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function removeKey(p: string) {
    setBusy(true);
    setActionError("");
    try {
      await call("ai.key.delete", { provider: p });
      setModels((m) => {
        const next = { ...m };
        delete next[p];
        return next;
      });
      refresh();
      toast(
        "Provider key removed. Reviews using this provider require a new key.",
      );
    } catch (e: any) {
      setActionError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const valid = Object.keys(agentNames).every(
    (id) =>
      connected.has(agents[id]?.provider) &&
      models[agents[id]?.provider]?.models.some(
        (m) => m.id === agents[id]?.model,
      ),
  );
  if (loading && !data) return <Loading />;
  return (
    <div className="settings-layout">
      <section className="panel form">
        <h2>Bring your own intelligence</h2>
        <p className="muted">
          Connect OpenAI, Anthropic, or Gemini. Choose a provider and model for
          each review perspective. Usage is billed by your provider.
        </p>
        {error && <ErrorBox message={error} />}{" "}
        {actionError && <ErrorBox message={actionError} />}
        <form className="form" onSubmit={saveKey}>
          <div className="form-grid">
            <label>
              Provider
              <select
                disabled={busy}
                value={provider}
                onChange={(e) => {
                  setProvider(e.target.value);
                  setKey("");
                  setActionError("");
                }}
              >
                {Object.entries(providers).map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              API key
              <input
                required
                disabled={demo || busy}
                type="password"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={512}
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder={
                  demo ? "Unavailable in demo" : "Paste a provider API key"
                }
              />
            </label>
          </div>
          <button
            className="button primary"
            disabled={busy || demo || !key.trim()}
          >
            <KeyRound size={16} />
            {busy ? "Connecting…" : "Validate and save encrypted key"}
          </button>
        </form>
        {demo && (
          <p className="notice">
            Connect API keys in your real account. The demo never sends
            manuscripts to AI providers.
          </p>
        )}
        <div className="connected-keys">
          {keys.map((k) => (
            <div key={k.provider}>
              <div className="settings-item">
                <span>
                  <Check size={16} /> {providers[k.provider] || k.provider}{" "}
                  connected
                  <small className="muted">
                    {" "}
                    · saved {new Date(k.updatedAt).toLocaleDateString()}
                  </small>
                </span>
                <div className="button-row">
                  <button
                    className="text-link"
                    disabled={catalogBusy[k.provider] || busy}
                    onClick={() => loadModels(k.provider)}
                  >
                    {catalogBusy[k.provider] ? "Refreshing…" : "Refresh models"}
                  </button>
                  <button
                    className="icon-button danger"
                    disabled={busy}
                    aria-label={"Remove " + k.provider + " key"}
                    onClick={() => removeKey(k.provider)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              {models[k.provider] && (
                <p className="fine-print">
                  {models[k.provider].models.length} models available to your
                  account · refreshed{" "}
                  {new Date(models[k.provider].fetchedAt).toLocaleString()}
                </p>
              )}
              {catalogErrors[k.provider] && (
                <ErrorBox message={catalogErrors[k.provider]} />
              )}
            </div>
          ))}
        </div>
        <div className="ai-recommendation">
          <h3>Five specialists, one revision plan</h3>
          <p>
            Recommended: GPT-6 Astra with medium reasoning. Model choices are
            explicit and never silently replaced.
          </p>
          <button
            className="button"
            disabled={
              demo ||
              busy ||
              !models.openai?.models.some(
                (m) => m.id === recommendedReviewModel,
              )
            }
            onClick={() =>
              setAgents(
                Object.fromEntries(
                  Object.keys(agentNames).map((id) => [
                    id,
                    {
                      provider: "openai",
                      model: recommendedReviewModel,
                      reasoningEffort: "medium",
                    },
                  ]),
                ),
              )
            }
          >
            <Sparkles size={16} /> Use GPT-6 Astra · medium for all specialists
          </button>
          {!models.openai?.models.some(
            (m) => m.id === recommendedReviewModel,
          ) && (
            <small>
              Connect OpenAI and refresh its catalog to confirm Astra access.
              You can choose other available models below.
            </small>
          )}
        </div>
        {Object.entries(agentNames).map(([id, name]) => {
          const p = agents[id]?.provider || "openai";
          const available = models[p]?.models || [];
          return (
            <div className="agent-config" key={id}>
              <strong>{name}</strong>
              <div className="form-grid">
                <label>
                  Provider for {name}
                  <select
                    aria-label={`Provider for ${name}`}
                    disabled={busy || demo}
                    value={p}
                    onChange={(e) =>
                      setAgents({
                        ...agents,
                        [id]: { provider: e.target.value, model: "" },
                      })
                    }
                  >
                    {Object.entries(providers).map(([pid, pname]) => (
                      <option key={pid} value={pid}>
                        {pname}
                        {connected.has(pid) ? "" : " · key needed"}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Model for {name}
                  <select
                    aria-label={`Model for ${name}`}
                    disabled={
                      demo || busy || catalogBusy[p] || !connected.has(p)
                    }
                    value={agents[id]?.model || ""}
                    onChange={(e) =>
                      setAgents({
                        ...agents,
                        [id]: {
                          provider: p,
                          model: e.target.value,
                          ...(modelReasoningOptions(p, e.target.value).length
                            ? { reasoningEffort: "medium" }
                            : {}),
                        },
                      })
                    }
                  >
                    <option value="">
                      {catalogBusy[p]
                        ? "Loading available models…"
                        : connected.has(p)
                          ? "Select an available model"
                          : "Connect this provider first"}
                    </option>
                    {agents[id]?.model &&
                      !available.some((m) => m.id === agents[id].model) && (
                        <option value={agents[id].model}>
                          {agents[id].model} · availability not confirmed
                        </option>
                      )}
                    {[...available]
                      .sort((a, b) =>
                        b.id.localeCompare(a.id, undefined, { numeric: true }),
                      )
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name === m.id ? m.id : `${m.name} (${m.id})`}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
              {modelReasoningOptions(p, agents[id]?.model || "").length > 0 && (
                <label>
                  Reasoning effort for {name}
                  <select
                    aria-label={`Reasoning effort for ${name}`}
                    value={agents[id]?.reasoningEffort || "medium"}
                    disabled={busy || demo}
                    onChange={(e) =>
                      setAgents({
                        ...agents,
                        [id]: {
                          ...agents[id],
                          reasoningEffort: e.target.value,
                        },
                      })
                    }
                  >
                    {modelReasoningOptions(p, agents[id].model).map(
                      (effort) => (
                        <option key={effort} value={effort}>
                          {effort}
                          {effort === "medium" ? " · recommended" : ""}
                        </option>
                      ),
                    )}
                  </select>
                  <small>
                    Higher effort can increase latency and cost. The review
                    keeps a fixed time and output budget.
                  </small>
                </label>
              )}
              {!modelReasoningOptions(p, agents[id]?.model || "").length && (
                <small>
                  Provider default reasoning. Explicit effort controls are
                  supported for GPT-6 Astra.
                </small>
              )}
            </div>
          );
        })}
        <button
          className="button"
          disabled={demo || busy || !valid}
          onClick={async () => {
            setBusy(true);
            setActionError("");
            try {
              await call("ai.configure", { agents });
              refresh();
              toast("Review models saved.");
            } catch (e: any) {
              setActionError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Save size={16} />
          Save model choices
        </button>
        <p className="fine-print">
          Synthesis uses the Methods & robustness model and reasoning effort.
          All five selections must be available in your connected provider
          catalogs.
        </p>
      </section>
      <aside className="rail-card" aria-label="AI key security and billing">
        <ShieldCheck size={25} />
        <h3>Keys stay private.</h3>
        <p>
          Keys are encrypted on the server and are never returned to the
          browser. They are used to validate access, fetch your model catalog,
          and run reviews you start.
        </p>
        <p>
          Available models come directly from your provider account. Refresh to
          see newly available models; access and generation capabilities depend
          on the provider.
        </p>
        <p className="fine-print">
          Each complete review makes six model calls, with up to three
          specialists running concurrently. Set spending limits in your provider
          account. You can remove a key at any time. Provider data policies
          apply; encryption does not prevent the provider from receiving the
          text you consent to review.
        </p>
      </aside>
    </div>
  );
}

export function ReviewStudio({ onAuth }: { onAuth: () => void }) {
  const { profile, call, toast, demo, refresh } = useApp();
  const [params] = useSearchParams();
  const [paperId, setPaperId] = useState(params.get("paper") || ""),
    [consent, setConsent] = useState(false),
    [lookup, setLookup] = useState(false),
    [coverageMode, setCoverageMode] = useState<"full" | "partial">("full"),
    [busy, setBusy] = useState(false),
    [job, setJob] = useState<any>(null),
    [error, setError] = useState(""),
    [lens, setLens] = useState("synthesis"),
    [pending, setPending] = useState<{
      requestId: string;
      paperId: string;
      allowMetadataLookup: boolean;
      coverageMode: "full" | "partial";
      jobId: string;
    } | null>(null);
  const runGuard = useRef(false);
  const papers = useData("paper.list", {}, !!profile),
    jobs = useData("ai.jobs", paperId ? { paperId } : {}, !!profile),
    settings = useData("ai.settings", {}, !!profile);
  const configured = Object.keys(agentNames).every(
    (id) =>
      settings.data?.agents?.[id]?.model &&
      settings.data?.keys?.some(
        (k: any) => k.provider === settings.data.agents[id].provider,
      ),
  );
  const selected = (papers.data || []).find((p: any) => p.id === paperId);
  const selectedCharacterCount = Number(
    selected?.textCharacterCount ?? String(selected?.text || "").length,
  );
  function receive(result: any) {
    setJob(result);
    if (result.status !== "running") {
      if (!pending || pending.jobId === result.id) setPending(null);
      setConsent(false);
    }
    setLens(
      result.results?.synthesis
        ? "synthesis"
        : Object.keys(result.results || {})[0] || "synthesis",
    );
  }
  async function run() {
    if (runGuard.current || !consent || !paperId || demo) return;
    runGuard.current = true;
    setBusy(true);
    setError("");
    const requestId = pending?.requestId || crypto.randomUUID();
    const hash = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`${profile!.id}:${requestId}`),
    );
    const request =
      pending?.paperId === paperId
        ? pending
        : {
            paperId,
            allowMetadataLookup: lookup,
            coverageMode,
            requestId,
            jobId: Array.from(new Uint8Array(hash))
              .map((b) => b.toString(16).padStart(2, "0"))
              .join(""),
          };
    setPending(request);
    setJob({
      id: request.jobId,
      title: selected?.title || "Research review",
      status: "running",
      createdAt: Date.now(),
      results: {},
      stages: Object.fromEntries(
        reviewStages.map((id) => [id, { status: "pending" }]),
      ),
    });
    try {
      const result = await call("ai.review", {
        paperId: request.paperId,
        allowMetadataLookup: request.allowMetadataLookup,
        requestId: request.requestId,
        coverageMode: request.coverageMode,
        consent: true,
      });
      receive(result);
      if (result.status !== "running") setPending(null);
      refresh();
      toast(
        result.status === "completed"
          ? "Your research review is ready."
          : result.status === "partial"
            ? "Review saved with some stages incomplete."
            : result.status === "failed"
              ? "Review failed. Inspect the saved details."
              : "Your review is still running.",
      );
    } catch (e: any) {
      const rejectedBeforeStart = [
        "failed-precondition",
        "invalid-argument",
        "permission-denied",
        "unauthenticated",
        "resource-exhausted",
        "not-found",
      ].some((code) => String(e.code || "").endsWith(code));
      if (rejectedBeforeStart) {
        setPending(null);
        setJob(null);
      }
      setError(
        e.message +
          (rejectedBeforeStart
            ? " The review did not start."
            : " If the request reached the server, it may still be running. Retry this same review or check history before starting another."),
      );
      refresh();
    } finally {
      setBusy(false);
      runGuard.current = false;
    }
  }
  useEffect(() => {
    if (job?.status !== "running" || !profile) return;
    let stopped = false;
    const timer = setInterval(async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const latest = await call("ai.job.get", { id: job.id });
        if (!stopped) {
          setJob(latest);
          if (latest.status !== "running") {
            if (pending?.jobId === latest.id) setPending(null);
            setConsent(false);
            refresh();
          }
        }
      } catch (e: any) {
        if (!stopped) setError(e.message);
      }
    }, 10000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [job?.id, job?.status, call, profile?.id, pending?.jobId]);
  const lenses = [
    {
      id: "evidence",
      Icon: ScanSearch,
      name: "Evidence lens",
      label: "Do the claims hold up?",
      description:
        "Trace claims to manuscript evidence and identify missing support.",
      color: "green",
    },
    {
      id: "originality",
      Icon: BookOpen,
      name: "Attribution lens",
      label: "Is credit given clearly?",
      description:
        "Examine citations and contribution framing. This is not a plagiarism scan.",
      color: "purple",
    },
    {
      id: "reviewer",
      Icon: MessageSquare,
      name: "Methods & robustness",
      label: "What would a reviewer ask?",
      description:
        "Inspect design, statistics, reproducibility, assumptions, and robustness.",
      color: "orange",
    },
    {
      id: "formatting",
      Icon: BookOpen,
      name: "Formatting & structure",
      label: "Can a reader follow it?",
      description:
        "Check headings, references, notation, and PDF extraction diagnostics. Visual layout still needs human inspection.",
      color: "green",
    },
    {
      id: "readiness",
      Icon: Check,
      name: "Submission readiness",
      label: "What needs work before sharing?",
      description:
        "Check the abstract, contribution, limitations, and reporting for a coherent submission. This is not acceptance certification.",
      color: "purple",
    },
  ];
  return (
    <>
      <PageHeading
        eyebrow="A FRESH PERSPECTIVE ON YOUR WORK"
        title="Think deeper. Revise with purpose."
        description="Five specialists inspect your extracted text. One prioritized revision plan, with quotes and concrete next steps."
        action={
          <Link to="/settings?tab=ai" className="button">
            <KeyRound size={16} />
            Configure AI
          </Link>
        }
      />
      <details className="ai-specialist-details">
        <summary>
          Five specialists: evidence, attribution, methods, formatting, and
          readiness
        </summary>
        <div className="review-lenses">
          {lenses.map(
            ({ id, Icon, name, label, description, color }, index) => (
              <article key={id} className={"lens-card " + color}>
                <div className="lens-icon">
                  <Icon size={23} />
                </div>
                <span className="overline">{name}</span>
                <h3>{label}</h3>
                <p>{description}</p>
                <span className="lens-number" aria-hidden="true">
                  0{index + 1}
                </span>
              </article>
            ),
          )}
        </div>
      </details>
      {!profile ? (
        <Empty
          title="Your private review studio"
          action={
            <button className="button primary" onClick={onAuth}>
              Create your workspace
            </button>
          }
        >
          Add a manuscript and connect your provider to get started.
        </Empty>
      ) : (
        <div className="review-workspace">
          <section className="panel form">
            <h2>Put your manuscript in focus</h2>
            {demo && (
              <p className="notice">
                AI reviews run only in a real account with your own key. Demo
                manuscripts are never sent to providers.
              </p>
            )}
            {settings.error && <ErrorBox message={settings.error} />}{" "}
            {!demo && !settings.loading && !configured && (
              <p className="notice">
                Connect a provider key and save all five review models in{" "}
                <Link to="/settings?tab=ai">AI settings</Link> first.
              </p>
            )}
            <label>
              Manuscript
              <select
                aria-label="Manuscript"
                disabled={busy || !!pending}
                value={paperId}
                onChange={(e) => {
                  setPaperId(e.target.value);
                  setJob(null);
                  setConsent(false);
                  setError("");
                }}
              >
                <option value="">Choose a manuscript</option>
                {papers.data?.map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </label>
            {papers.error && <ErrorBox message={papers.error} />}{" "}
            {!papers.loading && !papers.data?.length && (
              <Link to="/papers" className="text-link">
                Add your first manuscript <ArrowRight size={16} />
              </Link>
            )}
            <label>
              Review coverage
              <select
                aria-label="Review coverage"
                value={coverageMode}
                disabled={busy || !!pending}
                onChange={(e) => {
                  setCoverageMode(e.target.value as "full" | "partial");
                  setConsent(false);
                }}
              >
                <option value="full">
                  Full extracted text · up to 100,000 characters
                </option>
                <option value="partial">
                  Partial review · first 32,000 characters
                </option>
              </select>
            </label>
            {selected && (
              <div className="ai-coverage notice">
                <strong>
                  {selectedCharacterCount.toLocaleString()} extracted characters
                  available
                </strong>
                <p>
                  {coverageMode === "full"
                    ? "All stored extracted text is supplied to each specialist. Known incomplete PDF extraction blocks full mode."
                    : "Only the first 32,000 stored characters are supplied. Later content may be excluded."}
                </p>
                <p>
                  {selected.pdfAnalysis
                    ? `${selected.pdfAnalysis.scannedPages} of ${selected.pdfAnalysis.totalPages} PDF pages scanned${selected.pdfAnalysis.textTruncated ? "; extraction reached its text limit" : ""}.`
                    : "Source PDF page coverage is unknown for this manuscript. Re-upload to capture extraction diagnostics."}{" "}
                  Images and equations missing from extraction are not reviewed;
                  layout metrics do not replace visual inspection.
                </p>
                {coverageMode === "full" &&
                  (selectedCharacterCount > 100000 ||
                    selected.pdfAnalysis?.textTruncated ||
                    (selected.pdfAnalysis &&
                      selected.pdfAnalysis.scannedPages <
                        selected.pdfAnalysis.totalPages)) && (
                    <p role="status">
                      Full mode is unavailable for this extraction. Re-upload a
                      complete text-readable manuscript or choose partial
                      coverage explicitly.
                    </p>
                  )}
              </div>
            )}
            {configured && (
              <div className="notice">
                <strong>Selected providers and models</strong>
                {Object.entries(agentNames).map(([id, name]) => (
                  <p key={id}>
                    {name}: {providers[settings.data.agents[id].provider]} ·{" "}
                    {settings.data.agents[id].model}
                    {settings.data.agents[id].reasoningEffort
                      ? ` · ${settings.data.agents[id].reasoningEffort} reasoning`
                      : " · provider default"}
                  </p>
                ))}
                <small>
                  Synthesis uses the Methods & robustness model and reasoning
                  effort.
                </small>
              </div>
            )}
            <label className="checkbox-label">
              <input
                type="checkbox"
                disabled={busy || demo || job?.status === "running"}
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              I agree to send extracted manuscript text, metadata, and prior
              stage findings to the selected providers for this review. Their
              data policies and usage charges apply.
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                disabled={busy || !!pending || demo}
                checked={lookup}
                onChange={(e) => setLookup(e.target.checked)}
              />
              Look up scholarly metadata on Crossref. This sends the manuscript
              title and cited DOIs to Crossref.
            </label>
            <button
              className="button primary"
              disabled={
                demo ||
                !paperId ||
                !consent ||
                busy ||
                !configured ||
                job?.status === "running" ||
                selectedCharacterCount < 100 ||
                (coverageMode === "full" &&
                  (selectedCharacterCount > 100000 ||
                    selected?.pdfAnalysis?.textTruncated ||
                    (selected?.pdfAnalysis &&
                      selected.pdfAnalysis.scannedPages <
                        selected.pdfAnalysis.totalPages)))
              }
              onClick={run}
            >
              {busy ? (
                <RefreshCw size={17} className="spin" />
              ) : (
                <Sparkles size={17} />
              )}{" "}
              {busy
                ? "Reviewing your manuscript…"
                : pending
                  ? "Retry the same review"
                  : "Start a research review"}
            </button>
            {pending && !busy && (
              <button
                className="button"
                onClick={async () => {
                  try {
                    receive(await call("ai.job.get", { id: pending.jobId }));
                    setError("");
                  } catch (e: any) {
                    setError(
                      e.message + " You can retry the same request safely.",
                    );
                  }
                }}
              >
                Check this review’s status <RefreshCw size={16} />
              </button>
            )}
            {busy && (
              <p className="notice">
                This can take several minutes. Completed stages are saved to
                your history. Avoid starting another run while this one is
                active.
              </p>
            )}
            {error && <ErrorBox message={error} />}
            <p className="fine-print">
              Up to six provider calls, capped at 12,000 output tokens for
              OpenAI reasoning models and 6,000 otherwise; up to 10 started
              reviews per day. Specialists run with concurrency three, with a
              total time budget of 460 seconds. No automatic paid retries. These
              limits do not guarantee a dollar price. Failed requests can still
              incur provider charges. AI suggestions require human review; this
              is not comprehensive claim verification, plagiarism detection, or
              an endorsement decision.
            </p>
          </section>
          <aside className="panel" aria-label="Review history">
            <div className="panel-heading">
              <h3>Review history</h3>
              <button
                className="icon-button"
                aria-label="Refresh review history"
                onClick={refresh}
              >
                <RefreshCw size={16} />
              </button>
            </div>
            {jobs.error && <ErrorBox message={jobs.error} />}{" "}
            {jobs.loading && !jobs.data ? (
              <Loading />
            ) : jobs.data?.length ? (
              jobs.data.map((j: any) => (
                <button
                  className="history-item"
                  key={j.id}
                  onClick={async () => {
                    try {
                      receive(await call("ai.job.get", { id: j.id }));
                      setError("");
                    } catch (e: any) {
                      toast(e.message);
                    }
                  }}
                >
                  <span>
                    <strong>{j.title || "Research review"}</strong>
                    <small>
                      {new Date(j.createdAt).toLocaleString()} · {j.status}
                    </small>
                  </span>
                  <ArrowUpRight size={16} />
                </button>
              ))
            ) : (
              <p className="muted">
                Completed, partial, and interrupted reviews appear here. Refresh
                history after a disconnected request.
              </p>
            )}
          </aside>
        </div>
      )}
      {job && <ReviewResults job={job} lens={lens} onLens={setLens} />}
    </>
  );
}

export function ReviewResults({
  job,
  lens,
  onLens,
}: {
  job: any;
  lens: string;
  onLens: (name: string) => void;
}) {
  const stages = ["synthesis", ...Object.keys(agentNames)];
  const sources = Array.isArray(job.metadata?.sources)
    ? job.metadata.sources
    : [];
  const errors = Array.isArray(job.errors) ? job.errors : [];
  const result = job.results?.[lens];
  const failure =
    errors.find((e: any) => e.agent === lens) || job.stages?.[lens]?.error;
  return (
    <section className="panel review-results">
      <div className="panel-heading">
        <div>
          <span className="overline">RESEARCH REVIEW</span>
          <h2>{job.title || "Your review findings"}</h2>
          <p className="fine-print">
            {new Date(job.createdAt).toLocaleString()} · Prompt{" "}
            {job.promptVersion || "version not recorded"}
          </p>
        </div>
        <div className="button-row">
          <Tag>{job.status}</Tag>
          <button
            className="button"
            onClick={() => downloadReview(job, "markdown")}
          >
            <Download size={15} /> Export revision plan
          </button>
          <button
            className="button"
            onClick={() => downloadReview(job, "json")}
          >
            JSON
          </button>
        </div>
      </div>
      {job.status === "partial" && (
        <p className="notice">
          Some stages failed. Available findings are retained; this is an
          incomplete review.
        </p>
      )}
      {job.error && <ErrorBox message={job.error} />}{" "}
      {errors.map((e: any, i: number) => (
        <ErrorBox
          key={i}
          message={`${agentNames[e.agent] || "Synthesis"}: ${e.message} (${e.code})`}
        />
      ))}
      {job.stages && (
        <ol
          className="ai-stage-progress"
          aria-label="Review stage progress"
          aria-live="polite"
        >
          {reviewStages.map((id) => (
            <li key={id} data-status={job.stages[id]?.status || "pending"}>
              <strong>
                {id === "synthesis" ? "Revision plan" : agentNames[id]}
              </strong>
              <span>{job.stages[id]?.status || "pending"}</span>
            </li>
          ))}
        </ol>
      )}
      {job.scope && (
        <p className="notice">
          <strong>
            {job.scope.truncated
              ? "Partial manuscript coverage. "
              : "Text review scope. "}
          </strong>
          {Number(job.scope.reviewedCharacters || 0).toLocaleString()} of{" "}
          {Number(job.scope.totalCharacters || 0).toLocaleString()} extracted
          characters reviewed
          {job.scope.truncated ? " (partial coverage)." : "."} Mode:{" "}
          {job.scope.mode || "legacy"}. PDF pages scanned:{" "}
          {job.scope.scannedPages ?? "unknown"} of{" "}
          {job.scope.totalPages ?? "unknown"}; source coverage:{" "}
          {job.scope.sourceCoverage || "unknown"}. Figures, equations, and
          visual layout were not inspected. This snapshot reflects the
          manuscript at the time of the run.
        </p>
      )}
      {job.pdfAnalysis && (
        <details className="ai-pdf-diagnostics">
          <summary>PDF extraction and formatting diagnostics</summary>
          <p>
            Deterministic PDF.js measurements, separate from model findings.
            These are not visual inspection or venue compliance checks.
          </p>
          {job.pdfAnalysis.warnings?.length ? (
            <ul>
              {job.pdfAnalysis.warnings.map((w: string, i: number) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          ) : (
            <p>
              No extraction heuristics raised warnings. Inspect the rendered PDF
              yourself.
            </p>
          )}
        </details>
      )}
      <div className="tabs">
        {stages.map((l) => (
          <button
            key={l}
            className={lens === l ? "active" : ""}
            onClick={() => onLens(l)}
          >
            {l === "synthesis" ? "Prioritized revision plan" : agentNames[l]}
            {errors.some((e: any) => e.agent === l) ? " · incomplete" : ""}
          </button>
        ))}
      </div>
      {!result ? (
        <p className="notice">
          {failure?.message ||
            (job.status === "running"
              ? "This stage is still pending. Results refresh automatically while this page is visible."
              : "This stage has no saved result.")}
        </p>
      ) : (
        <>
          <div className="button-row">
            <Tag>{providers[result.provider] || result.provider}</Tag>
            <Tag>{result.model}</Tag>
            <Tag>{result.reasoningEffort || "provider default"} reasoning</Tag>
          </div>
          {result.usage && (
            <p className="fine-print">
              Provider-reported usage:{" "}
              {Number(result.usage.inputTokens || 0).toLocaleString()} input
              tokens · {Number(result.usage.outputTokens || 0).toLocaleString()}{" "}
              output tokens
              {result.usage.reasoningTokens
                ? ` · ${Number(result.usage.reasoningTokens).toLocaleString()} reasoning tokens`
                : ""}
              . Billing follows provider terms.
            </p>
          )}
          <p className="review-summary">{result.summary}</p>
          {!result.findings?.length && (
            <p className="notice">
              No accepted findings were returned for this stage. This does not
              establish correctness, originality, or endorsement eligibility.
            </p>
          )}
          {result.findings?.map((f: any, i: number) => (
            <article className="finding" key={i}>
              <div className="finding-heading">
                <span className={"severity " + f.severity}>{f.severity}</span>
                <h3>{f.title}</h3>
              </div>
              {f.quote && <blockquote>“{f.quote}”</blockquote>}
              <p>{f.explanation}</p>
              <div className="recommendation">
                <strong>A useful next step</strong>
                <p>{f.recommendation}</p>
              </div>
              {f.sourceIds?.length > 0 && (
                <div className="tags">
                  {f.sourceIds.map((id: string) => {
                    const source = sources.find((s: any) => s.id === id);
                    return source ? (
                      <a
                        key={id}
                        className="tag"
                        href={`https://doi.org/${encodeURIComponent(id)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={source.title}
                      >
                        DOI {id} ↗
                      </a>
                    ) : (
                      <Tag key={id}>Unavailable source {id}</Tag>
                    );
                  })}
                </div>
              )}
            </article>
          ))}
          {result.limitations?.length > 0 && (
            <div className="notice">
              <strong>Review limitations</strong>
              <ul>
                {result.limitations.map((l: string, i: number) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
      {job.metadata && (
        <details>
          <summary>
            Bibliographic lookup audit · {sources.length} records
          </summary>
          <p className="fine-print">
            Metadata identifies publications; it does not prove scientific
            claims. Title search results are candidate matches.
          </p>
          {sources.map((s: any) => (
            <div className="finding" key={s.id}>
              <strong>{s.title || s.id}</strong>
              <p>
                {s.authors?.join(", ")}
                {s.year ? ` · ${s.year}` : ""}
              </p>
              <a
                href={`https://doi.org/${encodeURIComponent(s.id)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                DOI {s.id} ↗
              </a>
              <p className="fine-print">
                Matched by{" "}
                {s.matchedBy === "doi"
                  ? "cited DOI"
                  : "title search (candidate only)"}
              </p>
            </div>
          ))}
          {job.metadata.lookups?.map((q: any, i: number) => (
            <p className="fine-print" key={i}>
              {q.kind === "doi" ? "DOI" : "Title"} lookup: {q.value} ·{" "}
              {q.status}
            </p>
          ))}
          {job.metadata.limitations?.map((text: string, i: number) => (
            <p className="notice" key={i}>
              {text}
            </p>
          ))}
        </details>
      )}
    </section>
  );
}
