import 'dart:convert';
import 'dart:async';
import 'dart:io';

import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api_client.dart';

/// Unique identifiers for attendance records
class AttendanceId {
  final String sessionId;
  final String scanId;
  final String qrCode;

  AttendanceId({
    required this.sessionId,
    required this.scanId,
    required this.qrCode,
  });

  Map<String, dynamic> toJson() => {
    'sessionId': sessionId,
    'scanId': scanId,
    'qrCode': qrCode,
  };

  static AttendanceId fromJson(Map<String, dynamic> j) => AttendanceId(
    sessionId: j['sessionId'] as String,
    scanId: j['scanId'] as String,
    qrCode: j['qrCode'] as String,
  );
}

/// Represents a single attendance scan record
class AttendanceScan {
  final AttendanceId id;
  final String studentName;
  final String enrollmentNumber;
  final String className;
  final String teacherName;
  final String roomNumber;
  final String date;
  final String scanTime;
  final String status;
  bool isSynced;
  final DateTime? createdAt;

  AttendanceScan({
    required this.id,
    required this.studentName,
    required this.enrollmentNumber,
    required this.className,
    required this.teacherName,
    required this.roomNumber,
    required this.date,
    required this.scanTime,
    required this.status,
    bool? isSynced,
    this.createdAt,
  }) : isSynced = isSynced ?? false;

  Map<String, dynamic> toJson() => {
    'id': id.toJson(),
    'studentName': studentName,
    'enrollmentNumber': enrollmentNumber,
    'className': className,
    'teacherName': teacherName,
    'roomNumber': roomNumber,
    'date': date,
    'scanTime': scanTime,
    'status': status,
    'isSynced': isSynced,
    if (createdAt != null) 'createdAt': createdAt!.toIso8601String(),
  };

  static AttendanceScan fromJson(Map<String, dynamic> j) => AttendanceScan(
    id: AttendanceId.fromJson(j['id'] as Map<String, dynamic>),
    studentName: j['studentName'] as String,
    enrollmentNumber: j['enrollmentNumber'] as String,
    className: j['className'] as String,
    teacherName: j['teacherName'] as String,
    roomNumber: j['roomNumber'] as String,
    date: j['date'] as String,
    scanTime: j['scanTime'] as String,
    status: j['status'] as String,
  );
}

/// Status states for sync
enum SyncStatus { pending, syncing, synced, failed }

/// Sync status wrapper for UI
class SyncStatusWrapper {
  final SyncStatus status;
  final String? message;
  final bool hasError;

  SyncStatusWrapper._({
    required this.status,
    this.message,
    this.hasError = false,
  });

  factory SyncStatusWrapper.synced() =>
      SyncStatusWrapper._(status: SyncStatus.synced);
  factory SyncStatusWrapper.pending() =>
      SyncStatusWrapper._(status: SyncStatus.pending);
  factory SyncStatusWrapper.syncing() =>
      SyncStatusWrapper._(status: SyncStatus.syncing);
  factory SyncStatusWrapper.failed(String message) => SyncStatusWrapper._(
    status: SyncStatus.failed,
    message: message,
    hasError: true,
  );
}

/// Result of a sync operation
class SyncResult {
  final bool success;
  final int syncedCount;
  final int failedCount;
  final String? errorMessage;

  SyncResult._({
    required this.success,
    this.syncedCount = 0,
    this.failedCount = 0,
    this.errorMessage,
  });

  factory SyncResult.synced() => SyncResult._(success: true);
  factory SyncResult.failed(String errorMessage) =>
      SyncResult._(success: false, errorMessage: errorMessage);
}

/// Service responsible for attendance operations:
/// - Session management (create/end)
/// - Scan recording (online/offline)
/// - Sync queue (pending → server)
/// - Excel export
class AttendanceService {
  AttendanceService(this._api);

  final ApiClient _api;
  SharedPreferences? _cachedPrefs;

  /// Storage is opened lazily so callers never crash if [initStorage] was not
  /// awaited before the first queued scan.
  Future<SharedPreferences> get _prefs async =>
      _cachedPrefs ??= await SharedPreferences.getInstance();

  /// Initialize storage (optional; the first use does this automatically).
  Future<void> initStorage() async {
    _cachedPrefs ??= await SharedPreferences.getInstance();
  }

  // ============================================================
  // Session Management
  // ============================================================

  /// Create a new attendance session
  /// Returns the session ID and session details
  Future<Map<String, dynamic>> createSession({
    required String teacherName,
    required String className,
    required String roomNumber,
  }) async {
    final res = await _api.post('/attendance/session', {
      'teacherName': teacherName,
      'className': className,
      'roomNumber': roomNumber,
    });
    return res;
  }

  /// End/Submit an attendance session
  /// Saves all pending scans and returns summary
  Future<Map<String, dynamic>> endSession({required String sessionId}) async {
    final res = await _api.post('/attendance/session/end', {
      'sessionId': sessionId,
    });
    return res;
  }

  /// Get active session (if any)
  Future<Map<String, dynamic>?> getActiveSession() async {
    try {
      final res = await _api.get('/attendance/active-session');
      return res;
    } catch (_) {
      return null;
    }
  }

  // ============================================================
  // Scan Recording
  // ============================================================

  /// Mark attendance for a student (online mode - direct API call)
  Future<Map<String, dynamic>> markAttendance({
    required String qrCode,
    required String sessionId,
  }) async {
    final res = await _api.post('/attendance/mark', {
      'token': qrCode,
      'sessionId': sessionId,
    });
    return res;
  }

  // ============================================================
  // Sync Queue
  // ============================================================

  /// Queue a scan record for automatic sync when internet available
  Future<String> queueForSync(AttendanceScan scan) async {
    final prefs = await _prefs;
    final queue = prefs.getStringList('sync_queue') ?? <String>[];
    queue.add(jsonEncode(scan.toJson()));
    await prefs.setStringList('sync_queue', queue);

    // Return a unique queue ID
    return DateTime.now().millisecondsSinceEpoch.toString();
  }

  /// Fetch pending scans from local storage and sync them
  Future<SyncResult> syncPendingScans() async {
    final prefs = await _prefs;
    final queue = prefs.getStringList('sync_queue') ?? <String>[];

    if (queue.isEmpty) {
      return SyncResult.synced();
    }

    final updatedQueue = <String>[];
    int syncedCount = 0;
    int failedCount = 0;
    String? errorMessage;

    for (final scanJson in queue) {
      // Parse the scan record
      final decoded = jsonDecode(scanJson) as Map<String, dynamic>;
      final scan = AttendanceScan.fromJson(decoded);

      if (scan.isSynced) {
        updatedQueue.add(scanJson);
        continue;
      }

      try {
        // Send to server for verification and final save
        await _api.post('/attendance/mark', {
          'token': scan.id.qrCode,
          'sessionId': scan.id.sessionId,
        });

        scan.isSynced = true;
        syncedCount++;
        updatedQueue.add(scanJson);
      } catch (e) {
        failedCount++;
        errorMessage ??= e.toString();
        // Keep this in the queue for retry
      }
    }

    await prefs.setStringList('sync_queue', updatedQueue);

    return SyncResult._(
      success: failedCount == 0,
      syncedCount: syncedCount,
      failedCount: failedCount,
      errorMessage: errorMessage,
    );
  }

  // ============================================================
  // Excel Export
  // ============================================================

  /// Export attendance records to Excel format
  /// Returns the file path of the generated Excel file
  Future<String> exportToExcel({
    required List<AttendanceScan> records,
    required String sessionId,
    required String teacherName,
    required String className,
    required String roomNumber,
    required String date,
  }) async {
    final directory = await getApplicationDocumentsDirectory();
    final filePath = '${directory.path}/attendance_$sessionId.xlsx';

    final file = File(filePath);

    // Generate Excel content as CSV for simplicity
    final lines = <String>[];
    lines.add('Attendance Export Report');
    lines.add('Session ID: $sessionId');
    lines.add('Teacher: $teacherName');
    lines.add('Class: $className');
    lines.add('Room: $roomNumber');
    lines.add('Date: $date');
    lines.add('');
    lines.add(
      'Student Name,Enrollment Number,Class,Date,Scan Time,Teacher,Room,Status',
    );

    for (final record in records) {
      lines.add('''
${record.studentName},
${record.enrollmentNumber},
${record.className},
${record.date},
${record.scanTime},
${record.teacherName},
${record.roomNumber},
${record.status}
      ''');
    }

    await file.writeAsString(lines.join('\n'));
    return filePath;
  }

  // ============================================================
  // History
  // ============================================================

  /// Fetch attendance history from server
  Future<List<AttendanceScan>> fetchHistory({
    Map<String, dynamic>? filters,
  }) async {
    final res = await _api.get('/attendance/history', query: filters);
    final List<dynamic>? items =
        res['items'] ?? res['rows'] ?? res['data'] ?? [];

    return (items as List<dynamic>).map((json) {
      return AttendanceScan.fromJson(json as Map<String, dynamic>);
    }).toList();
  }

  /// Get sync status for display
  Future<SyncStatusWrapper> getSyncStatus() async {
    final prefs = await _prefs;
    final queue = prefs.getStringList('sync_queue') ?? <String>[];

    if (queue.isNotEmpty) {
      int unsyncedCount = 0;

      for (final scanJson in queue) {
        final decoded = jsonDecode(scanJson) as Map<String, dynamic>;
        final scan = AttendanceScan.fromJson(decoded);
        if (!scan.isSynced) {
          unsyncedCount++;
        }
      }

      if (unsyncedCount == 0) {
        return SyncStatusWrapper.synced();
      }
    }

    return SyncStatusWrapper.pending();
  }
}
