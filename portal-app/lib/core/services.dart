import 'dart:io';
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:open_filex/open_filex.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:permission_handler/permission_handler.dart';

import 'api_client.dart';
import 'models.dart';
import 'session.dart';

/// App-wide singletons. The app is small enough that a DI framework isn't needed.
final api = ApiClient();
final session = Session(api);
final aboutService = AboutService(api);
final updateService = UpdateService(api);
final noticeService = NoticeService(api);

/// The version of the app that is currently installed.
class AppBuildInfo {
  const AppBuildInfo({required this.version, this.buildNumber});

  final String version;
  final String? buildNumber;

  int? get buildCode {
    final value = buildNumber?.trim();
    return value == null || value.isEmpty ? null : int.tryParse(value);
  }

  String get label => buildNumber == null || buildNumber!.isEmpty
      ? version
      : '$version ($buildNumber)';
}

/// Result of asking Android to launch the package installer.
class ApkInstallResult {
  const ApkInstallResult(this.success, this.message);

  final bool success;
  final String message;
}

/// Reads the published APK release and installs downloaded updates.
///
/// The release is always read from `GET /api/apk/latest`, which is backed by the
/// Admin Panel's upload endpoint. No version number or APK URL is hardcoded here.
class UpdateService {
  UpdateService(this._api);

  final ApiClient _api;

  /// Reads the installed version from the platform (pubspec `version:`).
  Future<AppBuildInfo> currentAppInfo() async {
    final info = await PackageInfo.fromPlatform();
    return AppBuildInfo(version: info.version, buildNumber: info.buildNumber);
  }

  /// Returns the newest published APK, or `null` when nothing has been uploaded.
  Future<ApkRelease?> fetchLatestRelease() async {
    final res = await _api.get('/apk/latest');
    final raw = res['apk'];
    if (raw is! Map) return null;
    return ApkRelease.fromJson(Map<String, dynamic>.from(raw));
  }

  /// Whether [release] is newer than the installed build.
  ///
  /// The published `versionName` is compared first because that is what the
  /// admin and the student see; `versionCode` breaks ties (for example when a
  /// rebuild keeps the same name). A release is never treated as older solely
  /// because of a missing or inconsistent version code.
  bool isNewer(ApkRelease release, AppBuildInfo current) {
    final nameComparison = compareVersionNames(
      release.versionName,
      current.version,
    );
    if (nameComparison != 0) return nameComparison > 0;

    final currentCode = current.buildCode;
    return release.versionCode > 0 &&
        currentCode != null &&
        currentCode > 0 &&
        release.versionCode > currentCode;
  }

  /// Downloads [release] to [savePath], reporting progress as bytes arrive.
  ///
  /// The URL comes from the release record. The release id is appended so the
  /// file that arrives is the exact version the student was shown, even if an
  /// administrator publishes another APK in the meantime.
  Future<void> downloadRelease(
    ApkRelease release,
    String savePath, {
    void Function(int received, int total)? onProgress,
    CancelToken? cancelToken,
  }) async {
    final base = release.downloadUrl?.trim();
    if (base == null || base.isEmpty) {
      throw ApiException(
        'The server did not provide a download URL for this update. Please try again later.',
      );
    }
    final path = release.id > 0
        ? '$base${base.contains('?') ? '&' : '?'}id=${release.id}'
        : base;

    try {
      await _api.download(
        path,
        savePath,
        onProgress: onProgress,
        cancelToken: cancelToken,
      );
    } catch (_) {
      // Never leave a truncated APK behind: the installer would reject it and
      // the next attempt could reuse the partial file.
      try {
        final file = File(savePath);
        if (await file.exists()) await file.delete();
      } catch (_) {
        // Best-effort cleanup only.
      }
      rethrow;
    }
  }

  /// Opens Android's package installer for a downloaded APK.
  ///
  /// Requests the "install unknown apps" permission first (Android 8+). The
  /// package installer itself still validates signatures and shows the final
  /// confirmation to the student.
  Future<ApkInstallResult> installApk(String filePath) async {
    try {
      final file = File(filePath);
      if (!await file.exists()) {
        return const ApkInstallResult(
          false,
          'The downloaded update file is missing. Please download it again.',
        );
      }
      if (await file.length() == 0) {
        return const ApkInstallResult(
          false,
          'The downloaded update file is empty. Please download it again.',
        );
      }

      final status = await Permission.requestInstallPackages.status;
      if (!status.isGranted) {
        final requested = await Permission.requestInstallPackages.request();
        if (!requested.isGranted) {
          return const ApkInstallResult(
            false,
            'Allow "Install unknown apps" for this app in Settings, then tap Install Update again.',
          );
        }
      }

      final result = await OpenFilex.open(
        filePath,
        type: 'application/vnd.android.package-archive',
      );
      if (result.type == ResultType.done) {
        return const ApkInstallResult(true, 'Installer opened.');
      }
      return ApkInstallResult(
        false,
        result.message.isEmpty
            ? 'Could not open the Android package installer.'
            : result.message,
      );
    } catch (e) {
      return ApkInstallResult(false, 'Could not start the installer: $e');
    }
  }
}

/// Compares dotted version strings (e.g. `1.2.10` > `1.2.9`). Non-numeric
/// suffixes are ignored, and a missing component counts as zero.
int compareVersionNames(String a, String b) {
  final left = _versionParts(a);
  final right = _versionParts(b);
  final length = math.max(left.length, right.length);
  for (var i = 0; i < length; i++) {
    final l = i < left.length ? left[i] : 0;
    final r = i < right.length ? right[i] : 0;
    if (l != r) return l.compareTo(r);
  }
  return 0;
}

List<int> _versionParts(String value) => value
    .split(RegExp(r'[^0-9]+'))
    .where((part) => part.isNotEmpty)
    .map((part) => int.tryParse(part) ?? 0)
    .toList();

/// Service for fetching About App & Developer data.
class AboutService {
  AboutService(this._api);

  final ApiClient _api;

  /// Fetches all About App cards and Developer profiles.
  Future<AboutData> fetchAbout() async {
    final res = await _api.get('/about');
    final appCards =
        (res['appCards'] as List<dynamic>?)
            ?.map((e) => AboutAppCard.fromJson(e as Map<String, dynamic>))
            .toList() ??
        [];
    final developers =
        (res['developers'] as List<dynamic>?)
            ?.map((e) => AboutDeveloper.fromJson(e as Map<String, dynamic>))
            .toList() ??
        [];
    return AboutData(appCards: appCards, developers: developers);
  }

  /// Fetches a developer's profile photo as bytes.
  Future<Uint8List> fetchDeveloperPhoto(int developerId) async {
    return _api.bytes('/about/developers/$developerId/photo');
  }
}

/// Service for student notices.
///
/// The backend merges per-user notifications with published global notices and
/// returns `{ unread, regularUnread, globalUnread, items }`; every item carries
/// its own `read` / `dismissible` flags.
class NoticeService {
  NoticeService(this._api);

  final ApiClient _api;

  /// Fetches all notices for the current student.
  Future<List<Notice>> fetchNotices() async => (await fetchFeed()).items;

  /// Fetches the notice feed together with the server-side unread counters.
  Future<NoticeFeed> fetchFeed() async {
    final res = await _api.get('/student/notices');
    final items = (res['items'] as List<dynamic>? ?? const [])
        .map((e) => Notice.fromJson(e as Map<String, dynamic>))
        .toList();
    return NoticeFeed(
      items: items,
      unread: asInt(res['unread']),
      globalUnread: asInt(res['globalUnread']),
      regularUnread: asInt(res['regularUnread']),
    );
  }

  /// Marks a notice as read or unread. [kind] tells the server which table the
  /// id belongs to ('notice' for admin notices, 'notification' for personal ones).
  Future<void> toggleNoticeReadStatus(
    int noticeId,
    bool isRead, {
    String? kind,
  }) async {
    await _api.post('/student/notices/$noticeId/read', {
      'read': isRead,
      if (kind != null && kind.isNotEmpty) 'kind': kind,
    });
  }

  /// Hides a global notice from this student's list.
  Future<void> dismissNotice(int noticeId, {String? kind}) async {
    await _api.post('/student/notices/$noticeId/dismiss', {
      if (kind != null && kind.isNotEmpty) 'kind': kind,
    });
  }
}

/// One page of `GET /api/student/notices` plus the unread counters it reports.
class NoticeFeed {
  const NoticeFeed({
    required this.items,
    required this.unread,
    required this.globalUnread,
    required this.regularUnread,
  });

  final List<Notice> items;
  final int unread;
  final int globalUnread;
  final int regularUnread;
}
