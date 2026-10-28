import 'package:flutter/foundation.dart';

/// Bumped whenever the student's complaint list changes (e.g. a new complaint
/// was submitted). The complaint list listens so it refetches even when the
/// form was closed via a route replacement instead of `pop`.
final complaintFeedRevision = ValueNotifier<int>(0);

void markComplaintsChanged() {
  complaintFeedRevision.value++;
}
