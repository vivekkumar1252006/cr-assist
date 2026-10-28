import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { pool } from './db.js';
import authRoutes from './routes/auth.js';
import studentRoutes from './routes/student.js';
import attendanceRoutes from './routes/attendance.js';
import complaintRoutes from './routes/complaints.js';
import notificationRoutes from './routes/notifications.js';
import adminRoutes from './routes/admin.js';
import facultyRoutes from './routes/faculty.js';
import inchargeRoutes from './routes/incharges.js';
import apkRoutes from './routes/apk.js';
import aboutRoutes from './routes/about.js';
import adminNoticesRoutes from './routes/adminNotices.js';
import studentNoticesRoutes from './routes/studentNotices.js';

const app = express();

app.set('trust proxy', 1);
app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      // Requests without an Origin (same-origin, curl, server-to-server) are allowed.
      // Unknown origins simply get no CORS headers instead of a 500 from the error handler.
      callback(null, !origin || config.clientOrigins.includes(origin));
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: '20kb' }));
app.use(cookieParser());

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch {
    res.status(503).json({ status: 'error', database: 'unreachable' });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/faculty', facultyRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/complaints', complaintRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/notices', adminNoticesRoutes);
app.use('/api/student/notices', studentNoticesRoutes);
app.use('/api/incharges', inchargeRoutes);
app.use('/api/apk', apkRoutes);
app.use('/api/about', aboutRoutes);

app.use('/api', (req, res) => res.status(404).json({ message: 'Not found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ message: 'Invalid JSON body' });
  console.error(err);
  const dbDown = ['ECONNREFUSED', 'ER_ACCESS_DENIED_ERROR', 'ER_BAD_DB_ERROR', 'ER_NO_SUCH_TABLE'].includes(err.code);
  res.status(dbDown ? 503 : 500).json({
    code: dbDown ? 'DATABASE_UNAVAILABLE' : 'INTERNAL_ERROR',
    message: dbDown
      ? 'The service is temporarily unavailable (database connection failed).'
      : 'Something went wrong. Please try again.',
  });
});

app.listen(config.port, config.host, () => {
  console.log(`CR-Assist API listening on http://${config.host}:${config.port}`);
  console.log('New accounts start as: active (no approval required)');
});
