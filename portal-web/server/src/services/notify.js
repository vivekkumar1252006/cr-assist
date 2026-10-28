import { pool } from '../db.js';

/**
 * Creates an in-app notification only. Email is reserved for the three
 * transactional messages (admin notices, account creation, password OTP), so
 * this deliberately never sends mail. Call it after the related transaction
 * has committed.
 */
export async function notifyUser(userId, { type, title, message, link }) {
  await pool.execute('INSERT INTO notifications (user_id, type, title, message, link) VALUES (?, ?, ?, ?, ?)', [
    userId, type, title.slice(0, 150), message.slice(0, 500), link ?? null,
  ]);
  return { inApp: true };
}

/** Fire-and-forget wrapper so a notification problem never fails the main request. */
export function notifyUserSafe(userId, payload) {
  notifyUser(userId, payload).catch((err) => console.error('[notify] failed:', err.message));
}
