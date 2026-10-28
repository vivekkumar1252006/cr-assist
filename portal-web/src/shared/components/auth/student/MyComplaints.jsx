import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FilePlus2, ListChecks, Search } from 'lucide-react';
import { Card, EmptyState, ErrorState, PageHeader, Skeleton, btnPrimary } from '../../components/student/common.jsx';
import { ComplaintList, Pagination, filterSelectCls } from '../../components/complaints/ComplaintList.jsx';
import { useApi } from '../../lib/useApi.js';
import { CATEGORIES, STATUSES } from '../../lib/complaints.js';

const PAGE_SIZE = 10;

export default function MyComplaints() {
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  // Debounce the search box.
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const qs = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
  if (status) qs.set('status', status);
  if (category) qs.set('category', category);
  if (q) qs.set('q', q);
  const { data, error, loading, reload } = useApi(`/complaints/my?${qs}`);
  const filtered = Boolean(status || category || q);

  const onFilter = (setter) => (e) => {
    setter(e.target.value);
    setPage(1);
  };

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="My Complaints"
        subtitle="Track the status of every problem or complaint you have submitted."
        actions={<Link to="/student/complaints/new" className={btnPrimary}><FilePlus2 className="h-4 w-4" /> New Complaint</Link>}
      />

      <Card bodyClassName="">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <label htmlFor="complaint-search" className="sr-only">Search complaints</label>
            <input
              id="complaint-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by complaint ID or title"
              className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm shadow-sm focus:border-teal-500 focus:outline-none focus:ring-4 focus:ring-teal-100"
            />
          </div>
          <label htmlFor="f-status" className="sr-only">Status</label>
          <select id="f-status" className={filterSelectCls} value={status} onChange={onFilter(setStatus)}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <label htmlFor="f-category" className="sr-only">Category</label>
          <select id="f-category" className={filterSelectCls} value={category} onChange={onFilter(setCategory)}>
            <option value="">All categories</option>
            {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>

        {error ? (
          <div className="p-5"><ErrorState message={error} onRetry={reload} /></div>
        ) : loading && !data ? (
          <div className="space-y-3 p-5">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}</div>
        ) : data.items.length === 0 ? (
          <EmptyState icon={ListChecks} title={filtered ? 'No complaints match your filters' : 'You haven’t submitted any complaints'}>
            {filtered ? 'Try clearing the search or filters.' : (
              <Link to="/student/complaints/new" className="font-semibold text-teal-700 hover:underline">Submit your first complaint</Link>
            )}
          </EmptyState>
        ) : (
          <div className={loading ? 'opacity-60 transition-opacity' : ''}>
            <ComplaintList items={data.items} basePath="/student/complaints" />
            <Pagination page={data.page} pages={data.pages} total={data.total} onPage={setPage} disabled={loading} />
          </div>
        )}
      </Card>
    </div>
  );
}
