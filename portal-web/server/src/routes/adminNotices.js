import { Router } from 'express';
import { pool } from '../db.js';
import { audit } from '../services/audit.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { isMailConfigured, sendBulk, sendNoticeEmail } from '../utils/mailer.js';

// Global notices: admin-created announcements that reach every student.
// Read / dismissed state lives per-student in `student_notice_status`.
const router = Router();

// Only admins may create, edit, publish or delete global notices.
router.use(requireAuth, requireRole('admin'));

const MAX_TITLE = 150;
const MAX_DESCRIPTION = 10000;

/** Shared validation for create / edit. Returns { title, description } or { errors }. */
function validateNotice(body) {
  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  const description = typeof body?.description === 'string' ? body.description.trim() : '';
  const errors = {};
  if (!title) errors.title = 'Notice title is required.';
  else if (title.length > MAX_TITLE) errors.title = `Title must be ${MAX_TITLE} characters or fewer.`;
  if (!description) errors.description = 'Notice description is required.';
  else if (description.length > MAX_DESCRIPTION) errors.description = `Description must be ${MAX_DESCRIPTION} characters or fewer.`;
  return { title, description, errors };
}

/** Shapes a raw row for the admin panel (camelCase + booleans). */
function mapNotice(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    isPublished: Boolean(row.is_published),
    createdAt: row.created_at,
    publishedAt: row.published_at,
    recipientCount: Number(row.recipient_count ?? 0),
    readCount: Number(row.read_count ?? 0),
  };
}

/**
 * Emails a published notice to every active, non-demo student and returns a
 * small delivery summary. Errors are logged, never thrown: the publish itself
 * has already committed and must not fail because SMTP is down.
 */
async function emailPublishedNotice({ id, title, description }) {
  if (!isMailConfigured()) {
    return { status: 'not_configured', sent: 0, failed: 0, total: 0 };
  }

  try {
    const [recipients] = await pool.execute(
      `SELECT full_name, email FROM users
        WHERE role = 'student' AND account_status = 'active' AND is_demo = 0
          AND email IS NOT NULL AND email <> ''`,
    );
    if (!recipients.length) {
      return { status: 'no_recipients', sent: 0, failed: 0, total: 0 };
    }

    const result = await sendBulk(
      recipients,
      (recipient) => sendNoticeEmail(recipient.email, { name: recipient.full_name, title, description }),
      { label: `notice ${id}` },
    );
    return {
      status: result.failed === 0 ? 'sent' : result.sent === 0 ? 'failed' : 'partial',
      sent: result.sent,
      failed: result.failed,
      total: result.total,
    };
  } catch (err) {
    console.error(`[notices] Email delivery for notice ${id} failed:`, err.message);
    return { status: 'failed', sent: 0, failed: 0, total: 0 };
  }
}

/** Human-readable publish result shown in the admin panel. */
function publishMessage(recipients, email) {
  const base = `Notice published to ${recipients} student(s).`;
  if (email.status === 'skipped') return `${base} The notice was already published, so no new emails were sent.`;
  if (email.status === 'not_configured') return `${base} Email delivery is not configured.`;
  if (email.status === 'no_recipients') return `${base} No student email addresses were available.`;
  if (email.status === 'failed') return `${base} Email delivery failed — students will still see it in the app.`;
  if (email.status === 'partial') {
    return `${base} Email sent to ${email.sent} of ${email.total} address(es); ${email.failed} failed.`;
  }
  return `${base} Email sent to ${email.sent} address(es).`;
}

// ============================================================================
// LIST — drafts + published together (optional ?published=true|false filter)
// ============================================================================
router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const offset = (page - 1) * limit;

    const conditions = [];
    const params = [];

    // Only narrow the set when the panel actually asks for it — otherwise the
    // default view must show every notice (published ones included).
    if (req.query.published === 'true') {
      conditions.push('gn.is_published = 1');
    } else if (req.query.published === 'false') {
      conditions.push('gn.is_published = 0');
    }

    const whereSql = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';

    const [[{ total }]] = await pool.execute(
      `SELECT COUNT(*) AS total FROM global_notices gn${whereSql}`,
      params,
    );

    const [rows] = await pool.execute(
      `SELECT gn.id, gn.title, gn.description, gn.is_published, gn.created_at, gn.published_at,
              (SELECT COUNT(*) FROM users u WHERE u.role = 'student' AND u.account_status = 'active') AS recipient_count,
              (SELECT COUNT(*) FROM student_notice_status sns WHERE sns.notice_id = gn.id AND sns.read_at IS NOT NULL) AS read_count
         FROM global_notices gn${whereSql}
         ORDER BY gn.is_published DESC, gn.created_at DESC
         LIMIT ${limit} OFFSET ${offset}`,
      params,
    );

    res.json({ notices: rows.map(mapNotice), total, page, limit, pages: Math.ceil(total / limit) || 1 });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// CREATE — starts as a draft; publish it from the list to deliver to students
// ============================================================================
router.post('/', async (req, res, next) => {
  const { title, description, errors } = validateNotice(req.body);
  if (Object.keys(errors).length) {
    return res.status(400).json({ message: 'Please correct the highlighted fields.', errors });
  }

  // Optional: create and publish in one step from the form.
  const publishNow = req.body.isPublished === true || req.body.is_published === true;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [result] = await conn.execute(
      `INSERT INTO global_notices (title, description, is_published, published_at)
       VALUES (?, ?, ?, ${publishNow ? 'UTC_TIMESTAMP()' : 'NULL'})`,
      [title, description, publishNow ? 1 : 0],
    );
    const noticeId = result.insertId;

    if (publishNow) {
      // Deliver to every active student account.
      await conn.execute(
        `INSERT INTO student_notice_status (student_id, notice_id, read_at, dismissed_at)
         SELECT u.id, ?, NULL, NULL FROM users u
          WHERE u.role = 'student' AND u.account_status = 'active'`,
        [noticeId],
      );
    }

    await audit(conn, req, 'notice.create', 'global_notice', noticeId, { title, published: publishNow });
    await conn.commit();

    let recipients = 0;
    let email = { status: 'skipped', sent: 0, failed: 0, total: 0 };
    if (publishNow) {
      const [[row]] = await pool.execute(
        'SELECT COUNT(*) AS count FROM student_notice_status WHERE notice_id = ?',
        [noticeId],
      );
      recipients = Number(row.count);
      email = await emailPublishedNotice({ id: noticeId, title, description });
    }

    res.status(201).json({
      message: publishNow ? publishMessage(recipients, email) : 'Notice saved as a draft.',
      notice: { id: noticeId, title, description, isPublished: publishNow },
      recipients,
      email,
    });
  } catch (err) {
    await conn.rollback().catch(() => {});
    next(err);
  } finally {
    conn.release();
  }
});

// ============================================================================
// EDIT — content only; publish state is changed through the publish endpoint
// ============================================================================
router.put('/:id', async (req, res, next) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: 'Invalid notice id.' });

  const { title, description, errors } = validateNotice(req.body);
  if (Object.keys(errors).length) {
    return res.status(400).json({ message: 'Please correct the highlighted fields.', errors });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[existing]] = await conn.execute(
      'SELECT id, title, is_published FROM global_notices WHERE id = ? FOR UPDATE',
      [id],
    );
    if (!existing) {
      await conn.rollback();
      return res.status(404).json({ message: 'Notice not found.' });
    }

    await conn.execute('UPDATE global_notices SET title = ?, description = ? WHERE id = ?', [title, description, id]);
    await audit(conn, req, 'notice.update', 'global_notice', id, { title });
    await conn.commit();

    res.json({ message: 'Notice updated successfully.', notice: { id, title, description } });
  } catch (err) {
    await conn.rollback().catch(() => {});
    next(err);
  } finally {
    conn.release();
  }
});

// ============================================================================
// PUBLISH / UNPUBLISH — publishing delivers the notice to every student
// ============================================================================
router.put('/:id/publish', async (req, res, next) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: 'Invalid notice id.' });

  const publish = req.body.is_published === true || req.body.isPublished === true;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[existing]] = await conn.execute(
      'SELECT id, title, description, is_published FROM global_notices WHERE id = ? FOR UPDATE',
      [id],
    );
    if (!existing) {
      await conn.rollback();
      return res.status(404).json({ message: 'Notice not found.' });
    }
    const wasPublished = Boolean(existing.is_published);

    if (publish) {
      await conn.execute(
        'UPDATE global_notices SET is_published = 1, published_at = UTC_TIMESTAMP() WHERE id = ?',
        [id],
      );
      // Every active student gets an (unread) row; ON DUPLICATE keeps existing state
      // for students who already saw an earlier publish of this notice.
      await conn.execute(
        `INSERT INTO student_notice_status (student_id, notice_id, read_at, dismissed_at)
         SELECT u.id, ?, NULL, NULL FROM users u
          WHERE u.role = 'student' AND u.account_status = 'active'
         ON DUPLICATE KEY UPDATE dismissed_at = NULL`,
        [id],
      );
    } else {
      await conn.execute('UPDATE global_notices SET is_published = 0, published_at = NULL WHERE id = ?', [id]);
    }

    await audit(conn, req, publish ? 'notice.publish' : 'notice.unpublish', 'global_notice', id);
    await conn.commit();

    const [[{ recipients }]] = await pool.execute(
      'SELECT COUNT(*) AS recipients FROM student_notice_status WHERE notice_id = ?',
      [id],
    );

    // Only a draft -> published transition is a new publication worth emailing.
    let email = { status: 'skipped', sent: 0, failed: 0, total: 0 };
    if (publish && !wasPublished) {
      email = await emailPublishedNotice({ id, title: existing.title, description: existing.description });
    }

    res.json({
      message: publish
        ? publishMessage(Number(recipients), email)
        : 'Notice unpublished. Students no longer see it.',
      notice: { id, isPublished: publish },
      recipients: Number(recipients),
      email,
    });
  } catch (err) {
    await conn.rollback().catch(() => {});
    next(err);
  } finally {
    conn.release();
  }
});

// ============================================================================
// DELETE — removes the notice and every per-student status row
// ============================================================================
router.delete('/:id', async (req, res, next) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: 'Invalid notice id.' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[existing]] = await conn.execute('SELECT id, title FROM global_notices WHERE id = ? FOR UPDATE', [id]);
    if (!existing) {
      await conn.rollback();
      return res.status(404).json({ message: 'Notice not found.' });
    }

    await conn.execute('DELETE FROM student_notice_status WHERE notice_id = ?', [id]);
    await conn.execute('DELETE FROM global_notices WHERE id = ?', [id]);
    await audit(conn, req, 'notice.delete', 'global_notice', id, { title: existing.title });
    await conn.commit();

    res.json({ message: 'Notice deleted permanently.' });
  } catch (err) {
    await conn.rollback().catch(() => {});
    next(err);
  } finally {
    conn.release();
  }
});

export default router;
