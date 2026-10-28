import React, { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import {
  QrCode,
  Building,
  User,
  Clock,
  Save,
  Square,
  Video,
  Camera,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  X,
  Wifi,
  Download,
  History,
  RefreshCw,
  Users,
  ChevronDown,
  ChevronUp,
  XCircle,
  ScanLine,
} from 'lucide-react';
import { api, parseApiError } from '@shared/lib/api.js';

const EMPTY_FORM = { teacherName: '', classBranch: '', room: '', subject: '' };

const sessionClassLabel = (session) =>
  session
    ? session.classBranch ||
      `${session.course} · Sem ${session.semester}${session.studentGroup ? ` · Group ${session.studentGroup}` : ''}`
    : '—';

const istDateTime = (value) =>
  value
    ? new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(value))
    : '—';

const istTime = (value) =>
  value
    ? new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      }).format(new Date(value))
    : '—';

function cameraErrorMessage(err) {
  const name = err?.name || '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
    return 'Camera access was denied. Click the camera icon in the browser address bar, allow access, then press Retry.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
    return 'No usable camera was found. Connect a webcam (or select one in the browser) and press Retry.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
    return 'The camera is busy or could not be started. Close other apps using the camera and press Retry.';
  }
  return err?.message ? `Camera error: ${err.message}` : 'Could not start the camera. Please try again.';
}

/** Extracts a filename from a Content-Disposition header. */
function filenameFromHeader(header, fallback) {
  if (!header) return fallback;
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (utf8) {
    try {
      return decodeURIComponent(utf8[1]);
    } catch {
      /* fall through */
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain ? plain[1] : fallback;
}

export function Attendance() {
  // ---------------------------------------------------------------- session form
  const [form, setForm] = useState(EMPTY_FORM);
  const [starting, setStarting] = useState(false);

  // ---------------------------------------------------------------- scanner state
  const [session, setSession] = useState(null);
  const [scannedStudents, setScannedStudents] = useState([]);
  const [feedback, setFeedback] = useState(null);
  const [cameraState, setCameraState] = useState('idle'); // idle | starting | live | error
  const [cameraError, setCameraError] = useState('');
  const [cameraRetry, setCameraRetry] = useState(0);
  const [ending, setEnding] = useState(false);
  const [finished, setFinished] = useState(null);

  // ---------------------------------------------------------------- history state
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState('');
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [expandedSession, setExpandedSession] = useState(null);
  const [recordsBySession, setRecordsBySession] = useState({});
  const [recordsLoading, setRecordsLoading] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);

  // ---------------------------------------------------------------- misc UI
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  // ---------------------------------------------------------------- refs
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const lastFrameRef = useRef(0);
  const scanBusyRef = useRef(false);
  const lastCodeRef = useRef({ code: '', at: 0 });
  const sessionRef = useRef(null);
  const scannedRef = useRef([]);
  const handleScanRef = useRef(null);
  const audioCtxRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    scannedRef.current = scannedStudents;
  }, [scannedStudents]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimeout(toastTimer.current);
    };
  }, []);

  const beep = useCallback((kind = 'ok') => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioCtxRef.current) audioCtxRef.current = new AudioCtx();
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = kind === 'ok' ? 920 : kind === 'duplicate' ? 520 : 200;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.24);
    } catch {
      /* audio feedback is optional */
    }
  }, []);

  // ---------------------------------------------------------------- data loading
  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const res = await api.get('/admin/attendance/sessions');
      setHistory(res.data?.sessions ?? []);
    } catch (err) {
      setHistoryError(parseApiError(err).message);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // ---------------------------------------------------------------- scanning
  const handleScan = useCallback(
    async (payload) => {
      const active = sessionRef.current;
      if (!active || scanBusyRef.current) return;
      scanBusyRef.current = true;

      try {
        const res = await api.post('/attendance/mark', { token: payload, sessionId: active.id });
        const data = res.data ?? {};
        const student = data.student ?? {};
        const markedAt = data.markedAt || new Date().toISOString();

        setScannedStudents((prev) => {
          if (prev.some((s) => s.id === student.id || s.enrollmentNumber === student.enrollmentNumber)) return prev;
          return [...prev, { ...student, status: data.status, markedAt }];
        });
        setFeedback({
          type: 'success',
          title: 'Attendance recorded',
          message: `${student.fullName || 'Student'} marked ${data.status || 'present'}.`,
          student: { ...student, markedAt },
          at: Date.now(),
        });
        // Keep the History row's counters accurate while the session is still open.
        setHistory((prev) =>
          prev.map((item) => {
            if (item.id !== active.id) return item;
            const late = data.status === 'late';
            return {
              ...item,
              total_marked: (Number(item.total_marked) || 0) + 1,
              present_count: (Number(item.present_count) || 0) + (late ? 0 : 1),
              late_count: (Number(item.late_count) || 0) + (late ? 1 : 0),
            };
          }),
        );
        beep('ok');
      } catch (err) {
        const info = parseApiError(err);
        let type = 'error';
        let title = 'Scan failed';
        if (info.code === 'ALREADY_MARKED') {
          type = 'duplicate';
          title = 'Already marked';
        } else if (info.code === 'STUDENT_NOT_FOUND' || info.code === 'AMBIGUOUS_QR') {
          type = 'unknown';
          title = info.code === 'AMBIGUOUS_QR' ? 'QR could not be matched' : 'Unknown student';
        } else if (['QR_INVALID', 'QR_EXPIRED', 'NOT_IN_CLASS', 'SESSION_REQUIRED'].includes(info.code)) {
          type = 'invalid';
          title = info.code === 'QR_EXPIRED' ? 'QR code expired' : 'Invalid QR code';
        } else if (info.code === 'SESSION_CLOSED') {
          title = 'Session is closed';
        }
        setFeedback({ type, title, message: info.message, at: Date.now() });
        beep(type === 'duplicate' ? 'duplicate' : 'error');
      } finally {
        scanBusyRef.current = false;
      }
    },
    [beep],
  );

  useEffect(() => {
    handleScanRef.current = handleScan;
  }, [handleScan]);

  // The camera effect runs after the scanner markup is committed, so videoRef is
  // populated. It owns the MediaStream and the requestAnimationFrame scan loop, and
  // both are torn down when the session changes (or the component unmounts).
  useEffect(() => {
    if (!session) return undefined;

    let cancelled = false;
    let trackEndedHandler = null;

    const stopLoop = () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };

    const releaseStream = () => {
      const stream = streamRef.current;
      streamRef.current = null;
      if (stream) stream.getTracks().forEach((track) => track.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
    };

    const startLoop = () => {
      stopLoop();
      const tick = () => {
        if (cancelled) return;
        rafRef.current = requestAnimationFrame(tick);

        const now = performance.now();
        if (now - lastFrameRef.current < 140) return;
        lastFrameRef.current = now;

        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas || scanBusyRef.current) return;
        if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;

        try {
          // Downscale big frames: jsQR stays fast and small QR codes remain readable.
          const scale = Math.min(1, 720 / Math.max(video.videoWidth, video.videoHeight));
          const width = Math.max(1, Math.round(video.videoWidth * scale));
          const height = Math.max(1, Math.round(video.videoHeight * scale));
          if (canvas.width !== width) canvas.width = width;
          if (canvas.height !== height) canvas.height = height;

          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) return;
          ctx.drawImage(video, 0, 0, width, height);
          const imageData = ctx.getImageData(0, 0, width, height);
          const code = jsQR(imageData.data, width, height, { inversionAttempts: 'attemptBoth' });
          if (!code?.data) return;

          const value = code.data.trim();
          if (!value) return;
          const nowMs = Date.now();
          // Ignore the same code while it is still in front of the camera.
          if (lastCodeRef.current.code === value && nowMs - lastCodeRef.current.at < 2500) return;
          lastCodeRef.current = { code: value, at: nowMs };
          handleScanRef.current?.(value);
        } catch {
          // A single bad frame must never stop the scan loop.
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    };

    const startCamera = async () => {
      setCameraState('starting');
      setCameraError('');
      lastFrameRef.current = 0;

      if (!window.isSecureContext) {
        setCameraState('error');
        setCameraError(
          'The camera needs a secure context. Open this page on http://localhost or over HTTPS (the ngrok link), not on a plain http:// IP address.',
        );
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraState('error');
        setCameraError('This browser does not support camera access. Try the latest Chrome, Edge or Firefox.');
        return;
      }

      try {
        let stream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          });
        } catch (err) {
          // Some desktop cameras reject the resolution/facing-mode constraints.
          if (['OverconstrainedError', 'ConstraintNotSatisfiedError', 'TypeError'].includes(err?.name)) {
            stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          } else {
            throw err;
          }
        }

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) {
          releaseStream();
          setCameraState('error');
          setCameraError('The camera preview could not be attached. Reload the page and try again.');
          return;
        }

        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        try {
          await video.play();
        } catch {
          // Autoplay of a muted stream is allowed; a rejection here is not fatal.
        }

        if (cancelled) {
          releaseStream();
          return;
        }

        const [track] = stream.getVideoTracks();
        if (track) {
          trackEndedHandler = () => {
            if (cancelled) return;
            stopLoop();
            setCameraState('error');
            setCameraError('The camera stopped. Reconnect it (or close other apps using it) and press Retry.');
          };
          track.addEventListener('ended', trackEndedHandler);
        }

        setCameraState('live');
        startLoop();
      } catch (err) {
        if (cancelled) return;
        setCameraState('error');
        setCameraError(cameraErrorMessage(err));
      }
    };

    startCamera();

    return () => {
      cancelled = true;
      stopLoop();
      const track = streamRef.current?.getVideoTracks?.()[0];
      if (track && trackEndedHandler) track.removeEventListener('ended', trackEndedHandler);
      releaseStream();
    };
  }, [session, cameraRetry]);

  // ---------------------------------------------------------------- actions
  const createSession = async (event) => {
    event.preventDefault();
    if (starting) return;

    const teacherName = form.teacherName.trim();
    const classBranch = form.classBranch.trim();
    const room = form.room.trim();
    const subject = form.subject.trim();

    if (!teacherName || !classBranch || !room || !subject) {
      showToast('Please fill in the teacher, class, room and subject.', 'error');
      return;
    }

    setStarting(true);
    try {
      const startsAt = new Date();
      const endsAt = new Date(startsAt.getTime() + 3 * 60 * 60 * 1000);
      const res = await api.post('/admin/attendance/sessions', {
        subject,
        classBranch,
        facultyName: teacherName,
        room,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        status: 'active',
      });

      // The server resolves the typed class into course / semester / group and
      // echoes the stored label back; fall back to the typed text if it does not.
      const stored = res.data?.session ?? {};
      const nextSession = {
        id: res.data.sessionId,
        subject: stored.subject ?? subject,
        course: stored.course ?? classBranch,
        semester: stored.semester ?? 0,
        studentGroup: stored.studentGroup ?? null,
        classBranch: stored.classBranch ?? classBranch,
        teacherName: stored.facultyName ?? teacherName,
        room: stored.room ?? room,
        startsAt: stored.startsAt ?? startsAt.toISOString(),
        endsAt: stored.endsAt ?? endsAt.toISOString(),
      };

      setSession(nextSession);
      setScannedStudents([]);
      setFeedback(null);
      setFinished(null);
      setCameraState('starting');
      setCameraError('');
      lastCodeRef.current = { code: '', at: 0 };
      showToast('Session started. Opening the camera…');
      loadHistory();
    } catch (err) {
      showToast(parseApiError(err).message, 'error');
    } finally {
      setStarting(false);
    }
  };

  const endAttendance = async () => {
    if (!session || ending) return;
    setEnding(true);
    try {
      await api.patch(`/admin/attendance/sessions/${session.id}/status`, { status: 'closed' });
      const summary = { session, students: scannedRef.current, endedAt: new Date().toISOString() };
      setFinished(summary);
      setSession(null);
      setFeedback(null);
      setCameraState('idle');
      showToast(`Attendance submitted — ${summary.students.length} student(s) marked.`);
      loadHistory();
      setExpandedSession(null);
      setRecordsBySession((prev) => {
        const next = { ...prev };
        delete next[session.id];
        return next;
      });
    } catch (err) {
      showToast(parseApiError(err).message, 'error');
    } finally {
      setEnding(false);
    }
  };

  const resetForNewSession = () => {
    setFinished(null);
    setScannedStudents([]);
    setFeedback(null);
    setSession(null);
    setForm(EMPTY_FORM);
    setCameraState('idle');
    setCameraError('');
    lastCodeRef.current = { code: '', at: 0 };
  };

  const downloadSessionReport = async (sessionId) => {
    if (!sessionId || downloadingId) return;
    setDownloadingId(sessionId);
    try {
      const res = await api.get(`/admin/attendance/sessions/${sessionId}/report`, { responseType: 'blob' });
      const blob = new Blob([res.data], {
        type: res.headers?.['content-type'] || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filenameFromHeader(res.headers?.['content-disposition'], `attendance-session-${sessionId}.xlsx`);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      showToast('Excel report downloaded.');
    } catch (err) {
      let message = parseApiError(err).message;
      const data = err?.response?.data;
      if (data instanceof Blob) {
        try {
          const body = JSON.parse(await data.text());
          message = body?.message || message;
        } catch {
          /* keep the generic message */
        }
      }
      showToast(message, 'error');
    } finally {
      setDownloadingId(null);
    }
  };

  const toggleHistory = async (sessionId) => {
    if (expandedSession === sessionId) {
      setExpandedSession(null);
      return;
    }
    setExpandedSession(sessionId);
    if (recordsBySession[sessionId]) return;

    setRecordsLoading(sessionId);
    try {
      const res = await api.get('/admin/attendance/records', { params: { sessionId, limit: 100 } });
      setRecordsBySession((prev) => ({ ...prev, [sessionId]: res.data?.records ?? [] }));
    } catch (err) {
      showToast(parseApiError(err).message, 'error');
    } finally {
      setRecordsLoading(null);
    }
  };

  // ---------------------------------------------------------------- derived
  const HISTORY_PREVIEW = 8;
  const visibleHistory = showAllHistory ? history : history.slice(0, HISTORY_PREVIEW);

  const effectiveSessionStatus = (item) => {
    if (item.status === 'active' && item.ends_at && new Date(item.ends_at).getTime() < Date.now()) return 'expired';
    return item.status;
  };

  const feedbackStyles = {
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    duplicate: 'border-amber-200 bg-amber-50 text-amber-900',
    invalid: 'border-rose-200 bg-rose-50 text-rose-900',
    unknown: 'border-orange-200 bg-orange-50 text-orange-900',
    error: 'border-rose-200 bg-rose-50 text-rose-900',
  };
  const FeedbackIcon = {
    success: CheckCircle2,
    duplicate: AlertTriangle,
    invalid: XCircle,
    unknown: AlertTriangle,
    error: AlertTriangle,
  }[feedback?.type] || AlertTriangle;

  const sessionForDisplay = session || finished?.session || null;
  const studentsForDisplay = session ? scannedStudents : finished?.students ?? [];

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-3 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-blue-100 text-blue-700 mb-3">
            <ScanLine className="w-6 h-6" />
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900">Attendance Scanner</h1>
          <p className="text-slate-500 mt-1">Enter session details, scan student QR codes, export the attendance sheet</p>
        </div>

        {/* Toast */}
        {toast && (
          <div
            role="status"
            className={`fixed top-4 right-4 z-50 max-w-sm px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-start gap-2 ${
              toast.type === 'error' ? 'bg-rose-600 text-white' : 'bg-emerald-600 text-white'
            }`}
          >
            <span className="flex-1">{toast.msg}</span>
            <button onClick={() => setToast(null)} className="opacity-80 hover:opacity-100" aria-label="Dismiss">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Step 1 — Session form */}
        {!session && !finished && (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8">
            <h2 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
              <Building className="w-5 h-5 text-blue-600" />
              Session Details
            </h2>

            <form onSubmit={createSession} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="teacher-name" className="block text-sm font-semibold text-slate-700 mb-1">
                    Teacher Name *
                  </label>
                  <input
                    id="teacher-name"
                    type="text"
                    required
                    value={form.teacherName}
                    onChange={(e) => setForm({ ...form, teacherName: e.target.value })}
                    placeholder="e.g. Dr. Rajesh Kumar"
                    autoComplete="off"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="class-branch" className="block text-sm font-semibold text-slate-700 mb-1">
                    Class / Branch *
                  </label>
                  <input
                    id="class-branch"
                    type="text"
                    required
                    value={form.classBranch}
                    onChange={(e) => setForm({ ...form, classBranch: e.target.value })}
                    placeholder="e.g. IT · Semester 3 · Group B"
                    autoComplete="off"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
                  />
                  <p className="mt-1.5 text-xs text-slate-500">
                    Type the class or branch (and semester, if you want scans matched to that cohort).
                  </p>
                </div>

                <div>
                  <label htmlFor="room-number" className="block text-sm font-semibold text-slate-700 mb-1">
                    Room Number *
                  </label>
                  <input
                    id="room-number"
                    type="text"
                    required
                    value={form.room}
                    onChange={(e) => setForm({ ...form, room: e.target.value })}
                    placeholder="e.g. Lab 2, 2nd Floor"
                    autoComplete="off"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="subject" className="block text-sm font-semibold text-slate-700 mb-1">
                    Subject *
                  </label>
                  <input
                    id="subject"
                    type="text"
                    required
                    value={form.subject}
                    onChange={(e) => setForm({ ...form, subject: e.target.value })}
                    placeholder="e.g. Data Structures"
                    autoComplete="off"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={starting}
                className="w-full mt-2 py-3 px-6 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-lg flex items-center justify-center gap-2 shadow-md shadow-blue-500/20 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {starting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                <span>{starting ? 'Starting session…' : 'Start Attendance'}</span>
              </button>
            </form>
          </div>
        )}

        {/* Step 2 — Live scanner */}
        {session && (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="bg-blue-600 text-white p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-lg sm:text-xl font-bold truncate">{session.subject}</h2>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2 text-sm opacity-90">
                    <span className="flex items-center gap-1.5">
                      <User className="w-4 h-4" /> {session.teacherName}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Building className="w-4 h-4" /> Room: {session.room}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Wifi className="w-4 h-4" /> {sessionClassLabel(session)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-blue-100">Session #{session.id} · started {istTime(session.startsAt)}</p>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                  <span
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold ${
                      cameraState === 'live' ? 'bg-white/20' : 'bg-rose-500/90'
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        cameraState === 'live' ? 'bg-emerald-400 animate-pulse' : 'bg-white'
                      }`}
                    />
                    {cameraState === 'live' ? 'CAMERA LIVE' : cameraState === 'starting' ? 'STARTING CAMERA' : 'CAMERA OFF'}
                  </span>
                  <button
                    type="button"
                    onClick={endAttendance}
                    disabled={ending}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-sm font-bold shadow-md transition-colors disabled:opacity-60"
                  >
                    {ending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
                    <span>{ending ? 'Submitting…' : 'End Attendance'}</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="p-4 sm:p-6">
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
                {/* Camera */}
                <div className="lg:col-span-3 space-y-3">
                  <div className="relative aspect-video bg-slate-900 rounded-2xl overflow-hidden">
                    <video ref={videoRef} className="w-full h-full object-cover" playsInline muted autoPlay />
                    <canvas ref={canvasRef} className="hidden" />

                    {cameraState === 'live' && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="relative w-56 h-56 sm:w-64 sm:h-64">
                          <div className="absolute inset-0 border-2 border-blue-400/60 rounded-xl" />
                          <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-blue-600 text-white text-[11px] rounded font-medium whitespace-nowrap">
                            Position Student QR Here
                          </div>
                          <div className="absolute -top-2 -left-2 w-6 h-6 border-t-4 border-l-4 border-blue-400 rounded-tl-xl" />
                          <div className="absolute -top-2 -right-2 w-6 h-6 border-t-4 border-r-4 border-blue-400 rounded-tr-xl" />
                          <div className="absolute -bottom-2 -left-2 w-6 h-6 border-b-4 border-l-4 border-blue-400 rounded-bl-xl" />
                          <div className="absolute -bottom-2 -right-2 w-6 h-6 border-b-4 border-r-4 border-blue-400 rounded-br-xl" />
                        </div>
                      </div>
                    )}

                    {cameraState !== 'live' && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center bg-slate-900">
                        {cameraState === 'starting' ? (
                          <>
                            <Loader2 className="w-10 h-10 text-blue-400 animate-spin" />
                            <p className="text-slate-300 text-sm font-medium">Starting camera…</p>
                            <p className="text-slate-500 text-xs">Allow camera access when the browser asks.</p>
                          </>
                        ) : (
                          <>
                            <Camera className="w-10 h-10 text-slate-500" />
                            <p className="text-rose-300 text-sm font-semibold">Camera unavailable</p>
                            <p className="text-slate-300 text-xs max-w-md">{cameraError || 'The camera could not be started.'}</p>
                            <button
                              type="button"
                              onClick={() => setCameraRetry((n) => n + 1)}
                              className="mt-1 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold"
                            >
                              <RefreshCw className="w-4 h-4" /> Retry camera
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Scan feedback */}
                  <div
                    aria-live="polite"
                    data-testid="scan-feedback"
                    className={`flex items-start gap-3 rounded-2xl border p-3.5 min-h-[74px] ${
                      feedback ? feedbackStyles[feedback.type] : 'border-slate-200 bg-slate-50 text-slate-600'
                    }`}
                  >
                    <div className="mt-0.5 flex-shrink-0">
                      {feedback ? (
                        <FeedbackIcon className="w-5 h-5" />
                      ) : (
                        <QrCode className="w-5 h-5 text-slate-400" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      {feedback ? (
                        <>
                          <p className="text-sm font-bold">{feedback.title}</p>
                          <p className="text-xs mt-0.5 break-words">{feedback.message}</p>
                          {feedback.type === 'success' && feedback.student && (
                            <p className="text-xs mt-1 font-mono opacity-80">
                              {feedback.student.enrollmentNumber} · {istTime(feedback.student.markedAt)}
                            </p>
                          )}
                        </>
                      ) : (
                        <>
                          <p className="text-sm font-semibold">Ready to scan</p>
                          <p className="text-xs mt-0.5">
                            Ask the student to open SmartAttend → QR Attendance and hold the code inside the frame.
                          </p>
                        </>
                      )}
                    </div>
                    {feedback && (
                      <button
                        type="button"
                        onClick={() => setFeedback(null)}
                        className="opacity-60 hover:opacity-100 flex-shrink-0"
                        aria-label="Dismiss scan message"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Live results */}
                <div className="lg:col-span-2 flex flex-col">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-blue-600" />
                      <h3 className="font-bold text-slate-900 text-sm">Marked Present</h3>
                      <span
                        data-testid="marked-count"
                        className="inline-flex items-center justify-center min-w-7 h-6 px-2 rounded-full bg-blue-100 text-blue-700 text-xs font-bold"
                      >
                        {scannedStudents.length}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => downloadSessionReport(session.id)}
                      disabled={!scannedStudents.length || downloadingId === session.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {downloadingId === session.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Download className="w-3.5 h-3.5" />
                      )}
                      <span>Excel</span>
                    </button>
                  </div>

                  {scannedStudents.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center py-10 px-4 border-2 border-dashed border-slate-200 rounded-2xl">
                      <Video className="w-10 h-10 text-slate-300 mb-2 animate-pulse" />
                      <p className="font-medium text-slate-500 text-sm">Waiting for scans…</p>
                      <p className="text-xs text-slate-400 mt-1">Point the camera at a student QR code</p>
                    </div>
                  ) : (
                    <div className="max-h-[420px] overflow-y-auto space-y-2 pr-1">
                      {[...scannedStudents].reverse().map((student, index) => (
                        <div
                          key={`${student.id ?? student.enrollmentNumber}-${student.markedAt}`}
                          className="flex items-center gap-3 p-2.5 bg-slate-50 rounded-xl border border-slate-100"
                        >
                          <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs flex-shrink-0">
                            {scannedStudents.length - index}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-slate-900 text-sm truncate">{student.fullName}</p>
                            <p className="text-[11px] text-slate-500 font-mono truncate">{student.enrollmentNumber}</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                student.status === 'late'
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-emerald-100 text-emerald-700'
                              }`}
                            >
                              {student.status || 'present'}
                            </span>
                            <p className="text-[10px] text-slate-400 font-mono mt-0.5">{istTime(student.markedAt)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3 — Submitted summary */}
        {finished && (
          <div className="bg-white rounded-3xl border border-emerald-200 shadow-sm overflow-hidden">
            <div className="bg-emerald-600 text-white p-5 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-6 h-6" />
                    <h2 className="text-xl font-bold">Attendance Submitted</h2>
                  </div>
                  <p className="text-sm text-emerald-50 mt-1">
                    {finished.session.subject} · {sessionClassLabel(finished.session)} · {finished.students.length} student
                    {finished.students.length === 1 ? '' : 's'} marked
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => downloadSessionReport(finished.session.id)}
                    disabled={!finished.students.length || downloadingId === finished.session.id}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white text-emerald-700 hover:bg-emerald-50 text-sm font-bold shadow-sm disabled:opacity-50"
                  >
                    {downloadingId === finished.session.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                    Download Excel
                  </button>
                  <button
                    type="button"
                    onClick={resetForNewSession}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-700/40 hover:bg-emerald-700/60 text-white text-sm font-bold"
                  >
                    <RefreshCw className="w-4 h-4" /> New Session
                  </button>
                </div>
              </div>
            </div>
            <div className="p-5 sm:p-6">
              {finished.students.length === 0 ? (
                <p className="text-sm text-slate-500">No students were marked in this session.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-80 overflow-y-auto">
                  {finished.students.map((student, index) => (
                    <div
                      key={`${student.id ?? student.enrollmentNumber}-${student.markedAt}`}
                      className="flex items-center gap-3 p-2.5 bg-slate-50 rounded-xl border border-slate-100"
                    >
                      <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-[11px] flex-shrink-0">
                        {index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-900 text-sm truncate">{student.fullName}</p>
                        <p className="text-[11px] text-slate-500 font-mono">{student.enrollmentNumber}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">
                          {student.status || 'present'}
                        </span>
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">{istTime(student.markedAt)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 4 — Attendance history */}
        <div data-testid="attendance-history" className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <History className="w-5 h-5 text-blue-600" />
              Attendance History
            </h2>
            <button
              type="button"
              onClick={loadHistory}
              disabled={historyLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${historyLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {historyError && <p className="text-sm text-rose-600">{historyError}</p>}

          {!historyError && historyLoading && history.length === 0 && (
            <div className="flex items-center justify-center gap-2 py-8 text-slate-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading sessions…
            </div>
          )}

          {!historyError && !historyLoading && history.length === 0 && (
            <div className="text-center py-8 text-slate-400">
              <Clock className="w-9 h-9 mx-auto text-slate-300 mb-2" />
              <p className="text-sm font-medium">No attendance sessions yet</p>
              <p className="text-xs mt-1">Saved sessions will appear here with an Excel download.</p>
            </div>
          )}

          {history.length > 0 && (
            <div className="space-y-2">
              {visibleHistory.map((item) => {
                const isOpen = expandedSession === item.id;
                const records = recordsBySession[item.id];
                const marked = Number(item.total_marked) || 0;
                const status = effectiveSessionStatus(item);
                return (
                  <div key={item.id} className="rounded-2xl border border-slate-200 overflow-hidden">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3.5">
                      <button
                        type="button"
                        onClick={() => toggleHistory(item.id)}
                        className="flex-1 min-w-0 text-left"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-slate-900 text-sm truncate">{item.subject}</p>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              status === 'active'
                                ? 'bg-emerald-100 text-emerald-700'
                                : status === 'cancelled'
                                  ? 'bg-rose-100 text-rose-700'
                                  : status === 'scheduled'
                                    ? 'bg-blue-100 text-blue-700'
                                    : status === 'expired'
                                      ? 'bg-amber-100 text-amber-700'
                                      : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {status}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5 truncate">
                          {item.class_branch ||
                            `${item.course} · Sem ${item.semester}${item.student_group ? ` · Group ${item.student_group}` : ''}`}{' '}
                          · Room {item.room || '—'} · {item.faculty_name || 'Teacher not recorded'}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5 flex flex-wrap gap-x-3">
                          <span>{istDateTime(item.starts_at)}</span>
                          <span className="font-semibold text-slate-600">
                            {marked} marked{item.eligible_students ? ` / ${item.eligible_students} eligible` : ''}
                          </span>
                          <span className="text-emerald-600">{Number(item.present_count) || 0} present</span>
                          <span className="text-amber-600">{Number(item.late_count) || 0} late</span>
                        </p>
                      </button>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => downloadSessionReport(item.id)}
                          disabled={!marked || downloadingId === item.id}
                          title={marked ? 'Download Excel report' : 'No students marked in this session'}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {downloadingId === item.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Download className="w-3.5 h-3.5" />
                          )}
                          <span>Excel</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleHistory(item.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold"
                        >
                          {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          {isOpen ? 'Hide' : 'View'}
                        </button>
                      </div>
                    </div>

                    {isOpen && (
                      <div className="border-t border-slate-100 bg-slate-50/60 p-3.5">
                        {recordsLoading === item.id && !records ? (
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading students…
                          </div>
                        ) : !records || records.length === 0 ? (
                          <p className="text-xs text-slate-500">No students were marked in this session.</p>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="min-w-full text-xs">
                              <thead>
                                <tr className="text-left text-slate-500">
                                  <th className="py-1.5 pr-4 font-semibold">#</th>
                                  <th className="py-1.5 pr-4 font-semibold">Student</th>
                                  <th className="py-1.5 pr-4 font-semibold">Enrollment</th>
                                  <th className="py-1.5 pr-4 font-semibold">Status</th>
                                  <th className="py-1.5 font-semibold">Scan time</th>
                                </tr>
                              </thead>
                              <tbody>
                                {records.map((record, index) => (
                                  <tr key={record.id} className="border-t border-slate-200/70">
                                    <td className="py-1.5 pr-4 text-slate-400">{index + 1}</td>
                                    <td className="py-1.5 pr-4 font-medium text-slate-800">{record.student_name}</td>
                                    <td className="py-1.5 pr-4 font-mono text-slate-600">{record.enrollment_number || '—'}</td>
                                    <td className="py-1.5 pr-4">
                                      <span
                                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                          record.status === 'late'
                                            ? 'bg-amber-100 text-amber-700'
                                            : 'bg-emerald-100 text-emerald-700'
                                        }`}
                                      >
                                        {record.status}
                                      </span>
                                    </td>
                                    <td className="py-1.5 text-slate-500">{istTime(record.marked_at)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {history.length > HISTORY_PREVIEW && (
                <div className="pt-1 text-center">
                  <button
                    type="button"
                    onClick={() => setShowAllHistory((v) => !v)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold"
                  >
                    {showAllHistory ? (
                      <>
                        <ChevronUp className="w-3.5 h-3.5" /> Show recent only
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-3.5 h-3.5" /> Show all {history.length} sessions
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <p className="text-center text-[11px] text-slate-400">
          Camera runs locally in your browser. Student QR data is matched against the college database — nothing is stored
          on the device.
        </p>
      </div>
    </div>
  );
}

export default Attendance;
