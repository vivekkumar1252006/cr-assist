import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api_client.dart';
import 'format.dart';
import 'models.dart';

/// Outcome of one QR scan.
class ScanOutcome {
  const ScanOutcome({
    required this.studentName,
    required this.enrollmentNumber,
    required this.status,
    this.markedAt,
    this.duplicate = false,
  });

  final String studentName;
  final String enrollmentNumber;
  final String status;
  final DateTime? markedAt;
  final bool duplicate;
}

/// A scan that could not reach the server yet.
class PendingScan {
  const PendingScan({
    required this.sessionId,
    required this.token,
    required this.queuedAt,
    this.enrollmentNumber = '',
    this.scanTime,
  });

  factory PendingScan.fromJson(Map<String, dynamic> json) => PendingScan(
    sessionId: asInt(json['sessionId']),
    token: json['token'] as String? ?? '',
    queuedAt: parseDate(json['queuedAt']) ?? DateTime.now(),
    enrollmentNumber: (json['enrollmentNumber'] as String? ?? '').trim(),
    scanTime: parseDate(json['scanTime']),
  );

  final int sessionId;
  final String token;
  final DateTime queuedAt;
  final String enrollmentNumber;
  final DateTime? scanTime;

  Map<String, dynamic> toJson() => {
    'sessionId': sessionId,
    'token': token,
    'queuedAt': queuedAt.toIso8601String(),
    'enrollmentNumber': enrollmentNumber,
    if (scanTime != null) 'scanTime': scanTime!.toIso8601String(),
  };

  String get key => '$sessionId|$token';
}

/// Result of flushing the offline queue.
class SyncReport {
  const SyncReport({
    this.synced = 0,
    this.rejected = 0,
    this.remaining = 0,
    this.offline = false,
    this.message,
  });

  final int synced;
  final int rejected;
  final int remaining;
  final bool offline;
  final String? message;

  bool get hasWork => synced > 0 || rejected > 0 || remaining > 0;
}

/// Admin attendance API + offline queue.
///
/// Everything here talks to the existing portal backend:
///   `GET  /api/admin/classes`
///   `POST /api/admin/attendance/sessions`
///   `GET  /api/admin/attendance/sessions`
///   `PATCH /api/admin/attendance/sessions/:id/status`
///   `GET  /api/admin/attendance/records?sessionId=…`
///   `GET  /api/admin/attendance/sessions/:id/report`  (xlsx)
///   `POST /api/attendance/mark`
///
/// Scans that fail because the phone is offline are stored in
/// SharedPreferences and replayed later, so the same session shows up in the
/// web admin's Attendance History once the connection returns.
class AdminAttendanceService {
  AdminAttendanceService(this._api);

  static const _queueKey = 'admin_attendance_queue_v1';
  static const _closesKey = 'admin_attendance_pending_closes_v1';

  final ApiClient _api;
  SharedPreferences? _prefs;

  Future<SharedPreferences> get _store async =>
      _prefs ??= await SharedPreferences.getInstance();

  // ---------------------------------------------------------------- connectivity

  /// Whether the phone currently has any usable network connection.
  Future<bool> isOnline() async {
    try {
      final results = await Connectivity().checkConnectivity();
      return results.any((r) => r != ConnectivityResult.none);
    } catch (_) {
      return true; // Unknown: let the request decide.
    }
  }

  Stream<bool> get onlineChanges => Connectivity().onConnectivityChanged.map(
    (results) => results.any((r) => r != ConnectivityResult.none),
  );

  // ---------------------------------------------------------------- reference data

  Future<List<AdminClass>> fetchClasses() async {
    final res = await _api.get('/admin/classes');
    final rows = res['classes'];
    if (rows is! List) return const [];
    final seen = <String>{};
    final classes = <AdminClass>[];
    for (final raw in rows) {
      if (raw is! Map) continue;
      final item = AdminClass.fromJson(Map<String, dynamic>.from(raw));
      if (item.course.isEmpty || item.semester <= 0) continue;
      if (!seen.add(item.key)) continue;
      classes.add(item);
    }
    classes.sort((a, b) {
      final byCourse = a.course.compareTo(b.course);
      if (byCourse != 0) return byCourse;
      final bySemester = a.semester.compareTo(b.semester);
      if (bySemester != 0) return bySemester;
      return (a.group ?? '').compareTo(b.group ?? '');
    });
    return classes;
  }

  // ---------------------------------------------------------------- sessions

  /// Creates a session that stays open for three hours, like the web admin.
  Future<AdminAttendanceSession> createSession({
    required String teacherName,
    required String classBranch,
    required String room,
    required String subject,
    AdminClass? adminClass,
  }) async {
    final startsAt = DateTime.now();
    final endsAt = startsAt.add(const Duration(hours: 3));
    final payload = <String, dynamic>{
      'subject': subject,
      'classBranch': classBranch,
      'facultyName': teacherName,
      'room': room,
      'startsAt': startsAt.toUtc().toIso8601String(),
      'endsAt': endsAt.toUtc().toIso8601String(),
      'status': 'active',
    };
    if (adminClass != null) {
      payload['course'] = adminClass.course;
      payload['semester'] = adminClass.semester;
      if (adminClass.group != null) {
        payload['studentGroup'] = adminClass.group;
      }
    }
    final res = await _api.post('/admin/attendance/sessions', payload);

    final id = asInt(res['sessionId']);
    if (id <= 0) {
      throw ApiException(
        'The server did not return an attendance session id. Please try again.',
      );
    }
    final sessionData = res['session'] as Map<String, dynamic>?;
    if (sessionData != null) {
      return AdminAttendanceSession(
        id: id,
        subject: (sessionData['subject'] as String? ?? subject).trim(),
        course: (sessionData['course'] as String? ?? adminClass?.course ?? classBranch).trim(),
        semester: asInt(sessionData['semester'] ?? adminClass?.semester ?? 1),
        group: (sessionData['studentGroup'] as String? ?? adminClass?.group)?.trim(),
        classBranch: (sessionData['classBranch'] as String? ?? sessionData['class_branch'] as String? ?? classBranch).trim(),
        room: (sessionData['room'] as String? ?? room).trim(),
        teacherName: (sessionData['facultyName'] as String? ?? teacherName).trim(),
        status: 'active',
        startsAt: startsAt,
        endsAt: endsAt,
        eligibleStudents: asInt(sessionData['eligibleStudents'] ?? adminClass?.studentCount ?? 0),
      );
    }

    return AdminAttendanceSession(
      id: id,
      subject: subject,
      course: adminClass?.course ?? classBranch,
      semester: adminClass?.semester ?? 1,
      group: adminClass?.group,
      classBranch: classBranch,
      room: room,
      teacherName: teacherName,
      status: 'active',
      startsAt: startsAt,
      endsAt: endsAt,
      eligibleStudents: adminClass?.studentCount ?? 0,
    );
  }

  Future<List<AdminAttendanceSession>> fetchSessions() async {
    final res = await _api.get('/admin/attendance/sessions');
    final rows = res['sessions'];
    if (rows is! List) return const [];
    return rows
        .whereType<Map>()
        .map(
          (e) => AdminAttendanceSession.fromJson(Map<String, dynamic>.from(e)),
        )
        .toList();
  }

  /// Closes a session. When the phone is offline the close is queued so it can
  /// run right after the pending scans for that session have been synced.
  Future<bool> closeSession(int sessionId) async {
    try {
      await _patchStatus(sessionId, 'closed');
      await _removePendingClose(sessionId);
      return true;
    } on ApiException catch (e) {
      if (e.statusCode == null) {
        await _queueClose(sessionId);
        return false;
      }
      rethrow;
    }
  }

  Future<void> _patchStatus(int sessionId, String status) async {
    await _api.patch('/admin/attendance/sessions/$sessionId/status', {
      'status': status,
    });
  }

  // ---------------------------------------------------------------- records

  Future<List<AdminAttendanceRecord>> fetchRecords(int sessionId) async {
    final res = await _api.get(
      '/admin/attendance/records',
      query: {'sessionId': sessionId, 'limit': 100},
    );
    final rows = res['records'];
    if (rows is! List) return const [];
    return rows
        .whereType<Map>()
        .map(
          (e) => AdminAttendanceRecord.fromJson(Map<String, dynamic>.from(e)),
        )
        .toList();
  }

  // ---------------------------------------------------------------- scanning

  /// Marks one QR token online. Throws [ApiException] on failure.
  Future<ScanOutcome> markAttendance({
    required String token,
    required int sessionId,
  }) async {
    final res = await _api.post('/attendance/mark', {
      'token': token,
      'sessionId': sessionId,
    });
    final student = res['student'];
    final map = student is Map
        ? Map<String, dynamic>.from(student)
        : const <String, dynamic>{};
    return ScanOutcome(
      studentName: (map['fullName'] as String? ?? '').trim(),
      enrollmentNumber: (map['enrollmentNumber'] as String? ?? '').trim(),
      status: (res['status'] as String? ?? 'present').trim(),
      markedAt: parseDate(res['markedAt']) ?? DateTime.now(),
    );
  }

  /// Stores a scan for later replay. Duplicate tokens are ignored.
  Future<void> queueScan({
    required String token,
    required int sessionId,
    String enrollmentNumber = '',
    DateTime? scanTime,
  }) async {
    final queue = await _readQueue();
    if (queue.any((s) => s.sessionId == sessionId && s.token == token)) return;
    if (enrollmentNumber.isNotEmpty &&
        queue.any((s) => s.sessionId == sessionId && s.enrollmentNumber == enrollmentNumber)) {
      return;
    }
    queue.add(
      PendingScan(
        sessionId: sessionId,
        token: token,
        queuedAt: DateTime.now(),
        enrollmentNumber: enrollmentNumber.trim(),
        scanTime: scanTime ?? DateTime.now(),
      ),
    );
    await _writeQueue(queue);
  }

  Future<List<PendingScan>> pendingScans() => _readQueue();

  Future<int> pendingCount() async => (await _readQueue()).length;

  /// Replays every queued scan. Network failures keep the entry; permanent
  /// rejections (invalid/unknown QR, closed session) are dropped and counted.
  Future<SyncReport> syncPendingScans() async {
    final queue = await _readQueue();
    if (queue.isEmpty) {
      await _flushPendingCloses();
      return const SyncReport();
    }

    final remaining = <PendingScan>[];
    final seen = <String>{};
    final seenEnrollments = <String>{};
    var synced = 0;
    var rejected = 0;
    var offline = false;
    String? message;

    for (final scan in queue) {
      if (!seen.add(scan.key)) continue; // duplicate inside the queue
      if (scan.enrollmentNumber.isNotEmpty) {
        if (!seenEnrollments.add(scan.enrollmentNumber)) {
          continue;
        }
      }
      try {
        await markAttendance(token: scan.token, sessionId: scan.sessionId);
        synced++;
      } on ApiException catch (e) {
        if (e.code == 'ALREADY_MARKED') {
          synced++;
          continue;
        }
        if (e.statusCode == null) {
          offline = true;
          remaining.add(scan);
          continue;
        }
        rejected++;
        message ??= e.message;
      } catch (_) {
        offline = true;
        remaining.add(scan);
      }
    }

    await _writeQueue(remaining);
    await _flushPendingCloses();

    return SyncReport(
      synced: synced,
      rejected: rejected,
      remaining: remaining.length,
      offline: offline,
      message: message,
    );
  }

  // ---------------------------------------------------------------- excel report

  /// Downloads the server-generated Excel report for [session] and returns its
  /// local path. The workbook is the same one the web admin downloads.
  Future<String> downloadSessionReport(AdminAttendanceSession session) async {
    final dir =
        await getExternalStorageDirectory() ??
        await getApplicationDocumentsDirectory();
    final day = session.startsAt == null
        ? ymd(DateTime.now())
        : ymd(session.startsAt!);
    final file = File('${dir.path}/attendance-session-${session.id}-$day.xlsx');
    try {
      if (await file.exists()) await file.delete();
      await _api.download(
        '/admin/attendance/sessions/${session.id}/report',
        file.path,
      );
      return file.path;
    } catch (_) {
      try {
        if (await file.exists()) await file.delete();
      } catch (_) {}
      rethrow;
    }
  }

  /// Hands a downloaded report to the phone's spreadsheet viewer.
  Future<String?> openFile(String path) async {
    final result = await OpenFilex.open(path);
    return result.type == ResultType.done ? null : result.message;
  }

  // ---------------------------------------------------------------- queue storage

  Future<List<PendingScan>> _readQueue() async {
    final prefs = await _store;
    final raw = prefs.getStringList(_queueKey) ?? const <String>[];
    final scans = <PendingScan>[];
    for (final line in raw) {
      try {
        final decoded = jsonDecode(line);
        if (decoded is Map) {
          scans.add(PendingScan.fromJson(Map<String, dynamic>.from(decoded)));
        }
      } catch (_) {
        // Skip a corrupt entry rather than blocking the whole queue.
      }
    }
    return scans;
  }

  Future<void> _writeQueue(List<PendingScan> scans) async {
    final prefs = await _store;
    await prefs.setStringList(
      _queueKey,
      scans.map((s) => jsonEncode(s.toJson())).toList(),
    );
  }

  Future<void> _queueClose(int sessionId) async {
    final prefs = await _store;
    final raw = prefs.getStringList(_closesKey) ?? const <String>[];
    if (raw.contains('$sessionId')) return;
    await prefs.setStringList(_closesKey, [...raw, '$sessionId']);
  }

  Future<void> _removePendingClose(int sessionId) async {
    final prefs = await _store;
    final raw = prefs.getStringList(_closesKey) ?? const <String>[];
    if (!raw.contains('$sessionId')) return;
    await prefs.setStringList(
      _closesKey,
      raw.where((id) => id != '$sessionId').toList(),
    );
  }

  /// Closes sessions that were submitted while offline, but only once every
  /// scan for that session has reached the server.
  Future<void> _flushPendingCloses() async {
    final prefs = await _store;
    final raw = prefs.getStringList(_closesKey) ?? const <String>[];
    if (raw.isEmpty) return;

    final queue = await _readQueue();
    final stillPending = <String>[];
    for (final id in raw) {
      final sessionId = int.tryParse(id);
      if (sessionId == null) continue;
      if (queue.any((scan) => scan.sessionId == sessionId)) {
        stillPending.add(id);
        continue;
      }
      try {
        await _patchStatus(sessionId, 'closed');
      } catch (_) {
        stillPending.add(id);
      }
    }
    await prefs.setStringList(_closesKey, stillPending);
  }
}
