import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';

import 'api_client.dart';
import 'models.dart';
import 'services.dart';
import 'session.dart';

/// App-wide source of truth for the student's notices.
///
/// The Profile bell and the Notifications & Notices screen both listen to this
/// store, so marking a notice read updates the badge immediately and every
/// screen stays in sync. While at least one screen is listening, the store polls
/// the API so notices published from the admin panel show up on their own.
///
/// Read / dismissed state is owned by the server (`student_notice_status`) and
/// is therefore specific to each student. Updates here are optimistic and are
/// rolled back if the request fails.
class NoticeStore extends ChangeNotifier {
  NoticeStore(
    this._service, {
    this.pollInterval = const Duration(seconds: 60),
  }) {
    session.addListener(_handleSessionChange);
  }

  final NoticeService _service;
  final Duration pollInterval;

  List<Notice> _items = const [];
  int _unread = 0;
  int _globalUnread = 0;
  bool _loading = false;
  bool _loadedOnce = false;
  String? _error;
  Future<void>? _inFlight;
  Timer? _timer;

  /// Notices / notifications for the signed-in student (dismissed ones omitted).
  List<Notice> get items => _items;

  /// Announcements published by the admin in Manage Notices.
  List<Notice> get adminNotices =>
      _items.where((n) => n.kind != 'notification').toList(growable: false);

  /// Per-student updates (complaint status changes and similar).
  List<Notice> get updates =>
      _items.where((n) => n.kind == 'notification').toList(growable: false);

  /// Unread total, straight from the server so it also counts items beyond the
  /// returned page.
  int get unreadCount => _unread;

  /// Unread announcements (admin notices) only.
  int get adminUnreadCount => _globalUnread;

  bool get isLoading => _loading;
  bool get hasLoaded => _loadedOnce;
  String? get error => _error;

  /// Loads the feed, collapsing concurrent calls into one request.
  Future<void> refresh({bool showSpinner = false}) {
    final running = _inFlight;
    if (running != null) return running;
    final future = _load(showSpinner);
    _inFlight = future.whenComplete(() => _inFlight = null);
    return _inFlight!;
  }

  Future<void> _load(bool showSpinner) async {
    if (showSpinner || !_loadedOnce) {
      _loading = true;
      notifyListeners();
    }
    try {
      final feed = await _service.fetchFeed();
      _items = feed.items;
      _unread = feed.unread;
      _globalUnread = feed.globalUnread;
      _error = null;
    } on ApiException catch (e) {
      _error = e.message;
    } finally {
      _loadedOnce = true;
      _loading = false;
      notifyListeners();
    }
  }

  /// Marks one notice read or unread. Returns an error message on failure.
  Future<String?> setRead(Notice notice, {required bool read}) async {
    if (notice.isRead == read) return null;

    final previousItems = _items;
    final previousUnread = _unread;
    final previousGlobalUnread = _globalUnread;

    _items = [
      for (final item in _items)
        item.key == notice.key ? item.copyWith(isRead: read) : item,
    ];
    _applyUnreadDelta(notice, read ? -1 : 1);
    notifyListeners();

    try {
      await _service.toggleNoticeReadStatus(notice.id, read, kind: notice.kind);
      return null;
    } on ApiException catch (e) {
      _items = previousItems;
      _unread = previousUnread;
      _globalUnread = previousGlobalUnread;
      notifyListeners();
      return e.message;
    }
  }

  /// Hides one notice for this student only. Returns an error message on failure.
  Future<String?> dismiss(Notice notice) async {
    final previousItems = _items;
    final previousUnread = _unread;
    final previousGlobalUnread = _globalUnread;

    _items = _items
        .where((item) => item.key != notice.key)
        .toList(growable: false);
    if (!notice.isRead) _applyUnreadDelta(notice, -1);
    notifyListeners();

    try {
      await _service.dismissNotice(notice.id, kind: notice.kind);
      return null;
    } on ApiException catch (e) {
      _items = previousItems;
      _unread = previousUnread;
      _globalUnread = previousGlobalUnread;
      notifyListeners();
      return e.message;
    }
  }

  /// Drops cached state, e.g. when the signed-in student changes.
  void reset() {
    _items = const [];
    _unread = 0;
    _globalUnread = 0;
    _error = null;
    _loading = false;
    _loadedOnce = false;
    notifyListeners();
  }

  void _applyUnreadDelta(Notice notice, int delta) {
    _unread = math.max(0, _unread + delta);
    if (notice.kind != 'notification') {
      _globalUnread = math.max(0, _globalUnread + delta);
    }
  }

  void _handleSessionChange() {
    if (session.status == SessionStatus.signedOut) reset();
  }

  // Poll only while a screen is actually listening. The shell keeps the Profile
  // branch alive, so the badge stays current without extra plumbing.
  @override
  void addListener(VoidCallback listener) {
    super.addListener(listener);
    _timer ??= Timer.periodic(pollInterval, (_) => refresh());
  }

  @override
  void removeListener(VoidCallback listener) {
    super.removeListener(listener);
    if (!hasListeners) {
      _timer?.cancel();
      _timer = null;
    }
  }
}

final noticeStore = NoticeStore(noticeService);
