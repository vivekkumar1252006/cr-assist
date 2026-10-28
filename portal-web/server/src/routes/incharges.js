import { Router } from 'express';
import multer from 'multer';
import { pool } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { detectFileType } from '../utils/fileTypes.js';

const router = Router();
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PHOTO_BYTES, files: 1, fields: 4 },
});

function receivePhoto(req, res, next) {
  upload.single('photo')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? 'Profile picture must be 2 MB or smaller.'
        : 'Invalid upload. Choose one JPG, PNG or WebP profile picture.';
      return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ message });
    }
    next(err);
  });
}

function validateContact(body) {
  const errors = {};
  const data = {
    name: typeof body.name === 'string' ? body.name.trim() : '',
    designation: typeof body.designation === 'string' ? body.designation.trim() : '',
    email: typeof body.email === 'string' ? body.email.trim().toLowerCase() : '',
    phone: typeof body.phone === 'string' ? body.phone.trim() : '',
  };

  if (data.name.length < 2 || data.name.length > 100) errors.name = 'Name must be between 2 and 100 characters.';
  if (data.designation.length < 2 || data.designation.length > 100) errors.designation = 'Designation must be between 2 and 100 characters.';
  if (data.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) errors.email = 'Enter a valid email address.';
  const phoneDigits = data.phone.replace(/\D/g, '').length;
  if (data.phone.length > 30 || phoneDigits < 7 || phoneDigits > 15 || !/^[+\d\s().-]+$/.test(data.phone)) {
    errors.phone = 'Enter a valid phone number with 7 to 15 digits.';
  }

  return { data, errors };
}

let hasPhotoUrlCol = null;
async function ensurePhotoUrlColumn() {
  if (hasPhotoUrlCol !== null) return hasPhotoUrlCol;
  try {
    const [cols] = await pool.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'incharge_contacts' AND COLUMN_NAME = 'photo_url'`
    );
    if (!cols.length) {
      await pool.query('ALTER TABLE incharge_contacts ADD COLUMN photo_url VARCHAR(255) NULL AFTER phone');
      await pool.query("UPDATE incharge_contacts SET photo_url = CONCAT('/api/incharges/', id, '/photo') WHERE (photo_url IS NULL OR photo_url = '') AND photo_data IS NOT NULL AND LENGTH(photo_data) > 0");
    }
    hasPhotoUrlCol = true;
    return true;
  } catch (err) {
    hasPhotoUrlCol = false;
    return false;
  }
}

function responseContact(row) {
  const hasPhoto = Boolean(row.has_photo ?? (row.photo_data && row.photo_data.length) ?? row.photo_url);
  const baseUrl = row.photo_url || (hasPhoto ? `/api/incharges/${row.id}/photo` : null);
  return {
    id: row.id,
    name: row.name,
    designation: row.designation,
    email: row.email,
    phone: row.phone,
    hasPhoto,
    photoUrl: baseUrl
      ? (baseUrl.includes('?v=') ? baseUrl : `${baseUrl}?v=${new Date(row.updated_at).getTime()}`)
      : null,
  };
}

function validatePhoto(file) {
  if (!file) return { error: 'Choose a profile picture.' };
  const type = detectFileType(file.buffer, ['jpg', 'png', 'webp']);
  return type ? { type } : { error: 'Profile picture must be a JPG, PNG or WebP image.' };
}

// ----------------------------------------------------------------------------
// Public profile picture endpoint
// Placed BEFORE requireAuth so <img> tags in student portal, admin panel,
// and mobile app can load directly without 401s or cookie blockers.
// ----------------------------------------------------------------------------
router.get('/:id/photo', async (req, res, next) => {
  try {
    if (!/^\d{1,10}$/.test(req.params.id)) return res.status(404).json({ message: 'Profile picture not found.' });
    const [[row]] = await pool.execute(
      'SELECT photo_data, photo_mime FROM incharge_contacts WHERE id = ?',
      [req.params.id],
    );
    if (!row || !row.photo_data || !row.photo_data.length) {
      return res.status(404).json({ message: 'Profile picture not found.' });
    }
    res.set({
      'Content-Type': row.photo_mime || 'image/jpeg',
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=3600',
      'X-Content-Type-Options': 'nosniff',
    });
    res.send(row.photo_data);
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------------------------------
// Authenticated Incharge Contacts API
// ----------------------------------------------------------------------------
router.use(requireAuth);

router.get('/', requireRole('student', 'admin'), async (req, res, next) => {
  try {
    const colAvailable = await ensurePhotoUrlColumn();
    const [rows] = await pool.execute(
      `SELECT id, name, designation, email, phone,
              ${colAvailable ? 'photo_url,' : ''}
              (photo_data IS NOT NULL AND LENGTH(photo_data) > 0) AS has_photo,
              updated_at
         FROM incharge_contacts
        ORDER BY name, id`,
    );
    res.json({ contacts: rows.map(responseContact) });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireRole('admin'), receivePhoto, async (req, res, next) => {
  const { data, errors } = validateContact(req.body);
  const photo = validatePhoto(req.file);
  if (photo.error) errors.photo = photo.error;
  if (Object.keys(errors).length) {
    return res.status(400).json({ message: 'Please correct the highlighted fields.', errors });
  }

  try {
    const colAvailable = await ensurePhotoUrlColumn();
    const [result] = await pool.execute(
      `INSERT INTO incharge_contacts (name, designation, email, phone, photo_data, photo_mime)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [data.name, data.designation, data.email, data.phone, req.file.buffer, photo.type.mime],
    );
    const photoUrl = `/api/incharges/${result.insertId}/photo`;
    if (colAvailable) {
      try {
        await pool.execute('UPDATE incharge_contacts SET photo_url = ? WHERE id = ?', [photoUrl, result.insertId]);
      } catch {}
    }
    const [[row]] = await pool.execute(
      `SELECT id, name, designation, email, phone,
              ${colAvailable ? 'photo_url,' : ''}
              (photo_data IS NOT NULL AND LENGTH(photo_data) > 0) AS has_photo,
              updated_at
         FROM incharge_contacts WHERE id = ?`,
      [result.insertId],
    );
    res.status(201).json({ message: 'In-charge contact added.', contact: responseContact(row) });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requireRole('admin'), receivePhoto, async (req, res, next) => {
  if (!/^\d{1,10}$/.test(req.params.id)) return res.status(404).json({ message: 'In-charge contact not found.' });
  const { data, errors } = validateContact(req.body);
  const photo = req.file ? validatePhoto(req.file) : null;
  if (photo?.error) errors.photo = photo.error;
  if (Object.keys(errors).length) {
    return res.status(400).json({ message: 'Please correct the highlighted fields.', errors });
  }

  try {
    const colAvailable = await ensurePhotoUrlColumn();
    const [[existing]] = await pool.execute('SELECT id FROM incharge_contacts WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ message: 'In-charge contact not found.' });

    const generatedPhotoUrl = req.file ? `/api/incharges/${req.params.id}/photo` : null;

    if (colAvailable) {
      await pool.execute(
        `UPDATE incharge_contacts
            SET name = ?, designation = ?, email = ?, phone = ?,
                photo_url = COALESCE(?, photo_url),
                photo_data = COALESCE(?, photo_data), photo_mime = COALESCE(?, photo_mime)
          WHERE id = ?`,
        [data.name, data.designation, data.email, data.phone, generatedPhotoUrl, req.file?.buffer ?? null, photo?.type.mime ?? null, req.params.id],
      );
    } else {
      await pool.execute(
        `UPDATE incharge_contacts
            SET name = ?, designation = ?, email = ?, phone = ?,
                photo_data = COALESCE(?, photo_data), photo_mime = COALESCE(?, photo_mime)
          WHERE id = ?`,
        [data.name, data.designation, data.email, data.phone, req.file?.buffer ?? null, photo?.type.mime ?? null, req.params.id],
      );
    }

    const [[row]] = await pool.execute(
      `SELECT id, name, designation, email, phone,
              ${colAvailable ? 'photo_url,' : ''}
              (photo_data IS NOT NULL AND LENGTH(photo_data) > 0) AS has_photo,
              updated_at
         FROM incharge_contacts WHERE id = ?`,
      [req.params.id],
    );
    res.json({ message: 'In-charge contact updated.', contact: responseContact(row) });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    if (!/^\d{1,10}$/.test(req.params.id)) return res.status(404).json({ message: 'In-charge contact not found.' });
    const [result] = await pool.execute('DELETE FROM incharge_contacts WHERE id = ?', [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ message: 'In-charge contact not found.' });
    res.json({ message: 'In-charge contact deleted.' });
  } catch (err) {
    next(err);
  }
});

export default router;
