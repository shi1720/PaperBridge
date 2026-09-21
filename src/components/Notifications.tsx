import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Bell,
  Check,
  CheckCheck,
  FileText,
  MessageCircle,
  MessageSquare,
  RefreshCw,
  Users,
} from "lucide-react";
import { useApp, useData } from "../lib/context";
import { notificationKind, notificationPath } from "../lib/notifications";
import { Empty, ErrorBox, Loading, PageHeading } from "./ui";
import "./notifications.css";

type Notice = {
  id: string;
  title?: string;
  body?: string;
  link?: string;
  read?: boolean;
  createdAt?: number;
  emailStatus?: string;
  emailIssue?: string;
};
const kinds = [
  { id: "all", label: "All activity" },
  { id: "research", label: "Research & requests" },
  { id: "discussion", label: "Discussions" },
  { id: "message", label: "Messages" },
  { id: "connection", label: "Connections" },
];
const icons = {
  research: FileText,
  discussion: MessageCircle,
  message: MessageSquare,
  connection: Users,
  other: Bell,
};

export function NotificationsPage({ onAuth }: { onAuth: () => void }) {
  const { profile, call, refresh, toast } = useApp();
  const { data, loading, error } = useData(
    "notifications.list",
    {},
    !!profile,
    15000,
  );
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [kind, setKind] = useState("all");
  const [busy, setBusy] = useState("");
  const [actionError, setActionError] = useState("");
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const notices: Notice[] = Array.isArray(data) ? data : [];
  const isRead = (notice: Notice) => !!notice.read || readIds.has(notice.id);
  const unread = notices.filter((notice) => !isRead(notice)).length;
  const visible = notices.filter(
    (notice) =>
      (!unreadOnly || !isRead(notice)) &&
      (kind === "all" || notificationKind(notice.link) === kind),
  );
  async function markRead(id?: string) {
    setBusy(id || "all");
    setActionError("");
    try {
      await call("notifications.read", id ? { id } : {});
      setReadIds(
        (previous) =>
          new Set([
            ...previous,
            ...(id ? [id] : notices.map((notice) => notice.id)),
          ]),
      );
      refresh();
    } catch (error: any) {
      toast("Could not mark activity as read. You can try again in Activity.");
      setActionError(
        error.message || "Could not update this notification. Try again.",
      );
    } finally {
      setBusy("");
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="STAY IN THE CONVERSATION"
        title="Your research, connected."
        description="Requests, replies, new connections, and private messages — together in your activity inbox."
        action={
          profile ? (
            <button className="button" onClick={refresh} disabled={loading}>
              <RefreshCw size={16} />
              Refresh activity
            </button>
          ) : undefined
        }
      />
      {!profile ? (
        <Empty
          title="A home for your research updates"
          action={
            <button className="button primary" onClick={onAuth}>
              Sign in to see your activity
              <ArrowRight size={16} />
            </button>
          }
        >
          Sign in to keep up with endorsement requests, conversations, and your
          research community.
        </Empty>
      ) : (
        <section className="card activity-inbox" aria-label="Activity inbox">
          <header className="activity-inbox-heading">
            <div className="activity-title">
              <span className="activity-title-icon">
                <Bell size={21} />
              </span>
              <div>
                <h2>Activity</h2>
                <p aria-live="polite">
                  {unread
                    ? `${unread} unread ${unread === 1 ? "update" : "updates"}`
                    : "You’re all caught up"}
                </p>
              </div>
            </div>
            <button
              className="button compact"
              disabled={!!busy || !unread}
              onClick={() => void markRead()}
            >
              <CheckCheck size={16} />
              {busy === "all" ? "Updating…" : "Mark all as read"}
            </button>
          </header>
          <div className="activity-filters">
            <div
              className="category-tabs"
              role="group"
              aria-label="Activity status"
            >
              <button
                className={!unreadOnly ? "active" : ""}
                aria-pressed={!unreadOnly}
                onClick={() => setUnreadOnly(false)}
              >
                All updates
              </button>
              <button
                className={unreadOnly ? "active" : ""}
                aria-pressed={unreadOnly}
                onClick={() => setUnreadOnly(true)}
              >
                Unread{unread > 0 && <span>{unread}</span>}
              </button>
            </div>
            <label>
              <span className="sr-only">Filter activity type</span>
              <select
                value={kind}
                onChange={(event) => setKind(event.target.value)}
              >
                {kinds.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {error && <ErrorBox message={error} />}
          {actionError && <ErrorBox message={actionError} />}
          {loading && !data ? (
            <Loading />
          ) : visible.length ? (
            <div className="activity-list">
              {visible.map((notice) => {
                const destination = notificationPath(notice.link);
                const category = notificationKind(notice.link);
                const Icon = icons[category];
                const read = isRead(notice);
                const timestamp = notice.createdAt
                  ? new Date(notice.createdAt)
                  : null;
                return (
                  <article
                    key={notice.id}
                    className={`activity-item ${read ? "" : "unread"}`}
                    aria-label={`${read ? "" : "Unread: "}${notice.title || "Research update"}`}
                  >
                    <span className={`activity-icon ${category}`}>
                      <Icon size={19} />
                    </span>
                    <div className="activity-copy">
                      <div className="activity-item-heading">
                        <h3>{notice.title || "Research update"}</h3>
                        {!read && (
                          <span className="activity-unread-label">New</span>
                        )}
                      </div>
                      <p>{notice.body}</p>
                      {timestamp && !Number.isNaN(timestamp.getTime()) && (
                        <time dateTime={timestamp.toISOString()}>
                          {timestamp.toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </time>
                      )}
                      {notice.emailStatus && (
                        <p
                          className="activity-email-status"
                          aria-label="Email notification status"
                        >
                          Email:{" "}
                          {notice.emailStatus === "sent"
                            ? "accepted by delivery provider"
                            : notice.emailStatus}
                          {notice.emailIssue ? ` · ${notice.emailIssue}` : ""}
                        </p>
                      )}
                      <div className="activity-item-actions">
                        {destination && (
                          <Link
                            className="text-link"
                            to={destination}
                            onClick={() => {
                              if (!read) void markRead(notice.id);
                            }}
                          >
                            Open update <ArrowRight size={14} />
                          </Link>
                        )}
                        {!read && (
                          <button
                            className="text-link"
                            disabled={!!busy}
                            onClick={() => void markRead(notice.id)}
                          >
                            <Check size={14} />
                            {busy === notice.id ? "Updating…" : "Mark as read"}
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : !error ? (
            <Empty
              title={
                notices.length
                  ? "Nothing waiting here"
                  : "Your next connection starts here"
              }
              action={
                notices.length ? (
                  <button
                    className="button"
                    onClick={() => {
                      setKind("all");
                      setUnreadOnly(false);
                    }}
                  >
                    Show all activity
                  </button>
                ) : (
                  <Link className="button" to="/community">
                    Explore the community
                    <ArrowRight size={16} />
                  </Link>
                )
              }
            >
              {notices.length
                ? "There are no updates matching these filters. New activity appears here automatically."
                : "When someone replies, messages you, follows you, or updates an endorsement request, you’ll see it here."}
            </Empty>
          ) : null}
          {!!notices.length && (
            <p className="activity-footer">
              Showing your most recent activity. Updates refresh automatically
              while this page is open.
            </p>
          )}
        </section>
      )}
    </>
  );
}
