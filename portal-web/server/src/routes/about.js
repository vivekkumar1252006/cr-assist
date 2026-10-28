import { Router } from 'express';
import multer from 'multer';
import { pool } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { detectFileType } from '../utils/fileTypes.js';

const router = Router();
const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5 MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PHOTO_BYTES, files: 1, fields: 10 },
});

function receiveDeveloperPhoto(req, res, next) {
  upload.single('photo')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? 'Profile picture must be 5 MB or smaller.'
          : 'Invalid upload. Choose one JPG, PNG or WebP image.';
      return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ message });
    }
    next(err);
  });
}

function validatePhoto(file) {
  if (!file) return null;
  const type = detectFileType(file.buffer, ['jpg', 'png', 'webp']);
  return type ? { type } : { error: 'Profile picture must be a JPG, PNG or WebP image.' };
}

function formatDeveloper(row) {
  return {
    id: row.id,
    name: row.name,
    role: row.role || 'App Developer',
    email: row.email,
    phone: row.phone,
    bio: row.bio || '',
    hasPhoto: Boolean(row.has_photo),
    photoUrl: row.has_photo ? `/api/about/developers/${row.id}/photo?v=${new Date(row.updated_at).getTime()}` : null,
    sortOrder: row.sort_order || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function formatAppCard(row) {
  let features = [];
  if (row.features) {
    try {
      features = typeof row.features === 'string' ? JSON.parse(row.features) : row.features;
    } catch (_) {
      features = [];
    }
  }
  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle || '',
    description: row.description,
    features: Array.isArray(features) ? features : [],
    badge: row.badge || '',
    sortOrder: row.sort_order || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ----------------------------------------------------------------------------
// Public / Authenticated Reads
// ----------------------------------------------------------------------------

/**
 * GET /api/about
 * Returns all About App cards and Developer profiles.
 */
router.get('/', async (req, res, next) => {
  try {
    const [appRows] = await pool.execute(
      `SELECT id, title, subtitle, description, features, badge, sort_order, created_at, updated_at
         FROM about_app_cards
        ORDER BY sort_order ASC, id ASC`
    );

    const [devRows] = await pool.execute(
      `SELECT id, name, role, email, phone, bio, (photo_data IS NOT NULL) AS has_photo, sort_order, created_at, updated_at
         FROM about_developers
        ORDER BY sort_order ASC, id ASC`
    );

    res.json({
      appCards: appRows.map(formatAppCard),
      developers: devRows.map(formatDeveloper),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/about/developers/:id/photo
 * Streams developer profile picture.
 */
router.get('/developers/:id/photo', async (req, res, next) => {
  try {
    if (!/^\d{1,10}$/.test(req.params.id)) {
      return res.status(404).json({ message: 'Profile picture not found.' });
    }

    const [[row]] = await pool.execute(
      'SELECT photo_data, photo_mime FROM about_developers WHERE id = ?',
      [req.params.id]
    );

    if (!row || !row.photo_data) {
      return res.status(404).json({ message: 'Profile picture not found.' });
    }

    res.set({
      'Content-Type': row.photo_mime || 'image/jpeg',
      'Cache-Control': 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    });
    res.send(row.photo_data);
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------------------------------
// Admin Management Routes
// ----------------------------------------------------------------------------

// ==================== APP CARDS ====================

/**
 * POST /api/about/app-cards
 * Admin: Add new About App card.
 */
router.post('/app-cards', requireAuth, requireRole('admin'), async (req, res, next) => {
  const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
  const subtitle = typeof req.body.subtitle === 'string' ? req.body.subtitle.trim() : '';
  const description = typeof req.body.description === 'string' ? req.body.description.trim() : '';
  const badge = typeof req.body.badge === 'string' ? req.body.badge.trim() : '';
  const sortOrder = parseInt(req.body.sortOrder, 10) || 0;
  let features = req.body.features;

  if (typeof features === 'string') {
    try {
      features = JSON.parse(features);
    } catch (_) {
      features = [];
    }
  }

  if (!title) return res.status(400).json({ message: 'Card title is required.' });
  if (!description) return res.status(400).json({ message: 'Card description is required.' });

  try {
    const [result] = await pool.execute(
      `INSERT INTO about_app_cards (title, subtitle, description, features, badge, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [title, subtitle, description, JSON.stringify(Array.isArray(features) ? features : []), badge, sortOrder]
    );

    const [[created]] = await pool.execute(
      'SELECT id, title, subtitle, description, features, badge, sort_order, created_at, updated_at FROM about_app_cards WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json({
      message: 'About App card added successfully.',
      card: formatAppCard(created),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/about/app-cards/:id
 * Admin: Edit About App card.
 */
router.put('/app-cards/:id', requireAuth, requireRole('admin'), async (req, res, next) => {
  const id = Number.parseInt(req.params.id, 10);
  const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
  const subtitle = typeof req.body.subtitle === 'string' ? req.body.subtitle.trim() : '';
  const description = typeof req.body.description === 'string' ? req.body.description.trim() : '';
  const badge = typeof req.body.badge === 'string' ? req.body.badge.trim() : '';
  const sortOrder = parseInt(req.body.sortOrder, 10) || 0;
  let features = req.body.features;

  if (typeof features === 'string') {
    try {
      features = JSON.parse(features);
    } catch (_) {
      features = [];
    }
  }

  if (!title) return res.status(400).json({ message: 'Card title is required.' });
  if (!description) return res.status(400).json({ message: 'Card description is required.' });

  try {
    const [result] = await pool.execute(
      `UPDATE about_app_cards
          SET title = ?, subtitle = ?, description = ?, features = ?, badge = ?, sort_order = ?
        WHERE id = ?`,
      [title, subtitle, description, JSON.stringify(Array.isArray(features) ? features : []), badge, sortOrder, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'App card not found.' });
    }

    const [[updated]] = await pool.execute(
      'SELECT id, title, subtitle, description, features, badge, sort_order, created_at, updated_at FROM about_app_cards WHERE id = ?',
      [id]
    );

    res.json({
      message: 'About App card updated successfully.',
      card: formatAppCard(updated),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/about/app-cards/:id
 * Admin: Delete About App card.
 */
router.delete('/app-cards/:id', requireAuth, requireRole('admin'), async (req, res, next) => {
  const id = Number.parseInt(req.params.id, 10);
  try {
    const [result] = await pool.execute('DELETE FROM about_app_cards WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'App card not found.' });
    }
    res.json({ message: 'App card deleted successfully.' });
  } catch (err) {
    next(err);
  }
});

// ==================== DEVELOPER PROFILES ====================

/**
 * POST /api/about/developers
 * Admin: Add new Developer profile.
 */
router.post('/developers', requireAuth, requireRole('admin'), receiveDeveloperPhoto, async (req, res, next) => {
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  const role = typeof req.body.role === 'string' ? req.body.role.trim() : 'App Developer';
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const phone = typeof req.body.phone === 'string' ? req.body.phone.trim() : '';
  const bio = typeof req.body.bio === 'string' ? req.body.bio.trim() : '';
  const sortOrder = parseInt(req.body.sortOrder, 10) || 0;

  const errors = {};
  if (!name || name.length < 2) errors.name = 'Name must be at least 2 characters.';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email address.';
  if (!phone || phone.replace(/\D/g, '').length < 7) errors.phone = 'Enter a valid contact phone number.';

  let photoMeta = null;
  if (req.file) {
    const p = validatePhoto(req.file);
    if (p?.error) errors.photo = p.error;
    else if (p?.type) photoMeta = p.type;
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ message: 'Please correct the highlighted fields.', errors });
  }

  try {
    const [result] = await pool.execute(
      `INSERT INTO about_developers (name, role, email, phone, bio, photo_data, photo_mime, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        role,
        email,
        phone,
        bio,
        req.file ? req.file.buffer : null,
        photoMeta ? photoMeta.mime : null,
        sortOrder,
      ]
    );

    const [[created]] = await pool.execute(
      `SELECT id, name, role, email, phone, bio, (photo_data IS NOT NULL) AS has_photo, sort_order, created_at, updated_at
         FROM about_developers WHERE id = ?`,
      [result.insertId]
    );

    res.status(201).json({
      message: 'Developer profile added successfully.',
      developer: formatDeveloper(created),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/about/developers/:id
 * Admin: Edit Developer profile.
 */
router.put('/developers/:id', requireAuth, requireRole('admin'), receiveDeveloperPhoto, async (req, res, next) => {
  const id = Number.parseInt(req.params.id, 10);
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  const role = typeof req.body.role === 'string' ? req.body.role.trim() : 'App Developer';
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const phone = typeof req.body.phone === 'string' ? req.body.phone.trim() : '';
  const bio = typeof req.body.bio === 'string' ? req.body.bio.trim() : '';
  const sortOrder = parseInt(req.body.sortOrder, 10) || 0;

  const errors = {};
  if (!name || name.length < 2) errors.name = 'Name must be at least 2 characters.';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email address.';
  if (!phone || phone.replace(/\D/g, '').length < 7) errors.phone = 'Enter a valid contact phone number.';

  let photoMeta = null;
  if (req.file) {
    const p = validatePhoto(req.file);
    if (p?.error) errors.photo = p.error;
    else if (p?.type) photoMeta = p.type;
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ message: 'Please correct the highlighted fields.', errors });
  }

  try {
    if (req.file && photoMeta) {
      await pool.execute(
        `UPDATE about_developers
            SET name = ?, role = ?, email = ?, phone = ?, bio = ?, photo_data = ?, photo_mime = ?, sort_order = ?
          WHERE id = ?`,
        [name, role, email, phone, bio, req.file.buffer, photoMeta.mime, sortOrder, id]
      );
    } else {
      await pool.execute(
        `UPDATE about_developers
            SET name = ?, role = ?, email = ?, phone = ?, bio = ?, sort_order = ?
          WHERE id = ?`,
        [name, role, email, phone, bio, sortOrder, id]
      );
    }

    const [[updated]] = await pool.execute(
      `SELECT id, name, role, email, phone, bio, (photo_data IS NOT NULL) AS has_photo, sort_order, created_at, updated_at
         FROM about_developers WHERE id = ?`,
      [id]
    );

    if (!updated) {
      return res.status(404).json({ message: 'Developer profile not found.' });
    }

    res.json({
      message: 'Developer profile updated successfully.',
      developer: formatDeveloper(updated),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/about/developers/:id
 * Admin: Delete Developer profile.
 */
router.delete('/developers/:id', requireAuth, requireRole('admin'), async (req, res, next) => {
  const id = Number.parseInt(req.params.id, 10);
  try {
    const [result] = await pool.execute('DELETE FROM about_developers WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Developer profile not found.' });
    }
    res.json({ message: 'Developer profile deleted successfully.' });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/about/developers/:id/photo
 * Admin: Delete only Developer profile photo.
 */
router.delete('/developers/:id/photo', requireAuth, requireRole('admin'), async (req, res, next) => {
  const id = Number.parseInt(req.params.id, 10);
  try {
    await pool.execute('UPDATE about_developers SET photo_data = NULL, photo_mime = NULL WHERE id = ?', [id]);
    res.json({ message: 'Profile picture removed.' });
  } catch (err) {
    next(err);
  }
});

export default router;
