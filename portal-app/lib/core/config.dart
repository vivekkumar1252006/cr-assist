import 'dart:io' show Platform;

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Where the SmartAttend Node.js API lives.
///
/// Resolution order:
///   1. A server address saved from the login screen ("Server settings").
///   2. `--dart-define=API_BASE_URL=http://192.168.1.10:5000` at build/run time.
///   3. Release builds default to the hosted Railway API; debug builds use a
///      local-development default: the Android emulator reaches the host
///      machine at 10.0.2.2, the iOS simulator at localhost.
class AppConfig {
  AppConfig._();

  static const _prefsKey = 'api_base_url';
  static const _fromDefine = String.fromEnvironment('API_BASE_URL');
  static const _productionBaseUrl = 'https://cr-assist-api-production.up.railway.app';

  static String get defaultBaseUrl {
    if (_fromDefine.isNotEmpty) return _fromDefine;
    if (kReleaseMode) return _productionBaseUrl;
    return Platform.isAndroid
        ? 'http://10.0.2.2:5000'
        : 'http://localhost:5000';
  }

  static String baseUrl = defaultBaseUrl;

  static Future<void> load() async {
    try {
      final prefs = await SharedPreferences.getInstance().timeout(
        const Duration(seconds: 3),
      );
      baseUrl = prefs.getString(_prefsKey) ?? defaultBaseUrl;
    } catch (e) {
      debugPrint('AppConfig.load error: $e');
      baseUrl = defaultBaseUrl;
    }
  }

  /// Saves a custom server address, or clears it when [url] is null/empty.
  static Future<void> setBaseUrl(String? url) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final cleaned = url?.trim().replaceAll(RegExp(r'/+$'), '') ?? '';
      if (cleaned.isEmpty) {
        await prefs.remove(_prefsKey);
        baseUrl = defaultBaseUrl;
      } else {
        await prefs.setString(_prefsKey, cleaned);
        baseUrl = cleaned;
      }
    } catch (e) {
      debugPrint('AppConfig.setBaseUrl error: $e');
    }
  }

  // Limits enforced by the server (see server/.env). Checked on-device first
  // so students get immediate feedback before uploading.
  static const maxAttachmentBytes = 10 * 1024 * 1024;
  static const maxAttachments = 10;
  static const maxPhotoBytes = 2 * 1024 * 1024;
  static const attachmentExtensions = ['jpg', 'jpeg', 'png', 'webp', 'pdf'];
}
