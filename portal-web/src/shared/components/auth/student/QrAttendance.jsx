import {
  IdCard,
  RefreshCw,
  User,
  Hash,
  Award,
} from 'lucide-react';
import { Card, ErrorState, PageHeader, Skeleton, btnSecondary } from '../../components/student/common.jsx';
import { useStudent } from '../../components/student/StudentLayout.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useApi } from '../../lib/useApi.js';

export default function QrAttendance() {
  const { user } = useAuth();
  const { profile } = useStudent();
  const { data, error, loading, reload } = useApi('/student/attendance/qr');

  const studentName = profile?.fullName || user?.fullName || 'Student';
  const enrollmentNumber = profile?.enrollmentNumber || user?.enrollmentNumber || '—';
  const rollNumber = profile?.studentId || user?.studentId || '—';

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title="QR Attendance"
        actions={
          <button onClick={reload} className={btnSecondary} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        }
      />

      {error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data ? (
        <div className="max-w-md mx-auto">
          <Skeleton className="h-96 rounded-2xl" />
        </div>
      ) : (
        <div className="max-w-md mx-auto">
          {/* Student Identification QR Code & Essential Details */}
          <Card title="Student Identification QR" icon={IdCard} className="flex flex-col">
            <div className="flex flex-col items-center py-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-xs">
                <img
                  src={data.identity.image}
                  alt="Student identification QR code"
                  className="h-56 w-56 sm:h-64 sm:w-64"
                />
              </div>

              {/* Essential Student Details */}
              <div className="mt-5 w-full rounded-xl border border-slate-100 bg-slate-50/70 p-4 space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 font-medium text-slate-500">
                    <User className="h-3.5 w-3.5 text-blue-600" /> Name
                  </span>
                  <span className="font-bold text-navy-900 text-sm">{studentName}</span>
                </div>

                <div className="flex items-center justify-between border-t border-slate-200/50 pt-2.5">
                  <span className="flex items-center gap-1.5 font-medium text-slate-500">
                    <Award className="h-3.5 w-3.5 text-indigo-600" /> Enrollment No.
                  </span>
                  <span className="font-semibold text-slate-800">{enrollmentNumber}</span>
                </div>

                <div className="flex items-center justify-between border-t border-slate-200/50 pt-2.5">
                  <span className="flex items-center gap-1.5 font-medium text-slate-500">
                    <Hash className="h-3.5 w-3.5 text-teal-600" /> Roll Number
                  </span>
                  <span className="font-semibold text-slate-800">{rollNumber}</span>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
