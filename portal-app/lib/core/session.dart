import 'package:flutter/foundation.dart';

import 'api_client.dart';
import 'models.dart';

enum SessionStatus { unknown, signedOut, signedIn }

/// Holds the signed-in user and drives the router's auth redirects.
class Session extends ChangeNotifier {
  Session(this.api) {
    api.onUnauthorized = () {
      if (status == SessionStatus.signedIn) {
        expiredMessage = 'Your session has ended. Please log in again.';
      }
      _setSignedOut();
    };
  }

  final ApiClient api;

  SessionStatus status = SessionStatus.unknown;
  User? user;

  /// Shown once on the login screen after a forced sign-out.
  String? expiredMessage;

  /// Restores a stored session by asking the server who we are.
  ///
  /// This method MUST always resolve — any unhandled error would leave
  /// [status] as [SessionStatus.unknown] and keep the splash screen forever.
  Future<void> restore() async {
    try {
      final hasSession = await api.hasSession().timeout(
        const Duration(seconds: 2),
        onTimeout: () => false,
      );
      if (!hasSession) {
        _setSignedOut();
        return;
      }
      // Quick timeout so an unreachable server doesn't freeze the splash screen.
      final data = await api
          .get('/auth/me')
          .timeout(
            const Duration(seconds: 4),
            onTimeout: () => <String, dynamic>{},
          );
      final raw = data['user'];
      if (raw == null) {
        _setSignedOut();
        return;
      }
      user = User.fromJson(raw as Map<String, dynamic>);
      status = SessionStatus.signedIn;
      notifyListeners();
    } on ApiException catch (e) {
      // Network/server error: show the login screen.
      if (e.statusCode == null) expiredMessage = e.message;
      _setSignedOut();
    } catch (_) {
      // Catch everything else (JSON parse errors, TypeErrors, etc.) so the
      // app never gets stuck on the splash screen.
      _setSignedOut();
    }
  }

  Future<void> login(
    String identifier,
    String password, {
    required bool remember,
  }) async {
    final data = await api.post('/auth/login', {
      'identifier': identifier.trim(),
      'password': password,
      'remember': remember,
    });
    user = User.fromJson(data['user'] as Map<String, dynamic>);
    expiredMessage = null;
    status = SessionStatus.signedIn;
    notifyListeners();
  }

  /// Creates a student account. The server activates it immediately and starts
  /// a session, so the caller can go straight to the signed-in app.
  Future<void> register(Map<String, dynamic> payload) async {
    final data = await api.post('/auth/register', payload);
    user = User.fromJson(data['user'] as Map<String, dynamic>);
    expiredMessage = null;
    status = SessionStatus.signedIn;
    notifyListeners();
  }

  Future<void> logout() async {
    try {
      await api.post('/auth/logout');
    } on ApiException {
      // Signing out locally is what matters; the server cookie expires on its own.
    }
    await api.clearSession();
    _setSignedOut();
  }

  void forceSignOut() {
    if (status == SessionStatus.unknown) {
      _setSignedOut();
    }
  }

  void _setSignedOut() {
    user = null;
    status = SessionStatus.signedOut;
    notifyListeners();
  }
}
