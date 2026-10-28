import React, { Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@shared/context/AuthContext.jsx';
import { ToastProvider } from '@shared/context/ToastContext.jsx';
import { ErrorBoundary } from '@shared/components/ErrorBoundary.jsx';
import Login from '@shared/auth/Login.jsx';
import Register from '@shared/auth/Register.jsx';
import ForgotPassword from '@shared/auth/ForgotPassword.jsx';
import Policies from '@shared/auth/Policies.jsx';

// Student pages (lazy loaded for code splitting)
const StudentDashboard = React.lazy(() => import('@student/pages/StudentDashboard.jsx'));
const MyProfile = React.lazy(() => import('@student/pages/MyProfile.jsx'));
const MyComplaints = React.lazy(() => import('@student/pages/MyComplaints.jsx'));
const ComplaintCenter = React.lazy(() => import('@student/pages/ComplaintCenter.jsx'));
const ComplaintDetails = React.lazy(() => import('@student/pages/ComplaintDetails.jsx'));
const QrAttendance = React.lazy(() => import('@student/pages/QrAttendance.jsx'));
const AttendanceComplaint = React.lazy(() => import('@student/pages/AttendanceComplaint.jsx'));
const HelpSupport = React.lazy(() => import('@student/pages/HelpSupport.jsx'));
const DownloadApp = React.lazy(() => import('@student/pages/DownloadApp.jsx'));
const AboutDeveloper = React.lazy(() => import('@student/pages/AboutDeveloper.jsx'));
const StudentNotices = React.lazy(() => import('@student/pages/StudentNotices.jsx'));

// Admin pages (lazy loaded)
const Students = React.lazy(() => import('@admin/pages/Students.jsx'));
const Faculty = React.lazy(() => import('@admin/pages/Faculty.jsx'));
const Complaints = React.lazy(() => import('@admin/pages/Complaints.jsx'));
const Attendance = React.lazy(() => import('@admin/pages/Attendance.jsx'));
const AttendanceComplaints = React.lazy(() => import('@admin/pages/AttendanceComplaints.jsx'));
const ClassesDepartments = React.lazy(() => import('@admin/pages/ClassesDepartments.jsx'));
const InCharges = React.lazy(() => import('@admin/pages/InCharges.jsx'));
const ManageApk = React.lazy(() => import('@admin/pages/ManageApk.jsx'));
const AboutManagement = React.lazy(() => import('@admin/pages/AboutManagement.jsx'));
const Settings = React.lazy(() => import('@admin/pages/Settings.jsx'));
const ManageNotices = React.lazy(() => import('@admin/pages/ManageNotices.jsx'));

// Layouts
import StudentLayout from '@student/components/StudentLayout.jsx';
import AdminLayout from '@admin/components/AdminLayout.jsx';

function FullPageSpinner({ dark = false }) {
  return (
    <div className={`min-h-screen flex items-center justify-center ${dark ? 'bg-slate-900' : 'bg-slate-50'}`}>
      <div
        className={`w-8 h-8 border-2 border-t-transparent rounded-full animate-spin ${
          dark ? 'border-teal-500' : 'border-blue-600'
        }`}
      />
    </div>
  );
}

const homeFor = (user) =>
  user?.role === 'admin' ? '/admin' : user?.role === 'faculty' ? '/portal-unavailable' : '/student/dashboard';

function PortalUnavailable() {
  const { user, logout } = useAuth();
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 p-4">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-bold text-navy-900">Portal unavailable</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          The faculty portal is not available yet. Please use the student or administrator portal.
        </p>
        {user && (
          <button
            type="button"
            onClick={logout}
            className="mt-6 rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-700"
          >
            Sign out
          </button>
        )}
      </section>
    </main>
  );
}

/** Login/register pages: signed-in users go to the home page for their role. */
function GuestOnly({ children }) {
  const { user, checking } = useAuth();
  if (checking) return <FullPageSpinner />;
  if (user) return <Navigate to={homeFor(user)} replace />;
  return children;
}

/** Requires a session (and optionally a role) before rendering the nested layout. */
function RoleGate({ role, children }) {
  const { user, checking } = useAuth();
  if (checking) return <FullPageSpinner dark={role === 'admin'} />;
  if (!user) return <Navigate to={role === 'admin' ? '/login?role=admin' : '/login'} replace />;
  if (user.role !== role) return <Navigate to={homeFor(user)} replace />;
  return children;
}

function HomeRedirect() {
  const { user, checking } = useAuth();
  if (checking) return <FullPageSpinner />;
  return <Navigate to={user ? homeFor(user) : '/login'} replace />;
}

export default function AppRouter() {
  return (
    <Router>
      <ErrorBoundary>
        <AuthProvider>
          <ToastProvider>
            <Suspense fallback={<FullPageSpinner />}>
              <Routes>
                <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
                <Route path="/register" element={<GuestOnly><Register /></GuestOnly>} />
                <Route path="/forgot-password" element={<GuestOnly><ForgotPassword /></GuestOnly>} />
                {/* Old reset links are dead; send visitors to the OTP flow. */}
                <Route path="/reset-password" element={<Navigate to="/forgot-password" replace />} />
                <Route path="/policies" element={<Policies />} />
                <Route path="/portal-unavailable" element={<PortalUnavailable />} />

                <Route path="/student" element={<RoleGate role="student"><StudentLayout /></RoleGate>}>
                  <Route index element={<Navigate to="dashboard" replace />} />
                  <Route path="dashboard" element={<StudentDashboard />} />
                  <Route path="profile" element={<MyProfile />} />
                  <Route path="qr" element={<QrAttendance />} />
                  <Route path="attendance" element={<Navigate to="/student/dashboard" replace />} />
                  <Route path="attendance-complaint" element={<AttendanceComplaint />} />
                  <Route path="complaints" element={<MyComplaints />} />
                  <Route path="complaints/new" element={<ComplaintCenter />} />
                  <Route path="complaints/:id" element={<ComplaintDetails />} />
                  <Route path="help" element={<HelpSupport />} />
                  <Route path="about-developer" element={<AboutDeveloper />} />
                  <Route path="download-app" element={<DownloadApp />} />
                  <Route path="notices" element={<StudentNotices />} />

                  {/* Legacy URLs kept working after the route rename */}
                  <Route path="attendance/qr" element={<Navigate to="/student/qr" replace />} />
                  <Route path="attendance/complaint" element={<Navigate to="/student/attendance-complaint" replace />} />
                  <Route path="about" element={<Navigate to="/student/about-developer" replace />} />
                  <Route path="download" element={<Navigate to="/student/download-app" replace />} />
                </Route>

                <Route path="/admin" element={<RoleGate role="admin"><AdminLayout /></RoleGate>}>
                  <Route index element={<Navigate to="students" replace />} />
                  <Route path="dashboard" element={<Navigate to="/admin/students" replace />} />
                  <Route path="students" element={<Students />} />
                  <Route path="faculty" element={<Faculty />} />
                  <Route path="complaints" element={<Complaints />} />
                  <Route path="attendance" element={<Attendance />} />
                  <Route path="attendance-complaints" element={<AttendanceComplaints />} />
                  <Route path="classes" element={<ClassesDepartments />} />
                  <Route path="incharges" element={<InCharges />} />
                  <Route path="manage-apk" element={<ManageApk />} />
                  <Route path="about-management" element={<AboutManagement />} />
                  <Route path="about" element={<Navigate to="/admin/about-management" replace />} />
                  <Route path="notices" element={<ManageNotices />} />
                  <Route path="settings" element={<Settings />} />
                </Route>

                <Route path="/" element={<HomeRedirect />} />
                <Route path="*" element={<Navigate to="/login" replace />} />
              </Routes>
            </Suspense>
          </ToastProvider>
        </AuthProvider>
      </ErrorBoundary>
    </Router>
  );
}
