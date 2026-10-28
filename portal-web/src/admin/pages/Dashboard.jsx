import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  GraduationCap,
  Building2,
  QrCode,
  UserCheck,
  UserX,
  AlertCircle,
  CheckCircle2,
  TrendingUp,
  RefreshCw,
  PlusCircle,
  FileText,
  Calendar,
  ChevronRight,
} from 'lucide-react';
import { api, parseApiError } from '@shared/lib/api.js';
import { StatCard } from '../components/StatCard.jsx';
import { StatusBadge } from '../components/Badge.jsx';

export function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetchDashboard = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const res = await api.get('/admin/dashboard');
      setData(res.data);
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm font-semibold text-slate-500">Loading College Attendance Analytics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800">
        <h3 className="text-base font-bold flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-rose-600" />
          Failed to load dashboard statistics
        </h3>
        <p className="text-sm mt-1">{error}</p>
        <button
          onClick={() => fetchDashboard(true)}
          className="mt-4 px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold hover:bg-rose-700"
        >
          Try Again
        </button>
      </div>
    );
  }

  const { summary, charts } = data || {};

  return (
    <div className="space-y-6">
      {/* Top Banner with Quick Actions */}
      <div className="bg-linear-to-r from-blue-900 via-indigo-900 to-slate-900 rounded-3xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 opacity-10 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-400 to-transparent pointer-events-none"></div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <span className="px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/30 text-xs font-semibold uppercase tracking-wider">
              SmartAttend College ERP
            </span>
            <h2 className="text-2xl md:text-3xl font-extrabold mt-2 tracking-tight">
              Attendance & Operations Overview
            </h2>
            <p className="text-slate-300 text-sm mt-1 max-w-xl">
              Real-time monitoring of campus QR sessions, student cohorts, faculty assignments, and grievance resolutions.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => fetchDashboard(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold backdrop-blur-xs transition-all border border-white/10 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span>Refresh Stats</span>
            </button>

            <Link
              to="/admin/attendance"
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md shadow-blue-500/30 transition-all cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Start Session</span>
            </Link>

            <Link
              to="/admin/students"
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white text-slate-900 hover:bg-slate-100 text-xs font-bold shadow-md transition-all cursor-pointer"
            >
              <GraduationCap className="w-3.5 h-3.5 text-blue-600" />
              <span>Add Student</span>
            </Link>
          </div>
        </div>
      </div>

      {/* 8 Summary Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Students"
          value={summary?.totalStudents ?? 0}
          icon={GraduationCap}
          color="blue"
          subtitle="Enrolled active students"
        />
        <StatCard
          title="Total Faculty"
          value={summary?.totalFaculty ?? 0}
          icon={Users}
          color="indigo"
          subtitle="Teaching staff members"
        />
        <StatCard
          title="Total Classes"
          value={summary?.totalClasses ?? 1}
          icon={Building2}
          color="purple"
          subtitle="Course / Sem / Groups"
        />
        <StatCard
          title="Attendance Sessions"
          value={summary?.totalSessions ?? 0}
          icon={QrCode}
          color="blue"
          subtitle="Total conducted meetings"
        />
        <StatCard
          title="Today's Present"
          value={summary?.todayPresent ?? 0}
          icon={UserCheck}
          color="emerald"
          subtitle="Students verified via QR"
        />
        <StatCard
          title="Today's Absent"
          value={summary?.todayAbsent ?? 0}
          icon={UserX}
          color="rose"
          subtitle="Missed scheduled classes"
        />
        <StatCard
          title="Pending Complaints"
          value={summary?.pendingComplaints ?? 0}
          icon={AlertCircle}
          color="amber"
          subtitle="Awaiting review / action"
        />
        <StatCard
          title="Resolved Complaints"
          value={summary?.resolvedComplaints ?? 0}
          icon={CheckCircle2}
          color="emerald"
          subtitle="Closed student tickets"
        />
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Daily Attendance Trend */}
        <div className="lg:col-span-2 bg-white rounded-3xl p-6 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">Attendance Activity Trends</h3>
              <p className="text-xs text-slate-500 mt-0.5">Scanned records for recent academic sessions</p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5 font-medium text-emerald-700">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500"></span> Present
              </span>
              <span className="flex items-center gap-1.5 font-medium text-amber-700">
                <span className="w-2.5 h-2.5 rounded-sm bg-amber-500"></span> Late
              </span>
              <span className="flex items-center gap-1.5 font-medium text-rose-700">
                <span className="w-2.5 h-2.5 rounded-sm bg-rose-500"></span> Absent
              </span>
            </div>
          </div>

          {charts?.dailyTrends?.length > 0 ? (
            <div className="h-64 flex items-end gap-3 pt-6 pb-2 border-b border-slate-100">
              {charts.dailyTrends.map((d, i) => {
                const total = (Number(d.presentCount) || 0) + (Number(d.lateCount) || 0) + (Number(d.absentCount) || 0);
                const pPct = total > 0 ? Math.round(((Number(d.presentCount) || 0) / total) * 100) : 0;
                const lPct = total > 0 ? Math.round(((Number(d.lateCount) || 0) / total) * 100) : 0;
                const aPct = total > 0 ? Math.round(((Number(d.absentCount) || 0) / total) * 100) : 0;

                return (
                  <div key={i} className="flex-1 flex flex-col items-center h-full justify-end group relative">
                    {/* Tooltip */}
                    <div className="absolute -top-12 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900 text-white text-[11px] rounded-lg py-1 px-2 pointer-events-none whitespace-nowrap z-20 shadow-lg">
                      {d.date}: {d.presentCount} Present, {d.lateCount} Late, {d.absentCount} Absent
                    </div>

                    <div className="w-full max-w-[42px] flex flex-col justify-end bg-slate-100 rounded-t-lg overflow-hidden h-48">
                      <div style={{ height: `${aPct}%` }} className="w-full bg-rose-400 transition-all"></div>
                      <div style={{ height: `${lPct}%` }} className="w-full bg-amber-400 transition-all"></div>
                      <div style={{ height: `${pPct}%` }} className="w-full bg-emerald-500 transition-all"></div>
                    </div>
                    <span className="text-[11px] font-semibold text-slate-500 mt-2 truncate w-full text-center">
                      {d.date ? String(d.date).slice(5) : `Day ${i + 1}`}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="h-48 flex flex-col items-center justify-center text-slate-400 text-sm">
              <Calendar className="w-8 h-8 text-slate-300 mb-2" />
              <span>No recent attendance activity recorded yet.</span>
            </div>
          )}

          <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
            <span>Aggregated across all registered branches & classes</span>
            <Link to="/admin/reports" className="font-semibold text-blue-600 hover:underline flex items-center gap-1">
              View Detailed Reports <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* Complaint Status Distribution */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-base font-bold text-slate-900">Complaints Status</h3>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">
                Grievance Center
              </span>
            </div>
            <p className="text-xs text-slate-500 mb-5">Current status of submitted student tickets</p>

            <div className="space-y-3">
              {charts?.complaintStats?.length > 0 ? (
                charts.complaintStats.map((item) => (
                  <div key={item.status} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <StatusBadge status={item.status} />
                    <span className="text-sm font-extrabold text-slate-800">{item.count}</span>
                  </div>
                ))
              ) : (
                <div className="py-8 text-center text-slate-400 text-xs">
                  <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-400 mb-2" />
                  No grievances currently registered.
                </div>
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 mt-4">
            <Link
              to="/admin/complaints"
              className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
            >
              Open Complaints Queue <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* Class-wise Performance & Quick Links */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Class-wise Attendance Performance */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">Class Cohort Attendance %</h3>
              <p className="text-xs text-slate-500 mt-0.5">Average attendance benchmark across departments</p>
            </div>
            <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
              Min Req: 75%
            </span>
          </div>

          <div className="space-y-4">
            {charts?.classWise?.length > 0 ? (
              charts.classWise.map((c, idx) => (
                <div key={idx} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-slate-800">{c.className}</span>
                    <span
                      className={`font-bold ${
                        c.percentage >= 75 ? 'text-emerald-600' : 'text-rose-600'
                      }`}
                    >
                      {c.percentage}% ({c.students} Students)
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${Math.min(100, c.percentage)}%` }}
                      className={`h-full rounded-full transition-all ${
                        c.percentage >= 75 ? 'bg-emerald-500' : 'bg-rose-500'
                      }`}
                    ></div>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-4 text-center text-slate-400 text-xs">
                No class cohorts configured yet.
              </div>
            )}
          </div>
        </div>

        {/* Operational Quick Guides & Actions */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900 mb-1">Administrative Actions</h3>
            <p className="text-xs text-slate-500 mb-4">Direct shortcuts to high-frequency ERP operations</p>

            <div className="grid grid-cols-2 gap-3">
              <Link
                to="/admin/attendance"
                className="p-4 rounded-2xl bg-blue-50/60 border border-blue-100 hover:bg-blue-100/70 transition-colors flex flex-col items-start gap-2 group"
              >
                <div className="p-2 rounded-xl bg-blue-600 text-white">
                  <QrCode className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900 group-hover:text-blue-600">
                    Live QR Attendance
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Project session QR code</div>
                </div>
              </Link>

              <Link
                to="/admin/students"
                className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-100 hover:bg-emerald-100/70 transition-colors flex flex-col items-start gap-2 group"
              >
                <div className="p-2 rounded-xl bg-emerald-600 text-white">
                  <GraduationCap className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900 group-hover:text-emerald-600">
                    Student Accounts
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Approve, edit or suspend</div>
                </div>
              </Link>

              <Link
                to="/admin/faculty"
                className="p-4 rounded-2xl bg-purple-50/60 border border-purple-100 hover:bg-purple-100/70 transition-colors flex flex-col items-start gap-2 group"
              >
                <div className="p-2 rounded-xl bg-purple-600 text-white">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900 group-hover:text-purple-600">
                    Class Incharges
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Assign faculty cohorts</div>
                </div>
              </Link>

              <Link
                to="/admin/reports"
                className="p-4 rounded-2xl bg-amber-50/60 border border-amber-100 hover:bg-amber-100/70 transition-colors flex flex-col items-start gap-2 group"
              >
                <div className="p-2 rounded-xl bg-amber-600 text-white">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900 group-hover:text-amber-600">
                    Low-Attendance Alert
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Students below 75%</div>
                </div>
              </Link>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>College Year: 2025-2026</span>
            <Link to="/admin/settings" className="font-semibold text-blue-600 hover:underline">
              System Settings & Audit Log →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
