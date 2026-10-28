import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/format.dart';
import '../../../core/models.dart';
import '../../../core/services.dart';
import '../../../core/theme.dart';
import '../../../widgets/common.dart';
import './complaint_form_screen.dart';

class AttendanceHistoryScreen extends StatefulWidget {
  const AttendanceHistoryScreen({super.key});

  @override
  State<AttendanceHistoryScreen> createState() =>
      _AttendanceHistoryScreenState();
}

class _AttendanceHistoryScreenState extends State<AttendanceHistoryScreen> {
  String _selectedStatus = 'all';

  Future<Map<String, dynamic>> _loadHistory() async {
    final query = <String, dynamic>{'limit': 50};
    if (_selectedStatus != 'all') query['status'] = _selectedStatus;
    return api.get('/student/attendance', query: query);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Attendance Complaint')),
      body: Column(
        children: [
          // Filter Chips
          Container(
            color: Colors.white,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  for (final (id, label) in [
                    ('all', 'All Records'),
                    ('present', 'Present'),
                    ('late', 'Late'),
                    ('absent', 'Absent'),
                  ])
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: FilterChip(
                        label: Text(label),
                        selected: _selectedStatus == id,
                        onSelected: (val) {
                          if (val && _selectedStatus != id) {
                            setState(() => _selectedStatus = id);
                          }
                        },
                      ),
                    ),
                ],
              ),
            ),
          ),
          const Divider(height: 1),

          // History List
          Expanded(
            child: AsyncView(
              key: ValueKey(_selectedStatus),
              load: _loadHistory,
              builder: (context, data, reload) {
                final rows = (data['rows'] as List<dynamic>? ?? [])
                    .cast<Map<String, dynamic>>();

                if (rows.isEmpty) {
                  return EmptyView(
                    icon: Icons.history,
                    title: 'No attendance records',
                    message: _selectedStatus == 'all'
                        ? 'You do not have any recorded classes yet.'
                        : 'No records found matching the $_selectedStatus filter.',
                  );
                }

                return RefreshIndicator(
                  onRefresh: reload,
                  child: ListView.separated(
                    padding: const EdgeInsets.all(16),
                    itemCount: rows.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 10),
                    itemBuilder: (context, index) {
                      final r = rows[index];
                      final status = r['status'] as String? ?? 'absent';
                      final startsAt = parseDate(r['startsAt']);
                      final subject = r['subject'] as String? ?? 'Class';
                      final room = r['room'] as String? ?? 'TBA';
                      final faculty = r['facultyName'] as String? ?? 'Faculty';
                      final sessionId = asInt(r['sessionId']);
                      final localDate = startsAt != null ? ymd(startsAt) : null;

                      return Card(
                        child: Padding(
                          padding: const EdgeInsets.all(14),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Expanded(
                                    child: Text(
                                      subject,
                                      style: const TextStyle(
                                        fontWeight: FontWeight.w700,
                                        fontSize: 15,
                                        color: AppColors.navy,
                                      ),
                                    ),
                                  ),
                                  StatusChip.attendance(status),
                                ],
                              ),
                              const SizedBox(height: 6),
                              Row(
                                children: [
                                  const Icon(
                                    Icons.calendar_today,
                                    size: 14,
                                    color: AppColors.muted,
                                  ),
                                  const SizedBox(width: 4),
                                  Text(
                                    formatDay(startsAt),
                                    style: const TextStyle(
                                      fontSize: 12,
                                      color: AppColors.muted,
                                    ),
                                  ),
                                  const SizedBox(width: 12),
                                  const Icon(
                                    Icons.access_time,
                                    size: 14,
                                    color: AppColors.muted,
                                  ),
                                  const SizedBox(width: 4),
                                  Text(
                                    formatTime(startsAt),
                                    style: const TextStyle(
                                      fontSize: 12,
                                      color: AppColors.muted,
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 4),
                              Row(
                                children: [
                                  const Icon(
                                    Icons.meeting_room_outlined,
                                    size: 14,
                                    color: AppColors.muted,
                                  ),
                                  const SizedBox(width: 4),
                                  Text(
                                    'Room $room',
                                    style: const TextStyle(
                                      fontSize: 12,
                                      color: AppColors.muted,
                                    ),
                                  ),
                                  const SizedBox(width: 12),
                                  const Icon(
                                    Icons.person_outline,
                                    size: 14,
                                    color: AppColors.muted,
                                  ),
                                  const SizedBox(width: 4),
                                  Text(
                                    faculty,
                                    style: const TextStyle(
                                      fontSize: 12,
                                      color: AppColors.muted,
                                    ),
                                  ),
                                ],
                              ),
                              if (status == 'absent' || status == 'late') ...[
                                const SizedBox(height: 8),
                                const Divider(height: 1),
                                const SizedBox(height: 4),
                                Align(
                                  alignment: Alignment.centerRight,
                                  child: TextButton.icon(
                                    icon: const Icon(
                                      Icons.report_problem_outlined,
                                      size: 16,
                                    ),
                                    label: const Text(
                                      'Report Issue / Raise Complaint',
                                      style: TextStyle(fontSize: 12),
                                    ),
                                    onPressed: () {
                                      context.push(
                                        '/complaints/new',
                                        extra: ComplaintPrefill(
                                          sessionId: sessionId,
                                          date: localDate,
                                          subject: subject,
                                          category: status == 'absent'
                                              ? 'attendance_marked_absent'
                                              : 'attendance_not_recorded',
                                          currentStatus: status,
                                          requestedCorrection: 'present',
                                        ),
                                      );
                                    },
                                  ),
                                ),
                              ],
                            ],
                          ),
                        ),
                      );
                    },
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
