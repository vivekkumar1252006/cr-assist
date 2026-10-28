import 'package:flutter_test/flutter_test.dart';
import 'package:smartattend_app/core/models.dart';
import 'package:smartattend_app/core/services.dart';

ApkRelease _release({String versionName = '1.0.0', int versionCode = 1}) =>
    ApkRelease(
      id: 1,
      appName: 'CR Assist',
      versionName: versionName,
      versionCode: versionCode,
      fileName: 'app.apk',
      fileSize: 1024,
      downloadUrl: '/api/apk/download',
      uploaderName: 'Admin',
      isAvailable: true,
    );

void main() {
  group('compareVersionNames', () {
    test('compares each numeric component', () {
      expect(compareVersionNames('1.2.10', '1.2.9'), greaterThan(0));
      expect(compareVersionNames('1.2', '1.2.0'), 0);
      expect(compareVersionNames('2.0.0', '1.9.9'), greaterThan(0));
      expect(compareVersionNames('1.0.0', '1.1'), lessThan(0));
    });

    test('ignores non-numeric suffixes', () {
      expect(compareVersionNames('1.2.0-beta', '1.2.0'), 0);
      expect(compareVersionNames('v1.3', '1.2.9'), greaterThan(0));
    });
  });

  group('UpdateService.isNewer', () {
    final service = UpdateService(api);

    test('uses version name when it differs', () {
      expect(
        service.isNewer(
          _release(versionName: '1.0.2', versionCode: 1),
          const AppBuildInfo(version: '1.0.1', buildNumber: '2005'),
        ),
        isTrue,
      );
      expect(
        service.isNewer(
          _release(versionName: '1.0.0', versionCode: 9999),
          const AppBuildInfo(version: '1.0.1', buildNumber: '2005'),
        ),
        isFalse,
      );
    });

    test('falls back to version code only when names match', () {
      expect(
        service.isNewer(
          _release(versionName: '1.0.1', versionCode: 2006),
          const AppBuildInfo(version: '1.0.1', buildNumber: '2005'),
        ),
        isTrue,
      );
      expect(
        service.isNewer(
          _release(versionName: '1.0.1', versionCode: 2005),
          const AppBuildInfo(version: '1.0.1', buildNumber: '2005'),
        ),
        isFalse,
      );
    });

    test('never reports an update for an unknown build code', () {
      expect(
        service.isNewer(
          _release(versionName: '1.0.1', versionCode: 2006),
          const AppBuildInfo(version: '1.0.1'),
        ),
        isFalse,
      );
    });
  });
}
