import { pool } from '../db.js';
import { config } from '../config.js';
import { COOKIE_NAME, clearSession, verifySession } from '../utils/auth.js';

export const USER_COLUMNS =
  'id, full_name, email, enrollment_number, student_id, role, account_status, is_demo, created_at';

/** Requires a valid session cookie for an active account; sets req.user. */
export async function requireAuth(req, res, next) {
  let token = req.cookies?.[COOKIE_NAME];
  if (!token && req.headers.authorization) {
    const parts = req.headers.authorization.split(' ');
    if (parts.length === 2 && /^Bearer$/i.test(parts[0])) {
      token = parts[1];
    }
  }
  if (!token && req.query?.token) {
    token = req.query.token;
  }
  if (!token) return res.status(401).json({ message: 'Not authenticated' });

  let payload;
  try {
    payload = verifySession(token);
  } catch {
    clearSession(res);
    return res.status(401).json({ message: 'Session expired. Please log in again.' });
  }

  try {
    const [rows] = await pool.execute(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, [payload.sub]);
    const user = rows[0];
    // Re-check status on every request so suspensions take effect immediately.
    if (!user || user.account_status !== 'active' || (user.is_demo && config.isProd)) {
      clearSession(res);
      return res.status(401).json({ message: 'Your account is not active' });
    }
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/** Use after requireAuth: restricts a route to the given roles. */
export const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user?.role) ? next() : res.status(403).json({ message: 'Forbidden' });
