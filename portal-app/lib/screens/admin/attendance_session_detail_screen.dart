import 'package:flutter/material.dart';

import '../../../core/admin_attendance_service.dart';
import '../../../core/api_client.dart';
import '../../../core/format.dart';
import '../../../core/models.dart';
import '../../../core/theme.dart';
import '../../../widgets/common.dart';

/// Full student list for one attendance session.
class AttendanceSessionDetailScreen extends StatefulWidget {
  const AttendanceSessionDetailScreen({
    super.key,
    required this.session,
    required this.service,
  });

  final AdminAttendanceSession session;
  final AdminAttendanceService service;

  @override
  State<AttendanceSessionDetailScreen> createState() =>
      _AttendanceSessionDetailScreenState();
}

class _AttendanceSessionDetailScreenState
    extends State<AttendanceSessionDetailScreen> {
  List<AdminAttendanceRecord> _records = const [];
  bool _loading = true;
  String? _error;
  bool _downloading = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final records = await widget.service.fetchRecords(widget.session.id);
      if (!mounted) return;
      setState(() {
        _records = records;
        _loading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = 'Could not load the student list: $e';
        _loading = false;
      });
    }
  }

  Future<void> _downloadExcel() async {
    if (_downloading) return;
    setState(() => _downloading = true);
    try {
      final path = await widget.service.downloadSessionReport(widget.session);
      final error = await widget.service.openFile(path);
      if (!mounted) return;
      showMessage(
        context,
        error == null
            ? 'Excel report downloaded.'
            : 'Saved, but it could not be opened.',
        error: error != null,
      );
    } on ApiException catch (e) {
      if (mounted) showMessage(context, e.message, error: true);
    } catch (e) {
      if (mounted) {
        showMessage(context, 'Could not download Excel: $e', error: true);
      }
    } finally {
      if (mounted) setState(() => _downloading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = widget.session;
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('Session Details'),
        actions: [
          IconButton(
            tooltip: 'Download Excel',
            onPressed: _records.isEmpty || _downloading ? null : _downloadExcel,
            icon: _downloading
                ? const SizedBox.square(
                    dimension: 18,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : const Icon(Icons.download_rounded),
          ),
        ],
      ),
      body: RefreshIndicator(
        color: AppColors.teal,
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            _buildHeader(session),
            const SizedBox(height: 16),
            _buildList(),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader(AdminAttendanceSession session) {
    // Prefer the freshly loaded records so the numbers never lag behind the
    // history card the user came from.
    final loaded = _records;
    final present = loaded.isEmpty
        ? session.presentCount
        : loaded.where((r) => r.status == 'present').length;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              session.subject.isEmpty ? 'Attendance session' : session.subject,
              style: const TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w800,
                color: AppColors.navy,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              '${session.classLabel} · Room ${session.room.isEmpty ? '—' : session.room}',
              style: const TextStyle(fontSize: 12, color: AppColors.muted),
            ),
            const SizedBox(height: 12),
            InfoRow(
              icon: Icons.person_outline_rounded,
              label: 'Teacher',
              value: session.teacherName.isEmpty ? '—' : session.teacherName,
            ),
            InfoRow(
              icon: Icons.schedule_rounded,
              label: 'Date & time',
              value: formatDateTime(session.startsAt),
            ),
            InfoRow(
              icon: Icons.verified_outlined,
              label: 'Status',
              value: session.displayStatus.isEmpty
                  ? '—'
                  : session.displayStatus[0].toUpperCase() +
                        session.displayStatus.substring(1),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                _stat('$present', 'Present', AppColors.present),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _stat(String value, String label, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            value,
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w800,
              color: color,
              height: 1.1,
            ),
          ),
          Text(
            label,
            style: TextStyle(
              fontSize: 10,
              color: color.withValues(alpha: 0.85),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildList() {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                const Icon(
                  Icons.groups_rounded,
                  size: 20,
                  color: AppColors.teal,
                ),
                const SizedBox(width: 8),
                const Expanded(
                  child: Text(
                    'Students marked',
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      color: AppColors.navy,
                    ),
                  ),
                ),
                StatusChip('${_records.length}', color: AppColors.teal),
              ],
            ),
            const SizedBox(height: 12),
            if (_loading)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 24),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (_error != null)
              NoticeBox(message: _error!)
            else if (_records.isEmpty)
              const EmptyView(
                icon: Icons.person_off_outlined,
                title: 'No students marked',
                message: 'No attendance was recorded for this session.',
              )
            else
              ..._records.map(_buildRecordRow),
          ],
        ),
      ),
    );
  }

  Widget _buildRecordRow(AdminAttendanceRecord record) {
    final color = switch (record.status) {
      'present' => AppColors.present,
      'late' => AppColors.late,
      'absent' => AppColors.absent,
      _ => AppColors.muted,
    };
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: AppColors.background,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          CircleAvatar(
            radius: 16,
            backgroundColor: color.withValues(alpha: 0.12),
            child: Text(
              initials(record.studentName.isEmpty ? '?' : record.studentName),
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: color,
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  record.studentName.isEmpty ? 'Student' : record.studentName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: AppColors.navy,
                  ),
                ),
                Text(
                  record.enrollmentNumber.isEmpty
                      ? '—'
                      : record.enrollmentNumber,
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
              StatusChip.attendance(record.status),
              const SizedBox(height: 2),
              Text(
                formatTime(record.markedAt),
                style: const TextStyle(fontSize: 10, color: AppColors.muted),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
