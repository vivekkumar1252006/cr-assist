import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export const COOKIE_NAME = 'sa_session';
const SHORT_TTL = 60 * 60 * 24; // 1 day
const REMEMBER_TTL = 60 * 60 * 24 * 30; // 30 days

const cookieBase = () => ({
  httpOnly: true,
  secure: config.isProd,
  sameSite: 'lax',
  path: '/',
});

export function issueSession(res, user, remember) {
  const ttl = remember ? REMEMBER_TTL : SHORT_TTL;
  const token = jwt.sign({ sub: String(user.id), role: user.role }, config.jwtSecret, { expiresIn: ttl });
  // Without "remember me" the cookie is a browser-session cookie (no maxAge).
  res.cookie(COOKIE_NAME, token, remember ? { ...cookieBase(), maxAge: ttl * 1000 } : cookieBase());
  return token;
}

export function clearSession(res) {
  res.clearCookie(COOKIE_NAME, cookieBase());
}

export function verifySession(token) {
  return jwt.verify(token, config.jwtSecret);
}

/** Shape returned to the client — never includes password_hash. */
export function publicUser(row) {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    enrollmentNumber: row.enrollment_number,
    studentId: row.student_id,
    role: row.role,
    accountStatus: row.account_status,
    isDemo: Boolean(row.is_demo),
    createdAt: row.created_at,
  };
}
