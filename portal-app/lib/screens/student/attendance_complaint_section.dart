import 'package:flutter/material.dart';

import '../../../core/api_client.dart';
import '../../../core/format.dart';
import '../../../core/models.dart';
import '../../../core/services.dart';
import '../../../core/theme.dart';
import '../../../widgets/common.dart';

/// Attendance complaint form + the student's submitted complaints.
///
/// Mirrors the web portal page `src/student/pages/AttendanceComplaint.jsx`:
///  * dropdown options come from `GET /student/complaint-options`, which the
///    admin panel manages in the database (nothing is hardcoded here, so the
///    app always matches the web portal),
///  * submissions go to `POST /student/attendance-complaints` (the server
///    attaches the signed-in student and starts the row as `pending`),
///  * the history and its status badges come from
///    `GET /student/attendance-complaints`.
class AttendanceComplaintSection extends StatefulWidget {
  const AttendanceComplaintSection({super.key});

  @override
  State<AttendanceComplaintSection> createState() =>
      _AttendanceComplaintSectionState();
}

class _AttendanceComplaintSectionState
    extends State<AttendanceComplaintSection> {
  static const int _maxDescriptionLength = 5000;

  final _dateController = TextEditingController();
  final _descriptionController = TextEditingController();

  List<String> _lectureTimes = const [];
  List<String> _lectureNumbers = const [];
  String? _lectureTime;
  String? _lectureNumber;
  DateTime _incidentDate = _today();
  int _descriptionLength = 0;

  bool _loadingOptions = true;
  String? _optionsError;
  bool _submitting = false;
  bool _submitted = false;
  String? _serverError;
  Map<String, String> _fieldErrors = const {};

  bool _loadingComplaints = true;
  String? _complaintsError;
  List<Map<String, dynamic>> _complaints = const [];

  static DateTime _today() {
    final now = DateTime.now();
    return DateTime(now.year, now.month, now.day);
  }

  @override
  void initState() {
    super.initState();
    _dateController.text = formatDate(_incidentDate);
    _descriptionController.addListener(_updateDescriptionLength);
    _loadOptions();
    _loadComplaints();
  }

  @override
  void dispose() {
    _descriptionController.removeListener(_updateDescriptionLength);
    _dateController.dispose();
    _descriptionController.dispose();
    super.dispose();
  }

  void _updateDescriptionLength() {
    setState(() => _descriptionLength = _descriptionController.text.length);
  }

  // ------------------------------------------------------------------ loading

  Future<void> _loadOptions() async {
    setState(() {
      _loadingOptions = true;
      _optionsError = null;
    });
    try {
      final res = await api.get('/student/complaint-options');
      if (!mounted) return;
      final times = _labels(res['lectureTimes']);
      final numbers = _labels(res['lectureNumbers']);
      setState(() {
        _lectureTimes = times;
        _lectureNumbers = numbers;
        // Drop a stale selection if an admin renamed or deleted the option.
        if (!times.contains(_lectureTime)) _lectureTime = null;
        if (!numbers.contains(_lectureNumber)) _lectureNumber = null;
        _loadingOptions = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _optionsError = e is ApiException ? e.message : '$e';
        _loadingOptions = false;
      });
    }
  }

  Future<void> _loadComplaints({bool silent = false}) async {
    if (!silent) {
      setState(() {
        _loadingComplaints = true;
        _complaintsError = null;
      });
    }
    try {
      final res = await api.get('/student/attendance-complaints');
      if (!mounted) return;
      setState(() {
        _complaints = (res['complaints'] as List<dynamic>? ?? const [])
            .cast<Map<String, dynamic>>();
        _complaintsError = null;
        _loadingComplaints = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _complaintsError = e is ApiException ? e.message : '$e';
        _loadingComplaints = false;
      });
    }
  }

  static List<String> _labels(Object? raw) =>
      (raw as List<dynamic>?)
          ?.map((value) => '$value'.trim())
          .where((value) => value.isNotEmpty)
          .toList(growable: false) ??
      const [];

  // ------------------------------------------------------------------ actions

  Future<void> _pickDate() async {
    final today = _today();
    final picked = await showDatePicker(
      context: context,
      initialDate: _incidentDate.isAfter(today) ? today : _incidentDate,
      firstDate: DateTime(today.year - 1, today.month, today.day),
      lastDate: today,
      helpText: 'Select lecture date',
    );
    if (picked == null || !mounted) return;
    setState(() {
      _incidentDate = picked;
      _dateController.text = formatDate(picked);
      _fieldErrors = {..._fieldErrors}..remove('incidentDate');
    });
  }

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();

    // Same validation rules and messages as the web form.
    final errors = <String, String>{};
    if (_lectureTime == null || _lectureTime!.isEmpty) {
      errors['lectureTime'] = 'Select a lecture time.';
    }
    if (_lectureNumber == null || _lectureNumber!.isEmpty) {
      errors['lectureNumber'] = 'Select a lecture number.';
    }
    if (_dateController.text.isEmpty) {
      errors['incidentDate'] = 'Select a lecture date.';
    } else if (_incidentDate.isAfter(_today())) {
      errors['incidentDate'] = 'Lecture date cannot be in the future.';
    }
    if (_descriptionLength > _maxDescriptionLength) {
      errors['description'] = 'Description must be 5000 characters or fewer.';
    }

    setState(() {
      _fieldErrors = errors;
      _serverError = null;
      _submitted = false;
    });
    if (errors.isNotEmpty) return;

    setState(() => _submitting = true);
    try {
      await api.post('/student/attendance-complaints', {
        'lectureTime': _lectureTime,
        'lectureNumber': _lectureNumber,
        'incidentDate': ymd(_incidentDate),
        'description': _descriptionController.text.trim(),
      });
      if (!mounted) return;

      setState(() {
        _submitted = true;
        _lectureTime = null;
        _lectureNumber = null;
        _incidentDate = _today();
        _dateController.text = formatDate(_incidentDate);
        _fieldErrors = const {};
      });
      _descriptionController.clear();

      await _loadComplaints(silent: true);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _serverError = e is ApiException ? e.message : '$e';
        _fieldErrors = e is ApiException ? e.fieldErrors : const {};
      });
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  // ------------------------------------------------------------------- build

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Text(
          'Attendance Complaint',
          style: TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.w700,
            color: AppColors.navy,
          ),
        ),
        const SizedBox(height: 4),
        const Text(
          'Submit an issue about your lecture attendance and track resolution in real time.',
          style: TextStyle(fontSize: 13, color: AppColors.muted, height: 1.4),
        ),
        const SizedBox(height: 16),
        _buildFormCard(),
        const SizedBox(height: 16),
        _buildComplaintsCard(),
      ],
    );
  }

  Widget _buildFormCard() {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: AppColors.tealLight,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(
                    Icons.calendar_month_outlined,
                    color: AppColors.teal,
                    size: 20,
                  ),
                ),
                const SizedBox(width: 10),
                const Text(
                  'Submit New Complaint',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: AppColors.navy,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 18),

            if (_submitted) ...[
              const NoticeBox(
                message: 'Attendance complaint submitted successfully! Your submission has been recorded in the database.',
                color: AppColors.present,
                icon: Icons.check_circle_outline,
              ),
              const SizedBox(height: 14),
            ],
            if (_serverError != null) ...[
              NoticeBox(message: _serverError!),
              const SizedBox(height: 14),
            ],
            if (_optionsError != null) ...[
              _buildOptionsError(),
              const SizedBox(height: 14),
            ],

            LayoutBuilder(
              builder: (context, constraints) {
                final lectureTime = _buildLectureTimeField();
                final lectureNumber = _buildLectureNumberField();
                final lectureDate = _buildLectureDateField();

                // Phone: one field per row. Wider screens: two per row, like the
                // web form's `sm:grid-cols-2 lg:grid-cols-3` grid.
                if (constraints.maxWidth < 520) {
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      lectureTime,
                      const SizedBox(height: 16),
                      lectureNumber,
                      const SizedBox(height: 16),
                      lectureDate,
                    ],
                  );
                }

                final half = (constraints.maxWidth - 16) / 2;
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        SizedBox(width: half, child: lectureTime),
                        const SizedBox(width: 16),
                        SizedBox(width: half, child: lectureNumber),
                      ],
                    ),
                    const SizedBox(height: 16),
                    SizedBox(width: half, child: lectureDate),
                  ],
                );
              },
            ),
            const SizedBox(height: 16),
            _buildDescriptionField(),
            const Divider(height: 28),
            Align(
              alignment: Alignment.centerRight,
              child: FilledButton.icon(
                onPressed: _submitting ? null : _submit,
                style: FilledButton.styleFrom(
                  minimumSize: const Size(0, 48),
                  padding: const EdgeInsets.symmetric(horizontal: 22),
                ),
                icon: _submitting
                    ? const SizedBox.square(
                        dimension: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Icon(Icons.send_rounded, size: 18),
                label: Text(
                  _submitting ? 'Submitting Complaint…' : 'Submit Complaint',
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildLectureTimeField() {
    return DropdownButtonFormField<String>(
      isExpanded: true,
      initialValue: _lectureTime,
      hint: Text(
        _loadingOptions ? 'Loading options…' : 'Select lecture time',
        overflow: TextOverflow.ellipsis,
      ),
      decoration: InputDecoration(
        labelText: 'Lecture Time *',
        prefixIcon: const Icon(Icons.access_time, size: 20),
        errorText: _fieldErrors['lectureTime'],
      ),
      items: [
        for (final time in _lectureTimes)
          DropdownMenuItem<String>(
            value: time,
            child: Text(time, overflow: TextOverflow.ellipsis),
          ),
      ],
      onChanged: _submitting
          ? null
          : (value) => setState(() {
              _lectureTime = value;
              _fieldErrors = {..._fieldErrors}..remove('lectureTime');
            }),
    );
  }

  Widget _buildLectureNumberField() {
    return DropdownButtonFormField<String>(
      isExpanded: true,
      initialValue: _lectureNumber,
      hint: Text(
        _loadingOptions ? 'Loading options…' : 'Select lecture number',
        overflow: TextOverflow.ellipsis,
      ),
      decoration: InputDecoration(
        labelText: 'Lecture Number *',
        prefixIcon: const Icon(Icons.format_list_numbered, size: 20),
        errorText: _fieldErrors['lectureNumber'],
      ),
      items: [
        for (final number in _lectureNumbers)
          DropdownMenuItem<String>(
            value: number,
            child: Text('Lecture $number', overflow: TextOverflow.ellipsis),
          ),
      ],
      onChanged: _submitting
          ? null
          : (value) => setState(() {
              _lectureNumber = value;
              _fieldErrors = {..._fieldErrors}..remove('lectureNumber');
            }),
    );
  }

  Widget _buildLectureDateField() {
    return TextField(
      controller: _dateController,
      readOnly: true,
      onTap: _submitting ? null : _pickDate,
      decoration: InputDecoration(
        labelText: 'Lecture Date *',
        prefixIcon: const Icon(Icons.calendar_today_outlined, size: 20),
        suffixIcon: const Icon(Icons.arrow_drop_down),
        errorText: _fieldErrors['incidentDate'],
      ),
    );
  }

  Widget _buildDescriptionField() {
    return TextField(
      controller: _descriptionController,
      enabled: !_submitting,
      minLines: 4,
      maxLines: 8,
      maxLength: _maxDescriptionLength,
      style: const TextStyle(fontSize: 14, color: AppColors.navy),
      decoration: InputDecoration(
        labelText: 'Description (optional)',
        alignLabelWithHint: true,
        hintText: 'Explain the attendance issue you are experiencing (e.g. scanner did not register, technical glitch, present in class).',
        hintMaxLines: 3,
        errorText: _fieldErrors['description'],
      ),
    );
  }

  Widget _buildOptionsError() {
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 8, 8, 8),
      decoration: BoxDecoration(
        color: AppColors.absent.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.absent.withValues(alpha: 0.25)),
      ),
      child: Row(
        children: [
          const Icon(
            Icons.cloud_off_rounded,
            color: AppColors.absent,
            size: 20,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              'Could not load the lecture options. ${_optionsError!}',
              style: const TextStyle(fontSize: 12, color: AppColors.absent),
            ),
          ),
          TextButton(
            onPressed: _loadingOptions ? null : _loadOptions,
            child: const Text('Retry'),
          ),
        ],
      ),
    );
  }

  Widget _buildComplaintsCard() {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: AppColors.tealLight,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(
                    Icons.assignment_outlined,
                    color: AppColors.teal,
                    size: 20,
                  ),
                ),
                const SizedBox(width: 10),
                const Expanded(
                  child: Text(
                    'My Submitted Complaints',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: AppColors.navy,
                    ),
                  ),
                ),
                IconButton(
                  onPressed: _loadingComplaints
                      ? null
                      : () => _loadComplaints(),
                  tooltip: 'Refresh',
                  icon: _loadingComplaints
                      ? const SizedBox.square(
                          dimension: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.refresh, size: 20),
                ),
              ],
            ),
            const SizedBox(height: 8),

            if (_complaintsError != null) ...[
              NoticeBox(message: _complaintsError!),
              const SizedBox(height: 12),
            ],

            if (_loadingComplaints && _complaints.isEmpty)
              ..._skeletonRows()
            else if (_complaints.isEmpty)
              _buildEmptyComplaints()
            else ...[
              Row(
                children: [
                  Expanded(
                    child: Text(
                      'TOTAL COMPLAINTS (${_complaints.length})',
                      style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 0.6,
                        color: AppColors.muted,
                      ),
                    ),
                  ),
                  const Text(
                    'Synced with portal database',
                    style: TextStyle(fontSize: 11, color: AppColors.muted),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              for (final complaint in _complaints) ...[
                _buildComplaintTile(complaint),
                const SizedBox(height: 12),
              ],
            ],
          ],
        ),
      ),
    );
  }

  List<Widget> _skeletonRows() => [
    for (var i = 0; i < 2; i++) ...[
      Container(
        height: 110,
        decoration: BoxDecoration(
          color: AppColors.background,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppColors.border),
        ),
      ),
      if (i == 0) const SizedBox(height: 12),
    ],
  ];

  Widget _buildEmptyComplaints() {
    return const Padding(
      padding: EdgeInsets.symmetric(vertical: 24),
      child: Column(
        children: [
          CircleAvatar(
            radius: 26,
            backgroundColor: AppColors.background,
            child: Icon(
              Icons.calendar_month_outlined,
              color: AppColors.muted,
              size: 26,
            ),
          ),
          SizedBox(height: 12),
          Text(
            'No attendance complaints yet',
            style: TextStyle(
              fontWeight: FontWeight.w700,
              fontSize: 14,
              color: AppColors.navy,
            ),
          ),
          SizedBox(height: 4),
          Text(
            'Any complaint you submit using the form above will be saved in the database and displayed here.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 12, color: AppColors.muted),
          ),
        ],
      ),
    );
  }

  Widget _buildComplaintTile(Map<String, dynamic> complaint) {
    final status = complaint['status'] as String? ?? 'pending';
    final config = _statusConfig(status);
    final lectureTime = (complaint['lectureTime'] as String? ?? '').trim();
    final lectureNumber = (complaint['lectureNumber'] as String? ?? '').trim();
    final incidentDate = parseDate(complaint['incidentDate']);
    final submittedAt = parseDate(complaint['submittedAt']);
    final description = (complaint['description'] as String? ?? '').trim();
    final adminRemarks = (complaint['adminRemarks'] as String? ?? '').trim();

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: 8,
            runSpacing: 6,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              if (lectureTime.isNotEmpty)
                _chip(lectureTime, AppColors.navy, AppColors.lightBlue),
              if (lectureNumber.isNotEmpty)
                _chip(
                  'Lecture $lectureNumber',
                  AppColors.navy,
                  AppColors.background,
                ),
              if (incidentDate != null)
                _chipWithIcon(
                  Icons.calendar_month_outlined,
                  formatDate(incidentDate),
                ),
              _statusBadge(config),
            ],
          ),
          if (submittedAt != null) ...[
            const SizedBox(height: 8),
            Row(
              children: [
                const Icon(Icons.access_time, size: 13, color: AppColors.muted),
                const SizedBox(width: 4),
                Text(
                  formatDateTime(submittedAt),
                  style: const TextStyle(fontSize: 11, color: AppColors.muted),
                ),
              ],
            ),
          ],
          const SizedBox(height: 10),
          const Divider(height: 1),
          const SizedBox(height: 10),
          Text(
            description.isEmpty ? 'No description provided.' : description,
            style: const TextStyle(
              fontSize: 13,
              color: AppColors.navy,
              height: 1.45,
            ),
          ),
          if (adminRemarks.isNotEmpty) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: AppColors.tealLight.withValues(alpha: 0.45),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                  color: AppColors.teal.withValues(alpha: 0.25),
                ),
              ),
              child: Text.rich(
                TextSpan(
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppColors.navy,
                    height: 1.4,
                  ),
                  children: [
                    const TextSpan(
                      text: 'Admin Remarks: ',
                      style: TextStyle(fontWeight: FontWeight.w700),
                    ),
                    TextSpan(text: adminRemarks),
                  ],
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _chip(String label, Color color, Color background) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: color,
        ),
      ),
    );
  }

  Widget _chipWithIcon(IconData icon, String label) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.background,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 13, color: AppColors.muted),
          const SizedBox(width: 4),
          Text(
            label,
            style: const TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: AppColors.navy,
            ),
          ),
        ],
      ),
    );
  }

  /// Same labels/colours as the web page's `STATUS_CONFIG`.
  ({String label, Color color, IconData icon}) _statusConfig(String status) {
    return switch (status) {
      'approved' || 'resolved' => (
        label: 'Approved',
        color: AppColors.present,
        icon: Icons.check_circle_outline,
      ),
      'in_review' => (
        label: 'In Review',
        color: AppColors.info,
        icon: Icons.refresh,
      ),
      'rejected' => (
        label: 'Rejected',
        color: AppColors.absent,
        icon: Icons.error_outline,
      ),
      _ => (label: 'Pending', color: AppColors.late, icon: Icons.schedule),
    };
  }

  Widget _statusBadge(({String label, Color color, IconData icon}) config) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: config.color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(config.icon, size: 12, color: config.color),
          const SizedBox(width: 4),
          Text(
            config.label,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: config.color,
            ),
          ),
        ],
      ),
    );
  }
}
