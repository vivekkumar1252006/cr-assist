import 'dart:async';

import 'package:flutter/material.dart';

import '../../../core/admin_attendance_service.dart';
import '../../../core/api_client.dart';
import '../../../core/format.dart';
import '../../../core/models.dart';
import '../../../core/services.dart';
import '../../../core/theme.dart';
import '../../../widgets/common.dart';
import 'attendance_scanner_screen.dart';
import 'attendance_session_detail_screen.dart';

/// Admin home screen: start an attendance session and review past sessions.
class AdminAttendanceScreen extends StatefulWidget {
  const AdminAttendanceScreen({super.key});

  @override
  State<AdminAttendanceScreen> createState() => _AdminAttendanceScreenState();
}

class _AdminAttendanceScreenState extends State<AdminAttendanceScreen>
    with WidgetsBindingObserver {
  final _formKey = GlobalKey<FormState>();
  final _teacher = TextEditingController();
  final _classBranch = TextEditingController();
  final _room = TextEditingController();
  final _subject = TextEditingController();

  final AdminAttendanceService _service = AdminAttendanceService(api);

  List<AdminClass> _classes = const [];

  List<AdminAttendanceSession> _sessions = const [];
  bool _loadingHistory = true;
  String? _historyError;

  bool _starting = false;
  bool _syncing = false;
  bool _online = true;
  int _pending = 0;
  int? _downloadingId;
  StreamSubscription<bool>? _onlineSub;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _loadClasses();
    _loadHistory();
    _refreshPending();
    _onlineSub = _service.onlineChanges.listen((online) {
      if (!mounted) return;
      setState(() => _online = online);
      if (online) _syncPending();
    });
    _service.isOnline().then((value) {
      if (!mounted) return;
      setState(() => _online = value);
      // Flush anything saved offline while the app was closed.
      if (value) _syncPending(silent: true);
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _onlineSub?.cancel();
    _teacher.dispose();
    _classBranch.dispose();
    _room.dispose();
    _subject.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _syncPending(silent: true);
      _loadHistory(silent: true);
    }
  }

  // ---------------------------------------------------------------- data

  Future<void> _loadClasses() async {
    try {
      final classes = await _service.fetchClasses();
      if (!mounted) return;
      setState(() {
        _classes = classes;
      });
    } catch (_) {
      // Classes are optional when entering class/branch manually.
    }
  }

  Future<void> _loadHistory({bool silent = false}) async {
    if (!silent) setState(() => _loadingHistory = true);
    try {
      final sessions = await _service.fetchSessions();
      if (!mounted) return;
      setState(() {
        _sessions = sessions;
        _historyError = null;
        _loadingHistory = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _historyError = e.message;
        _loadingHistory = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _historyError = 'Could not load attendance history: $e';
        _loadingHistory = false;
      });
    }
  }

  Future<void> _refreshPending() async {
    final pending = await _service.pendingCount();
    if (!mounted) return;
    setState(() => _pending = pending);
  }

  Future<void> _syncPending({bool silent = false}) async {
    if (_syncing || !mounted) return;
    setState(() => _syncing = true);
    try {
      final report = await _service.syncPendingScans();
      await _refreshPending();
      if (!mounted || !report.hasWork) return;
      final parts = <String>[
        if (report.synced > 0) '${report.synced} synced',
        if (report.rejected > 0) '${report.rejected} rejected',
        if (report.remaining > 0) '${report.remaining} pending',
      ];
      showMessage(
        context,
        'Attendance sync: ${parts.isEmpty ? 'nothing to sync' : parts.join(', ')}',
        error: report.rejected > 0 || report.offline,
      );
      if (report.synced > 0) _loadHistory(silent: true);
    } finally {
      if (mounted) setState(() => _syncing = false);
    }
  }

  // ---------------------------------------------------------------- actions

  Future<void> _startAttendance() async {
    if (_starting) return;
    if (!(_formKey.currentState?.validate() ?? false)) return;

    final classBranch = _classBranch.text.trim();
    if (classBranch.isEmpty) {
      showMessage(context, 'Enter the class / branch.', error: true);
      return;
    }

    AdminClass? matchedClass;
    for (final c in _classes) {
      if (c.label.toLowerCase() == classBranch.toLowerCase() ||
          c.course.toLowerCase() == classBranch.toLowerCase()) {
        matchedClass = c;
        break;
      }
    }

    setState(() => _starting = true);
    try {
      final session = await _service.createSession(
        teacherName: _teacher.text.trim(),
        classBranch: classBranch,
        adminClass: matchedClass,
        room: _room.text.trim(),
        subject: _subject.text.trim(),
      );

      if (!mounted) return;
      final result = await _openScanner(session);
      if (!mounted) return;

      if (result?.submitted == true) {
        _teacher.clear();
        _classBranch.clear();
        _room.clear();
        _subject.clear();
        _showSubmitResult(result!);
      }
    } on ApiException catch (e) {
      if (!mounted) return;
      showMessage(
        context,
        e.statusCode == null
            ? 'Connect to the internet to start an attendance session.'
            : e.message,
        error: true,
      );
    } catch (e) {
      if (mounted) {
        showMessage(context, 'Could not start attendance: $e', error: true);
      }
    } finally {
      if (mounted) setState(() => _starting = false);
    }
  }

  /// Opens the QR scanner for [session] and refreshes the dashboard afterwards.
  Future<ScannerResult?> _openScanner(AdminAttendanceSession session) async {
    final result = await Navigator.of(context).push<ScannerResult>(
      MaterialPageRoute(
        builder: (_) =>
            AttendanceScannerScreen(session: session, service: _service),
      ),
    );
    if (!mounted) return result;
    await _loadHistory(silent: true);
    await _refreshPending();
    return result;
  }

  /// Reopens the scanner for a session that was left open without submitting.
  Future<void> _resumeScanning(AdminAttendanceSession session) async {
    final result = await _openScanner(session);
    if (!mounted || result == null) return;
    if (result.submitted) _showSubmitResult(result);
  }

  void _showSubmitResult(ScannerResult result) {
    final notes = <String>[
      if (result.pending > 0)
        '${result.pending} scan(s) will sync when the internet returns',
      if (!result.closed) 'the session will close automatically once online',
    ];
    showMessage(
      context,
      notes.isEmpty
          ? 'Attendance submitted successfully.'
          : 'Attendance saved — ${notes.join('; ')}.',
      error: false,
    );
  }

  Future<void> _downloadExcel(AdminAttendanceSession session) async {
    if (_downloadingId != null) return;
    setState(() => _downloadingId = session.id);
    try {
      final path = await _service.downloadSessionReport(session);
      final error = await _service.openFile(path);
      if (!mounted) return;
      showMessage(
        context,
        error == null
            ? 'Excel report ready: ${path.split(RegExp(r'[\\/]')).last}'
            : 'Saved the report, but no spreadsheet app could open it.',
        error: error != null,
      );
    } on ApiException catch (e) {
      if (mounted) showMessage(context, e.message, error: true);
    } catch (e) {
      if (mounted) {
        showMessage(context, 'Could not download Excel: $e', error: true);
      }
    } finally {
      if (mounted) setState(() => _downloadingId = null);
    }
  }

  Future<void> _openDetails(AdminAttendanceSession session) async {
    await Navigator.of(context).push<void>(
      MaterialPageRoute(
        builder: (_) =>
            AttendanceSessionDetailScreen(session: session, service: _service),
      ),
    );
    if (mounted) _loadHistory(silent: true);
  }

  Future<void> _logout() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
        title: const Text('Log out?'),
        content: const Text(
          'Your admin session will be cleared and you will return to the login screen.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Logout'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    await session.logout();
    // The router's redirect sends signed-out users to /login.
  }

  // ---------------------------------------------------------------- build

  @override
  Widget build(BuildContext context) {
    if (!(session.user?.isAdmin ?? false)) {
      return _facultyGate();
    }

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 28,
              height: 28,
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(8),
              ),
              clipBehavior: Clip.antiAlias,
              padding: const EdgeInsets.all(3),
              child: Image.asset('assets/images/logo.png', fit: BoxFit.contain),
            ),
            const SizedBox(width: 10),
            const Text('Attendance Dashboard'),
          ],
        ),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: TextButton.icon(
              onPressed: _logout,
              icon: const Icon(Icons.logout_rounded, size: 18),
              label: const Text(
                'Logout',
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
              ),
              style: TextButton.styleFrom(
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 8,
                ),
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
            ),
          ),
        ],
      ),
      body: SafeArea(
        child: RefreshIndicator(
          color: AppColors.teal,
          onRefresh: () async {
            await Future.wait([
              _loadClasses(),
              _loadHistory(silent: true),
              _syncPending(silent: true),
            ]);
          },
          child: LayoutBuilder(
            builder: (context, constraints) {
              final wide = constraints.maxWidth >= 900;
              final startCard = _buildStartCard();
              final historyCard = _buildHistoryCard();
              return ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  _buildHeader(),
                  const SizedBox(height: 16),
                  if (wide)
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(flex: 4, child: startCard),
                        const SizedBox(width: 16),
                        Expanded(flex: 5, child: historyCard),
                      ],
                    )
                  else ...[
                    startCard,
                    const SizedBox(height: 16),
                    historyCard,
                  ],
                  const SizedBox(height: 24),
                ],
              );
            },
          ),
        ),
      ),
    );
  }

  Widget _facultyGate() {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Attendance'),
        actions: [
          TextButton.icon(
            onPressed: _logout,
            icon: const Icon(Icons.logout_rounded, size: 18),
            label: const Text('Logout'),
            style: TextButton.styleFrom(foregroundColor: Colors.white),
          ),
        ],
      ),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(
                Icons.admin_panel_settings_outlined,
                size: 56,
                color: AppColors.muted,
              ),
              const SizedBox(height: 12),
              const Text(
                'Admin access required',
                style: TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.w700,
                  color: AppColors.navy,
                ),
              ),
              const SizedBox(height: 6),
              const Text(
                'The attendance dashboard is available to admin accounts. '
                'Sign out and log in with an admin ID to take attendance.',
                textAlign: TextAlign.center,
                style: TextStyle(color: AppColors.muted, height: 1.5),
              ),
              const SizedBox(height: 18),
              FilledButton.icon(
                onPressed: _logout,
                icon: const Icon(Icons.logout_rounded),
                label: const Text('Logout'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildHeader() {
    final name = session.user?.fullName ?? 'Administrator';
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [AppColors.navy, AppColors.navyLight],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Welcome, $name',
            style: const TextStyle(
              color: Colors.white,
              fontSize: 17,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 4),
          const Text(
            'Start a session, scan student QR codes and review past attendance.',
            style: TextStyle(color: Colors.white70, fontSize: 12, height: 1.4),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _pill(
                _online ? Icons.wifi_rounded : Icons.wifi_off_rounded,
                _online ? 'Online' : 'Offline',
                _online ? AppColors.tealLight : AppColors.late,
              ),
              if (_pending > 0)
                _pill(
                  Icons.cloud_upload_outlined,
                  '$_pending pending sync',
                  AppColors.late,
                ),
              if (_pending > 0)
                TextButton.icon(
                  onPressed: _syncing ? null : () => _syncPending(),
                  icon: _syncing
                      ? const SizedBox.square(
                          dimension: 14,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Icon(Icons.sync_rounded, size: 16),
                  label: const Text(
                    'Sync now',
                    style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600),
                  ),
                  style: TextButton.styleFrom(
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(horizontal: 10),
                    minimumSize: const Size(0, 30),
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _pill(IconData icon, String label, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.22),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: Colors.white),
          const SizedBox(width: 6),
          Text(
            label,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 11,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }

  // ---------------------------------------------------------------- start card

  Widget _buildStartCard() {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
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
                    Icons.play_circle_outline_rounded,
                    color: AppColors.teal,
                    size: 20,
                  ),
                ),
                const SizedBox(width: 10),
                const Expanded(
                  child: Text(
                    'Start Attendance',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: AppColors.navy,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Form(
              key: _formKey,
              child: Column(
                children: [
                  TextFormField(
                    controller: _teacher,
                    textCapitalization: TextCapitalization.words,
                    decoration: const InputDecoration(
                      labelText: 'Teacher Name *',
                      hintText: 'e.g. Dr. Rajesh Kumar',
                      prefixIcon: Icon(Icons.person_outline_rounded),
                    ),
                    validator: (v) => (v ?? '').trim().isEmpty
                        ? 'Enter the teacher name'
                        : null,
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _classBranch,
                    textCapitalization: TextCapitalization.words,
                    decoration: const InputDecoration(
                      labelText: 'Class / Branch *',
                      hintText: 'e.g. IT · Semester 3 · Group B',
                      prefixIcon: Icon(Icons.apartment_rounded),
                    ),
                    validator: (v) => (v ?? '').trim().isEmpty
                        ? 'Enter the class / branch'
                        : null,
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _room,
                    textCapitalization: TextCapitalization.characters,
                    decoration: const InputDecoration(
                      labelText: 'Room Number *',
                      hintText: 'e.g. Lab 2, 2nd Floor',
                      prefixIcon: Icon(Icons.meeting_room_outlined),
                    ),
                    validator: (v) => (v ?? '').trim().isEmpty
                        ? 'Enter the room number'
                        : null,
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _subject,
                    textCapitalization: TextCapitalization.words,
                    decoration: const InputDecoration(
                      labelText: 'Subject *',
                      hintText: 'e.g. Data Structures',
                      prefixIcon: Icon(Icons.menu_book_outlined),
                    ),
                    validator: (v) =>
                        (v ?? '').trim().isEmpty ? 'Enter the subject' : null,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: _starting ? null : _startAttendance,
              icon: _starting
                  ? const SizedBox.square(
                      dimension: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Icon(Icons.qr_code_scanner_rounded),
              label: Text(_starting ? 'Starting…' : 'Start Attendance'),
            ),
            const SizedBox(height: 8),
            const Text(
              'The camera scanner opens as soon as the session starts.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 11, color: AppColors.muted),
            ),
          ],
        ),
      ),
    );
  }

  // ---------------------------------------------------------------- history card

  Widget _buildHistoryCard() {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: AppColors.lightBlue,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(
                    Icons.history_rounded,
                    color: AppColors.navy,
                    size: 20,
                  ),
                ),
                const SizedBox(width: 10),
                const Expanded(
                  child: Text(
                    'Attendance History',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: AppColors.navy,
                    ),
                  ),
                ),
                IconButton(
                  tooltip: 'Refresh history',
                  onPressed: _loadingHistory ? null : () => _loadHistory(),
                  icon: const Icon(Icons.refresh_rounded, size: 20),
                ),
              ],
            ),
            const SizedBox(height: 8),
            if (_historyError != null)
              NoticeBox(message: _historyError!)
            else if (_loadingHistory && _sessions.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 28),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (_sessions.isEmpty)
              const EmptyView(
                icon: Icons.event_busy_rounded,
                title: 'No attendance sessions yet',
                message:
                    'Sessions you submit appear here with an Excel report.',
              )
            else
              ..._sessions.map(_buildSessionTile),
          ],
        ),
      ),
    );
  }

  Widget _buildSessionTile(AdminAttendanceSession session) {
    final status = session.displayStatus;
    final color = switch (status) {
      'active' => AppColors.present,
      'expired' => AppColors.late,
      'cancelled' => AppColors.absent,
      'scheduled' => AppColors.info,
      _ => AppColors.muted,
    };
    final canDownload = session.markedCount > 0;

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.background,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  session.subject.isEmpty
                      ? 'Attendance session'
                      : session.subject,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: AppColors.navy,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              StatusChip(
                status.isEmpty
                    ? 'session'
                    : status[0].toUpperCase() + status.substring(1),
                color: color,
              ),
            ],
          ),
          const SizedBox(height: 6),
          Wrap(
            spacing: 12,
            runSpacing: 2,
            children: [
              _meta(Icons.schedule_rounded, formatDateTime(session.startsAt)),
              _meta(
                Icons.person_outline_rounded,
                session.teacherName.isEmpty ? 'Teacher —' : session.teacherName,
              ),
              _meta(Icons.apartment_rounded, session.classLabel),
              _meta(
                Icons.meeting_room_outlined,
                'Room ${session.room.isEmpty ? '—' : session.room}',
              ),
            ],
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 6,
            children: [
              _count('${session.presentCount}', 'present', AppColors.present),
            ],
          ),
          const SizedBox(height: 10),
          if (session.isOpen) ...[
            FilledButton.icon(
              onPressed: () => _resumeScanning(session),
              icon: const Icon(Icons.qr_code_scanner_rounded, size: 18),
              label: const Text('Continue scanning'),
              style: FilledButton.styleFrom(
                minimumSize: const Size.fromHeight(42),
                backgroundColor: AppColors.navy,
              ),
            ),
            const SizedBox(height: 8),
          ],
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => _openDetails(session),
                  icon: const Icon(Icons.visibility_outlined, size: 18),
                  label: const Text('View Details'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: FilledButton.icon(
                  onPressed: canDownload && _downloadingId == null
                      ? () => _downloadExcel(session)
                      : null,
                  icon: _downloadingId == session.id
                      ? const SizedBox.square(
                          dimension: 16,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Icon(Icons.download_rounded, size: 18),
                  label: const Text('Excel'),
                  style: FilledButton.styleFrom(
                    minimumSize: const Size.fromHeight(42),
                    backgroundColor: AppColors.teal,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _meta(IconData icon, String text) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 13, color: AppColors.muted),
        const SizedBox(width: 4),
        Text(
          text,
          style: const TextStyle(fontSize: 11, color: AppColors.muted),
        ),
      ],
    );
  }

  Widget _count(String value, String label, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        '$value $label',
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          color: color,
        ),
      ),
    );
  }
}
