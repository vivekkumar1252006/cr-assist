import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

// In-app notifications for the signed-in user only.
const router = Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, type, title, message, link, read_at, created_at FROM notifications
        WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 20`,
      [req.user.id],
    );
    const [[{ unread }]] = await pool.execute('SELECT COUNT(*) AS unread FROM notifications WHERE user_id = ? AND read_at IS NULL', [req.user.id]);
    res.json({
      unread: Number(unread),
      items: rows.map((r) => ({
        id: r.id, type: r.type, title: r.title, message: r.message, link: r.link, read: Boolean(r.read_at), createdAt: r.created_at,
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/read-all', async (req, res, next) => {
  try {
    await pool.execute('UPDATE notifications SET read_at = UTC_TIMESTAMP() WHERE user_id = ? AND read_at IS NULL', [req.user.id]);
    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/read', async (req, res, next) => {
  try {
    const id = /^\d{1,10}$/.test(req.params.id) ? Number(req.params.id) : null;
    if (!id) return res.status(404).json({ message: 'Notification not found' });
    const [r] = await pool.execute('UPDATE notifications SET read_at = COALESCE(read_at, UTC_TIMESTAMP()) WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (!r.affectedRows) return res.status(404).json({ message: 'Notification not found' });
    res.json({ message: 'Marked as read' });
  } catch (err) {
    next(err);
  }
});

export default router;
