import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../../../core/api_client.dart';
import '../../../core/complaint_feed.dart';
import '../../../core/config.dart';
import '../../../core/format.dart';
import '../../../core/models.dart';
import '../../../core/services.dart';
import '../../../core/theme.dart';
import '../../widgets/common.dart';
import 'complaint_attachment.dart';
import 'complaint_review_screen.dart';

/// Details carried over from the attendance history screen ("Report issue").
class ComplaintPrefill {
  const ComplaintPrefill({
    this.sessionId,
    this.date,
    this.subject,
    this.category,
    this.currentStatus,
    this.requestedCorrection,
  });

  final int? sessionId;
  final String? date;
  final String? subject;
  final String? category;
  final String? currentStatus;
  final String? requestedCorrection;
}

/// One complaint type from `GET /complaints/types` (admin-managed).
class _ComplaintType {
  const _ComplaintType({
    required this.id,
    required this.label,
    required this.categoryKey,
    required this.readsSession,
    required this.sessionRequired,
  });

  factory _ComplaintType.fromJson(Map<String, dynamic> json) => _ComplaintType(
    id: asInt(json['id']),
    label: (json['label'] as String?)?.trim() ?? 'Complaint',
    categoryKey: json['categoryKey'] as String?,
    readsSession: json['readsSession'] == true,
    sessionRequired: json['sessionRequired'] == true,
  );

  final int id;
  final String label;
  final String? categoryKey;
  final bool readsSession;
  final bool sessionRequired;
}

/// Mirrors `ComplaintCenter.jsx` on the web portal:
///  * title (5–150 characters, live counter),
///  * complaint type from the database-backed list,
///  * attendance details only for the types that read a class session,
///  * optional description (max 5000),
///  * supporting attachments (JPEG/PNG/WebP/PDF, 10 MB each, max 10),
///  * Cancel / Review & Submit with a review screen before the POST.
class ComplaintFormScreen extends StatefulWidget {
  const ComplaintFormScreen({super.key, this.prefill});

  final ComplaintPrefill? prefill;

  @override
  State<ComplaintFormScreen> createState() => _ComplaintFormScreenState();
}

class _ComplaintFormScreenState extends State<ComplaintFormScreen> {
  static const _maxTitle = 150;
  static const _minTitle = 5;
  static const _maxDescription = 5000;
  static const _corrections = <String>['present', 'late'];

  final _titleController = TextEditingController();
  final _descriptionController = TextEditingController();
  final _dateController = TextEditingController();
  final _imagePicker = ImagePicker();

  // Complaint types (database-backed) ------------------------------------
  List<_ComplaintType> _types = const [];
  _ComplaintType? _selectedType;
  bool _loadingTypes = true;
  String? _typesError;

  // Attendance details (only for types that read a session) --------------
  DateTime? _attendanceDate;
  List<Map<String, dynamic>> _sessions = const [];
  int? _sessionId;
  String? _sessionStatus;
  String? _requestedCorrection;
  bool _loadingSessions = false;
  String? _sessionsError;

  // Attachments -----------------------------------------------------------
  List<ComplaintAttachment> _attachments = const [];
  List<String> _attachmentProblems = const [];

  // Submission ------------------------------------------------------------
  final Map<String, String> _fieldErrors = {};
  String? _serverError;
  ComplaintSubmitResult? _created;
  List<ComplaintAttachment> _failedUploads = const [];
  bool _retryingUploads = false;

  @override
  void initState() {
    super.initState();

    final prefillDate = widget.prefill?.date;
    if (prefillDate != null) {
      final parsed = DateTime.tryParse(prefillDate);
      if (parsed != null) {
        _attendanceDate = DateTime(parsed.year, parsed.month, parsed.day);
        _dateController.text = formatDate(_attendanceDate);
      }
    }
    _requestedCorrection = widget.prefill?.requestedCorrection;
    _loadTypes();
  }

  @override
  void dispose() {
    _titleController.dispose();
    _descriptionController.dispose();
    _dateController.dispose();
    super.dispose();
  }

  // ---------------------------------------------------------------- loading

  Future<void> _loadTypes() async {
    setState(() {
      _loadingTypes = true;
      _typesError = null;
    });
    try {
      final res = await api.get('/complaints/types');
      final types = (res['types'] as List<dynamic>? ?? const [])
          .cast<Map<String, dynamic>>()
          .map(_ComplaintType.fromJson)
          .toList(growable: false);
      if (!mounted) return;
      setState(() {
        _types = types;
        _loadingTypes = false;
      });
      _applyPrefill(types);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _loadingTypes = false;
        _typesError = e.message;
      });
    }
  }

  /// Deep links from the attendance history screen carry a category key; the
  /// matching database type is selected once the list arrives.
  void _applyPrefill(List<_ComplaintType> types) {
    final category = widget.prefill?.category;
    if (category == null || _selectedType != null) return;

    _ComplaintType? match;
    for (final type in types) {
      if (type.categoryKey == category) {
        match = type;
        break;
      }
    }
    if (match == null) return;

    final selected = match;
    setState(() {
      _selectedType = selected;
      if (selected.readsSession) {
        _sessionId = widget.prefill?.sessionId;
        _sessionStatus = widget.prefill?.currentStatus;
      }
    });
    if (selected.readsSession && _attendanceDate != null) {
      _loadSessions(preselect: _sessionId);
    }
  }

  Future<void> _loadSessions({int? preselect}) async {
    final date = _attendanceDate;
    if (date == null) {
      setState(() {
        _sessions = const [];
        _loadingSessions = false;
        _sessionsError = null;
      });
      return;
    }

    setState(() {
      _loadingSessions = true;
      _sessionsError = null;
    });
    try {
      final res = await api.get(
        '/student/attendance',
        query: {'date': ymd(date), 'limit': 50},
      );
      final items = (res['items'] as List<dynamic>? ?? const [])
          .cast<Map<String, dynamic>>();
      if (!mounted) return;

      final wanted = preselect ?? _sessionId;
      Map<String, dynamic>? chosen;
      for (final item in items) {
        if (asInt(item['sessionId']) == wanted) {
          chosen = item;
          break;
        }
      }

      setState(() {
        _sessions = items;
        _loadingSessions = false;
        if (chosen == null) {
          if (wanted != null) {
            _sessionId = null;
            _sessionStatus = null;
          }
        } else {
          _sessionId = asInt(chosen['sessionId']);
          _sessionStatus = chosen['status'] as String? ?? _sessionStatus;
        }
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _loadingSessions = false;
        _sessionsError = e.message;
      });
    }
  }

  // ---------------------------------------------------------------- picking

  Future<void> _pickFiles() async {
    if (_attachments.length >= AppConfig.maxAttachments) {
      _setAttachmentProblems([
        'You can attach at most ${AppConfig.maxAttachments} files.',
      ]);
      return;
    }

    try {
      final picked = await FilePicker.pickFiles(
        type: FileType.custom,
        allowedExtensions: AppConfig.attachmentExtensions,
      );
      if (picked.isEmpty) return;

      final incoming = <ComplaintAttachment>[];
      for (final file in picked) {
        final size = await file.length() ?? 0;
        incoming.add(
          ComplaintAttachment(name: file.name, size: size, file: file.xFile),
        );
      }
      _addAttachments(incoming);
    } catch (e) {
      if (!mounted) return;
      showMessage(context, 'Could not open the file picker. $e', error: true);
    }
  }

  Future<void> _takePhoto() async {
    if (_attachments.length >= AppConfig.maxAttachments) {
      _setAttachmentProblems([
        'You can attach at most ${AppConfig.maxAttachments} files.',
      ]);
      return;
    }

    try {
      final photo = await _imagePicker.pickImage(
        source: ImageSource.camera,
        imageQuality: 85,
        maxWidth: 2048,
      );
      if (photo == null) return;

      final size = await photo.length();
      var name = photo.name;
      if (attachmentExtension(name).isEmpty) name = 'photo.jpg';
      _addAttachments([
        ComplaintAttachment(name: name, size: size, file: photo),
      ]);
    } catch (e) {
      if (!mounted) return;
      showMessage(context, 'Could not open the camera. $e', error: true);
    }
  }

  /// Validates new picks with the same rules as the web picker and the server.
  void _addAttachments(List<ComplaintAttachment> incoming) {
    final problems = <String>[];
    final accepted = <ComplaintAttachment>[];

    for (final item in incoming) {
      if (!attachmentExtensions.contains(attachmentExtension(item.name))) {
        problems.add(
          '${item.name}: unsupported format. Use JPEG, PNG, WebP or PDF.',
        );
        continue;
      }
      if (item.size > AppConfig.maxAttachmentBytes) {
        problems.add(
          '${item.name} is ${formatBytes(item.size)} — the limit is '
          '${formatBytes(AppConfig.maxAttachmentBytes)} per file.',
        );
        continue;
      }
      if (item.size == 0) {
        problems.add('${item.name} is empty.');
        continue;
      }
      if (_attachments.length + accepted.length >= AppConfig.maxAttachments) {
        problems.add(
          '${item.name}: you can attach at most '
          '${AppConfig.maxAttachments} files.',
        );
        continue;
      }
      accepted.add(item);
    }

    if (!mounted) return;
    setState(() {
      _attachments = [..._attachments, ...accepted];
      _attachmentProblems = problems;
    });
  }

  void _setAttachmentProblems(List<String> problems) {
    setState(() => _attachmentProblems = problems);
  }

  void _removeAttachment(ComplaintAttachment attachment) {
    setState(() {
      _attachments = _attachments
          .where((item) => !identical(item, attachment))
          .toList(growable: false);
      _attachmentProblems = const [];
    });
  }

  // -------------------------------------------------------------- attendance

  Future<void> _pickAttendanceDate() async {
    final today = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _attendanceDate ?? DateTime(today.year, today.month, today.day),
      firstDate: DateTime(today.year - 2),
      lastDate: DateTime(today.year, today.month, today.day),
      helpText: 'Attendance date',
    );
    if (picked == null || !mounted) return;

    setState(() {
      _attendanceDate = picked;
      _dateController.text = formatDate(picked);
      _sessionId = null;
      _sessionStatus = null;
      _requestedCorrection = null;
      _fieldErrors.remove('attendanceDate');
      _fieldErrors.remove('attendanceSessionId');
      _fieldErrors.remove('requestedCorrection');
    });
    _loadSessions();
  }

  void _onTypeChanged(_ComplaintType? type) {
    setState(() {
      _selectedType = type;
      _attendanceDate = null;
      _dateController.clear();
      _sessions = const [];
      _sessionId = null;
      _sessionStatus = null;
      _requestedCorrection = null;
      _fieldErrors.remove('typeId');
      _fieldErrors.remove('attendanceDate');
      _fieldErrors.remove('attendanceSessionId');
      _fieldErrors.remove('requestedCorrection');
    });
  }

  static String _statusLabel(String? status) => switch (status) {
    'present' => 'Present',
    'late' => 'Late',
    'absent' => 'Absent',
    'not_recorded' => 'Not recorded',
    'ongoing' => 'Ongoing',
    _ => 'Unknown',
  };

  Map<String, dynamic>? get _selectedSession {
    for (final item in _sessions) {
      if (asInt(item['sessionId']) == _sessionId) return item;
    }
    return null;
  }

  String? get _sessionLabel {
    final session = _selectedSession;
    if (session == null) return null;
    final subject = session['subject'] as String? ?? 'Class';
    final start = formatTime(parseDate(session['startsAt']));
    return '$start · $subject';
  }

  // -------------------------------------------------------------- validation

  bool _validate() {
    final errors = <String, String>{};
    final title = _titleController.text.trim();
    final description = _descriptionController.text.trim();

    if (title.isEmpty) {
      errors['title'] = 'Complaint title is required';
    } else if (title.length < _minTitle || title.length > _maxTitle) {
      errors['title'] = 'Complaint title must be $_minTitle–$_maxTitle characters';
    }
    if (_selectedType == null) {
      errors['typeId'] = 'Select a complaint type';
    }
    if (description.length > _maxDescription) {
      errors['description'] =
          'Detailed description must be $_maxDescription characters or fewer';
    }

    final type = _selectedType;
    if (type != null && type.readsSession && type.sessionRequired) {
      if (_attendanceDate == null) {
        errors['attendanceDate'] = 'Select the attendance date';
      }
      if (_sessionId == null) {
        errors['attendanceSessionId'] = 'Select the class session';
      }
      if (!_corrections.contains(_requestedCorrection)) {
        errors['requestedCorrection'] =
            'Select the correction you are requesting';
      }
    }

    setState(() {
      _fieldErrors
        ..clear()
        ..addAll(errors);
      _serverError = null;
    });
    return errors.isEmpty;
  }

  // -------------------------------------------------------------- submission

  Future<void> _reviewAndSubmit() async {
    FocusScope.of(context).unfocus();
    if (!_validate()) {
      showMessage(
        context,
        'Please correct the highlighted fields',
        error: true,
      );
      return;
    }

    final type = _selectedType!;
    final result = await Navigator.of(context).push<ComplaintSubmitResult>(
      MaterialPageRoute(
        builder: (_) => ComplaintReviewScreen(
          title: _titleController.text.trim(),
          typeLabel: type.label,
          description: _descriptionController.text.trim(),
          attachments: List<ComplaintAttachment>.of(_attachments),
          attendanceDate: type.readsSession && _attendanceDate != null
              ? formatDate(_attendanceDate)
              : null,
          sessionLabel: type.readsSession ? _sessionLabel : null,
          currentStatusLabel: type.readsSession && _sessionStatus != null
              ? _statusLabel(_sessionStatus)
              : null,
          requestedCorrectionLabel:
              type.sessionRequired && _requestedCorrection != null
              ? _statusLabel(_requestedCorrection)
              : null,
          onSubmit: _submit,
        ),
      ),
    );

    if (result == null || !mounted) return;
    setState(() {
      _created = result;
      _failedUploads = _attachments
          .where((item) => !item.uploaded)
          .toList(growable: false);
    });
  }

  /// Creates the complaint, then uploads every attachment one by one.
  /// Reused by the review screen and by the "retry failed uploads" action.
  Future<ComplaintSubmitResult> _submit(
    void Function(String) onProgress,
  ) async {
    final type = _selectedType!;
    final isAttendance = type.readsSession;

    final body = <String, dynamic>{
      'title': _titleController.text.trim(),
      'typeId': '${type.id}',
      'description': _descriptionController.text.trim(),
    };
    if (isAttendance) {
      body['attendanceDate'] = _attendanceDate == null
          ? ''
          : ymd(_attendanceDate!);
      body['attendanceSessionId'] = _sessionId == null ? '' : '$_sessionId';
      body['requestedCorrection'] = type.sessionRequired
          ? (_requestedCorrection ?? '')
          : '';
    }

    onProgress('Submitting complaint…');
    final res = await api.post('/complaints', body);
    final complaint = res['complaint'] as Map<String, dynamic>? ?? const {};
    final id = asInt(complaint['id']);
    final number = complaint['complaintNumber'] as String? ?? 'CMP-$id';

    for (var i = 0; i < _attachments.length; i++) {
      final item = _attachments[i];
      onProgress('Uploading attachment ${i + 1} of ${_attachments.length}…');
      item.uploaded = false;
      item.uploadError = null;
      try {
        await api.upload(
          '/complaints/$id/attachments',
          field: 'file',
          read: item.file.openRead,
          length: item.size,
          filename: item.name,
        );
        item.uploaded = true;
      } on ApiException catch (e) {
        item.uploadError = e.message;
      } catch (e) {
        item.uploadError = '$e';
      }
    }

    // The list refreshes from this notifier even if the form is replaced.
    markComplaintsChanged();

    return ComplaintSubmitResult(
      id: id,
      complaintNumber: number,
      assigned: complaint['assigned'] == true,
    );
  }

  Future<void> _retryFailedUploads() async {
    final created = _created;
    if (created == null || _failedUploads.isEmpty || _retryingUploads) return;

    setState(() => _retryingUploads = true);
    for (final item in List<ComplaintAttachment>.of(_failedUploads)) {
      if (!mounted) return;
      item.uploadError = null;
      try {
        await api.upload(
          '/complaints/${created.id}/attachments',
          field: 'file',
          read: item.file.openRead,
          length: item.size,
          filename: item.name,
        );
        item.uploaded = true;
      } on ApiException catch (e) {
        item.uploadError = e.message;
      } catch (e) {
        item.uploadError = '$e';
      }
    }

    if (!mounted) return;
    setState(() {
      _retryingUploads = false;
      _failedUploads = _attachments
          .where((item) => !item.uploaded)
          .toList(growable: false);
    });
    showMessage(
      context,
      _failedUploads.isEmpty
          ? 'All attachments uploaded.'
          : '${_failedUploads.length} attachment(s) still failed to upload.',
      error: _failedUploads.isNotEmpty,
    );
  }

  void _resetForAnother() {
    setState(() {
      _created = null;
      _failedUploads = const [];
      _attachments = const [];
      _attachmentProblems = const [];
      _selectedType = null;
      _attendanceDate = null;
      _dateController.clear();
      _sessions = const [];
      _sessionId = null;
      _sessionStatus = null;
      _requestedCorrection = null;
      _fieldErrors.clear();
      _serverError = null;
      _titleController.clear();
      _descriptionController.clear();
    });
  }

  // ------------------------------------------------------------------- build

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text('Submit Complaint')),
      body: _created != null ? _buildSuccess() : _buildForm(),
    );
  }

  Widget _buildForm() {
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 780),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
          children: [
            const Text(
              'Problem & Complaint Center',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w700,
                color: AppColors.navy,
              ),
            ),
            const SizedBox(height: 4),
            const Text(
              'Report an issue, upload supporting evidence, and track its '
              'resolution.',
              style: TextStyle(
                fontSize: 13,
                color: AppColors.muted,
                height: 1.4,
              ),
            ),
            const SizedBox(height: 16),

            if (_serverError != null) ...[
              NoticeBox(message: _serverError!),
              const SizedBox(height: 14),
            ],

            _buildDetailsCard(),
            const SizedBox(height: 16),

            if (_selectedType?.readsSession == true) ...[
              _buildAttendanceCard(_selectedType!),
              const SizedBox(height: 16),
            ],

            _buildDescriptionCard(),
            const SizedBox(height: 16),
            _buildAttachmentsCard(),
            const SizedBox(height: 20),
            _buildButtons(),
          ],
        ),
      ),
    );
  }

  Widget _buildDetailsCard() {
    return SectionCard(
      title: 'Complaint details',
      icon: Icons.assignment_outlined,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
            controller: _titleController,
            maxLength: _maxTitle,
            textInputAction: TextInputAction.next,
            onChanged: (_) {
              if (_fieldErrors.containsKey('title')) {
                setState(() => _fieldErrors.remove('title'));
              }
            },
            decoration: InputDecoration(
              labelText: 'Complaint title *',
              hintText: 'e.g. Marked absent in Data Structures on 14 Oct',
              errorText: _fieldErrors['title'],
            ),
          ),
          const SizedBox(height: 6),
          DropdownButtonFormField<String>(
            isExpanded: true,
            initialValue: _selectedType == null ? null : '${_selectedType!.id}',
            hint: Text(
              _loadingTypes
                  ? 'Loading complaint types…'
                  : 'Select the type of issue',
              overflow: TextOverflow.ellipsis,
            ),
            decoration: const InputDecoration(
              labelText: 'Complaint type *',
              prefixIcon: Icon(Icons.category_outlined, size: 20),
            ),
            items: [
              for (final type in _types)
                DropdownMenuItem<String>(
                  value: '${type.id}',
                  child: Text(type.label, overflow: TextOverflow.ellipsis),
                ),
            ],
            onChanged: _loadingTypes
                ? null
                : (value) {
                    if (value == null) {
                      _onTypeChanged(null);
                      return;
                    }
                    _onTypeChanged(
                      _types.where((t) => '${t.id}' == value).firstOrNull,
                    );
                  },
          ),
          if (_fieldErrors['typeId'] != null) ...[
            const SizedBox(height: 6),
            Text(
              _fieldErrors['typeId']!,
              style: const TextStyle(fontSize: 12, color: AppColors.absent),
            ),
          ],
          if (_typesError != null) ...[
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Could not load complaint types. $_typesError',
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppColors.absent,
                    ),
                  ),
                ),
                TextButton(
                  onPressed: _loadingTypes ? null : _loadTypes,
                  child: const Text('Retry'),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildAttendanceCard(_ComplaintType type) {
    final needsSession = type.sessionRequired;
    final sessionValue =
        _sessionId?.toString() ?? (needsSession ? null : '');
    final hint = _attendanceDate == null
        ? 'Select a date first'
        : _loadingSessions
        ? 'Loading classes…'
        : _sessionsError != null
        ? 'Could not load classes'
        : _sessions.isEmpty
        ? 'No classes on this date'
        : needsSession
        ? 'Select the class'
        : 'No specific class';

    final correctionOptions = _corrections
        .where((value) => value != _sessionStatus)
        .toList(growable: false);

    return SectionCard(
      title: 'Attendance details',
      icon: Icons.calendar_month_outlined,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AppColors.lightBlue,
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.info_outline, size: 16, color: AppColors.navy),
                SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'You can’t change attendance yourself. Your class incharge '
                    'or an administrator will verify this request before any '
                    'record is corrected.',
                    style: TextStyle(
                      fontSize: 11.5,
                      height: 1.4,
                      color: AppColors.navy,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),

          TextField(
            controller: _dateController,
            readOnly: true,
            onTap: _pickAttendanceDate,
            decoration: InputDecoration(
              labelText: needsSession
                  ? 'Attendance date *'
                  : 'Attendance date',
              hintText: 'Select the date of the class',
              prefixIcon: const Icon(Icons.event_outlined, size: 20),
              suffixIcon: const Icon(Icons.arrow_drop_down),
              errorText: _fieldErrors['attendanceDate'],
            ),
          ),
          const SizedBox(height: 14),

          DropdownButtonFormField<String>(
            isExpanded: true,
            initialValue: sessionValue,
            hint: Text(hint, overflow: TextOverflow.ellipsis),
            decoration: InputDecoration(
              labelText: needsSession
                  ? 'Class / attendance session *'
                  : 'Class / attendance session',
              prefixIcon: const Icon(Icons.meeting_room_outlined, size: 20),
            ),
            items: [
              if (!needsSession)
                const DropdownMenuItem<String>(
                  value: '',
                  child: Text('No specific class'),
                ),
              for (final session in _sessions)
                DropdownMenuItem<String>(
                  value: '${asInt(session['sessionId'])}',
                  child: Text(
                    '${formatTime(parseDate(session['startsAt']))} · '
                    '${session['subject'] as String? ?? 'Class'} '
                    '(${_statusLabel(session['status'] as String?)})',
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
            ],
            onChanged:
                _attendanceDate == null ||
                    _loadingSessions ||
                    (_sessions.isEmpty && needsSession)
                ? null
                : (value) {
                    setState(() {
                      _fieldErrors.remove('attendanceSessionId');
                      _fieldErrors.remove('requestedCorrection');
                      if (value == null || value.isEmpty) {
                        _sessionId = null;
                        _sessionStatus = null;
                        _requestedCorrection = null;
                        return;
                      }
                      final id = int.tryParse(value);
                      _sessionId = id;
                      _sessionStatus = null;
                      for (final session in _sessions) {
                        if (asInt(session['sessionId']) == id) {
                          _sessionStatus = session['status'] as String?;
                          break;
                        }
                      }
                      if (_requestedCorrection == _sessionStatus) {
                        _requestedCorrection = null;
                      }
                    });
                  },
          ),
          if (_fieldErrors['attendanceSessionId'] != null) ...[
            const SizedBox(height: 6),
            Text(
              _fieldErrors['attendanceSessionId']!,
              style: const TextStyle(fontSize: 12, color: AppColors.absent),
            ),
          ],
          if (_sessionsError != null) ...[
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Could not load your classes. $_sessionsError',
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppColors.absent,
                    ),
                  ),
                ),
                TextButton(
                  onPressed: _loadingSessions
                      ? null
                      : () => _loadSessions(preselect: _sessionId),
                  child: const Text('Retry'),
                ),
              ],
            ),
          ],
          const SizedBox(height: 14),

          const Text(
            'Current attendance status',
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: AppColors.navy,
            ),
          ),
          const SizedBox(height: 6),
          Container(
            height: 48,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            alignment: Alignment.centerLeft,
            decoration: BoxDecoration(
              color: AppColors.background,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.border),
            ),
            child: _sessionStatus == null
                ? const Text(
                    'Select a class',
                    style: TextStyle(fontSize: 13, color: AppColors.muted),
                  )
                : StatusChip.attendance(_sessionStatus!),
          ),

          if (needsSession) ...[
            const SizedBox(height: 14),
            DropdownButtonFormField<String>(
              isExpanded: true,
              initialValue: correctionOptions.contains(_requestedCorrection)
                  ? _requestedCorrection
                  : null,
              hint: const Text('Mark me as…'),
              decoration: const InputDecoration(
                labelText: 'Requested correction *',
                prefixIcon: Icon(Icons.fact_check_outlined, size: 20),
              ),
              items: [
                for (final value in correctionOptions)
                  DropdownMenuItem<String>(
                    value: value,
                    child: Text(_statusLabel(value)),
                  ),
              ],
              onChanged: (value) => setState(() {
                _requestedCorrection = value;
                _fieldErrors.remove('requestedCorrection');
              }),
            ),
            if (_fieldErrors['requestedCorrection'] != null) ...[
              const SizedBox(height: 6),
              Text(
                _fieldErrors['requestedCorrection']!,
                style: const TextStyle(fontSize: 12, color: AppColors.absent),
              ),
            ],
          ],
        ],
      ),
    );
  }

  Widget _buildDescriptionCard() {
    final isAttendance = _selectedType?.readsSession == true;
    return SectionCard(
      title: 'Description',
      icon: Icons.notes_outlined,
      child: TextField(
        controller: _descriptionController,
        maxLength: _maxDescription,
        minLines: 4,
        maxLines: 8,
        onChanged: (_) {
          if (_fieldErrors.containsKey('description')) {
            setState(() => _fieldErrors.remove('description'));
          }
        },
        decoration: InputDecoration(
          labelText: 'Detailed description (optional)',
          alignLabelWithHint: true,
          hintText: isAttendance
              ? 'Explain what happened in class, why the record is wrong, and '
                    'who can confirm you were present.'
              : 'Describe the issue, when it started and what you have already '
                    'tried.',
          hintMaxLines: 3,
          errorText: _fieldErrors['description'],
        ),
      ),
    );
  }

  Widget _buildAttachmentsCard() {
    final full = _attachments.length >= AppConfig.maxAttachments;
    return SectionCard(
      title: 'Supporting attachments',
      icon: Icons.attach_file,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppColors.background,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppColors.border),
            ),
            child: Column(
              children: [
                const Icon(
                  Icons.cloud_upload_outlined,
                  size: 30,
                  color: AppColors.teal,
                ),
                const SizedBox(height: 8),
                Text(
                  _attachments.isEmpty
                      ? 'Add supporting evidence'
                      : 'Add more evidence',
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: AppColors.navy,
                  ),
                ),
                const SizedBox(height: 2),
                const Text(
                  'JPEG, PNG, WebP or PDF · up to 10 MB each · max 10 files',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 11.5, color: AppColors.muted),
                ),
                const SizedBox(height: 12),
                LayoutBuilder(
                  builder: (context, constraints) {
                    final stacked = constraints.maxWidth < 380;
                    final choose = OutlinedButton.icon(
                      onPressed: full ? null : _pickFiles,
                      icon: const Icon(Icons.folder_open_outlined, size: 18),
                      label: Text(
                        _attachments.isEmpty ? 'Choose Files' : 'Add File',
                      ),
                    );
                    final camera = OutlinedButton.icon(
                      onPressed: full ? null : _takePhoto,
                      style: OutlinedButton.styleFrom(
                        foregroundColor: AppColors.teal,
                        side: const BorderSide(color: AppColors.teal),
                      ),
                      icon: const Icon(Icons.photo_camera_outlined, size: 18),
                      label: const Text('Take New Photo'),
                    );
                    if (stacked) {
                      return Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          choose,
                          const SizedBox(height: 8),
                          camera,
                        ],
                      );
                    }
                    return Row(
                      children: [
                        Expanded(child: choose),
                        const SizedBox(width: 10),
                        Expanded(child: camera),
                      ],
                    );
                  },
                ),
              ],
            ),
          ),

          if (_attachmentProblems.isNotEmpty) ...[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.absent.withValues(alpha: 0.06),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: AppColors.absent.withValues(alpha: 0.25),
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  for (final problem in _attachmentProblems)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 2),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Icon(
                            Icons.error_outline,
                            size: 14,
                            color: AppColors.absent,
                          ),
                          const SizedBox(width: 6),
                          Expanded(
                            child: Text(
                              problem,
                              style: const TextStyle(
                                fontSize: 11.5,
                                color: AppColors.absent,
                                height: 1.35,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
          ],

          if (_attachments.isNotEmpty) ...[
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Selected files (${_attachments.length}/'
                    '${AppConfig.maxAttachments})',
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: AppColors.navy,
                    ),
                  ),
                ),
                if (full)
                  const Text(
                    'Limit reached',
                    style: TextStyle(fontSize: 11, color: AppColors.late),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            for (final attachment in _attachments)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: AttachmentTile(
                  attachment: attachment,
                  onPreview: () => showAttachmentPreview(context, attachment),
                  onRemove: () => _removeAttachment(attachment),
                ),
              ),
          ],

          const SizedBox(height: 12),
          const Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.lock_outline, size: 14, color: AppColors.muted),
              SizedBox(width: 6),
              Expanded(
                child: Text(
                  'Attachments are stored privately and are visible only to you '
                  'and authorized staff.',
                  style: TextStyle(fontSize: 11.5, color: AppColors.muted),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildButtons() {
    final review = FilledButton.icon(
      onPressed: _reviewAndSubmit,
      style: FilledButton.styleFrom(minimumSize: const Size(0, 48)),
      icon: const Icon(Icons.send_rounded, size: 18),
      label: const Text(
        'Review & Submit',
        style: TextStyle(fontWeight: FontWeight.w700),
      ),
    );
    final cancel = OutlinedButton(
      onPressed: () => context.pop(),
      style: OutlinedButton.styleFrom(minimumSize: const Size(0, 48)),
      child: const Text('Cancel'),
    );

    return LayoutBuilder(
      builder: (context, constraints) {
        if (constraints.maxWidth < 480) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [review, const SizedBox(height: 8), cancel],
          );
        }
        return Row(
          mainAxisAlignment: MainAxisAlignment.end,
          children: [
            SizedBox(width: 140, child: cancel),
            const SizedBox(width: 12),
            SizedBox(width: 190, child: review),
          ],
        );
      },
    );
  }

  Widget _buildSuccess() {
    final created = _created!;
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 780),
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(22),
                child: Column(
                  children: [
                    Container(
                      width: 72,
                      height: 72,
                      decoration: BoxDecoration(
                        color: AppColors.present.withValues(alpha: 0.1),
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(
                        Icons.check_circle_rounded,
                        color: AppColors.present,
                        size: 40,
                      ),
                    ),
                    const SizedBox(height: 16),
                    const Text(
                      'Complaint submitted',
                      style: TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w700,
                        color: AppColors.navy,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text.rich(
                      TextSpan(
                        style: const TextStyle(
                          fontSize: 13,
                          color: AppColors.muted,
                          height: 1.5,
                        ),
                        children: [
                          const TextSpan(text: 'Your complaint ID is '),
                          TextSpan(
                            text: created.complaintNumber,
                            style: const TextStyle(
                              fontWeight: FontWeight.w700,
                              color: AppColors.teal,
                            ),
                          ),
                          TextSpan(
                            text: created.assigned
                                ? '. It has been sent to your class incharge.'
                                : '. It will be assigned to an authorized staff '
                                      'member.',
                          ),
                        ],
                      ),
                      textAlign: TextAlign.center,
                    ),
                    if (_failedUploads.isNotEmpty) ...[
                      const SizedBox(height: 16),
                      NoticeBox(
                        message:
                            '${_failedUploads.length} attachment(s) failed to '
                            'upload: ${_failedUploads.map((f) => f.name).join(', ')}',
                        color: AppColors.late,
                        icon: Icons.warning_amber_rounded,
                      ),
                      const SizedBox(height: 10),
                      OutlinedButton.icon(
                        onPressed: _retryingUploads
                            ? null
                            : _retryFailedUploads,
                        icon: _retryingUploads
                            ? const SizedBox.square(
                                dimension: 16,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                ),
                              )
                            : const Icon(Icons.refresh, size: 18),
                        label: Text(
                          _retryingUploads
                              ? 'Retrying…'
                              : 'Retry ${_failedUploads.length} failed '
                                    'upload(s)',
                        ),
                      ),
                    ],
                    const SizedBox(height: 20),
                    FilledButton.icon(
                      onPressed: () =>
                          context.pushReplacement('/complaints/${created.id}'),
                      style: FilledButton.styleFrom(
                        minimumSize: const Size.fromHeight(48),
                      ),
                      icon: const Icon(Icons.visibility_outlined, size: 18),
                      label: const Text('View complaint'),
                    ),
                    const SizedBox(height: 8),
                    OutlinedButton(
                      onPressed: () => context.pop(),
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size.fromHeight(46),
                      ),
                      child: const Text('My Complaints'),
                    ),
                    const SizedBox(height: 4),
                    TextButton(
                      onPressed: _resetForAnother,
                      child: const Text('Submit another'),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
