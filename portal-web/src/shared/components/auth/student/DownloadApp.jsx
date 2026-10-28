import React, { useState } from 'react';
import {
  Download,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  Clock,
  HardDrive,
  Layers,
  Sparkles,
  ShieldCheck,
  QrCode,
  BellRing,
  HelpCircle,
  FileDown,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { PageHeader, Skeleton, ErrorState } from '../../components/student/common.jsx';
import { useApi } from '../../lib/useApi.js';

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function DownloadApp() {
  const { data, error, loading, reload } = useApi('/apk/latest');
  const [downloading, setDownloading] = useState(false);
  const [downloadNotice, setDownloadNotice] = useState(null);

  const apk = data?.apk;

  const handleDownload = () => {
    if (!apk?.isAvailable) {
      setDownloadNotice({ type: 'error', message: 'The latest APK is not available on the server.' });
      return;
    }

    setDownloading(true);
    const link = document.createElement('a');
    link.href = apk.downloadUrl || '/api/apk/download';
    link.download = `${apk.appName.replace(/[^a-zA-Z0-9_-]/g, '_')}_v${apk.versionName.replace(/[^a-zA-Z0-9._-]/g, '_')}.apk`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setDownloadNotice({ type: 'success', message: 'Your APK download has started. Check your browser downloads.' });
    window.setTimeout(() => {
      setDownloading(false);
    }, 1000);
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title="Download Mobile App"
        subtitle="Get the official Class Representative Assist Android app for fast attendance and updates."
        actions={
          <button
            onClick={reload}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        }
      />

      {/* Hero Showcase Card */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#102B60] via-[#14367A] to-[#1877E8] p-6 text-white shadow-xl sm:p-8">
        {/* Decorative background glows */}
        <div className="absolute -right-12 -top-12 h-64 w-64 rounded-full bg-teal-400/15 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-12 -left-12 h-64 w-64 rounded-full bg-blue-400/20 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3 max-w-xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1 text-xs font-semibold backdrop-blur-md ring-1 ring-white/20">
              <Sparkles className="h-3.5 w-3.5 text-teal-300" />
              <span>Official Android Release</span>
            </div>

            <h2 className="text-2xl font-black tracking-tight sm:text-3xl text-white">
              {apk?.appName || 'Class Representative Assist'}
            </h2>

            <p className="text-sm leading-relaxed text-blue-100/90 sm:text-base">
              Mark attendance on the go, view live lecture timetables, submit attendance complaints,
              and receive instant push notifications right on your Android device.
            </p>

            <div className="flex flex-wrap gap-4 pt-1 text-xs font-medium text-teal-200">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-teal-300" /> Fast QR Scanner
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-teal-300" /> Direct Grievance Desk
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-teal-300" /> Secure Student Login
              </span>
            </div>
          </div>

          {/* Download Action Box inside Hero */}
          <div className="rounded-2xl bg-white/10 p-5 backdrop-blur-md ring-1 ring-white/20 lg:w-80 shrink-0">
            {loading ? (
              <div className="space-y-3 py-4 text-center">
                <Loader2 className="mx-auto h-7 w-7 animate-spin text-teal-300" />
                <p className="text-xs text-blue-100">Fetching latest APK information...</p>
              </div>
            ) : apk ? (
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between text-xs text-blue-200">
                    <span>Latest Version</span>
                    <span className="font-bold text-teal-300">v{apk.versionName}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs text-blue-200">
                    <span>Package Size</span>
                    <span className="font-semibold text-white">{formatBytes(apk.fileSize)}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={downloading || !apk.isAvailable}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-teal-400 px-5 py-3 text-sm font-bold text-navy-950 shadow-lg shadow-teal-400/25 transition hover:bg-teal-300 active:scale-[0.98] disabled:opacity-70"
                >
                  {downloading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-navy-950" />
                      Starting download...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4" />
                      Download App ({formatBytes(apk.fileSize)})
                    </>
                  )}
                </button>

                {!apk.isAvailable && (
                  <p role="status" className="text-center text-[11px] text-amber-100">
                    This release is currently missing from server storage.
                  </p>
                )}

                <p className="text-[11px] text-center text-blue-200/80">
                  Android 7.0 (Nougat) or higher required
                </p>
              </div>
            ) : (
              <div className="text-center py-3">
                <Smartphone className="mx-auto h-8 w-8 text-blue-200/60 mb-2" />
                <p className="text-xs font-semibold text-white">No APK Available</p>
                <p className="mt-1 text-[11px] text-blue-200/80 leading-relaxed">
                  The admin has not published an APK release yet. Please check back later.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Download Alert Notice */}
      {downloadNotice && (
        <div className={`flex items-start justify-between gap-3 rounded-2xl border p-4 text-sm shadow-xs ${
          downloadNotice.type === 'error'
            ? 'border-rose-200 bg-rose-50 text-rose-900'
            : 'border-teal-200 bg-teal-50 text-teal-900'
        }`}>
          <div className="flex items-center gap-3">
            {downloadNotice.type === 'error'
              ? <AlertCircle className="h-5 w-5 shrink-0 text-rose-600" />
              : <CheckCircle2 className="h-5 w-5 shrink-0 text-teal-600" />}
            <div>
              <p className="font-semibold">{downloadNotice.message}</p>
            </div>
          </div>
          <button
            onClick={() => setDownloadNotice(null)}
            className="text-xs font-bold underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Error state */}
      {error && !data && <ErrorState message={error} onRetry={reload} />}

      {/* Version Details and Features Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Card: Current Release Details */}
        <div className="rounded-2xl border border-slate-200/70 bg-white p-6 shadow-sm shadow-navy-900/[0.03]">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-[#1877E8]">
              <FileDown className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-navy-900">Release Specification</h3>
              <p className="text-xs text-slate-500">Android APK package details</p>
            </div>
          </div>

          {loading && !data ? (
            <div className="space-y-4 pt-5">
              <Skeleton className="h-10 rounded-xl" />
              <Skeleton className="h-10 rounded-xl" />
              <Skeleton className="h-10 rounded-xl" />
            </div>
          ) : apk ? (
            <div className="space-y-4 pt-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-slate-50 p-3">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                    <Layers className="h-3.5 w-3.5 text-blue-600" />
                    Version Name
                  </div>
                  <div className="mt-1 text-sm font-bold text-navy-900">v{apk.versionName}</div>
                </div>

                <div className="rounded-xl bg-slate-50 p-3">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                    <HardDrive className="h-3.5 w-3.5 text-emerald-600" />
                    Download Size
                  </div>
                  <div className="mt-1 text-sm font-bold text-navy-900">
                    {formatBytes(apk.fileSize)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-slate-50 p-3">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                    <Clock className="h-3.5 w-3.5 text-amber-600" />
                    Updated On
                  </div>
                  <div className="mt-1 text-xs font-semibold text-navy-900">
                    {formatDate(apk.uploadedAt)}
                  </div>
                </div>

                <div className="rounded-xl bg-slate-50 p-3">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                    <ShieldCheck className="h-3.5 w-3.5 text-teal-600" />
                    Verified Package
                  </div>
                  <div className="mt-1 text-xs font-semibold text-teal-700">Official Release</div>
                </div>
              </div>

              {apk.releaseNotes && (
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3.5 text-xs">
                  <div className="font-semibold text-slate-700">What's New in this Build:</div>
                  <p className="mt-1 text-slate-600 whitespace-pre-wrap leading-relaxed">
                    {apk.releaseNotes}
                  </p>
                </div>
              )}

              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={downloading || !apk.isAvailable}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#1877E8] px-4 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-[#102B60] disabled:opacity-60"
                >
                  {downloading
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Starting download...</>
                    : <><Download className="h-4 w-4" /> Download v{apk.versionName} APK</>}
                </button>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-slate-500">
              <AlertCircle className="mx-auto h-8 w-8 text-slate-300 mb-2" />
              No release published yet. When the college administrator uploads an APK, it will appear
              here for download.
            </div>
          )}
        </div>

        {/* Card: Installation Guide */}
        <div className="rounded-2xl border border-slate-200/70 bg-white p-6 shadow-sm shadow-navy-900/[0.03]">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
              <HelpCircle className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-navy-900">Installation Guide</h3>
              <p className="text-xs text-slate-500">How to install the APK on Android</p>
            </div>
          </div>

          <div className="space-y-4 pt-5">
            <div className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#1877E8]/10 text-xs font-bold text-[#1877E8]">
                1
              </span>
              <div>
                <h4 className="text-xs font-bold text-navy-900">Download the APK</h4>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  Tap the <strong>Download App</strong> button above to download the APK directly to your phone.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#1877E8]/10 text-xs font-bold text-[#1877E8]">
                2
              </span>
              <div>
                <h4 className="text-xs font-bold text-navy-900">Open Downloaded File</h4>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  Open your Android notification drawer or file manager and tap on the downloaded file.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#1877E8]/10 text-xs font-bold text-[#1877E8]">
                3
              </span>
              <div>
                <h4 className="text-xs font-bold text-navy-900">Allow Unknown Sources</h4>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  If prompted by Android security, tap <strong>Settings</strong> and enable{' '}
                  <em>"Allow from this source"</em> for your browser.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#1877E8]/10 text-xs font-bold text-[#1877E8]">
                4
              </span>
              <div>
                <h4 className="text-xs font-bold text-navy-900">Install &amp; Log In</h4>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  Tap <strong>Install</strong>. Once completed, launch Class Representative Assist and sign in
                  using your college enrollment number.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
