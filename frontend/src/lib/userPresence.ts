/**
 * Lightweight client-side presence tracking.
 * Each browser session writes a heartbeat for the logged-in user every
 * HEARTBEAT_MS milliseconds. The admin list treats a user as "online" if
 * their last heartbeat was within ONLINE_THRESHOLD_MS.
 */

const KEY = "gom_user_presence";
const HEARTBEAT_MS = 30_000;   // write every 30 s
const ONLINE_THRESHOLD_MS = 2 * 60_000; // 2 minutes → considered online

type PresenceMap = Record<string, number>; // userId → epoch ms

function read(): PresenceMap {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    return JSON.parse(raw) as PresenceMap;
  } catch {
    return {};
  }
}

function write(map: PresenceMap) {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* ignore quota errors */
  }
}

/** Stamp the current user's presence. Call on login + periodically. */
export function heartbeat(userId: string) {
  const map = read();
  map[userId] = Date.now();
  write(map);
}

/** Returns true if the given user has been active within ONLINE_THRESHOLD_MS. */
export function isUserOnline(userId: string): boolean {
  const ts = read()[userId];
  if (!ts) return false;
  return Date.now() - ts < ONLINE_THRESHOLD_MS;
}

/** Returns a snapshot of all user IDs considered online right now. */
export function getOnlineUserIds(): Set<string> {
  const map = read();
  const now = Date.now();
  return new Set(
    Object.entries(map)
      .filter(([, ts]) => now - ts < ONLINE_THRESHOLD_MS)
      .map(([id]) => id),
  );
}

/** Remove a user's presence entry immediately (call on logout). */
export function clearPresence(userId: string) {
  const map = read();
  delete map[userId];
  write(map);
}

/** Start a periodic heartbeat interval; returns a cleanup function. */
export function startHeartbeat(userId: string): () => void {
  heartbeat(userId); // immediate first beat
  const id = setInterval(() => heartbeat(userId), HEARTBEAT_MS);
  return () => clearInterval(id);
}
