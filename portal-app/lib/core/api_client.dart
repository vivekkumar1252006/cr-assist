import 'dart:io';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'config.dart';

/// An API error with a user-facing message and optional per-field errors,
/// matching the backend's `{ message, code?, errors? }` response shape.
class ApiException implements Exception {
  ApiException(
    this.message, {
    this.statusCode,
    this.code,
    this.fieldErrors = const {},
  });

  final String message;
  final int? statusCode;
  final String? code;
  final Map<String, String> fieldErrors;

  @override
  String toString() => message;
}

/// The backend authenticates with an httpOnly `sa_session` cookie. Browsers handle
/// that automatically; here we capture it from `Set-Cookie`, keep it in the
/// platform keystore (Android Keystore / iOS Keychain), and send it back on
/// every request.
class ApiClient {
  ApiClient() {
    _dio = Dio(
      BaseOptions(
        connectTimeout: const Duration(seconds: 15),
        receiveTimeout: const Duration(seconds: 60),
        headers: {'Accept': 'application/json'},
      ),
    );
    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          options.baseUrl = '${AppConfig.baseUrl}/api';
          final token = await _token();
          if (token != null) {
            options.headers[HttpHeaders.cookieHeader] = '$_cookieName=$token';
          }
          handler.next(options);
        },
        onResponse: (response, handler) async {
          await _captureCookie(response.headers);
          handler.next(response);
        },
        onError: (error, handler) async {
          final response = error.response;
          if (response != null) await _captureCookie(response.headers);
          // A 401 from anything other than the login call means the session is gone.
          if (response?.statusCode == 401 &&
              !error.requestOptions.path.startsWith('/auth/login')) {
            await clearSession();
            onUnauthorized?.call();
          }
          handler.next(error);
        },
      ),
    );
  }

  static const _cookieName = 'sa_session';
  static const _storageKey = 'sa_session';
  static const _storage = FlutterSecureStorage(
    aOptions: AndroidOptions(resetOnError: true),
  );

  late final Dio _dio;
  String? _cachedToken;
  bool _tokenLoaded = false;

  /// Called when the server rejects the stored session (expired, suspended, …).
  void Function()? onUnauthorized;

  Future<String?> _token() async {
    if (!_tokenLoaded) {
      try {
        _cachedToken = await _storage
            .read(key: _storageKey)
            .timeout(const Duration(seconds: 2), onTimeout: () => null);
      } catch (e) {
        _cachedToken = null;
      }
      _tokenLoaded = true;
    }
    return _cachedToken;
  }

  Future<bool> hasSession() async => (await _token()) != null;

  Future<void> clearSession() async {
    _cachedToken = null;
    _tokenLoaded = true;
    try {
      await _storage
          .delete(key: _storageKey)
          .timeout(const Duration(seconds: 2));
    } catch (_) {}
  }

  Future<void> _captureCookie(Headers headers) async {
    for (final raw
        in headers[HttpHeaders.setCookieHeader] ?? const <String>[]) {
      final Cookie cookie;
      try {
        cookie = Cookie.fromSetCookieValue(raw);
      } catch (_) {
        continue;
      }
      if (cookie.name != _cookieName) continue;
      final expired =
          cookie.expires != null && cookie.expires!.isBefore(DateTime.now());
      if (cookie.value.isEmpty || expired) {
        await clearSession();
      } else {
        _cachedToken = cookie.value;
        _tokenLoaded = true;
        try {
          await _storage
              .write(key: _storageKey, value: cookie.value)
              .timeout(const Duration(seconds: 2));
        } catch (_) {}
      }
    }
  }

  // ------------------------------------------------------------------ requests

  Future<Map<String, dynamic>> get(
    String path, {
    Map<String, dynamic>? query,
  }) => _send(() => _dio.get(path, queryParameters: _clean(query)));

  Future<Map<String, dynamic>> post(String path, [Object? body]) =>
      _send(() => _dio.post(path, data: body));

  Future<Map<String, dynamic>> put(String path, [Object? body]) =>
      _send(() => _dio.put(path, data: body));

  Future<Map<String, dynamic>> patch(String path, [Object? body]) =>
      _send(() => _dio.patch(path, data: body));

  Future<Map<String, dynamic>> delete(String path) =>
      _send(() => _dio.delete(path));

  /// Uploads one file as multipart form data under [field].
  Future<Map<String, dynamic>> upload(
    String path, {
    required String field,
    required Stream<List<int>> Function() read,
    required int length,
    required String filename,
    void Function(int sent, int total)? onProgress,
  }) {
    final form = FormData.fromMap({
      field: MultipartFile.fromStream(read, length, filename: filename),
    });
    return _send(() => _dio.post(path, data: form, onSendProgress: onProgress));
  }

  /// Downloads protected binary content (profile photos, attachments).
  Future<Uint8List> bytes(String path) async {
    try {
      final res = await _dio.get<List<int>>(
        _apiPath(path),
        options: Options(responseType: ResponseType.bytes),
      );
      return Uint8List.fromList(res.data ?? const []);
    } on DioException catch (e) {
      throw _toApiException(e);
    }
  }

  /// Downloads protected content to [savePath], reporting bytes received.
  Future<void> download(
    String path,
    String savePath, {
    void Function(int received, int total)? onProgress,
    CancelToken? cancelToken,
  }) async {
    try {
      await _dio.download(
        _apiPath(path),
        savePath,
        onReceiveProgress: onProgress,
        cancelToken: cancelToken,
        // APK downloads are large: allow slow mobile connections, but still
        // fail if the server stops sending data for a long time.
        options: Options(receiveTimeout: const Duration(minutes: 10)),
      );
    } on DioException catch (e) {
      if (CancelToken.isCancel(e)) {
        throw ApiException('Download cancelled.');
      }
      throw _toApiException(e);
    }
  }

  /// The server returns URLs like `/api/student/profile/photo?v=…`; Dio's base already ends in /api.
  static String _apiPath(String url) =>
      url.startsWith('/api/') ? url.substring(4) : url;

  static Map<String, dynamic>? _clean(Map<String, dynamic>? query) =>
      query == null
      ? null
      : (Map.of(query)..removeWhere((_, v) => v == null || v == ''));

  Future<Map<String, dynamic>> _send(
    Future<Response<dynamic>> Function() call,
  ) async {
    try {
      final res = await call();
      final data = res.data;
      return data is Map<String, dynamic> ? data : <String, dynamic>{};
    } on DioException catch (e) {
      throw _toApiException(e);
    }
  }

  ApiException _toApiException(DioException e) {
    final res = e.response;
    if (res == null) {
      final timeout =
          e.type == DioExceptionType.connectionTimeout ||
          e.type == DioExceptionType.receiveTimeout;
      return ApiException(
        timeout
            ? 'The server took too long to respond. Check your connection and try again.'
            : 'Cannot reach the SmartAttend server at ${AppConfig.baseUrl}. '
                  'Check your connection or the server address in Server settings.',
      );
    }
    final data = res.data;
    if (data is Map) {
      final errors = <String, String>{};
      final raw = data['errors'];
      if (raw is Map) raw.forEach((k, v) => errors['$k'] = '$v');
      return ApiException(
        (data['message'] as String?) ?? 'Request failed (${res.statusCode})',
        statusCode: res.statusCode,
        code: data['code'] as String?,
        fieldErrors: errors,
      );
    }
    if (res.statusCode == 429) {
      return ApiException(
        'Too many requests. Please wait a moment and try again.',
        statusCode: 429,
      );
    }
    return ApiException(
      'Something went wrong (${res.statusCode}). Please try again.',
      statusCode: res.statusCode,
    );
  }
}
