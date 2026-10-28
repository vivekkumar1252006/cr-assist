import { useState } from 'react';
import { CalendarClock, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import { Card, EmptyState, ErrorState, PageHeader, Skeleton } from '../../components/student/common.jsx';
import AttendanceTable from '../../components/student/AttendanceTable.jsx';
import { useApi } from '../../lib/useApi.js';

const STATUS_OPTIONS = [
  ['', 'All statuses'],
  ['present', 'Present'],
  ['late', 'Late'],
  ['absent', 'Absent'],
  ['ongoing', 'Ongoing'],
];
const PAGE_SIZE = 15;

const selectCls =
  'rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-4 focus:ring-teal-100';

export default function AttendanceHistory() {
  const [status, setStatus] = useState('');
  const [subject, setSubject] = useState('');
  const [page, setPage] = useState(1);

  const qs = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
  if (status) qs.set('status', status);
  if (subject) qs.set('subject', subject);
  const { data, error, loading, reload } = useApi(`/student/attendance?${qs}`);

  const changeFilter = (setter) => (e) => {
    setter(e.target.value);
    setPage(1);
  };

  return (
    <div className="animate-fade-up">
      <PageHeader title="Attendance History" subtitle="Every class held for your section, with your attendance status." />

      <Card
        bodyClassName=""
        title={data ? `${data.total} class${data.total === 1 ? '' : 'es'}` : 'Classes'}
        icon={CalendarClock}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="hidden h-4 w-4 text-slate-400 sm:block" />
            <label className="sr-only" htmlFor="filter-subject">Subject</label>
            <select id="filter-subject" className={selectCls} value={subject} onChange={changeFilter(setSubject)}>
              <option value="">All subjects</option>
              {(data?.subjects ?? []).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <label className="sr-only" htmlFor="filter-status">Status</label>
            <select id="filter-status" className={selectCls} value={status} onChange={changeFilter(setStatus)}>
              {STATUS_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        }
      >
        {error ? (
          <div className="p-5"><ErrorState message={error} onRetry={reload} /></div>
        ) : loading && !data ? (
          <div className="space-y-3 p-5">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-11" />)}</div>
        ) : data.items.length === 0 ? (
          <EmptyState icon={CalendarClock} title={status || subject ? 'No classes match these filters' : 'No attendance history yet'}>
            {status || subject ? 'Try a different subject or status.' : 'Classes will appear here once sessions have been held for your section.'}
          </EmptyState>
        ) : (
          <div className={loading ? 'opacity-60 transition-opacity' : ''}>
            <AttendanceTable items={data.items} allowComplaint />
            {data.pages > 1 && (
              <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-sm">
                <p className="text-slate-500">Page {data.page} of {data.pages}</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => p - 1)}
                    disabled={page <= 1 || loading}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" /> Previous
                  </button>
                  <button
                    onClick={() => setPage((p) => p + 1)}
                    disabled={page >= data.pages || loading}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                  >
                    Next <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
