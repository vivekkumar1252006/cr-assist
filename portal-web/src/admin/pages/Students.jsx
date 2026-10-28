import React, { useEffect, useRef, useState } from 'react';
import {
  Search,
  Plus,
  Download,
  Eye,
  Edit2,
  Trash2,
  GraduationCap,
  Mail,
  Phone,
  Calendar,
  ChevronLeft,
  ChevronRight,
  User,
  Upload,
  X,
  AlertTriangle,
} from 'lucide-react';
import { api, parseApiError } from '@shared/lib/api.js';
import { Modal } from '../components/Modal.jsx';
import { StatusBadge, ComplaintStatusBadge } from '../components/Badge.jsx';

const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const EMPTY_FORM = {
  fullName: '',
  email: '',
  password: '',
  enrollmentNumber: '',
  studentId: '',
  course: 'CSE',
  academicYear: 'First Year',
  semester: 1,
  studentGroup: 'A',
  mobile: '',
  dob: '',
  accountStatus: 'active',
};

/** Formats a YYYY-MM-DD date column for display (matches the Attendance Complaints page). */
const formatDateOnly = (value) =>
  value
    ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '—';

export function Students() {
  const [students, setStudents] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(15);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [search, setSearch] = useState('');
  const [course, setCourse] = useState('');
  const [semester, setSemester] = useState('');
  const [group, setGroup] = useState('');

  // Modals state
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentDetails, setStudentDetails] = useState(null);
  const [detailTab, setDetailTab] = useState('profile'); // 'profile' | 'attendance' | 'complaints'
  const [detailLoading, setDetailLoading] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // Form state
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  // Profile photo chosen in the edit modal (previewed locally, uploaded on save).
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [photoError, setPhotoError] = useState('');
  const [photoRemoving, setPhotoRemoving] = useState(false);
  const photoInputRef = useRef(null);
  const objectUrlRef = useRef(null);

  const fetchStudents = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { page, limit };
      if (search) params.search = search;
      if (course) params.course = course;
      if (semester) params.semester = semester;
      if (group) params.group = group;

      const res = await api.get('/admin/students', { params });
      setStudents(res.data.students || []);
      setTotal(res.data.total || 0);
      setPages(res.data.pages || 1);
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, [page, course, semester, group]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchStudents();
  };

  // Open details modal
  const openDetails = async (student) => {
    setSelectedStudent(student);
    setDetailTab('profile');
    setDetailModalOpen(true);
    setDetailLoading(true);
    try {
      const res = await api.get(`/admin/students/${student.id}`);
      setStudentDetails(res.data);
    } catch (err) {
      alert(parseApiError(err).message);
    } finally {
      setDetailLoading(false);
    }
  };

  // Open edit modal (loads fresh details so every field is current).
  const openEdit = async (student) => {
    setSelectedStudent(student);
    setFormData({
      fullName: student.fullName || '',
      email: student.email || '',
      password: '',
      enrollmentNumber: student.enrollmentNumber || '',
      studentId: student.studentId || '',
      course: student.course || 'CSE',
      academicYear: student.academicYear || 'First Year',
      semester: student.semester || 1,
      studentGroup: student.group || 'A',
      mobile: student.mobile || '',
      dob: student.dob ? String(student.dob).slice(0, 10) : '',
      // Not editable in this form — sent back unchanged so saving never alters the status.
      accountStatus: student.accountStatus || 'active',
    });
    setFieldErrors({});
    setFormError(null);
    setPhotoFile(null);
    setPhotoError('');
    setPhotoRemoving(false);
    setPhotoPreview(student.photoUrl || '');
    setEditModalOpen(true);
  };

  /** Client-side validation mirroring the server rules. Returns true when clean. */
  function validateForm({ isNew = false } = {}) {
    const next = {};
    const name = formData.fullName.trim();
    const email = formData.email.trim().toLowerCase();
    const enrollment = formData.enrollmentNumber.trim().toUpperCase();
    const sid = formData.studentId.trim().toUpperCase();
    const mobile = formData.mobile.replace(/[\s-]/g, '').replace(/^\+91/, '').replace(/^91(\d{10})$/, '$1');

    if (!/^[A-Za-z][A-Za-z .'-]{1,99}$/.test(name)) next.fullName = 'Enter the full name (letters only).';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 191) next.email = 'Enter a valid email address.';
    if (!/^[0-9]{4}[A-Z]{2,4}[0-9]{5,7}$/.test(enrollment)) next.enrollmentNumber = 'Invalid enrollment number (e.g. 0111CS251275).';
    if (!/^[0-9]{2}-[0-9]{2}STU[0-9]{4,6}$/.test(sid)) next.studentId = 'Invalid student ID (e.g. 25-26STU11806).';
    if (mobile && !/^[6-9][0-9]{9}$/.test(mobile)) next.mobile = 'Enter a valid 10-digit mobile number.';

    if (formData.dob) {
      const d = new Date(`${formData.dob}T00:00:00Z`);
      if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== formData.dob) {
        next.dob = 'Enter a valid date of birth.';
      } else {
        const now = new Date();
        let age = now.getUTCFullYear() - d.getUTCFullYear();
        const m = now.getUTCMonth() - d.getUTCMonth();
        if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) age--;
        if (age < 15 || age > 70) next.dob = 'Age must be between 15 and 70 years.';
      }
    }

    const yearIdx = ['First Year', 'Second Year', 'Third Year', 'Fourth Year'].indexOf(formData.academicYear);
    const sem = Number(formData.semester);
    if (!Number.isInteger(sem) || sem < 1 || sem > 8) next.semester = 'Select your semester.';
    else if (yearIdx !== -1 && Math.ceil(sem / 2) !== yearIdx + 1) {
      next.semester = `Semester ${sem} does not belong to ${formData.academicYear}.`;
    }

    // Password is optional on edit, but must be strong when supplied (and always on create).
    const pw = formData.password;
    if (isNew && !pw) next.password = 'Password is required to register a student.';
    if (pw) {
      if (pw.length < 8) next.password = 'Password must be at least 8 characters.';
      else if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/[0-9]/.test(pw)) {
        next.password = 'Password must include uppercase, lowercase letters and a number.';
      }
    }

    if (photoFile && !PHOTO_TYPES.includes(photoFile.type)) next.photo = 'Choose a JPG, PNG or WebP image.';
    if (photoFile && photoFile.size > MAX_PHOTO_BYTES) next.photo = 'Photo must be 2 MB or smaller.';

    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  function onPhotoChange(e) {
    const file = e.target.files?.[0] || null;
    setPhotoError('');
    setFieldErrors((cur) => ({ ...cur, photo: '' }));
    if (!file) return;
    if (!PHOTO_TYPES.includes(file.type)) {
      setPhotoError('Choose a JPG, PNG or WebP image.');
      e.target.value = '';
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setPhotoError('Photo must be 2 MB or smaller.');
      e.target.value = '';
      return;
    }
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    setPhotoFile(file);
    setPhotoPreview(url);
    setPhotoRemoving(false);
  }

  function clearPhoto() {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
    setPhotoFile(null);
    setPhotoPreview('');
    setPhotoError('');
    if (photoInputRef.current) photoInputRef.current.value = '';
  }

  // Delete the student account + associated records (server cascades).
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await api.delete(`/admin/students/${deleteTarget.id}`);
      setDeleteTarget(null);
      // Refetch so pagination stays correct when the last row on a page goes away.
      if (students.length === 1 && page > 1) setPage((p) => p - 1);
      else fetchStudents();
    } catch (err) {
      setDeleteError(parseApiError(err).message);
    } finally {
      setDeleting(false);
    }
  };

  // Submit Add Student
  const handleAddSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);
    if (!validateForm({ isNew: true })) return;
    setFormSubmitting(true);
    try {
      await api.post('/admin/students', formData);
      setAddModalOpen(false);
      setFormData(EMPTY_FORM);
      fetchStudents();
    } catch (err) {
      const parsed = parseApiError(err);
      setFormError(parsed.message);
      setFieldErrors(parsed.errors || {});
    } finally {
      setFormSubmitting(false);
    }
  };

  // Submit Edit Student (details first, then the photo if one was chosen).
  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);
    if (!validateForm()) return;
    setFormSubmitting(true);
    try {
      const payload = { ...formData };
      delete payload.password;
      if (formData.password) payload.password = formData.password;

      await api.put(`/admin/students/${selectedStudent.id}`, payload);

      if (photoFile) {
        const body = new FormData();
        body.append('photo', photoFile);
        await api.post(`/admin/students/${selectedStudent.id}/photo`, body, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      } else if (photoRemoving && selectedStudent?.hasPhoto) {
        await api.delete(`/admin/students/${selectedStudent.id}/photo`);
      }

      setEditModalOpen(false);
      clearPhoto();
      fetchStudents();
      // Keep an open details modal in sync with the edits.
      if (detailModalOpen && studentDetails?.student?.id === selectedStudent.id) {
        openDetails(selectedStudent);
      }
    } catch (err) {
      const parsed = parseApiError(err);
      setFormError(parsed.message);
      setFieldErrors(parsed.errors || {});
    } finally {
      setFormSubmitting(false);
    }
  };

  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  // Export to CSV
  const handleExportCSV = () => {
    if (!students.length) return;
    const headers = [
      'ID',
      'Full Name',
      'Email',
      'Enrollment Number',
      'Student ID',
      'Branch/Course',
      'Semester',
      'Group',
      'Mobile',
    ];
    const rows = students.map((s) => [
      s.id,
      `"${s.fullName || ''}"`,
      `"${s.email || ''}"`,
      `"${s.enrollmentNumber || ''}"`,
      `"${s.studentId || ''}"`,
      `"${s.course || ''}"`,
      s.semester || '',
      s.group || '',
      `"${s.mobile || ''}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `smartattend_students_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">Student Directory</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage student registrations, academic cohorts, and attendance standing
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4 text-slate-500" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={() => {
              setFormData(EMPTY_FORM);
              setFieldErrors({});
              setFormError(null);
              clearPhoto();
              setAddModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Student</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-3">
        <form onSubmit={handleSearchSubmit} className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by student name, enrollment no, student ID, or email..."
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={course}
              onChange={(e) => {
                setCourse(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-700 bg-white"
            >
              <option value="">All Branches</option>
              <option value="CSE">CSE</option>
              <option value="IT">IT</option>
              <option value="ECE">ECE</option>
              <option value="ME">ME</option>
              <option value="Civil">Civil</option>
            </select>

            <select
              value={semester}
              onChange={(e) => {
                setSemester(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-700 bg-white"
            >
              <option value="">All Semesters</option>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                <option key={s} value={s}>
                  Sem {s}
                </option>
              ))}
            </select>

            <select
              value={group}
              onChange={(e) => {
                setGroup(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-700 bg-white"
            >
              <option value="">All Groups</option>
              <option value="A">Group A</option>
              <option value="B">Group B</option>
            </select>

            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-slate-800 text-white text-xs font-semibold hover:bg-slate-900"
            >
              Apply Filter
            </button>
          </div>
        </form>
      </div>

      {/* Students Data Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                <th className="py-3.5 px-4">Student</th>
                <th className="py-3.5 px-4">Enrollment / ID</th>
                <th className="py-3.5 px-4">Class Cohort</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-slate-400">
                    <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                    Loading students...
                  </td>
                </tr>
              ) : students.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-slate-400">
                    <GraduationCap className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                    No students match the selected filters.
                  </td>
                </tr>
              ) : (
                students.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center shrink-0">
                            {s.fullName ? s.fullName.charAt(0) : 'S'}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900">{s.fullName}</div>
                            <div className="text-[11px] text-slate-400">{s.email}</div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-mono font-medium text-slate-700">
                        <div>{s.enrollmentNumber}</div>
                        <div className="text-[11px] text-slate-400 font-sans">{s.studentId}</div>
                      </td>

                      <td className="py-3.5 px-4 font-medium text-slate-700">
                        <span className="font-bold text-slate-900">{s.course}</span> · Sem {s.semester}{' '}
                        <span className="text-slate-400">({s.group})</span>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openDetails(s)}
                            title="Details"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                          >
                            <Eye className="w-3.5 h-3.5" /> Details
                          </button>

                          <button
                            onClick={() => openEdit(s)}
                            title="Edit Student"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                          >
                            <Edit2 className="w-3.5 h-3.5" /> Edit
                          </button>

                          <button
                            onClick={() => {
                              setDeleteTarget(s);
                              setDeleteError('');
                            }}
                            title="Delete Student"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <div>
            Showing <span className="font-bold text-slate-800">{students.length}</span> of{' '}
            <span className="font-bold text-slate-800">{total}</span> total registered students
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-semibold text-slate-700">
              Page {page} of {pages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              disabled={page >= pages}
              className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ====================================================================== */}
      {/* ADD STUDENT MODAL                                                      */}
      {/* ====================================================================== */}
      <Modal isOpen={addModalOpen} onClose={() => setAddModalOpen(false)} title="Register New Student">
        <form onSubmit={handleAddSubmit} className="space-y-4">
          {formError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Full Name *</label>
              <input
                type="text"
                required
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                placeholder="e.g. Arun Sharma"
                className="w-full px-3 py-2 rounded-xl border border-slate-200"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Email Address *</label>
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="student@gmail.com"
                className="w-full px-3 py-2 rounded-xl border border-slate-200"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Password *</label>
              <input
                type="password"
                required
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="Min 8 chars, upper + lower + number"
                className={`w-full px-3 py-2 rounded-xl border ${fieldErrors.password ? 'border-rose-300 bg-rose-50/40' : 'border-slate-200'}`}
              />
              {fieldErrors.password && <p className="mt-1 text-[11px] font-semibold text-rose-600">{fieldErrors.password}</p>}
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Enrollment Number *</label>
              <input
                type="text"
                required
                value={formData.enrollmentNumber}
                onChange={(e) => setFormData({ ...formData, enrollmentNumber: e.target.value })}
                placeholder="0111CS251275"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 uppercase"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">College Student ID *</label>
              <input
                type="text"
                required
                value={formData.studentId}
                onChange={(e) => setFormData({ ...formData, studentId: e.target.value })}
                placeholder="25-26STU11806"
                className="w-full px-3 py-2 rounded-xl border border-slate-200"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Mobile Number</label>
              <input
                type="tel"
                value={formData.mobile}
                onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                placeholder="9876543210"
                className="w-full px-3 py-2 rounded-xl border border-slate-200"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Branch / Course</label>
              <select
                value={formData.course}
                onChange={(e) => setFormData({ ...formData, course: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
              >
                <option value="CSE">Computer Science (CSE)</option>
                <option value="IT">Information Technology (IT)</option>
                <option value="AIML">CSE (AI &amp; Machine Learning)</option>
                <option value="ECE">Electronics (ECE)</option>
                <option value="EE">Electrical (EE)</option>
                <option value="ME">Mechanical (ME)</option>
                <option value="CE">Civil Engineering</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Academic Year</label>
              <select
                value={formData.academicYear}
                onChange={(e) => setFormData({ ...formData, academicYear: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
              >
                <option value="First Year">First Year</option>
                <option value="Second Year">Second Year</option>
                <option value="Third Year">Third Year</option>
                <option value="Fourth Year">Fourth Year</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Semester</label>
              <select
                value={formData.semester}
                onChange={(e) => setFormData({ ...formData, semester: parseInt(e.target.value, 10) })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                  <option key={s} value={s}>
                    Semester {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Class Section / Group</label>
              <select
                value={formData.studentGroup}
                onChange={(e) => setFormData({ ...formData, studentGroup: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
              >
                <option value="A">Group A</option>
                <option value="B">Group B</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setAddModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={formSubmitting}
              className="px-5 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 disabled:opacity-50"
            >
              {formSubmitting ? 'Registering...' : 'Register Student'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ====================================================================== */}
      {/* EDIT STUDENT MODAL                                                     */}
      {/* ====================================================================== */}
      <Modal isOpen={editModalOpen} onClose={() => setEditModalOpen(false)} title="Edit Student Details">
        <form onSubmit={handleEditSubmit} className="space-y-4">
          {formError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
              {formError}
            </div>
          )}

          {/* Profile photo */}
          <div className="flex items-center gap-4 p-3 rounded-xl bg-slate-50 border border-slate-200">
            {photoPreview ? (
              <img src={photoPreview} alt="Profile preview" className="w-16 h-16 rounded-full object-cover ring-4 ring-blue-50" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-blue-100 text-blue-700 text-xl font-bold flex items-center justify-center ring-4 ring-blue-50">
                {(formData.fullName || 'S').charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-slate-700">Profile Photo</p>
              <p className="text-[11px] text-slate-500 mb-2">JPG, PNG or WebP · max 2 MB.</p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {photoPreview ? 'Change photo' : 'Upload photo'}
                </button>
                {(photoPreview || photoFile) && (
                  <button
                    type="button"
                    onClick={() => {
                      clearPhoto();
                      setPhotoRemoving(Boolean(selectedStudent?.hasPhoto));
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-rose-600 hover:bg-rose-50"
                  >
                    <X className="w-3.5 h-3.5" /> Remove
                  </button>
                )}
              </div>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={onPhotoChange}
                className="hidden"
              />
              {(photoError || fieldErrors.photo) && (
                <p className="mt-1 text-[11px] font-semibold text-rose-600">{photoError || fieldErrors.photo}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Full Name *</label>
              <input
                type="text"
                required
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                className={`w-full px-3 py-2 rounded-xl border ${fieldErrors.fullName ? 'border-rose-300 bg-rose-50/40' : 'border-slate-200'}`}
              />
              {fieldErrors.fullName && <p className="mt-1 text-[11px] font-semibold text-rose-600">{fieldErrors.fullName}</p>}
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Email Address *</label>
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className={`w-full px-3 py-2 rounded-xl border ${fieldErrors.email ? 'border-rose-300 bg-rose-50/40' : 'border-slate-200'}`}
              />
              {fieldErrors.email && <p className="mt-1 text-[11px] font-semibold text-rose-600">{fieldErrors.email}</p>}
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Enrollment Number *</label>
              <input
                type="text"
                required
                value={formData.enrollmentNumber}
                onChange={(e) => setFormData({ ...formData, enrollmentNumber: e.target.value })}
                placeholder="0111CS251275"
                className={`w-full px-3 py-2 rounded-xl border uppercase ${fieldErrors.enrollmentNumber ? 'border-rose-300 bg-rose-50/40' : 'border-slate-200'}`}
              />
              {fieldErrors.enrollmentNumber && (
                <p className="mt-1 text-[11px] font-semibold text-rose-600">{fieldErrors.enrollmentNumber}</p>
              )}
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Student ID *</label>
              <input
                type="text"
                required
                value={formData.studentId}
                onChange={(e) => setFormData({ ...formData, studentId: e.target.value })}
                placeholder="25-26STU11806"
                className={`w-full px-3 py-2 rounded-xl border ${fieldErrors.studentId ? 'border-rose-300 bg-rose-50/40' : 'border-slate-200'}`}
              />
              {fieldErrors.studentId && <p className="mt-1 text-[11px] font-semibold text-rose-600">{fieldErrors.studentId}</p>}
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Mobile Number</label>
              <input
                type="tel"
                value={formData.mobile}
                onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                placeholder="9876543210"
                className={`w-full px-3 py-2 rounded-xl border ${fieldErrors.mobile ? 'border-rose-300 bg-rose-50/40' : 'border-slate-200'}`}
              />
              {fieldErrors.mobile && <p className="mt-1 text-[11px] font-semibold text-rose-600">{fieldErrors.mobile}</p>}
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Date of Birth</label>
              <input
                type="date"
                value={formData.dob}
                onChange={(e) => setFormData({ ...formData, dob: e.target.value })}
                className={`w-full px-3 py-2 rounded-xl border ${fieldErrors.dob ? 'border-rose-300 bg-rose-50/40' : 'border-slate-200'}`}
              />
              {fieldErrors.dob && <p className="mt-1 text-[11px] font-semibold text-rose-600">{fieldErrors.dob}</p>}
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Branch / Course</label>
              <select
                value={formData.course}
                onChange={(e) => setFormData({ ...formData, course: e.target.value })}
                className={`w-full px-3 py-2 rounded-xl border bg-white ${fieldErrors.course ? 'border-rose-300' : 'border-slate-200'}`}
              >
                <option value="CSE">CSE</option>
                <option value="IT">IT</option>
                <option value="AIML">CSE (AI & ML)</option>
                <option value="ECE">ECE</option>
                <option value="EE">EE</option>
                <option value="ME">ME</option>
                <option value="CE">Civil</option>
              </select>
              {fieldErrors.course && <p className="mt-1 text-[11px] font-semibold text-rose-600">{fieldErrors.course}</p>}
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Academic Year</label>
              <select
                value={formData.academicYear}
                onChange={(e) => setFormData({ ...formData, academicYear: e.target.value })}
                className={`w-full px-3 py-2 rounded-xl border bg-white ${fieldErrors.academicYear ? 'border-rose-300' : 'border-slate-200'}`}
              >
                <option value="First Year">First Year</option>
                <option value="Second Year">Second Year</option>
                <option value="Third Year">Third Year</option>
                <option value="Fourth Year">Fourth Year</option>
              </select>
              {fieldErrors.academicYear && (
                <p className="mt-1 text-[11px] font-semibold text-rose-600">{fieldErrors.academicYear}</p>
              )}
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Semester</label>
              <select
                value={formData.semester}
                onChange={(e) => setFormData({ ...formData, semester: parseInt(e.target.value, 10) })}
                className={`w-full px-3 py-2 rounded-xl border bg-white ${fieldErrors.semester ? 'border-rose-300' : 'border-slate-200'}`}
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                  <option key={s} value={s}>
                    Semester {s}
                  </option>
                ))}
              </select>
              {fieldErrors.semester && <p className="mt-1 text-[11px] font-semibold text-rose-600">{fieldErrors.semester}</p>}
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Group</label>
              <select
                value={formData.studentGroup}
                onChange={(e) => setFormData({ ...formData, studentGroup: e.target.value })}
                className={`w-full px-3 py-2 rounded-xl border bg-white ${fieldErrors.group ? 'border-rose-300' : 'border-slate-200'}`}
              >
                <option value="A">Group A</option>
                <option value="B">Group B</option>
              </select>
              {fieldErrors.group && <p className="mt-1 text-[11px] font-semibold text-rose-600">{fieldErrors.group}</p>}
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">New Password (optional)</label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="Leave blank to keep unchanged"
                className={`w-full px-3 py-2 rounded-xl border ${fieldErrors.password ? 'border-rose-300 bg-rose-50/40' : 'border-slate-200'}`}
              />
              {fieldErrors.password ? (
                <p className="mt-1 text-[11px] font-semibold text-rose-600">{fieldErrors.password}</p>
              ) : (
                <p className="mt-1 text-[11px] text-slate-400">Min 8 chars with uppercase, lowercase &amp; a number.</p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setEditModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 border border-slate-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={formSubmitting}
              className="px-5 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 disabled:opacity-50"
            >
              {formSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ====================================================================== */}
      {/* DELETE STUDENT CONFIRMATION                                            */}
      {/* ====================================================================== */}
      <Modal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete Student Account"
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="text-sm text-rose-800">
              <p className="font-bold">This permanently deletes the student account.</p>
              <p className="mt-1 text-xs leading-5">
                Their profile, attendance records, complaints and notifications will be removed. This cannot be undone.
              </p>
            </div>
          </div>

          {deleteTarget && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs">
              <p className="font-bold text-slate-900">{deleteTarget.fullName}</p>
              <p className="text-slate-500 mt-0.5">{deleteTarget.email}</p>
              <p className="text-slate-500 mt-0.5 font-mono">
                {deleteTarget.enrollmentNumber} · {deleteTarget.studentId}
              </p>
            </div>
          )}

          {deleteError && (
            <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
              {deleteError}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <button
              onClick={() => setDeleteTarget(null)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 border border-slate-200 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-5 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 disabled:opacity-50"
            >
              {deleting ? 'Deleting...' : 'Delete Permanently'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ====================================================================== */}
      {/* STUDENT PROFILE & ATTENDANCE DETAILS MODAL                             */}
      {/* ====================================================================== */}
      <Modal
        isOpen={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        title={selectedStudent ? `${selectedStudent.fullName} · Details` : 'Student Details'}
        maxWidth="max-w-3xl"
      >
        {detailLoading ? (
          <div className="py-12 text-center text-slate-400 text-xs">
            <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
            Loading full student records...
          </div>
        ) : studentDetails ? (
          <div className="space-y-4">
            {/* Student Header */}
            <div className="flex items-center gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-200">
              {studentDetails.student.photoUrl ? (
                <img
                  src={studentDetails.student.photoUrl}
                  alt={`Profile photo of ${studentDetails.student.fullName}`}
                  className="w-14 h-14 rounded-2xl object-cover shadow-md ring-2 ring-white"
                />
              ) : (
                <div className="w-14 h-14 rounded-2xl bg-blue-600 text-white text-xl font-bold flex items-center justify-center shadow-md">
                  {studentDetails.student.fullName?.charAt(0)}
                </div>
              )}
              <div className="flex-1">
                <h4 className="text-base font-extrabold text-slate-900">{studentDetails.student.fullName}</h4>
                <div className="text-xs text-slate-500 font-medium">
                  {studentDetails.student.email} · Mobile: {studentDetails.student.mobile || 'Not provided'}
                </div>
                <div className="text-xs text-blue-600 font-semibold mt-1">
                  Enrollment: {studentDetails.student.enrollmentNumber} · ID: {studentDetails.student.studentId}
                </div>
              </div>
            </div>

            {/* Sub-tabs: Profile, Attendance Complaint, Complaints */}
            <div className="flex border-b border-slate-200 gap-4 text-xs font-bold">
              <button
                onClick={() => setDetailTab('profile')}
                className={`pb-2.5 transition-colors cursor-pointer ${
                  detailTab === 'profile' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Academic Profile
              </button>
              <button
                onClick={() => setDetailTab('attendance')}
                className={`pb-2.5 transition-colors cursor-pointer ${
                  detailTab === 'attendance' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Attendance Complaint
              </button>
              <button
                onClick={() => setDetailTab('complaints')}
                className={`pb-2.5 transition-colors cursor-pointer ${
                  detailTab === 'complaints' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Submitted Complaints ({studentDetails.complaints?.length || 0})
              </button>
            </div>

            {/* TAB: PROFILE */}
            {detailTab === 'profile' && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs pt-2">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 sm:col-span-1">
                  <span className="text-slate-400 block mb-0.5">Full Name</span>
                  <span className="font-bold text-slate-800">{studentDetails.student.fullName}</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 sm:col-span-2">
                  <span className="text-slate-400 block mb-0.5">Email Address</span>
                  <span className="font-bold text-slate-800 break-all">{studentDetails.student.email}</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-slate-400 block mb-0.5">Enrollment Number</span>
                  <span className="font-bold text-slate-800 font-mono">{studentDetails.student.enrollmentNumber}</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-slate-400 block mb-0.5">Student ID</span>
                  <span className="font-bold text-slate-800 font-mono">{studentDetails.student.studentId}</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-slate-400 block mb-0.5">Course / Branch</span>
                  <span className="font-bold text-slate-800">{studentDetails.student.course}</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-slate-400 block mb-0.5">Academic Year</span>
                  <span className="font-bold text-slate-800">{studentDetails.student.academicYear}</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-slate-400 block mb-0.5">Semester</span>
                  <span className="font-bold text-slate-800">Semester {studentDetails.student.semester}</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-slate-400 block mb-0.5">Group</span>
                  <span className="font-bold text-slate-800">Group {studentDetails.student.group}</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-slate-400 block mb-0.5">Mobile Number</span>
                  <span className="font-bold text-slate-800">{studentDetails.student.mobile || 'Not provided'}</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-slate-400 block mb-0.5">Date of Birth</span>
                  <span className="font-bold text-slate-800">
                    {studentDetails.student.dob
                      ? new Date(`${String(studentDetails.student.dob).slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        })
                      : 'Not provided'}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-slate-400 block mb-0.5">Profile Photo</span>
                  <span className="font-bold text-slate-800">
                    {studentDetails.student.hasPhoto ? 'Uploaded' : 'No photo uploaded'}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-slate-400 block mb-0.5">Registered On</span>
                  <span className="font-medium text-slate-800">
                    {new Date(studentDetails.student.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            )}

            {/* TAB: ATTENDANCE COMPLAINTS — all complaints this student submitted
                (attendance_complaints, kept in sync with the Attendance Complaint system) */}
            {detailTab === 'attendance' && (
              <div className="space-y-2 pt-2 max-h-72 overflow-y-auto">
                {studentDetails.attendanceComplaints?.length > 0 ? (
                  studentDetails.attendanceComplaints.map((c) => (
                    <div key={c.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-bold text-slate-900">
                          Lecture {c.lectureNumber} · {c.lectureTime}
                        </span>
                        <ComplaintStatusBadge status={c.status} />
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1">
                        Complaint Date: {formatDateOnly(c.incidentDate)} · Submitted{' '}
                        {new Date(c.submittedAt).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </div>
                      {c.description && (
                        <p className="mt-1.5 text-slate-700 leading-5 whitespace-pre-line">{c.description}</p>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="p-6 text-center text-slate-400 text-xs">
                    No attendance complaints submitted.
                  </div>
                )}
              </div>
            )}

            {/* TAB: COMPLAINTS */}
            {detailTab === 'complaints' && (
              <div className="space-y-2 pt-2 max-h-60 overflow-y-auto">
                {studentDetails.complaints?.length > 0 ? (
                  studentDetails.complaints.map((c) => (
                    <div key={c.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-bold text-slate-900">{c.complaint_number || `CMP-${c.id}`} · {c.title}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Category: {c.category.replace(/_/g, ' ')} · Filed {new Date(c.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      <StatusBadge status={c.status} />
                    </div>
                  ))
                ) : (
                  <div className="p-6 text-center text-slate-400 text-xs">
                    No complaints registered for this student.
                  </div>
                )}
              </div>
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

export default Students;
