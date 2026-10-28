import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../../../core/admin_attendance_service.dart';
import '../../../core/api_client.dart';
import '../../../core/format.dart';
import '../../../core/models.dart';
import '../../../core/theme.dart';
import '../../../widgets/common.dart';

/// What the dashboard needs to know after the scanner closes.
class ScannerResult {
  const ScannerResult({
    required this.submitted,
    this.pending = 0,
    this.closed = true,
  });

  final bool submitted;
  final int pending;
  final bool closed;
}

class _ScanEntry {
  _ScanEntry({
    required this.token,
    required this.name,
    required this.enrollment,
    required this.status,
    required this.at,
    required this.synced,
  });

  final String token;
  final String name;
  final String enrollment;
  final String status;
  final DateTime at;
  final bool synced;

  bool get isPending => !synced;
}

/// Camera screen that scans student QR codes for one attendance session.
class AttendanceScannerScreen extends StatefulWidget {
  const AttendanceScannerScreen({
    super.key,
    required this.session,
    required this.service,
  });

  final AdminAttendanceSession session;
  final AdminAttendanceService service;

  @override
  State<AttendanceScannerScreen> createState() =>
      _AttendanceScannerScreenState();
}

class _AttendanceScannerScreenState extends State<AttendanceScannerScreen> {
  final MobileScannerController _controller = MobileScannerController(
    formats: const [BarcodeFormat.qrCode],
    facing: CameraFacing.back,
  );

  final List<_ScanEntry> _entries = [];
  final Set<String> _seenTokens = {};
  final Set<String> _seenStudents = {};

  StreamSubscription<bool>? _onlineSub;
  bool _busy = false;
  bool _torchOn = false;
  bool _submitting = false;
  bool _syncing = false;
  int _pending = 0;
  String _lastToken = '';
  DateTime _lastTokenAt = DateTime.fromMillisecondsSinceEpoch(0);

  ({bool ok, String message})? _feedback;

  @override
  void initState() {
    super.initState();
    _refreshPending();
    _onlineSub = widget.service.onlineChanges.listen((online) {
      if (!online || !mounted) return;
      // Internet came back: replay anything that was scanned offline.
      _syncPending(silent: true);
    });
  }

  @override
  void dispose() {
    _onlineSub?.cancel();
    _controller.dispose();
    super.dispose();
  }

  int get _presentCount => _entries.where((e) => e.synced).length;

  Future<void> _refreshPending() async {
    final count = await widget.service.pendingCount();
    if (!mounted) return;
    setState(() => _pending = count);
  }

  void _setFeedback(bool ok, String message) {
    if (!mounted) return;
    setState(() => _feedback = (ok: ok, message: message));
  }

  // ---------------------------------------------------------------- scanning

  String _extractEnrollment(String token) {
    var normalized = token.replaceAll(RegExp(r'^SMARTATTEND:(?:STUDENT|IDENTITY):', caseSensitive: false), '').trim();
    if (normalized.startsWith('SATT1.')) return '';
    if (normalized.isEmpty) return '';
    if (normalized.length > 64) return normalized.length > 22 ? _shortToken(normalized) : normalized;
    return normalized;
  }

Future<void> _handleDetect(BarcodeCapture capture) async {
    if (_busy || _submitting) return;
    final raw = capture.barcodes.isEmpty
        ? null
        : capture.barcodes.first.rawValue;
    final token = raw?.trim() ?? '';
    if (token.isEmpty) return;

    // Ignore the same code while it is still in front of the camera.
    final now = DateTime.now();
    if (token == _lastToken &&
        now.difference(_lastTokenAt) < const Duration(seconds: 3)) {
      return;
    }
    _lastToken = token;
    _lastTokenAt = now;

    if (_seenTokens.contains(token)) {
      _setFeedback(false, 'This student was already scanned in this session.');
      return;
    }

    final extractedEnrollment = _extractEnrollment(token);

    _busy = true;
    try {
      final outcome = await widget.service.markAttendance(
        token: token,
        sessionId: widget.session.id,
      );

      if (!mounted) return;
      final conflictEnrollment = outcome.enrollmentNumber.isNotEmpty ? outcome.enrollmentNumber : extractedEnrollment;
      if (conflictEnrollment.isNotEmpty && _seenStudents.contains(conflictEnrollment)) {
        _seenTokens.add(token);
        final displayName = outcome.studentName.isEmpty ? conflictEnrollment : outcome.studentName;
        _setFeedback(false, '$displayName was already scanned in this session.');
        return;
      }
      _seenTokens.add(token);
      if (outcome.enrollmentNumber.isNotEmpty) {
        _seenStudents.add(outcome.enrollmentNumber);
      } else if (extractedEnrollment.isNotEmpty) {
        _seenStudents.add(extractedEnrollment);
      }
      setState(() {
        _entries.insert(
          0,
          _ScanEntry(
            token: token,
            name: outcome.studentName.isEmpty ? (extractedEnrollment.isEmpty ? 'Student' : extractedEnrollment) : outcome.studentName,
            enrollment: outcome.enrollmentNumber.isNotEmpty ? outcome.enrollmentNumber : extractedEnrollment,
            status: outcome.status,
            at: outcome.markedAt ?? DateTime.now(),
            synced: true,
          ),
        );
      });
      final feedbackName = outcome.studentName.isEmpty ? (extractedEnrollment.isEmpty ? 'Student' : extractedEnrollment) : outcome.studentName;
      _setFeedback(
        outcome.status == 'late',
        '$feedbackName marked ${outcome.status}.',
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      if (e.code == 'ALREADY_MARKED') {
        _seenTokens.add(token);
        _setFeedback(false, e.message);
      } else if (e.statusCode == null) {
        if (extractedEnrollment.isNotEmpty) {
          if (_seenStudents.contains(extractedEnrollment)) {
            _seenTokens.add(token);
            _setFeedback(false, 'This student was already scanned in this session.');
            _busy = false;
            return;
          }
          _seenStudents.add(extractedEnrollment);
        }
        // No connection: keep the scan and replay it later.
        await widget.service.queueScan(
          token: token,
          sessionId: widget.session.id,
          enrollmentNumber: extractedEnrollment,
          scanTime: DateTime.now(),
        );
        if (!mounted) return;
        _seenTokens.add(token);
        setState(() {
          _entries.insert(
            0,
            _ScanEntry(
              token: token,
              name: extractedEnrollment.isNotEmpty ? extractedEnrollment : _shortToken(token),
              enrollment: extractedEnrollment.isNotEmpty ? extractedEnrollment : _shortToken(token),
              status: 'pending',
              at: DateTime.now(),
              synced: false,
            ),
          );
        });
        await _refreshPending();
        _setFeedback(
          true,
          'Saved offline. It will sync automatically when the internet returns.',
        );
      } else {
        _setFeedback(false, e.message);
      }
    } catch (e) {
      if (mounted) _setFeedback(false, 'Scan failed: $e');
    } finally {
      _busy = false;
    }
  }

  String _shortToken(String token) {
    if (token.length <= 22) return token;
    return '${token.substring(0, 12)}…${token.substring(token.length - 6)}';
  }

  // ---------------------------------------------------------------- sync + submit

  Future<void> _syncPending({bool silent = false}) async {
    if (_syncing) return;

    setState(() => _syncing = true);
    try {
      final report = await widget.service.syncPendingScans();
      if (!mounted) return;

      // Replace the local list with the server's authoritative records so the
      // student names of offline scans appear too.
      if (report.synced > 0) await _reloadEntries();

      final parts = <String>[];
      if (report.synced > 0) parts.add('${report.synced} synced');
      if (report.rejected > 0) parts.add('${report.rejected} rejected');
      if (report.remaining > 0) parts.add('${report.remaining} still pending');
      if (parts.isEmpty) parts.add('nothing to sync');

      if (!silent || report.hasWork) {
        _setFeedback(
          report.remaining == 0 && report.rejected == 0,
          'Sync finished: ${parts.join(', ')}.'
          '${report.message == null ? '' : ' ${report.message}'}',
        );
      }
    } finally {
      if (mounted) setState(() => _syncing = false);
      await _refreshPending();
    }
  }

  Future<void> _reloadEntries() async {
    try {
      final records = await widget.service.fetchRecords(widget.session.id);
      if (!mounted) return;
      final pendingScans = await widget.service.pendingScans();
      final pendingTokens = pendingScans
          .where((s) => s.sessionId == widget.session.id)
          .map((s) => s.token)
          .toSet();

      setState(() {
        _seenStudents
          ..clear()
          ..addAll(records.map((r) => r.enrollmentNumber));
        _entries
          ..clear()
          ..addAll(
            records.map(
              (r) => _ScanEntry(
                token: '',
                name: r.studentName.isEmpty ? 'Student' : r.studentName,
                enrollment: r.enrollmentNumber,
                status: r.status,
                at: r.markedAt ?? DateTime.now(),
                synced: true,
              ),
            ),
          );
        for (final token in pendingTokens) {
          if (_seenTokens.contains(token)) continue;
          _entries.insert(
            0,
            _ScanEntry(
              token: token,
              name: 'Pending sync',
              enrollment: _shortToken(token),
              status: 'pending',
              at: DateTime.now(),
              synced: false,
            ),
          );
        }
      });
    } catch (_) {
      // Offline again: keep the local list as-is.
    }
  }

  Future<void> _submit() async {
    if (_submitting) return;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
        title: const Text('Submit attendance?'),
        content: Text(
          '$_presentCount student${_presentCount == 1 ? '' : 's'} marked present'
          '${_pending > 0 ? ' and $_pending saved offline' : ''}.\n\n'
          'Scanning will stop and the session will be closed.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Keep scanning'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Submit'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    setState(() => _submitting = true);
    try {
      try {
        await _controller.stop();
      } catch (_) {
        // The camera may already be stopped (e.g. permission denied).
      }

      // Make sure every offline scan reaches the server before closing.
      final pending = await widget.service.pendingCount();
      if (pending > 0) {
        await widget.service.syncPendingScans();
      }
      final stillPending = await widget.service.pendingCount();

      var closed = false;
      try {
        closed = await widget.service.closeSession(widget.session.id);
      } on ApiException {
        closed = false;
      }

      if (!mounted) return;
      Navigator.pop(
        context,
        ScannerResult(submitted: true, pending: stillPending, closed: closed),
      );
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _confirmExit() async {
    if (_submitting) return;
    final leave = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
        title: const Text('Stop scanning?'),
        content: const Text(
          'The session stays open, so you can keep scanning later. '
          'Use Submit Attendance when the class is done.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Stay'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Stop'),
          ),
        ],
      ),
    );
    if (leave == true && mounted) {
      Navigator.pop(context, const ScannerResult(submitted: false));
    }
  }

  // ---------------------------------------------------------------- UI

  @override
  Widget build(BuildContext context) {
    final session = widget.session;
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _confirmExit();
      },
      child: Scaffold(
        backgroundColor: AppColors.background,
        appBar: AppBar(
          title: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                session.subject.isEmpty ? 'Scan attendance' : session.subject,
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                ),
              ),
              Text(
                '${session.classLabel} · Room ${session.room.isEmpty ? '—' : session.room}',
                style: const TextStyle(fontSize: 11, color: Colors.white70),
              ),
            ],
          ),
          leading: IconButton(
            onPressed: _confirmExit,
            icon: const Icon(Icons.close_rounded),
            tooltip: 'Stop scanning',
          ),
          actions: [
            IconButton(
              tooltip: _torchOn ? 'Turn torch off' : 'Turn torch on',
              onPressed: () async {
                await _controller.toggleTorch();
                if (mounted) setState(() => _torchOn = !_torchOn);
              },
              icon: Icon(
                _torchOn ? Icons.flash_on_rounded : Icons.flash_off_rounded,
              ),
            ),
            IconButton(
              tooltip: 'Sync pending scans',
              onPressed: _syncing ? null : () => _syncPending(),
              icon: _syncing
                  ? const SizedBox.square(
                      dimension: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Icon(Icons.sync_rounded),
            ),
          ],
        ),
        body: SafeArea(
          child: LayoutBuilder(
            builder: (context, constraints) {
              final wide = constraints.maxWidth >= 720;
              final camera = _buildCamera();
              final list = _buildScannedList();
              return Column(
                children: [
                  _buildSessionBar(),
                  Expanded(
                    child: wide
                        ? Row(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Expanded(
                                flex: 5,
                                child: Padding(
                                  padding: const EdgeInsets.fromLTRB(
                                    16,
                                    0,
                                    8,
                                    8,
                                  ),
                                  child: camera,
                                ),
                              ),
                              Expanded(
                                flex: 4,
                                child: Padding(
                                  padding: const EdgeInsets.fromLTRB(
                                    8,
                                    0,
                                    16,
                                    8,
                                  ),
                                  child: list,
                                ),
                              ),
                            ],
                          )
                        : Column(
                            children: [
                              Padding(
                                padding: const EdgeInsets.fromLTRB(
                                  16,
                                  0,
                                  16,
                                  8,
                                ),
                                child: SizedBox(height: 260, child: camera),
                              ),
                              Expanded(
                                child: Padding(
                                  padding: const EdgeInsets.fromLTRB(
                                    16,
                                    0,
                                    16,
                                    8,
                                  ),
                                  child: list,
                                ),
                              ),
                            ],
                          ),
                  ),
                  _buildSubmitBar(),
                ],
              );
            },
          ),
        ),
      ),
    );
  }

  Widget _buildSessionBar() {
    final session = widget.session;
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 12, 16, 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: AppColors.tealLight,
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Icon(
              Icons.person_pin_circle_rounded,
              color: AppColors.teal,
              size: 22,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  session.teacherName.isEmpty
                      ? 'Teacher not recorded'
                      : session.teacherName,
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: AppColors.navy,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  '${session.classLabel} · Room ${session.room.isEmpty ? '—' : session.room}',
                  style: const TextStyle(fontSize: 12, color: AppColors.muted),
                ),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                '$_presentCount',
                style: const TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                  color: AppColors.teal,
                  height: 1,
                ),
              ),
              const Text(
                'present',
                style: TextStyle(fontSize: 10, color: AppColors.muted),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildCamera() {
    return ClipRRect(
      borderRadius: BorderRadius.circular(18),
      child: Stack(
        fit: StackFit.expand,
        children: [
          MobileScanner(
            controller: _controller,
            onDetect: _handleDetect,
            errorBuilder: (context, error) => Container(
              color: AppColors.navy,
              padding: const EdgeInsets.all(20),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(
                    Icons.no_photography_rounded,
                    color: Colors.white70,
                    size: 40,
                  ),
                  const SizedBox(height: 10),
                  Text(
                    error.errorCode == MobileScannerErrorCode.permissionDenied
                        ? 'Camera permission was denied. Allow it in Android settings and reopen the scanner.'
                        : 'The camera could not be started. ${error.errorDetails?.message ?? ''}',
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: Colors.white70, fontSize: 12),
                  ),
                ],
              ),
            ),
          ),
          IgnorePointer(
            child: Center(
              child: Container(
                width: 200,
                height: 200,
                decoration: BoxDecoration(
                  border: Border.all(color: Colors.white70, width: 2),
                  borderRadius: BorderRadius.circular(16),
                ),
              ),
            ),
          ),
          Positioned(
            left: 12,
            right: 12,
            bottom: 12,
            child: _feedback == null
                ? const _ScanHint('Point the camera at a student QR code')
                : _ScanHint(
                    _feedback!.message,
                    color: _feedback!.ok ? AppColors.present : AppColors.absent,
                  ),
          ),
        ],
      ),
    );
  }

  Widget _buildScannedList() {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 8),
            child: Row(
              children: [
                const Icon(
                  Icons.groups_rounded,
                  size: 18,
                  color: AppColors.teal,
                ),
                const SizedBox(width: 8),
                const Expanded(
                  child: Text(
                    'Scanned students',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: AppColors.navy,
                    ),
                  ),
                ),
                StatusChip('$_presentCount present', color: AppColors.teal),
              ],
            ),
          ),
          const Divider(height: 1, color: AppColors.border),
          Expanded(
            child: _entries.isEmpty
                ? const EmptyView(
                    icon: Icons.qr_code_scanner_rounded,
                    title: 'Waiting for scans',
                    message: 'Marked students appear here instantly.',
                  )
                : ListView.separated(
                    padding: const EdgeInsets.all(10),
                    itemCount: _entries.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 8),
                    itemBuilder: (_, index) => _buildEntry(_entries[index]),
                  ),
          ),
        ],
      ),
    );
  }

  Widget _buildEntry(_ScanEntry entry) {
    final pending = entry.isPending;
    final color = pending
        ? AppColors.late
        : entry.status == 'late'
        ? AppColors.late
        : AppColors.present;
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: pending
            ? AppColors.late.withValues(alpha: 0.06)
            : AppColors.background,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          CircleAvatar(
            radius: 16,
            backgroundColor: color.withValues(alpha: 0.12),
            child: Icon(
              pending ? Icons.cloud_upload_outlined : Icons.check_rounded,
              size: 16,
              color: color,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  entry.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: AppColors.navy,
                  ),
                ),
                Text(
                  entry.enrollment.isEmpty ? '—' : entry.enrollment,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 11, color: AppColors.muted),
                ),
              ],
            ),
          ),
          const SizedBox(width: 6),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              StatusChip(pending ? 'Pending' : entry.status, color: color),
              const SizedBox(height: 2),
              Text(
                formatTime(entry.at),
                style: const TextStyle(fontSize: 10, color: AppColors.muted),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildSubmitBar() {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(top: BorderSide(color: AppColors.border)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (_pending > 0)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(
                children: [
                  const Icon(
                    Icons.cloud_off_rounded,
                    size: 16,
                    color: AppColors.late,
                  ),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      '$_pending scan${_pending == 1 ? '' : 's'} saved offline — '
                      'syncing automatically when the internet returns.',
                      style: const TextStyle(
                        fontSize: 11,
                        color: AppColors.late,
                      ),
                    ),
                  ),
                  TextButton(
                    onPressed: _syncing ? null : () => _syncPending(),
                    child: const Text('Sync now'),
                  ),
                ],
              ),
            ),
          FilledButton.icon(
            onPressed: _submitting ? null : _submit,
            icon: _submitting
                ? const SizedBox.square(
                    dimension: 18,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : const Icon(Icons.task_alt_rounded),
            label: Text(
              _submitting
                  ? 'Submitting…'
                  : 'Submit Attendance ($_presentCount)',
            ),
          ),
        ],
      ),
    );
  }
}

class _ScanHint extends StatelessWidget {
  const _ScanHint(this.text, {this.color = AppColors.navy});

  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.88),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Text(
        text,
        textAlign: TextAlign.center,
        style: const TextStyle(
          color: Colors.white,
          fontSize: 12,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}
