-- Adds lightweight, per-user notification state to the existing `users` table
-- instead of standing up a whole new delivery pipeline:
--   * notifications_viewed_at — last time the user opened /dashboard/notifications,
--     used to compute the "unread" badge count from live derived events
--     (approvals, bot status changes, deployments) without persisting a duplicate
--     notification row per event.
--   * notification_prefs — JSON blob of the user's notification-preference toggles
--     shown on /dashboard/settings (e.g. {"agent_pause":true,"high_risk":true,...}).

ALTER TABLE users ADD COLUMN notifications_viewed_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN notification_prefs TEXT NOT NULL DEFAULT '{}';
