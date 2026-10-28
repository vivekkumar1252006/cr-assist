import express from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { pool } from '../db.js';
import { config } from '../config.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { cleanFilename } from '../utils/fileTypes.js';

const router = express.Router();
const apkDir = path.join(config.uploadDir, 'apk');
const maxApkBytes = 150 * 1024 * 1024;

await fs.mkdir(apkDir, { recursive: true });

function getApkPath(fileName) {
  if (!fileName || path.basename(fileName) !== fileName) return null;
  const resolvedPath = path.resolve(apkDir, fileName);
  return resolvedPath.startsWith(`${path.resolve(apkDir)}${path.sep}`) ? resolvedPath : null;
}

async function removeApkFile(fileName) {
  const filePath = getApkPath(fileName);
  if (!filePath) {
    console.error('Refusing to remove APK with invalid stored filename.');
    return false;
  }

  try {
    await fs.unlink(filePath);
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') return true;
    console.error('Failed to remove stored APK:', err);
    return false;
  }
}

async function isAvailableApk(fileName) {
  const filePath = getApkPath(fileName);
  if (!filePath) return false;

  try {
    return (await fs.stat(filePath)).isFile();
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    throw err;
  }
}

export async function hasApkStructure(filePath) {
  const handle = await fs.open(filePath, 'r');
  try {
    const { size } = await handle.stat();
    if (size < 22) return false;

    const readRange = async (position, length) => {
      const buffer = Buffer.alloc(length);
      let totalRead = 0;
      while (totalRead < length) {
        const { bytesRead } = await handle.read(
          buffer,
          totalRead,
          length - totalRead,
          position + totalRead,
        );
        if (bytesRead === 0) return null;
        totalRead += bytesRead;
      }
      return buffer;
    };

    const header = await readRange(0, 4);
    if (!header?.equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) return false;

    const tailLength = Math.min(size, 65557);
    const tail = await readRange(size - tailLength, tailLength);
    if (!tail) return false;
    const endSignature = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
    const endOffset = tail.lastIndexOf(endSignature);
    if (endOffset < 0 || endOffset + 22 > tail.length) return false;

    const commentLength = tail.readUInt16LE(endOffset + 20);
    if (endOffset + 22 + commentLength !== tail.length) return false;

    const entryCount = tail.readUInt16LE(endOffset + 10);
    const directorySize = tail.readUInt32LE(endOffset + 12);
    const directoryOffset = tail.readUInt32LE(endOffset + 16);
    const endOfDirectory = directoryOffset + directorySize;
    const endOfArchive = size - tailLength + endOffset;
    if (
      entryCount === 0xffff
      || directorySize === 0xffffffff
      || directoryOffset === 0xffffffff
      || directorySize > 32 * 1024 * 1024
      || endOfDirectory > endOfArchive
    ) {
      return false;
    }

    const directory = await readRange(directoryOffset, directorySize);
    if (!directory) return false;

    let offset = 0;
    let foundManifest = false;
    for (let entry = 0; entry < entryCount; entry += 1) {
      if (offset + 46 > directory.length || directory.readUInt32LE(offset) !== 0x02014b50) {
        return false;
      }
      const nameLength = directory.readUInt16LE(offset + 28);
      const extraLength = directory.readUInt16LE(offset + 30);
      const entryCommentLength = directory.readUInt16LE(offset + 32);
      const nameStart = offset + 46;
      const nextOffset = nameStart + nameLength + extraLength + entryCommentLength;
      if (nextOffset > directory.length) return false;
      if (directory.toString('utf8', nameStart, nameStart + nameLength) === 'AndroidManifest.xml') {
        foundManifest = true;
      }
      offset = nextOffset;
    }
    return foundManifest && offset === directory.length;
  } finally {
    await handle.close();
  }
}

const storage = multer.diskStorage({
  destination: apkDir,
  filename: (req, file, cb) => {
    cb(null, `app-release-${Date.now()}-${crypto.randomBytes(12).toString('hex')}.apk`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: maxApkBytes, files: 1, fields: 4, fieldSize: 60 * 1024 },
  fileFilter: (req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() !== '.apk') {
      return cb(new Error('Only .apk files are allowed.'));
    }
    cb(null, true);
  },
});

function handleApkUpload(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ message: 'APK file must be 150 MB or smaller.' });
      }
      return res.status(400).json({ message: `Upload error: ${err.message}` });
    }
    if (err) return res.status(400).json({ message: err.message || 'Invalid APK file.' });
    next();
  });
}

function validateReleaseDetails(body) {
  const appName = String(body.appName ?? '').trim();
  const versionName = String(body.versionName ?? '').trim();
  const versionCodeText = String(body.versionCode ?? '1').trim();
  const releaseNotes = String(body.releaseNotes ?? '').trim();

  if (!appName || appName.length > 150) {
    return { error: 'App name is required and must be 150 characters or fewer.' };
  }
  if (!versionName || versionName.length > 50) {
    return { error: 'Version name is required and must be 50 characters or fewer.' };
  }
  if (!/^[1-9]\d{0,9}$/.test(versionCodeText) || Number(versionCodeText) > 4294967295) {
    return { error: 'Version code must be a positive whole number.' };
  }
  if (releaseNotes.length > 60000) {
    return { error: 'Release notes must be 60,000 characters or fewer.' };
  }

  return {
    appName,
    versionName,
    versionCode: Number(versionCodeText),
    releaseNotes: releaseNotes || null,
  };
}

router.get('/latest', requireAuth, requireRole('student', 'admin'), async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT a.id, a.app_name, a.version_name, a.version_code, a.file_name, a.original_name,
              a.file_size, a.download_url, a.release_notes, a.uploaded_at, u.full_name AS uploader_name
         FROM apk_releases a
         LEFT JOIN users u ON u.id = a.uploaded_by
        ORDER BY a.uploaded_at DESC, a.id DESC
        LIMIT 1`,
    );

    if (rows.length === 0) return res.json({ apk: null });

    const row = rows[0];
    return res.json({
      apk: {
        id: row.id,
        appName: row.app_name,
        versionName: row.version_name,
        versionCode: row.version_code,
        fileName: row.original_name,
        fileSize: Number(row.file_size),
        downloadUrl: row.download_url,
        releaseNotes: row.release_notes,
        uploadedAt: row.uploaded_at,
        uploaderName: row.uploader_name || 'System Admin',
        isAvailable: await isAvailableApk(row.file_name),
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/download', requireAuth, requireRole('student', 'admin'), async (req, res, next) => {
  try {
    // Students can pin the download to the release they were shown by passing
    // `?id=`. Without it the newest release is served, preserving the original
    // behaviour used by the web portal.
    const requestedId = /^\d{1,10}$/.test(String(req.query.id ?? ''))
      ? Number.parseInt(req.query.id, 10)
      : null;

    const [rows] = requestedId
      ? await pool.execute(
          `SELECT app_name, version_name, file_name, file_size
             FROM apk_releases
            WHERE id = ?
            LIMIT 1`,
          [requestedId],
        )
      : await pool.execute(
          `SELECT app_name, version_name, file_name, file_size
             FROM apk_releases
            ORDER BY uploaded_at DESC, id DESC
            LIMIT 1`,
        );
    if (rows.length === 0) {
      return res.status(404).json({
        message: requestedId
          ? 'This APK release is no longer available. Check for updates again.'
          : 'No APK release is currently available for download.',
      });
    }

    const apk = rows[0];
    const filePath = getApkPath(apk.file_name);
    if (!filePath || !(await isAvailableApk(apk.file_name))) {
      return res.status(404).json({ message: 'APK file was not found in server storage.' });
    }

    const safeAppName = apk.app_name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const downloadName = `${safeAppName}_v${apk.version_name.replace(/[^a-zA-Z0-9._-]/g, '_')}.apk`;
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Length', apk.file_size);
    res.setHeader('Cache-Control', 'private, no-store');
    res.download(filePath, downloadName, (err) => {
      if (!err) return;
      if (res.headersSent) return res.destroy(err);
      next(err);
    });
  } catch (err) {
    next(err);
  }
});

router.post('/upload', requireAuth, requireRole('admin'), handleApkUpload, async (req, res, next) => {
  if (!req.file) return res.status(400).json({ message: 'Please select an .apk file to upload.' });

  let uploadedFileRemoved = false;
  const removeNewFile = async () => {
    await removeApkFile(req.file.filename);
    uploadedFileRemoved = true;
  };

  try {
    const details = validateReleaseDetails(req.body);
    if (details.error) {
      await removeNewFile();
      return res.status(400).json({ message: details.error });
    }
    if (!(await hasApkStructure(req.file.path))) {
      await removeNewFile();
      return res.status(400).json({ message: 'The selected file is not a valid Android APK package.' });
    }

    const connection = await pool.getConnection();
    let oldReleases = [];
    try {
      await connection.beginTransaction();
      [oldReleases] = await connection.execute('SELECT file_name FROM apk_releases FOR UPDATE');
      await connection.execute('DELETE FROM apk_releases');
      const [result] = await connection.execute(
        `INSERT INTO apk_releases
           (app_name, version_name, version_code, file_name, original_name, file_path, file_size,
            mime_type, download_url, release_notes, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          details.appName,
          details.versionName,
          details.versionCode,
          req.file.filename,
          cleanFilename(req.file.originalname),
          path.posix.join('uploads', 'apk', req.file.filename),
          req.file.size,
          'application/vnd.android.package-archive',
          '/api/apk/download',
          details.releaseNotes,
          req.user.id,
        ],
      );
      await connection.commit();

      const cleanupResults = await Promise.all(oldReleases.map((release) => removeApkFile(release.file_name)));
      const cleanupWarning = cleanupResults.some((success) => !success);

      return res.status(201).json({
        message: cleanupWarning
          ? 'APK published, but a previous file could not be removed from server storage.'
          : 'APK uploaded and published successfully.',
        apk: {
          id: result.insertId,
          appName: details.appName,
          versionName: details.versionName,
          versionCode: details.versionCode,
          fileName: cleanFilename(req.file.originalname),
          fileSize: req.file.size,
          downloadUrl: '/api/apk/download',
          releaseNotes: details.releaseNotes,
          uploadedAt: new Date().toISOString(),
          uploaderName: req.user.full_name,
          isAvailable: true,
        },
      });
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  } catch (err) {
    if (!uploadedFileRemoved) await removeNewFile();
    next(err);
  }
});

router.delete('/', requireAuth, requireRole('admin'), async (req, res, next) => {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [releases] = await connection.execute('SELECT file_name FROM apk_releases FOR UPDATE');
    if (releases.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'No APK found to delete.' });
    }
    await connection.execute('DELETE FROM apk_releases');
    await connection.commit();

    const cleanupResults = await Promise.all(releases.map((release) => removeApkFile(release.file_name)));
    return res.json({
      message: cleanupResults.some((success) => !success)
        ? 'APK removed from the student portal, but a file could not be removed from server storage.'
        : 'APK has been deleted successfully.',
    });
  } catch (err) {
    if (connection) await connection.rollback();
    next(err);
  } finally {
    connection?.release();
  }
});

export default router;
