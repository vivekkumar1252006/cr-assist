import React, { useState, useEffect } from 'react';
import { Outlet, useLocation, Navigate } from 'react-router-dom';
import { Sidebar } from './Sidebar.jsx';
import { Header } from './Header.jsx';
import { useAuth } from '@shared/context/AuthContext.jsx';
import { api } from '@shared/lib/api.js';

export function AdminLayout() {
  const { user, checking } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pendingComplaints, setPendingComplaints] = useState(0);
  const location = useLocation();

  useEffect(() => {
    // Poll pending complaints count for sidebar badge
    const fetchBadge = async () => {
      try {
        const res = await api.get('/admin/dashboard');
        if (res.data?.summary?.pendingComplaints !== undefined) {
          setPendingComplaints(res.data.summary.pendingComplaints);
        }
      } catch (_) {}
    };

    if (user && user.role === 'admin') {
      fetchBadge();
      const interval = setInterval(fetchBadge, 30000);
      return () => clearInterval(interval);
    }
  }, [user, location.pathname]);

  if (checking) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-sm font-medium text-slate-400">Loading SmartAttend Admin...</p>
      </div>
    );
  }

  if (!user || user.role !== 'admin') {
    return <Navigate to="/login?role=admin" replace />;
  }

  const titles = {
    '/admin': 'Student Management',
    '/admin/students': 'Student Management',
    '/admin/faculty': 'Faculty Management',
    '/admin/classes': 'Departments',
    '/admin/attendance': 'Attendance Sessions & Records',
    '/admin/complaints': 'Student Grievance & Complaints',
    '/admin/attendance-complaints': 'Attendance Complaints',
    '/admin/reports': 'Reports & Analytics',
    '/admin/incharges': 'Manage In-Charge Contacts',
    '/admin/manage-apk': 'Manage APK Release',
    '/admin/about-management': 'About Page Management',
    '/admin/notices': 'Manage Notices',
    '/admin/settings': 'System Settings & Audit Logs',
  };

  const currentTitle = titles[location.pathname] || 'Admin Portal';

  return (
    <div className="min-h-screen bg-slate-100 flex">
      {/* Sidebar */}
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        pendingComplaintsCount={pendingComplaints}
      />

      {/* Main Container */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-64">
        <Header
          title={currentTitle}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
        />

        <main className="flex-1 p-4 md:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default AdminLayout;