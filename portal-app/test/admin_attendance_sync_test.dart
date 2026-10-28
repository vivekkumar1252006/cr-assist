import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:smartattend_app/core/admin_attendance_service.dart';
import 'package:smartattend_app/core/api_client.dart';
import 'package:smartattend_app/core/models.dart';
import 'package:smartattend_app/core/services.dart';

/// Replaces the network call so the offline queue can be tested on its own.
class _FakeService extends AdminAttendanceService {
  _FakeService() : super(api);

  final List<String> marked = [];

  @override
  Future<ScanOutcome> markAttendance({
    required String token,
    required int sessionId,
  }) async {
    if (token == 'invalid') {
      throw ApiException(
        'This is not a valid SmartAttend student QR code.',
        statusCode: 400,
        code: 'QR_INVALID',
      );
    }
    if (token == 'already') {
      throw ApiException(
        'Already marked for this session.',
        statusCode: 409,
        code: 'ALREADY_MARKED',
      );
    }
    marked.add(token);
    return const ScanOutcome(
      studentName: 'Test Student',
      enrollmentNumber: 'EN-001',
      status: 'present',
    );
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('offline attendance queue', () {
    setUp(() => SharedPreferences.setMockInitialValues({}));

    test('queues a scan once per session and token', () async {
      final service = _FakeService();
      await service.queueScan(token: 'EN-001', sessionId: 7);
      await service.queueScan(token: 'EN-001', sessionId: 7);
      await service.queueScan(token: 'EN-001', sessionId: 8);

      expect(await service.pendingCount(), 2);
    });

    test('replays queued scans and drops permanent rejections', () async {
      final service = _FakeService();
      await service.queueScan(token: 'EN-001', sessionId: 7);
      await service.queueScan(token: 'already', sessionId: 7);
      await service.queueScan(token: 'invalid', sessionId: 7);

      final report = await service.syncPendingScans();

      expect(service.marked, ['EN-001']);
      expect(report.synced, 2); // marked + already-marked
      expect(report.rejected, 1); // invalid QR
      expect(report.remaining, 0);
      expect(await service.pendingCount(), 0);
    });

    test('keeps scans that fail because the server is unreachable', () async {
      final service = _UnreachableService();
      await service.queueScan(token: 'EN-002', sessionId: 3);

      final report = await service.syncPendingScans();

      expect(report.offline, isTrue);
      expect(report.remaining, 1);
      expect(await service.pendingCount(), 1);
    });
  });

  group('AdminAttendanceSession', () {
    test('treats an active session past its end time as expired', () {
      final expired = AdminAttendanceSession(
        id: 1,
        subject: 'DS',
        course: 'CSE',
        semester: 3,
        teacherName: 'Dr. Rao',
        status: 'active',
        startsAt: DateTime.now().subtract(const Duration(hours: 4)),
        endsAt: DateTime.now().subtract(const Duration(hours: 1)),
      );
      expect(expired.isExpired, isTrue);
      expect(expired.isOpen, isFalse);
      expect(expired.displayStatus, 'expired');
    });

    test('builds the class label used by the web admin', () {
      final session = AdminAttendanceSession(
        id: 2,
        subject: 'OS',
        course: 'CSE',
        semester: 5,
        group: 'A',
        teacherName: 'Dr. Rao',
        status: 'closed',
      );
      expect(session.classLabel, 'CSE · Sem 5 · Group A');
    });
  });
}

class _UnreachableService extends AdminAttendanceService {
  _UnreachableService() : super(api);

  @override
  Future<ScanOutcome> markAttendance({
    required String token,
    required int sessionId,
  }) async {
    throw ApiException('Cannot reach the SmartAttend server.');
  }
}
