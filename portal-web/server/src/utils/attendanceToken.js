import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

// Separate signing key from session cookies, derived from JWT_SECRET, so a session token can
// never be accepted as an attendance token (and vice versa).
const KEY = crypto.createHmac('sha256', config.jwtSecret).update('smartattend:attendance-token').digest();
const AUDIENCE = 'smartattend:attendance';
const PREFIX = 'SATT1.'; // marks the QR payload as an attendance token

/** Short-lived token binding one student to one active session. */
export function signAttendanceToken(userId, sessionId) {
  const token = jwt.sign({ sid: sessionId }, KEY, {
    subject: String(userId),
    audience: AUDIENCE,
    expiresIn: config.attendanceTokenTtlSeconds,
    jwtid: crypto.randomBytes(8).toString('hex'),
    algorithm: 'HS256',
  });
  return PREFIX + token;
}

/** Returns { userId, sessionId } or throws if the token is malformed, forged or expired. */
export function verifyAttendanceToken(payload) {
  if (typeof payload !== 'string' || !payload.startsWith(PREFIX)) throw new Error('Not an attendance QR code');
  const claims = jwt.verify(payload.slice(PREFIX.length), KEY, { audience: AUDIENCE, algorithms: ['HS256'] });
  return { userId: Number(claims.sub), sessionId: Number(claims.sid) };
}
