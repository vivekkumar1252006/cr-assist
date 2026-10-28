import 'package:intl/intl.dart';

const _locale = 'en_IN';

String formatDate(DateTime? d) =>
    d == null ? '—' : DateFormat('d MMM y', _locale).format(d);

String formatDay(DateTime? d) =>
    d == null ? '—' : DateFormat('EEE, d MMM', _locale).format(d);

String formatTime(DateTime? d) =>
    d == null ? '—' : DateFormat('h:mm a', _locale).format(d);

String formatDateTime(DateTime? d) =>
    d == null ? '—' : DateFormat('d MMM y, h:mm a', _locale).format(d);

/// Formats a `YYYY-MM-DD` string without time-zone shifting.
String? formatDob(String? ymd) {
  final d = ymd == null ? null : DateTime.tryParse(ymd);
  return d == null ? null : DateFormat('d MMMM y', _locale).format(d);
}

String ymd(DateTime d) => DateFormat('yyyy-MM-dd').format(d);

String formatPercent(num? v) {
  if (v == null) return '—';
  return v == v.roundToDouble() ? '${v.toInt()}%' : '${v.toStringAsFixed(1)}%';
}

String formatBytes(int bytes) {
  if (bytes < 1024) return '$bytes B';
  if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(0)} KB';
  return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
}

String initials(String name) {
  final parts = name.split(' ').where((p) => p.isNotEmpty).take(2);
  final s = parts.map((p) => p[0]).join().toUpperCase();
  return s.isEmpty ? '?' : s;
}
