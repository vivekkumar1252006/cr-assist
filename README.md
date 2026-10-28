# Class Representative Assist (SmartAttend)

Attendance + complaint portal for the college: students mark QR attendance, track attendance history,
raise complaints (including attendance-correction requests) and read notices; administrators manage
students, faculty, classes, attendance, complaints, reports and app releases.

| Layer    | Stack |
| -------- | ----- |
| Web app  | React 19, Vite 8, Tailwind CSS 4, React Router 7, Axios, Lucide |
| API      | Node.js + Express 5, mysql2 (parameterized queries), bcrypt, JWT in an HttpOnly cookie, multer, qrcode |
| Database | MariaDB 10.4+ / MySQL 8 (`smartattend`) |
| Mobile   | Flutter app in `portal-app/` |

## Repository layout

```
portal/
├── portal-web/                  Active web application
│   ├── index.html               Vite entry
│   ├── src/
│   │   ├── main.jsx             React entry → routes/index.jsx
│   │   ├── routes/index.jsx     Router, auth/role guards, lazy-loaded pages
│   │   ├── shared/              Auth pages, contexts, API client, reusable components
│   │   ├── student/             Student layout, pages and components (/student/*)
│   │   └── admin/               Admin layout, pages and components (/admin/*)
│   ├── server/
│   │   ├── src/
│   │   │   ├── index.js         Express app, route mounts, error handler
│   │   │   ├── config.js        .env loading + defaults
│   │   │   ├── routes/          auth, student, admin, faculty, attendance, complaints, …
│   │   │   ├── services/        attendance queries, audit log, notifications
│   │   │   ├── middleware/      requireAuth, requireRole
│   │   │   └── utils/           validation, file signatures, tokens, mailer
│   │   ├── scripts/             init-db, setup-accounts, init-admin, test-e2e
│   │   └── uploads/             avatars/, complaints/<id>/ (private, git-ignored)
│   ├── database/
│   │   ├── schema.sql           users, student_profiles, password_resets, attendance_*
│   │   └── migrations/          complaints, admin panel, APK, about page, in-charges
│   └── public/                  Logos and illustrations served by Vite
├── portal-app/                  Flutter mobile app
└── README.md
```

`portal-web/src/App.jsx`, `src/context/`, `src/lib/`, `src/student/lib/`, `src/admin/lib/`,
`src/admin/context/` and `src/shared/components/auth/student/` are older copies that are **not imported
by the app** (the live code uses `src/routes`, `src/shared/*`, `src/student/*`, `src/admin/*`).
They can be deleted once nothing else references them.

## Setup

Prerequisites: Node.js 20+, and a running MariaDB/MySQL server.

```bash
cd portal-web

# 1. Install dependencies (web + API)
npm install
npm --prefix server install

# 2. Configure the API
#    copy server/.env.example to server/.env and set DB_* + a long JWT_SECRET
#    (add SMTP_* as well to enable the three transactional emails — see below)

# 3. Create the database, apply schema + migrations
npm run db:init

# 4. Create the admin and demo student logins
npm run setup:accounts

# 5. Start API (5000) + web app (8080) together
npm run dev
```

Open http://localhost:8080. The API health check is http://localhost:5000/api/health.

### Accounts created by `npm run setup:accounts`

| Role | Login | Password |
| ---- | ----- | -------- |
| Admin | `admin@gmail.com` | `admin@12345` |
| Student | `arunsingh2364@gmail.com` or enrollment `0111IT251014` | `arun@12345` |

Change these before any real deployment. New self-registered accounts stay `pending` until an admin
activates them (`REQUIRE_APPROVAL=false` changes that).

## Frontend routes

| Student (`/student/*`) | Admin (`/admin/*`) |
| --- | --- |
| `/dashboard` | `/` (dashboard) |
| `/profile` | `/students` |
| `/qr` | `/faculty` |
| `/attendance` | `/classes` |
| `/attendance-complaint` | `/attendance` |
| `/complaints`, `/complaints/new`, `/complaints/:id` | `/attendance-complaints` |
| `/help` | `/complaints` |
| `/about-developer` | `/reports` |
| `/download-app` | `/incharges` |
| | `/manage-apk` |
| | `/about-management` |
| | `/settings` |

Public routes: `/login`, `/register`, `/forgot-password`, `/policies`. `/reset-password` redirects to
`/forgot-password` (reset links were replaced by email OTPs).
`/` redirects to the dashboard for the signed-in role; faculty accounts see `/portal-unavailable`
(the faculty web portal is not built yet — the API in `server/src/routes/faculty.js` is ready).

### Admin attendance scanner (`/admin/attendance`)

Pick a real class (loaded from `student_profiles`), enter teacher, room and subject, then press
**Start Attendance**. The API session is created first and the camera opens automatically. The webcam
reads student QR codes with `jsqr` and marks each student through `POST /api/attendance/mark`; the
response fills the live "Marked Present" list.

Both QR formats work: the identity QR shown by the web/Flutter app (the enrollment number) and the
signed `SATT1.` attendance token from `GET /api/student/attendance/qr`. The scanner session is matched
against the student's real course/semester/group, duplicates are rejected by
`UNIQUE(session_id, student_id)`, and unknown/invalid/expired/other-class codes show a specific
message. **End Attendance** closes the session. Saved sessions are listed in **Attendance History**
on the same page and download as a formatted `.xlsx` via
`GET /api/admin/attendance/sessions/:id/report`.

Camera access needs `localhost` or HTTPS (the ngrok link); a plain `http://` LAN IP is not a secure
context. Denied/unavailable/busy cameras show the reason and a **Retry camera** button.

### Attendance complaint review

Admins review the queue at `/admin/attendance-complaints`. Each report shows the student's name,
enrollment number, lecture time, lecture number and complaint date, with three actions:

| Action | What happens |
| ------ | ------------ |
| **Details** | Opens a modal with only the description the student wrote; the button is hidden when the description is empty |
| **Approve** | `PATCH /api/admin/attendance-complaints/:id/status` stores `approved` and the badge flips immediately |
| **Reject** | Same endpoint with `rejected`; an optional admin remark explains the decision to the student |

The **Download Report** card exports every complaint whose lecture date falls inside the chosen
From/To range (both days inclusive) to a formatted `.xlsx` through
`GET /api/admin/attendance-complaints/report?from=YYYY-MM-DD&to=YYYY-MM-DD`. The sheet lists student
name, enrollment number, lecture date, lecture time, lecture number, description and complaint
status. Invalid or reversed dates return `400`; a range with no complaints returns `404`.

Statuses are stored in MySQL (`attendance_complaints.status`; see migration
`014_attendance_complaint_approved.sql`) and the student's `/student/attendance-complaint` page reads
them back from `GET /api/student/attendance-complaints` — it refreshes on focus and once a minute, so
a decision appears without a manual reload. Each change also creates an in-app notification only —
SmartAttend never emails complaint or attendance updates. Students can never change a status: the
student API has no status endpoint (attempts return `403`) and new complaints always start as
`pending`.

### Mobile app notices (`portal-app/lib/screens/student/notifications_screen.dart`)

The Profile tab has a notification bell with an unread badge. It opens **Notifications & Notices**,
which lists every notice published from the admin panel's Manage Notices section (newest first) plus
the student's own updates. Each row shows the title, date and a Read/Unread chip; tapping expands the
full title and description inline and marks it read. The expanded panel can flip the item back to
unread or dismiss it for this student only.

`lib/core/notice_store.dart` is the shared source of truth: the bell and the screen both listen to it,
so reads update the badge immediately, and it polls `GET /api/student/notices` while a screen is
visible (60 s) plus on app resume and pull-to-refresh. State comes from `student_notice_status`
(`read_at` / `dismissed_at` per student); publishing a notice inserts an unread row for every active
student and emails the notice to their registered addresses (see [Email delivery](#email-delivery-gmail-smtp)),
and dismissed notices stay visible to everyone else. The client sends `kind`
(`notice` / `notification`) because the two tables have separate id sequences.

`/notifications` is a top-level route pushed over the shell, not a sixth shell branch: the shell's
`NavigationBar` must have exactly one `NavigationDestination` per branch, and the mismatch throws
`'0 <= selectedIndex && selectedIndex < destinations.length' is not true`. A pushed route also hides
the bottom bar, which suits a detail screen reached from the Profile bell.


## API

All endpoints are under `/api`; every response is JSON. Auth uses an HttpOnly cookie.

| Mount | Purpose |
| ----- | ------- |
| `/api/auth` | register, login, logout, me, forgot password (email OTP), verify OTP, reset password |
| `/api/student` | profile, photo, attendance history/summary/QR, notices feed with per-student read/dismiss state |
| `/api/attendance` | mark a student from their identity QR (enrollment number) or a signed `SATT1.` token (`POST /mark`) |
| `/api/complaints` | student complaints, attachments, responses, reopen; staff queue and workflow |
| `/api/notifications` | in-app notifications |
| `/api/admin/notices` | Manage Notices: create, edit, publish/unpublish, delete global notices (publishing also emails active students) |
| `/api/admin` | dashboard, students, faculty, classes, attendance sessions/records, session Excel report, attendance complaint review, complaints, reports, settings, audit logs |
| `/api/faculty` | faculty dashboard, classes, sessions, QR (faculty/admin) |
| `/api/incharges` | Help & Support contact cards |
| `/api/apk` | APK release upload/latest/download |
| `/api/about` | About page cards and developer profiles |
| `/api/health` | API + database status |

## Scripts (run inside `portal-web/`)

| Command | Purpose |
| ------- | ------- |
| `npm run dev` | API + Vite dev server together |
| `npm run dev:web` / `npm run dev:server` | Only the web app / only the API |
| `npm run build` / `npm run preview` | Production build / preview it |
| `npm start` | Start the API only (`server/src/index.js`) |
| `npm run db:init` | Apply `database/schema.sql` and pending migrations (safe to re-run) |
| `npm run setup:accounts` | Create/reset the admin and demo student accounts |
| `npm run admin:create` | Create an extra admin account |
| `npm run test:e2e` | End-to-end API + DB test against the running API (creates and removes its own data) |
| `npm run test:smtp` | Check the SMTP login; add `-- you@gmail.com` to also send a test email |

## Configuration (`server/.env`)

See `server/.env.example`. Notable options: `PORT`, `CLIENT_ORIGINS`, `DB_*`, `JWT_SECRET`,
`REQUIRE_APPROVAL`, `BCRYPT_ROUNDS`, `SMTP_*`, `OTP_*`, `ATTENDANCE_TOKEN_TTL_SECONDS`,
`LATE_AFTER_MINUTES`, `MIN_ATTENDANCE_PERCENT`, `UPLOAD_DIR`, `COMPLAINT_*`.

## Email delivery (Gmail SMTP)

The portal sends exactly **three** transactional emails; everything else stays in-app only:

| Email | Trigger | Recipient |
| --- | --- | --- |
| Admin notice | An admin publishes a notice (create-and-publish, or a draft's **Publish** button) | Every active, non-demo student's registered address |
| Account creation | A student registers successfully | The new student's address — welcome note plus registration details, never a password |
| Password reset OTP | A student requests **Forgot password** | The account's address — only the 6-digit code and its validity |

Complaint updates, attendance decisions and other in-app notifications never generate email. Notice
emails use bounded concurrency; individual failures are logged and summarised in the publish response
(`email.sent` / `email.failed`) without failing the publish itself. Demo accounts are always skipped.

Credentials live only in `server/.env` (never in the React or Flutter code).

### Gmail SMTP setup

1. Enable **2-Step Verification** on the Gmail account.
2. Create an **App Password** at https://myaccount.google.com/apppasswords.
3. Fill in `server/.env`:

   ```dotenv
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_SECURE=false        # 587 uses STARTTLS, not implicit TLS
   SMTP_REQUIRE_TLS=true
   SMTP_USER=your.email@gmail.com
   SMTP_APP_PASSWORD=xxxx xxxx xxxx xxxx   # spaces are stripped automatically
   SMTP_FROM="CR-Assist <your.email@gmail.com>"

   OTP_TTL_MINUTES=5
   OTP_MAX_ATTEMPTS=5              # wrong codes per code before it is invalidated
   OTP_MAX_REQUESTS=3              # codes per email inside the window
   OTP_REQUEST_WINDOW_MINUTES=15
   OTP_RESEND_COOLDOWN_SECONDS=60
   OTP_RESET_TICKET_TTL_MINUTES=10 # time to submit the new password after verifying
   ```

   `SMTP_USER`/`SMTP_FROM` must match the account that created the App Password. Never commit
   `server/.env` — only `.env.example` (placeholders) belongs in Git.

4. Verify the connection (from `portal-web/server`):

   ```bash
   npm run test:smtp                      # connection + login only
   npm run test:smtp -- you@gmail.com     # also send a test email
   ```

5. Restart the API — `.env` is read once at startup — then register a student, publish a notice, or
   try `/forgot-password` to exercise the three emails.

### Password reset OTP

"Forgot password" emails a **6-digit verification code**. The student enters the code, then chooses a
new password. The email contains only the code and how long it stays valid.

- The code is random (`crypto.randomInt`), expires after `OTP_TTL_MINUTES`, and is stored **only as a
  bcrypt hash**. Plain codes are never written to the database, API responses or logs.
- One code is live per account; requesting a new one invalidates the previous one.
- A code allows `OTP_MAX_ATTEMPTS` wrong guesses, then it is destroyed and a new code is required.
- Per email: at most `OTP_MAX_REQUESTS` codes per `OTP_REQUEST_WINDOW_MINUTES`, with a
  `OTP_RESEND_COOLDOWN_SECONDS` wait between sends. These limits also apply to unregistered
  addresses, so they cannot be used to discover accounts.
- Per IP: `express-rate-limit` on the request, verify and reset endpoints.
- Verifying a code returns a short-lived, single-use reset ticket (kept in browser memory, never
  emailed); the ticket and every outstanding code are invalidated once the password is changed. The
  new password is bcrypt-hashed exactly like a normal login password.
- The request endpoint always returns the same message whether or not the address exists, and SMTP
  failures are logged server-side rather than returned, so the API cannot be used for email
  enumeration. If SMTP is not configured the route returns `503 EMAIL_NOT_CONFIGURED`.

## Database notes

- Migrations are tracked in `schema_migrations` by filename, so `npm run db:init` only applies new files.
- Conditional column adds use an `information_schema` guard (see `database/migrations/`), which works on
  both MariaDB and MySQL 8 — MySQL 8 does not support `ADD COLUMN IF NOT EXISTS`.
- Two migrations share the `004_` prefix and two share `007_`; they are applied in filename order and do
  not depend on each other. Do not rename files that are already applied — the tracker stores the filename.
- Uploaded files live outside `public/` and are streamed through access-checked API endpoints.

## Known gaps

- The faculty web portal (dashboard, sessions, own QR scanner) is not built; the API endpoints exist.
  Admins scan from `/admin/attendance` instead.
- Email (admin notices, account welcome notes, password reset OTP) requires SMTP. Without it, notices
  and registrations still work and the publish/create responses report `email.status: not_configured`;
  the forgot-password route returns `503 EMAIL_NOT_CONFIGURED`. Codes are never printed to the console.
- An already-issued session stays valid after a password reset until it expires.
#   c r - a s s i s t  
 # cr-assist
