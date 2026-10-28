import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../core/api_client.dart';
import '../../../core/models.dart';
import '../../../core/services.dart';
import '../../../core/theme.dart';
import '../../../widgets/common.dart';

/// Full Edit Profile — parity with the web portal's Edit Profile form. Every
/// profile field the backend accepts is editable here: full name, email,
/// enrollment number, student ID, mobile, date of birth, course / branch,
/// academic year, semester and group. Client-side validation mirrors
/// server/src/utils/validation.js `validateFullProfileUpdate` exactly, and the
/// server's per-field errors are shown inline after a failed save.
class EditProfileScreen extends StatefulWidget {
  const EditProfileScreen({super.key});

  @override
  State<EditProfileScreen> createState() => _EditProfileScreenState();
}

class _EditProfileScreenState extends State<EditProfileScreen> {
  static const _groups = ['A', 'B'];

  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _emailController = TextEditingController();
  final _enrollmentController = TextEditingController();
  final _studentIdController = TextEditingController();
  final _mobileController = TextEditingController();
  final _dobController = TextEditingController();

  String _course = '';
  String _academicYear = '';
  int _semester = 0; // 0 = not selected
  String _group = '';
  bool _saving = false;
  String? _error;
  Map<String, String> _fieldErrors = {};

  Future<StudentProfile> _loadProfile() async {
    final res = await api.get('/student/profile');
    final profile = StudentProfile(res['profile'] as Map<String, dynamic>);
    _nameController.text = profile.fullName;
    _emailController.text = profile.email;
    _enrollmentController.text = profile.enrollmentNumber;
    _studentIdController.text = profile.studentId;
    _mobileController.text = profile.mobile ?? '';
    if (profile.dob != null && profile.dob!.isNotEmpty) {
      _dobController.text = profile.dob!;
    }
    _course = profile.course;
    _academicYear = profile.academicYear;
    _semester = profile.semester;
    _group = profile.group;
    return profile;
  }

  @override
  void dispose() {
    _nameController.dispose();
    _emailController.dispose();
    _enrollmentController.dispose();
    _studentIdController.dispose();
    _mobileController.dispose();
    _dobController.dispose();
    super.dispose();
  }

  // ------------------------------------------------------------- validation
  // Mirrors the server's validation.js so users see the same rules offline.
  bool _validName(String v) =>
      RegExp(r"^[A-Za-z][A-Za-z .'-]{1,99}$").hasMatch(v);

  bool _validEmail(String v) =>
      v.length <= 191 && RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]{2,}$').hasMatch(v);

  bool _validEnrollment(String v) =>
      RegExp(r'^[0-9]{4}[A-Z]{2,4}[0-9]{5,7}$').hasMatch(v);

  bool _validStudentId(String v) =>
      RegExp(r'^[0-9]{2}-[0-9]{2}STU[0-9]{4,6}$').hasMatch(v);

  /// +91 / 91- / spaces / hyphens are all stripped, like the server does.
  String _normalizeMobile(String v) {
    var m = v.trim().replaceAll(RegExp(r'[\s-]'), '');
    if (m.startsWith('+91')) {
      m = m.substring(3);
    } else if (m.length == 12 && m.startsWith('91')) {
      m = m.substring(2);
    }
    return m;
  }

  bool _validMobile(String v) =>
      RegExp(r'^[6-9][0-9]{9}$').hasMatch(_normalizeMobile(v));

  String? _dobError(String iso) {
    final dob = DateTime.tryParse(iso);
    if (dob == null || dob.toIso8601String().substring(0, 10) != iso) {
      return 'Enter a valid date of birth';
    }
    final now = DateTime.now().toUtc();
    var age = now.year - dob.year;
    if (now.month < dob.month ||
        (now.month == dob.month && now.day < dob.day)) {
      age--;
    }
    if (age < 15 || age > 70) return 'Age must be between 15 and 70 years';
    return null;
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _parseDob() ?? DateTime(now.year - 19, now.month, now.day),
      firstDate: DateTime(1970),
      lastDate: DateTime(now.year - 14, now.month, now.day),
    );
    if (picked != null) {
      setState(() {
        _dobController.text = DateFormat('yyyy-MM-dd').format(picked);
        _fieldErrors.remove('dob');
      });
    }
  }

  DateTime? _parseDob() {
    final iso = _dobController.text.trim();
    if (iso.isEmpty) return null;
    final d = DateTime.tryParse(iso);
    return d != null && d.toIso8601String().substring(0, 10) == iso ? d : null;
  }

  // ------------------------------------------------------------------- save
  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _saving = true;
      _error = null;
      _fieldErrors = {};
    });

    try {
      final res = await api.put('/student/profile', {
        'fullName': _nameController.text.trim(),
        'email': _emailController.text.trim(),
        'enrollmentNumber': _enrollmentController.text.trim().toUpperCase(),
        'studentId': _studentIdController.text.trim().toUpperCase(),
        'mobile': _normalizeMobile(_mobileController.text),
        'dob': _dobController.text.trim(),
        'course': _course,
        'academicYear': _academicYear,
        'semester': _semester,
        'group': _group,
      });
      if (mounted) {
        showMessage(
          context,
          (res['message'] as String?) ?? 'Profile updated successfully',
        );
        Navigator.pop(context, true);
      }
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _error = e.message;
          _fieldErrors = e.fieldErrors;
        });
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  InputDecoration _decoration(
    String label,
    IconData icon, {
    String? errorKey,
    Widget? suffix,
  }) => InputDecoration(
    labelText: label,
    prefixIcon: Icon(icon),
    suffixIcon: suffix,
    errorText: errorKey == null ? null : _fieldErrors[errorKey],
  );

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Edit Profile')),
      body: AsyncView(
        load: _loadProfile,
        builder: (context, profile, reload) {
          return Form(
            key: _formKey,
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                if (_error != null) ...[
                  NoticeBox(message: _error!),
                  const SizedBox(height: 16),
                ],

                // ---- Personal Information
                SectionCard(
                  title: 'Personal Information',
                  icon: Icons.person_pin_outlined,
                  child: Column(
                    children: [
                      TextFormField(
                        controller: _nameController,
                        textCapitalization: TextCapitalization.words,
                        decoration: _decoration(
                          'Full Name *',
                          Icons.person_outline,
                          errorKey: 'fullName',
                        ),
                        validator: (v) {
                          final value = v?.trim() ?? '';
                          if (value.isEmpty) return 'Full name is required';
                          if (!_validName(value)) {
                            return 'Enter your full name (letters only)';
                          }
                          return null;
                        },
                      ),
                      const SizedBox(height: 14),
                      TextFormField(
                        controller: _emailController,
                        keyboardType: TextInputType.emailAddress,
                        autocorrect: false,
                        decoration: _decoration(
                          'Email *',
                          Icons.mail_outline,
                          errorKey: 'email',
                        ),
                        validator: (v) {
                          final value = v?.trim() ?? '';
                          if (value.isEmpty) return 'Email is required';
                          if (!_validEmail(value)) {
                            return 'Enter a valid email address';
                          }
                          return null;
                        },
                      ),
                      const SizedBox(height: 14),
                      TextFormField(
                        controller: _mobileController,
                        keyboardType: TextInputType.phone,
                        decoration: _decoration(
                          'Mobile Number *',
                          Icons.phone_outlined,
                          errorKey: 'mobile',
                        ),
                        validator: (v) {
                          if ((v ?? '').trim().isEmpty) {
                            return 'Mobile number is required';
                          }
                          if (!_validMobile(v ?? '')) {
                            return 'Enter a valid 10-digit mobile number';
                          }
                          return null;
                        },
                      ),
                      const SizedBox(height: 14),
                      TextFormField(
                        controller: _dobController,
                        readOnly: true,
                        onTap: _pickDate,
                        decoration: _decoration(
                          'Date of Birth (YYYY-MM-DD) *',
                          Icons.cake_outlined,
                          errorKey: 'dob',
                          suffix: const Icon(Icons.calendar_month_outlined),
                        ),
                        validator: (v) {
                          final value = (v ?? '').trim();
                          if (value.isEmpty) return 'Date of birth is required';
                          return _dobError(value);
                        },
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),

                // ---- Academic Details
                SectionCard(
                  title: 'Academic Details',
                  icon: Icons.school_outlined,
                  child: Column(
                    children: [
                      TextFormField(
                        controller: _enrollmentController,
                        autocorrect: false,
                        textCapitalization: TextCapitalization.characters,
                        decoration: _decoration(
                          'Enrollment Number *',
                          Icons.numbers_outlined,
                          errorKey: 'enrollmentNumber',
                        ),
                        validator: (v) {
                          final value = (v ?? '').trim();
                          if (value.isEmpty) {
                            return 'Enrollment number is required';
                          }
                          if (!_validEnrollment(value.toUpperCase())) {
                            return 'Invalid enrollment number (e.g. 0111CS251275)';
                          }
                          return null;
                        },
                      ),
                      const SizedBox(height: 14),
                      TextFormField(
                        controller: _studentIdController,
                        autocorrect: false,
                        textCapitalization: TextCapitalization.characters,
                        decoration: _decoration(
                          'Student ID *',
                          Icons.badge_outlined,
                          errorKey: 'studentId',
                        ),
                        validator: (v) {
                          final value = (v ?? '').trim();
                          if (value.isEmpty) return 'Student ID is required';
                          if (!_validStudentId(value.toUpperCase())) {
                            return 'Invalid student ID (e.g. 25-26STU11806)';
                          }
                          return null;
                        },
                      ),
                      const SizedBox(height: 14),
                      DropdownButtonFormField<String>(
                        initialValue: _course.isEmpty ? null : _course,
                        decoration: _decoration(
                          'Course / Branch *',
                          Icons.menu_book_outlined,
                          errorKey: 'course',
                        ),
                        isExpanded: true,
                        items: [
                          for (final entry in Courses.all.entries)
                            DropdownMenuItem(
                              value: entry.key,
                              child: Text(
                                '${entry.key} — ${entry.value}',
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                        ],
                        onChanged: (v) {
                          setState(() {
                            _course = v ?? '';
                            _fieldErrors.remove('course');
                          });
                        },
                        validator: (v) => _validCourse(v)
                            ? null
                            : 'Select your course / branch',
                      ),
                      const SizedBox(height: 14),
                      DropdownButtonFormField<String>(
                        initialValue: _academicYear.isEmpty
                            ? null
                            : _academicYear,
                        decoration: _decoration(
                          'Academic Year *',
                          Icons.calendar_today_outlined,
                          errorKey: 'academicYear',
                        ),
                        items: [
                          for (final year in Courses.years)
                            DropdownMenuItem(value: year, child: Text(year)),
                        ],
                        onChanged: (v) {
                          setState(() {
                            _academicYear = v ?? '';
                            _fieldErrors.remove('academicYear');
                          });
                        },
                        validator: (v) =>
                            _validYear(v) ? null : 'Select your academic year',
                      ),
                      const SizedBox(height: 14),
                      DropdownButtonFormField<int>(
                        initialValue: _semester >= 1 && _semester <= 8
                            ? _semester
                            : null,
                        decoration: _decoration(
                          'Semester *',
                          Icons.layers_outlined,
                          errorKey: 'semester',
                        ),
                        items: [
                          for (final s in List<int>.generate(8, (i) => i + 1))
                            DropdownMenuItem(
                              value: s,
                              child: Text('Semester $s'),
                            ),
                        ],
                        onChanged: (v) {
                          setState(() {
                            _semester = v ?? 0;
                            _fieldErrors.remove('semester');
                          });
                        },
                        validator: (v) => _semesterError(),
                      ),
                      const SizedBox(height: 14),
                      DropdownButtonFormField<String>(
                        initialValue: _group.isEmpty ? null : _group,
                        decoration: _decoration(
                          'Group *',
                          Icons.group_outlined,
                          errorKey: 'group',
                        ),
                        items: [
                          for (final g in _groups)
                            DropdownMenuItem(value: g, child: Text('Group $g')),
                        ],
                        onChanged: (v) {
                          setState(() {
                            _group = v ?? '';
                            _fieldErrors.remove('group');
                          });
                        },
                        validator: (v) => _groups.contains(v)
                            ? null
                            : 'Select Group A or Group B',
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 24),

                // ---- Buttons (Cancel + Save Changes)
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: _saving
                            ? null
                            : () => Navigator.pop(context, false),
                        style: OutlinedButton.styleFrom(
                          minimumSize: const Size(0, 50),
                        ),
                        child: const Text('Cancel'),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: FilledButton(
                        onPressed: _saving ? null : _save,
                        child: _saving
                            ? const SizedBox.square(
                                dimension: 22,
                                child: CircularProgressIndicator(
                                  color: Colors.white,
                                  strokeWidth: 2.5,
                                ),
                              )
                            : const Text('Save Changes'),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                const Text(
                  'Changes sync with the web portal instantly.',
                  style: TextStyle(fontSize: 12, color: AppColors.muted),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 24),
              ],
            ),
          );
        },
      ),
    );
  }

  // Course / year / semester rules shared by validators (semester must belong
  // to the selected year, like the server's cross-check).
  bool _validCourse(String? course) =>
      course != null && Courses.all.containsKey(course);

  bool _validYear(String? year) => year != null && Courses.years.contains(year);

  String? _semesterError() {
    if (_semester < 1 || _semester > 8) return 'Select your semester';
    final yearIdx = Courses.years.indexOf(_academicYear);
    if (yearIdx != -1 && (_semester / 2).ceil() != yearIdx + 1) {
      return 'Semester $_semester does not belong to $_academicYear';
    }
    return null;
  }
}
