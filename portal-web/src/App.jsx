import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './shared/context/AuthContext.jsx';
import { ToastProvider } from './shared/context/ToastContext.jsx';
import { ErrorBoundary } from './shared/components/ErrorBoundary.jsx';
import Login from './shared/auth/Login.jsx';
import Register from './shared/auth/Register.jsx';
import ForgotPassword from './shared/auth/ForgotPassword.jsx';
import Policies from './shared/auth/Policies.jsx';

// Student pages (lazy loaded for code splitting)
const StudentDashboard = React.lazy(() => import('./apps/student/pages/StudentDashboard.jsx'));
const MyProfile = React.lazy(() => import('./apps/student/pages/MyProfile.jsx'));
const MyComplaints = React.lazy(() => import('./apps/student/pages/MyComplaints.jsx'));
const ComplaintCenter = React.lazy(() => import('./apps/student/pages/ComplaintCenter.jsx'));
const ComplaintDetails = React.lazy(() => import('./apps/student/pages/ComplaintDetails.jsx'));
const AttendanceHistory = React.lazy(() => import('./apps/student/pages/AttendanceHistory.jsx'));
const QrAttendance = React.lazy(() => import('./apps/student/pages/QrAttendance.jsx'));
const AttendanceComplaint = React.lazy(() => import('./apps/student/pages/AttendanceComplaint.jsx'));
const HelpSupport = React.lazy(() => import('./apps/student/pages/HelpSupport.jsx'));
const DownloadApp = React.lazy(() => import('./apps/student/pages/DownloadApp.jsx'));
const AboutDeveloper = React.lazy(() => import('./apps/student/pages/AboutDeveloper.jsx'));
const StudentNotices = React.lazy(() => import('./apps/student/pages/StudentNotices.jsx'));

// Admin pages (lazy loaded)
const AdminDashboard = React.lazy(() => import('./apps/admin/pages/Dashboard.jsx'));
const Students = React.lazy(() => import('./apps/admin/pages/Students.jsx'));
const Faculty = React.lazy(() => import('./apps/admin/pages/Faculty.jsx'));
const Complaints = React.lazy(() => import('./apps/admin/pages/Complaints.jsx'));
const Attendance = React.lazy(() => import('./apps/admin/pages/Attendance.jsx'));
const AttendanceComplaints = React.lazy(() => import('./apps/admin/pages/AttendanceComplaints.jsx'));
const ClassesDepartments = React.lazy(() => import('./apps/admin/pages/ClassesDepartments.jsx'));
const InCharges = React.lazy(() => import('./apps/admin/pages/InCharges.jsx'));
const Reports = React.lazy(() => import('./apps/admin/pages/Reports.jsx'));
const ManageApk = React.lazy(() => import('./apps/admin/pages/ManageApk.jsx'));
const AboutManagement = React.lazy(() => import('./apps/admin/pages/AboutManagement.jsx'));
const Settings = React.lazy(() => import('./apps/admin/pages/Settings.jsx'));
const ManageNotices = React.lazy(() => import('./apps/admin/pages/ManageNotices.jsx'));

// Layouts
import StudentLayout from './apps/student/components/StudentLayout.jsx';
import { AdminLayout } from './apps/admin/components/AdminLayout.jsx';

function StudentRoutes() {
  const { user, checking } = useAuth();

  if (checking) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role !== 'student') {
    return <Navigate to="/admin" replace />;
  }

  return (
    <StudentLayout>
      <Suspense fallback={<div className="p-8 text-center">Loading...</div>}>
        <Routes>
          <Route path="/student/dashboard" element={<StudentDashboard />} />
          <Route path="/student/profile" element={<MyProfile />} />
          <Route path="/student/complaints" element={<MyComplaints />} />
          <Route path="/student/complaints/new" element={<ComplaintCenter />} />
          <Route path="/student/complaints/:id" element={<ComplaintDetails />} />
          <Route path="/student/attendance" element={<AttendanceHistory />} />
          <Route path="/student/attendance/qr" element={<QrAttendance />} />
          <Route path="/student/attendance/complaint" element={<AttendanceComplaint />} />
          <Route path="/student/help" element={<HelpSupport />} />
          <Route path="/student/download" element={<DownloadApp />} />
          <Route path="/student/about" element={<AboutDeveloper />} />
          <Route path="/student/notices" element={<StudentNotices />} />
          <Route path="/student" element={<Navigate to="/student/dashboard" replace />} />
        </Routes>
      </Suspense>
    </StudentLayout>
  );
}

function AdminRoutes() {
  const { user, checking } = useAuth();

  if (checking) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login?role=admin" replace />;
  }

  if (user.role !== 'admin') {
    return <Navigate to="/student/dashboard" replace />;
  }

  return (
    <AdminLayout>
      <Suspense fallback={<div className="p-8 text-center text-white">Loading...</div>}>
        <Routes>
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/students" element={<Students />} />
          <Route path="/admin/faculty" element={<Faculty />} />
          <Route path="/admin/complaints" element={<Complaints />} />
          <Route path="/admin/attendance" element={<Attendance />} />
          <Route path="/admin/attendance-complaints" element={<AttendanceComplaints />} />
          <Route path="/admin/classes" element={<ClassesDepartments />} />
          <Route path="/admin/incharges" element={<InCharges />} />
          <Route path="/admin/reports" element={<Reports />} />
          <Route path="/admin/manage-apk" element={<ManageApk />} />
          <Route path="/admin/about" element={<AboutManagement />} />
          <Route path="/admin/notices" element={<ManageNotices />} />
          <Route path="/admin/settings" element={<Settings />} />
        </Routes>
      </Suspense>
    </AdminLayout>
  );
}

function PublicRoutes() {
  const { user, checking } = useAuth();

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={user.role === 'admin' ? '/admin' : '/student/dashboard'} replace /> : <Login />} />
      <Route path="/register" element={user ? <Navigate to={user.role === 'admin' ? '/admin' : '/student/dashboard'} replace /> : <Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<Navigate to="/forgot-password" replace />} />
      <Route path="/policies" element={<Policies />} />
    </Routes>
  );
}

function AppRoutes() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={<PublicRoutes />} />
      <Route path="/register" element={<PublicRoutes />} />
      <Route path="/forgot-password" element={<PublicRoutes />} />
      <Route path="/reset-password" element={<PublicRoutes />} />
      <Route path="/policies" element={<PublicRoutes />} />
      <Route path="/student/*" element={<StudentRoutes />} />
      <Route path="/admin/*" element={<AdminRoutes />} />
      <Route path="/" element={<Navigate to={user?.role === 'admin' ? '/admin' : '/student/dashboard'} replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <AuthProvider>
          <ToastProvider>
            <AppRoutes />
          </ToastProvider>
        </AuthProvider>
      </ErrorBoundary>
    </BrowserRouter>
  );
}