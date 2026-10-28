import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api_client.dart';
import '../../../core/format.dart';
import '../../../core/models.dart';
import '../../../core/services.dart';
import '../../../core/theme.dart';
import '../../widgets/common.dart';
import 'auth_layout.dart';

// Same rules as server/src/utils/validation.js, so most mistakes are caught before submitting.
final _nameRe = RegExp(r"^[A-Za-z][A-Za-z .'-]{1,99}$");
final _enrollmentRe = RegExp(r'^[0-9]{4}[A-Z]{2,4}[0-9]{5,7}$');
final _studentIdRe = RegExp(r'^[0-9]{2}-[0-9]{2}STU[0-9]{4,6}$');
final _mobileRe = RegExp(r'^[6-9][0-9]{9}$');
final _emailRe = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]{2,}$');

String? checkPassword(String? p) {
  if (p == null || p.length < 8) {
    return 'Password must be at least 8 characters';
  }
  if (!RegExp('[a-z]').hasMatch(p) ||
      !RegExp('[A-Z]').hasMatch(p) ||
      !RegExp('[0-9]').hasMatch(p)) {
    return 'Use uppercase, lowercase letters and a number';
  }
  return null;
}

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _form = GlobalKey<FormState>();
  final _c = {
    for (final k in [
      'fullName',
      'enrollmentNumber',
      'studentId',
      'mobile',
      'email',
      'password',
      'confirmPassword',
    ])
      k: TextEditingController(),
  };
  DateTime? _dob;
  String? _course;
  String? _year;
  int? _semester;
  String? _group;
  bool _terms = false;
  bool _obscure = true;
  bool _busy = false;
  String? _error;
  Map<String, String> _serverErrors = {};

  @override
  void dispose() {
    for (final c in _c.values) {
      c.dispose();
    }
    super.dispose();
  }

  List<int> get _semesterOptions {
    final idx = _year == null ? -1 : Courses.years.indexOf(_year!);
    return idx == -1
        ? List.generate(8, (i) => i + 1)
        : [idx * 2 + 1, idx * 2 + 2];
  }

  Future<void> _pickDob() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _dob ?? DateTime(now.year - 19),
      firstDate: DateTime(now.year - 70),
      lastDate: DateTime(now.year - 15, now.month, now.day),
      helpText: 'Date of birth',
    );
    if (picked != null) setState(() => _dob = picked);
  }

  Future<void> _submit() async {
    setState(() => _serverErrors = {});
    final valid = _form.currentState!.validate();
    if (!valid || _dob == null || !_terms) {
      setState(
        () => _error = !_terms && valid && _dob != null
            ? 'You must accept the Terms and Privacy Policy'
            : 'Please correct the highlighted fields',
      );
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await session.register({
        'fullName': _c['fullName']!.text.trim(),
        'enrollmentNumber': _c['enrollmentNumber']!.text.trim().toUpperCase(),
        'studentId': _c['studentId']!.text.trim().toUpperCase(),
        'mobile': _c['mobile']!.text.trim(),
        'email': _c['email']!.text.trim().toLowerCase(),
        'dob': ymd(_dob!),
        'course': _course,
        'academicYear': _year,
        'semester': _semester,
        'group': _group,
        'password': _c['password']!.text,
        'confirmPassword': _c['confirmPassword']!.text,
        'acceptTerms': true,
      });
      if (!mounted) return;
      // The account is active immediately; the router moves to the student home.
      showMessage(context, 'Account created. Welcome to SmartAttend!');
      context.go('/profile');
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _serverErrors = e.fieldErrors;
      });
      _form.currentState!.validate();
    } catch (e) {
      if (!mounted) return;
      setState(
        () => _error = 'Unable to connect to server. Please check your network or server URL.',
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Client-side rule, falling back to the server's message for that field.
  FormFieldValidator<String> _v(
    String field,
    String? Function(String v) rule,
  ) =>
      (v) => rule(v?.trim() ?? '') ?? _serverErrors[field];

  Widget _field(
    String key,
    String label,
    IconData icon,
    String? Function(String) rule, {
    TextInputType? keyboard,
    String? hint,
    bool caps = false,
    bool secret = false,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: TextFormField(
        controller: _c[key],
        keyboardType: keyboard,
        obscureText: secret && _obscure,
        autocorrect: false,
        textCapitalization: caps
            ? TextCapitalization.characters
            : TextCapitalization.none,
        textInputAction: TextInputAction.next,
        decoration: InputDecoration(
          labelText: label,
          hintText: hint,
          prefixIcon: Icon(icon),
        ),
        validator: _v(key, rule),
      ),
    );
  }

  Widget _dropdown<T>(
    String field,
    String label,
    T? value,
    Map<T, String> items,
    ValueChanged<T?> onChanged,
  ) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: DropdownButtonFormField<T>(
        initialValue: value,
        isExpanded: true,
        decoration: InputDecoration(labelText: label),
        items: [
          for (final e in items.entries)
            DropdownMenuItem(
              value: e.key,
              child: Text(e.value, overflow: TextOverflow.ellipsis),
            ),
        ],
        onChanged: onChanged,
        validator: (v) =>
            v == null ? 'Select ${label.toLowerCase()}' : _serverErrors[field],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AuthLayout(
      title: 'Create account',
      subtitle: 'Register as a student with your college details',
      showBack: true,
      child: Form(
        key: _form,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (_error != null) ...[
              NoticeBox(message: _error!),
              const SizedBox(height: 16),
            ],
            const _Heading('Personal details'),
            _field(
              'fullName',
              'Full name',
              Icons.person_outline,
              (v) => _nameRe.hasMatch(v.replaceAll(RegExp(r'\s+'), ' '))
                  ? null
                  : 'Enter your full name (letters only)',
            ),
            _field(
              'email',
              'Email address',
              Icons.mail_outline,
              (v) =>
                  _emailRe.hasMatch(v) ? null : 'Enter a valid email address',
              keyboard: TextInputType.emailAddress,
            ),
            _field('mobile', 'Mobile number', Icons.phone_outlined, (v) {
              var m = v.replaceAll(RegExp(r'[\s-]'), '');
              if (m.startsWith('+91')) m = m.substring(3);
              return _mobileRe.hasMatch(m)
                  ? null
                  : 'Enter a valid 10-digit mobile number';
            }, keyboard: TextInputType.phone),
            Padding(
              padding: const EdgeInsets.only(bottom: 14),
              child: FormField<DateTime>(
                validator: (_) => _dob == null
                    ? 'Select your date of birth'
                    : _serverErrors['dob'],
                builder: (state) => InkWell(
                  onTap: () async {
                    await _pickDob();
                    state.didChange(_dob);
                  },
                  borderRadius: BorderRadius.circular(12),
                  child: InputDecorator(
                    decoration: InputDecoration(
                      labelText: 'Date of birth',
                      prefixIcon: const Icon(Icons.cake_outlined),
                      errorText: state.errorText,
                    ),
                    child: Text(
                      _dob == null ? 'Select date' : formatDate(_dob),
                    ),
                  ),
                ),
              ),
            ),
            const _Heading('College details'),
            _field(
              'enrollmentNumber',
              'Enrollment number',
              Icons.badge_outlined,
              (v) => _enrollmentRe.hasMatch(v.toUpperCase())
                  ? null
                  : 'Invalid enrollment number (e.g. 0111CS251275)',
              hint: '0111CS251275',
              caps: true,
            ),
            _field(
              'studentId',
              'Student ID',
              Icons.credit_card_outlined,
              (v) => _studentIdRe.hasMatch(v.toUpperCase())
                  ? null
                  : 'Invalid student ID (e.g. 25-26STU11806)',
              hint: '25-26STU11806',
              caps: true,
            ),
            _dropdown<String>(
              'course',
              'Course / branch',
              _course,
              Courses.all,
              (v) => setState(() => _course = v),
            ),
            _dropdown<String>(
              'academicYear',
              'Academic year',
              _year,
              {for (final y in Courses.years) y: y},
              (v) {
                setState(() {
                  _year = v;
                  if (_semester != null &&
                      !_semesterOptions.contains(_semester)) {
                    _semester = null;
                  }
                });
              },
            ),
            Row(
              children: [
                Expanded(
                  child: _dropdown<int>('semester', 'Semester', _semester, {
                    for (final s in _semesterOptions) s: 'Semester $s',
                  }, (v) => setState(() => _semester = v)),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _dropdown<String>('group', 'Group', _group, const {
                    'A': 'Group A',
                    'B': 'Group B',
                  }, (v) => setState(() => _group = v)),
                ),
              ],
            ),
            const _Heading('Password'),
            _field(
              'password',
              'Password',
              Icons.lock_outline,
              checkPassword,
              secret: true,
            ),
            _field(
              'confirmPassword',
              'Confirm password',
              Icons.lock_outline,
              (v) =>
                  v == _c['password']!.text ? null : 'Passwords do not match',
              secret: true,
            ),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                onPressed: () => setState(() => _obscure = !_obscure),
                icon: Icon(
                  _obscure
                      ? Icons.visibility_outlined
                      : Icons.visibility_off_outlined,
                  size: 18,
                ),
                label: Text(_obscure ? 'Show passwords' : 'Hide passwords'),
              ),
            ),
            CheckboxListTile(
              value: _terms,
              onChanged: (v) => setState(() => _terms = v ?? false),
              contentPadding: EdgeInsets.zero,
              controlAffinity: ListTileControlAffinity.leading,
              title: const Text(
                'I accept the SmartAttend Terms of Use and Privacy Policy',
                style: TextStyle(fontSize: 14),
              ),
            ),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: _busy ? null : _submit,
              child: _busy
                  ? const SizedBox.square(
                      dimension: 22,
                      child: CircularProgressIndicator(
                        strokeWidth: 2.5,
                        color: Colors.white,
                      ),
                    )
                  : const Text('Create account'),
            ),
            const SizedBox(height: 8),
            const Text(
              'Your account is ready as soon as you sign up.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 12, color: AppColors.muted),
            ),
          ],
        ),
      ),
    );
  }
}

class _Heading extends StatelessWidget {
  const _Heading(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 4, bottom: 12),
    child: Text(
      text,
      style: const TextStyle(
        fontWeight: FontWeight.w700,
        color: AppColors.navy,
        fontSize: 15,
      ),
    ),
  );
}
