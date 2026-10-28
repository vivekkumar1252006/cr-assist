import { useEffect, useRef, useState } from 'react';
import {
  Check,
  Code2,
  Mail,
  Phone,
  Sparkles,
  CheckCircle2,
  Layers,
  RefreshCw,
  ExternalLink,
  User,
} from 'lucide-react';
import { Avatar, Card, PageHeader, Skeleton, ErrorState, btnSecondary } from '@/student/components/common.jsx';
import { useApi } from '@shared/lib/useApi.js';

export default function AboutDeveloper() {
  const { data, error, loading, reload } = useApi('/about');
  const [copiedInfo, setCopiedInfo] = useState({}); // { [devId]: { type: 'phone'|'email', text: string } }
  const timeoutRef = useRef(null);

  useEffect(() => () => window.clearTimeout(timeoutRef.current), []);

  async function copyToClipboard(devId, type, text) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const input = document.createElement('textarea');
        input.value = text;
        input.setAttribute('readonly', '');
        input.style.position = 'fixed';
        input.style.opacity = '0';
        document.body.appendChild(input);
        try {
          input.select();
          document.execCommand('copy');
        } finally {
          input.remove();
        }
      }

      setCopiedInfo({
        [devId]: {
          type,
          text: `${type === 'phone' ? 'Phone number' : 'Email'} copied!`,
        },
      });
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(() => setCopiedInfo({}), 2500);
    } catch {
      setCopiedInfo({
        [devId]: {
          type,
          text: 'Copy failed',
        },
      });
    }
  }

  const appCards = data?.appCards || [];
  const developers = data?.developers || [];

  return (
    <div className="space-y-8 animate-fade-up">
      <PageHeader
        title="About & Developer"
        subtitle="Learn more about the portal, its core features, and get in touch with the development team."
        actions={
          <button onClick={reload} className={btnSecondary} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        }
      />

      {error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading && !data ? (
        <div className="space-y-6">
          <Skeleton className="h-72 rounded-2xl" />
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-80 rounded-2xl" />
            <Skeleton className="h-80 rounded-2xl" />
            <Skeleton className="h-80 rounded-2xl" />
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {/* ========================================================
              CARD 1: ABOUT APP (Portal Purpose & Key Features)
             ======================================================== */}
          {appCards.map((app) => (
            <Card key={app.id} title="About Portal & App" icon={Sparkles} className="overflow-hidden">
              <div className="space-y-6">
                {/* Header Info */}
                <div className="border-b border-slate-100 pb-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-xl font-black tracking-tight text-navy-900 sm:text-2xl">
                      {app.title}
                    </h2>
                    {app.badge && (
                      <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700 ring-1 ring-blue-600/20">
                        {app.badge}
                      </span>
                    )}
                  </div>
                  {app.subtitle && (
                    <p className="mt-1 text-sm font-semibold text-teal-700">{app.subtitle}</p>
                  )}
                  <p className="mt-3 text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">
                    {app.description}
                  </p>
                </div>

                {/* Key Features Section */}
                {app.features && app.features.length > 0 && (
                  <div>
                    <h3 className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                      <Layers className="h-4 w-4 text-teal-600" /> Key Features & Capabilities
                    </h3>
                    <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                      {app.features.map((feat, idx) => (
                        <div
                          key={idx}
                          className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-4 transition hover:bg-slate-50 hover:border-slate-300"
                        >
                          <div className="flex items-center gap-2 font-bold text-navy-900 text-sm">
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-teal-600" />
                            <span>{feat.title}</span>
                          </div>
                          {feat.description && (
                            <p className="mt-1.5 text-xs text-slate-600 leading-relaxed pl-6">
                              {feat.description}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Card>
          ))}

          {/* ========================================================
              CARD 2: ABOUT DEVELOPER (Separate Developer Cards)
             ======================================================== */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-[#1877E8]">
                  <Code2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-navy-900">About Developer</h3>
                  <p className="text-xs text-slate-500">Development team behind the portal</p>
                </div>
              </div>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-[#1877E8] ring-1 ring-blue-600/20">
                {developers.length} {developers.length === 1 ? 'Developer' : 'Developers'}
              </span>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {developers.map((dev) => {
                const currentCopied = copiedInfo[dev.id];

                return (
                  <div
                    key={dev.id}
                    className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm shadow-navy-900/[0.03] flex flex-col justify-between space-y-5 transition hover:shadow-md hover:border-slate-300"
                  >
                    {/* Top: Avatar & Name */}
                    <div className="flex items-start gap-4">
                      <div className="shrink-0">
                        {dev.hasPhoto && dev.photoUrl ? (
                          <img
                            src={dev.photoUrl}
                            alt={`${dev.name}'s profile photo`}
                            className="h-16 w-16 rounded-2xl object-cover ring-2 ring-slate-100 shadow-xs border border-slate-200"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              e.currentTarget.nextElementSibling?.classList.remove('hidden');
                            }}
                          />
                        ) : null}
                        <div className={dev.hasPhoto && dev.photoUrl ? 'hidden' : ''}>
                          <Avatar name={dev.name} size="md" className="ring-navy-50" />
                        </div>
                      </div>

                      <div className="min-w-0 flex-1">
                        <h4 className="text-base font-extrabold text-navy-900 truncate">{dev.name}</h4>
                        <p className="text-xs font-semibold text-blue-700 mt-0.5">{dev.role}</p>
                        {dev.bio && (
                          <p className="mt-2 text-xs text-slate-500 line-clamp-2 leading-relaxed">
                            {dev.bio}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Clickable Email & Phone Contact Chips */}
                    <div className="space-y-2.5 w-full text-xs text-slate-700">
                      <div
                        onClick={() => copyToClipboard(dev.id, 'email', dev.email)}
                        className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-slate-50/80 px-3.5 py-2.5 cursor-pointer hover:bg-blue-50/60 hover:border-blue-200 transition"
                        title="Click to copy email address"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Mail className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                          <span className="font-semibold truncate">{dev.email}</span>
                        </div>
                        <span className={`text-[11px] font-bold shrink-0 ml-2 ${
                          currentCopied?.type === 'email' ? 'text-emerald-600 flex items-center gap-1' : 'text-blue-700'
                        }`}>
                          {currentCopied?.type === 'email' ? (
                            <>
                              <Check className="h-3 w-3" /> Copied!
                            </>
                          ) : (
                            'Copy'
                          )}
                        </span>
                      </div>

                      <div
                        onClick={() => copyToClipboard(dev.id, 'phone', dev.phone)}
                        className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-slate-50/80 px-3.5 py-2.5 cursor-pointer hover:bg-teal-50/60 hover:border-teal-200 transition"
                        title="Click to copy phone number"
                      >
                        <div className="flex items-center gap-2">
                          <Phone className="h-3.5 w-3.5 text-teal-600 shrink-0" />
                          <span className="font-semibold">{dev.phone}</span>
                        </div>
                        <span className={`text-[11px] font-bold shrink-0 ml-2 ${
                          currentCopied?.type === 'phone' ? 'text-emerald-600 flex items-center gap-1' : 'text-teal-700'
                        }`}>
                          {currentCopied?.type === 'phone' ? (
                            <>
                              <Check className="h-3 w-3" /> Copied!
                            </>
                          ) : (
                            'Copy'
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
