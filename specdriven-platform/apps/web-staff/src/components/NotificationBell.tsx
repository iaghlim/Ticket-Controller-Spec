import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ApiError,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type Notification,
} from "../lib/api";
import { formatDate } from "../lib/labels";

function IconBell() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 7h18s-3 0-3-7" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

type NotificationBellProps = {
  refreshKey?: string;
};

export function NotificationBell({ refreshKey }: NotificationBellProps) {
  const navigate = useNavigate();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listNotifications({ limit: 30 });
      setNotifications(res.notifications);
      setUnreadCount(res.unreadCount);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Notificações indisponíveis.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  async function onOpen() {
    setOpen((prev) => !prev);
    if (!open) void load();
  }

  async function onClickNotification(n: Notification) {
    if (!n.readAt) {
      try {
        await markNotificationRead(n.id);
        setNotifications((prev) =>
          prev.map((item) =>
            item.id === n.id ? { ...item, readAt: new Date() } : item,
          ),
        );
        setUnreadCount((c) => Math.max(0, c - 1));
      } catch {
        /* best effort */
      }
    }
    setOpen(false);
    if (n.href) {
      navigate(n.href);
    }
  }

  async function onMarkAllRead() {
    try {
      await markAllNotificationsRead();
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date() })),
      );
      setUnreadCount(0);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Falha ao marcar como lidas.",
      );
    }
  }

  return (
    <div className="notification-bell" ref={wrapRef}>
      <button
        type="button"
        className="icon-btn"
        aria-label={`Notificações${unreadCount > 0 ? `, ${unreadCount} não lidas` : ""}`}
        aria-expanded={open}
        onClick={() => void onOpen()}
      >
        <IconBell />
        {unreadCount > 0 ? (
          <span className="icon-btn-badge">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="notification-dropdown" role="menu">
          <div className="notification-dropdown-head">
            <strong>Notificações</strong>
            {unreadCount > 0 ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => void onMarkAllRead()}
              >
                Marcar todas como lidas
              </button>
            ) : null}
          </div>

          {loading ? (
            <p className="notification-dropdown-hint muted">Carregando…</p>
          ) : null}
          {error ? (
            <p className="notification-dropdown-hint error">{error}</p>
          ) : null}

          {!loading && !error && notifications.length === 0 ? (
            <p className="notification-dropdown-hint muted">
              Nenhuma notificação.
            </p>
          ) : null}

          {!loading && notifications.length > 0 ? (
            <ul className="notification-list">
              {notifications.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className={`notification-item${n.readAt ? "" : " unread"}`}
                    onClick={() => void onClickNotification(n)}
                  >
                    <span className="notification-item-title">{n.title}</span>
                    {n.body ? (
                      <span className="notification-item-body">{n.body}</span>
                    ) : null}
                    <span className="notification-item-meta">
                      {formatDate(n.createdAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="notification-dropdown-foot">
            <Link to="/approvals" onClick={() => setOpen(false)}>
              Aprovações pendentes →
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
