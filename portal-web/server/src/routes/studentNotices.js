import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

// Student-facing notices: regular per-user notifications + published global
// notices, each with this student's own read / dismissed state.
const router = Router();
router.use(requireAuth, requireRole('student'));

/**
 * GET /student/notices
 * Merges the student's own notifications with published global notices.
 * Global notices dismissed by this student are excluded (other students still see them).
 */
router.get('/', async (req, res, next) => {
  try {
    const studentId = req.user.id;

    // 1. Regular per-user notifications (complaint updates, status changes...).
    const [regularRows] = await pool.execute(
      `SELECT id, type, title, message, link, read_at, created_at
         FROM notifications
        WHERE user_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 20`,
      [studentId],
    );
    const [[{ unread: regularUnread }]] = await pool.execute(
      'SELECT COUNT(*) AS unread FROM notifications WHERE user_id = ? AND read_at IS NULL',
      [studentId],
    );

    const regularItems = regularRows.map((r) => ({
      id: r.id,
      kind: 'notification',
      type: r.type,
      title: r.title,
      message: r.message,
      link: r.link,
      read: Boolean(r.read_at),
      dismissible: false,
      createdAt: r.created_at,
    }));

    // 2. Published global notices with this student's status. Returned in full:
    // every student sees every published notice, however old.
    const [globalRows] = await pool.execute(
      `SELECT gn.id, gn.title, gn.description, gn.created_at, gn.published_at, gn.is_published
         FROM global_notices gn
        WHERE gn.is_published = 1
        ORDER BY gn.published_at DESC, gn.created_at DESC
        LIMIT 100`,
    );

    const [statusRows] = await pool.execute(
      'SELECT notice_id, read_at, dismissed_at FROM student_notice_status WHERE student_id = ?',
      [studentId],
    );
    const statusMap = new Map(statusRows.map((r) => [r.notice_id, r]));

    // No row yet (notice published after this student's last sync) = unread & visible.
    const globalItems = globalRows
      .filter((gn) => !statusMap.get(gn.id)?.dismissed_at)
      .map((gn) => ({
        id: gn.id,
        kind: 'notice',
        type: 'global_notice',
        title: gn.title,
        message: gn.description,
        description: gn.description,
        link: null,
        read: Boolean(statusMap.get(gn.id)?.read_at),
        dismissible: true,
        publishedAt: gn.published_at,
        createdAt: gn.created_at,
      }));

    const items = [...regularItems, ...globalItems];
    const globalUnread = globalItems.filter((n) => !n.read).length;

    res.json({
      unread: regularUnread + globalUnread,
      regularUnread,
      globalUnread,
      items,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /student/notices/:id — full text of one notice/notification (for the detail view).
 * Only published notices are readable; dismissed ones 404 for this student.
 */
router.get('/:id', async (req, res, next) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: 'Invalid notice id.' });

    const [[globalNotice]] = await pool.execute(
      `SELECT gn.id, gn.title, gn.description, gn.created_at, gn.published_at, sns.read_at, sns.dismissed_at
         FROM global_notices gn
         LEFT JOIN student_notice_status sns ON sns.notice_id = gn.id AND sns.student_id = ?
        WHERE gn.id = ? AND gn.is_published = 1`,
      [req.user.id, id],
    );

    if (globalNotice) {
      if (globalNotice.dismissed_at) return res.status(404).json({ message: 'Notice not found.' });
      return res.json({
        notice: {
          id: globalNotice.id,
          kind: 'notice',
          title: globalNotice.title,
          message: globalNotice.description,
          description: globalNotice.description,
          read: Boolean(globalNotice.read_at),
          dismissible: true,
          publishedAt: globalNotice.published_at,
          createdAt: globalNotice.created_at,
        },
      });
    }

    const [[row]] = await pool.execute(
      `SELECT id, type, title, message, link, read_at, created_at
         FROM notifications WHERE id = ? AND user_id = ?`,
      [id, req.user.id],
    );
    if (!row) return res.status(404).json({ message: 'Notice not found.' });

    res.json({
      notice: {
        id: row.id,
        kind: 'notification',
        type: row.type,
        title: row.title,
        message: row.message,
        link: row.link,
        read: Boolean(row.read_at),
        dismissible: false,
        createdAt: row.created_at,
      },
    });
  } catch (err) {
    next(err);
  }
});

/** POST /student/notices/read-all — clears the unread badge for both kinds. */
router.post('/read-all', async (req, res, next) => {
  try {
    await pool.execute(
      'UPDATE notifications SET read_at = UTC_TIMESTAMP() WHERE user_id = ? AND read_at IS NULL',
      [req.user.id],
    );
    await pool.execute(
      `INSERT INTO student_notice_status (student_id, notice_id, read_at, dismissed_at)
       SELECT ?, gn.id, UTC_TIMESTAMP(), NULL FROM global_notices gn WHERE gn.is_published = 1
         ON DUPLICATE KEY UPDATE read_at = UTC_TIMESTAMP()`,
      [req.user.id],
    );
    res.json({ message: 'All notifications marked as read.' });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /student/notices/:id/read  { read: true|false, kind?: 'notice'|'notification' }
 * Marks one item read or unread. Students only ever touch their own rows.
 *
 * Global notices and per-user notifications live in separate tables whose ids
 * can collide, so the client sends `kind`; without it the global notice wins
 * (the historical behaviour).
 */
router.post('/:id/read', async (req, res, next) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: 'Invalid notice id.' });
    const read = req.body?.read === undefined ? true : req.body.read === true || req.body.read === 'true';
    const kind = req.body?.kind === 'notification' || req.body?.kind === 'notice' ? req.body.kind : null;

    if (kind !== 'notification') {
      const [[globalNotice]] = await pool.execute('SELECT id FROM global_notices WHERE id = ? AND is_published = 1', [id]);
      if (globalNotice) {
        await pool.execute(
          `INSERT INTO student_notice_status (student_id, notice_id, read_at, dismissed_at)
           VALUES (?, ?, ${read ? 'UTC_TIMESTAMP()' : 'NULL'}, NULL)
           ON DUPLICATE KEY UPDATE read_at = VALUES(read_at)`,
          [req.user.id, id],
        );
        return res.json({ message: read ? 'Marked as read.' : 'Marked as unread.', read });
      }
      // The client said this is an admin notice, so don't fall back to a
      // same-numbered personal notification.
      if (kind === 'notice') return res.status(404).json({ message: 'Notice not found.' });
    }

    const [r] = await pool.execute(
      `UPDATE notifications SET read_at = ${read ? 'COALESCE(read_at, UTC_TIMESTAMP())' : 'NULL'}
        WHERE id = ? AND user_id = ?`,
      [id, req.user.id],
    );
    if (!r.affectedRows) return res.status(404).json({ message: 'Notice not found.' });
    res.json({ message: read ? 'Marked as read.' : 'Marked as unread.', read });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /student/notices/:id/dismiss
 * Hides a global notice from this student only. Other students keep it, and the
 * admin's copy is never deleted.
 */
router.post('/:id/dismiss', async (req, res, next) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: 'Invalid notice id.' });
    if (req.body?.kind === 'notification') {
      return res
        .status(400)
        .json({ code: 'NOT_DISMISSIBLE', message: 'Only notices published by the admin can be dismissed.' });
    }

    const [[globalNotice]] = await pool.execute('SELECT id FROM global_notices WHERE id = ?', [id]);
    if (!globalNotice) return res.status(404).json({ message: 'Notice not found.' });

    await pool.execute(
      `INSERT INTO student_notice_status (student_id, notice_id, read_at, dismissed_at)
       VALUES (?, ?, COALESCE(read_at, UTC_TIMESTAMP()), UTC_TIMESTAMP())
       ON DUPLICATE KEY UPDATE dismissed_at = UTC_TIMESTAMP(), read_at = COALESCE(read_at, UTC_TIMESTAMP())`,
      [req.user.id, id],
    );
    res.json({ message: 'Notice dismissed from your list.' });
  } catch (err) {
    next(err);
  }
});

export default router;
