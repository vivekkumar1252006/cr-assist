import { ContactRound } from 'lucide-react';
import { EmptyState, ErrorState, PageHeader, Skeleton } from '../../components/student/common.jsx';
import InchargeContactCard from '../../components/student/InchargeContactCard.jsx';
import { useApi } from '../../lib/useApi.js';

export default function HelpSupport() {
  const { data, error, loading, reload } = useApi('/incharges');

  return (
    <div className="animate-fade-up">
      <PageHeader title="Help & Support" subtitle="Contact a class in-charge for assistance." />
      {error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading && !data ? (
        <div className="grid gap-5 md:grid-cols-2">
          {[0, 1].map((item) => <Skeleton key={item} className="h-56 rounded-2xl" />)}
        </div>
      ) : data?.contacts?.length ? (
        <div className="grid gap-5 md:grid-cols-2">
          {data.contacts.map((contact) => <InchargeContactCard key={contact.id} contact={contact} />)}
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200/70 bg-white shadow-sm shadow-navy-900/[0.03]">
          <EmptyState icon={ContactRound} title="No in-charge contacts available">
            Please check back later or contact the college administration.
          </EmptyState>
        </div>
      )}
    </div>
  );
}
