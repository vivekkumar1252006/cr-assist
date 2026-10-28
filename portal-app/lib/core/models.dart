// Plain data classes for the parts of the API used across several screens.
// Single-screen responses are read directly from the JSON map.

import 'format.dart';

DateTime? parseDate(Object? value) =>
    value is String ? DateTime.tryParse(value)?.toLocal() : null;

int asInt(Object? value) =>
    value is num ? value.toInt() : int.tryParse('$value') ?? 0;

/// About App Card (Portal purpose & key features)
class AboutAppCard {
  AboutAppCard({
    required this.id,
    required this.title,
    required this.subtitle,
    required this.description,
    required this.features,
    required this.badge,
    this.version,
    this.releaseNotes,
  });

  factory AboutAppCard.fromJson(Map<String, dynamic> j) => AboutAppCard(
    id: asInt(j['id']),
    title: j['title'] as String? ?? '',
    subtitle: j['subtitle'] as String? ?? '',
    description: j['description'] as String? ?? '',
    features:
        (j['features'] as List<dynamic>?)
            ?.map((e) => AboutFeature.fromJson(e as Map<String, dynamic>))
            .toList() ??
        [],
    badge: j['badge'] as String? ?? '',
    version: j['version'] as String?,
    releaseNotes: j['releaseNotes'] as String?,
  );

  final int id;
  final String title;
  final String subtitle;
  final String description;
  final List<AboutFeature> features;
  final String badge;
  final String? version;
  final String? releaseNotes;
}

class AboutFeature {
  AboutFeature({required this.title, required this.description});

  factory AboutFeature.fromJson(Map<String, dynamic> j) => AboutFeature(
    title: j['title'] as String? ?? '',
    description: j['description'] as String? ?? '',
  );

  final String title;
  final String description;
}

/// About Developer Profile
class AboutDeveloper {
  AboutDeveloper({
    required this.id,
    required this.name,
    required this.role,
    required this.email,
    required this.phone,
    required this.bio,
    required this.hasPhoto,
    required this.photoUrl,
  });

  factory AboutDeveloper.fromJson(Map<String, dynamic> j) => AboutDeveloper(
    id: asInt(j['id']),
    name: j['name'] as String? ?? '',
    role: j['role'] as String? ?? 'App Developer',
    email: j['email'] as String? ?? '',
    phone: j['phone'] as String? ?? '',
    bio: j['bio'] as String? ?? '',
    hasPhoto: j['hasPhoto'] as bool? ?? false,
    photoUrl: j['photoUrl'] as String?,
  );

  final int id;
  final String name;
  final String role;
  final String email;
  final String phone;
  final String bio;
  final bool hasPhoto;
  final String? photoUrl;
}

class User {
  User({
    required this.id,
    required this.fullName,
    required this.email,
    required this.role,
    this.enrollmentNumber,
    this.studentId,
    this.isDemo = false,
  });

  factory User.fromJson(Map<String, dynamic> j) => User(
    id: asInt(j['id']),
    fullName: j['fullName'] as String? ?? '',
    email: j['email'] as String? ?? '',
    role: j['role'] as String? ?? 'student',
    enrollmentNumber: j['enrollmentNumber'] as String?,
    studentId: j['studentId'] as String?,
    isDemo: j['isDemo'] == true,
  );

  final int id;
  final String fullName;
  final String email;
  final String role;
  final String? enrollmentNumber;
  final String? studentId;
  final bool isDemo;

  bool get isStudent => role == 'student';
  bool get isStaff => role == 'faculty' || role == 'admin';
  bool get isAdmin => role == 'admin';
}

class StudentProfile {
  StudentProfile(this.json);

  final Map<String, dynamic> json;

  String get fullName => json['fullName'] as String? ?? '';
  String get email => json['email'] as String? ?? '';
  String get enrollmentNumber => json['enrollmentNumber'] as String? ?? '';
  String get studentId => json['studentId'] as String? ?? '';
  String get course => json['course'] as String? ?? '';
  String get courseName => json['courseName'] as String? ?? course;
  String get academicYear => json['academicYear'] as String? ?? '';
  int get semester => asInt(json['semester']);
  String get group => json['group'] as String? ?? '';
  String? get mobile => json['mobile'] as String?;

  /// `YYYY-MM-DD` (DATE column, returned as a string by the server).
  String? get dob => json['dob'] as String?;
  String? get photoUrl => json['photoUrl'] as String?;
  DateTime? get memberSince => parseDate(json['memberSince']);

  String get classLabel => '$course · Sem $semester · Group $group';
}

/// One entry of `GET /api/student/notices`. The server merges per-user
/// notifications (`kind == 'notification'`) with published global notices
/// (`kind == 'notice'`), and already filters out dismissed notices.
class Notice {
  Notice({
    required this.id,
    required this.kind,
    required this.type,
    required this.title,
    required this.message,
    required this.isRead,
    required this.isDismissible,
    this.link,
    this.createdAt,
    this.publishedAt,
  });

  factory Notice.fromJson(Map<String, dynamic> j) => Notice(
    id: asInt(j['id']),
    kind: j['kind'] as String? ?? 'notice',
    type: j['type'] as String? ?? '',
    title: j['title'] as String? ?? '',
    message: (j['message'] ?? j['description']) as String? ?? '',
    link: j['link'] as String?,
    isRead: j['read'] == true,
    isDismissible: j['dismissible'] == true,
    createdAt: parseDate(j['createdAt']),
    publishedAt: parseDate(j['publishedAt']),
  );

  final int id;
  final String kind;
  final String type;
  final String title;
  final String message;
  final String? link;
  final bool isRead;
  final bool isDismissible;
  final DateTime? createdAt;
  final DateTime? publishedAt;

  /// Stable identity for list keys and local updates. Global notices and
  /// per-user notifications live in different tables, so ids can collide.
  String get key => '$kind-$id';

  /// Series screens render the full text as [description].
  String get description => message;

  /// The server never returns dismissed notices for this student.
  bool get isDismissed => false;

  String get date => formatDate(publishedAt ?? createdAt);

  Notice copyWith({bool? isRead}) => Notice(
    id: id,
    kind: kind,
    type: type,
    title: title,
    message: message,
    link: link,
    isRead: isRead ?? this.isRead,
    isDismissible: isDismissible,
    createdAt: createdAt,
    publishedAt: publishedAt,
  );
}

/// Labels shared by the complaint screens (mirrors server/src/utils/complaintValidation.js).
class ComplaintMeta {
  ComplaintMeta._();

  static const categories = {
    'attendance_marked_absent': 'Attendance Marked Absent Incorrectly',
    'qr_not_scanning': 'QR Code Not Scanning',
    'attendance_not_recorded': 'Attendance Not Recorded',
    'wrong_attendance_percentage': 'Wrong Attendance Percentage',
    'login_problem': 'Login Problem',
    'profile_update_issue': 'Profile Update Issue',
    'technical_problem': 'Technical Problem',
    'other': 'Other College Issue',
  };

  /// Categories that show the attendance section of the form.
  static const attendanceCategories = {
    'attendance_marked_absent',
    'qr_not_scanning',
    'attendance_not_recorded',
    'wrong_attendance_percentage',
  };

  /// Categories about one specific class that request a correction.
  static const sessionRequired = {
    'attendance_marked_absent',
    'attendance_not_recorded',
  };

  static const statuses = {
    'submitted': 'Submitted',
    'under_review': 'Under Review',
    'in_progress': 'In Progress',
    'resolved': 'Resolved',
    'rejected': 'Rejected',
  };

  static const priorities = {'low': 'Low', 'medium': 'Medium', 'high': 'High'};
}

class Courses {
  Courses._();

  static const all = {
    'CSE': 'Computer Science & Engineering',
    'IT': 'Information Technology',
    'AIML': 'CSE (AI & Machine Learning)',
    'ECE': 'Electronics & Communication Engineering',
    'EE': 'Electrical Engineering',
    'ME': 'Mechanical Engineering',
    'CE': 'Civil Engineering',
  };

  static const years = [
    'First Year',
    'Second Year',
    'Third Year',
    'Fourth Year',
  ];
}

/// The APK release published by an administrator through the Admin Panel.
///
/// Mirrors `GET /api/apk/latest`. Only the newest published release is returned,
/// so the app never invents a version that has not been uploaded successfully.
class ApkRelease {
  ApkRelease({
    required this.id,
    required this.appName,
    required this.versionName,
    required this.versionCode,
    required this.fileName,
    required this.fileSize,
    required this.downloadUrl,
    required this.uploaderName,
    required this.isAvailable,
    this.releaseNotes,
    this.uploadedAt,
  });

  factory ApkRelease.fromJson(Map<String, dynamic> j) => ApkRelease(
    id: asInt(j['id']),
    appName: j['appName'] as String? ?? 'CR Assist',
    versionName: j['versionName'] as String? ?? '',
    versionCode: asInt(j['versionCode']),
    fileName: j['fileName'] as String? ?? '',
    fileSize: asInt(j['fileSize']),
    downloadUrl: j['downloadUrl'] as String?,
    releaseNotes: j['releaseNotes'] as String?,
    uploadedAt: parseDate(j['uploadedAt']),
    uploaderName: j['uploaderName'] as String? ?? 'System Admin',
    isAvailable: j['isAvailable'] != false,
  );

  final int id;
  final String appName;
  final String versionName;
  final int versionCode;
  final String fileName;
  final int fileSize;
  final String? releaseNotes;
  final String? downloadUrl;
  final DateTime? uploadedAt;
  final String uploaderName;
  final bool isAvailable;

  /// `versionName (versionCode)` for display in the update prompt.
  String get displayVersion =>
      versionCode > 0 ? '$versionName ($versionCode)' : versionName;

  bool get hasReleaseNotes => releaseNotes?.trim().isNotEmpty == true;
}

/// Combined About data from the API.
class AboutData {
  AboutData({required this.appCards, required this.developers});

  final List<AboutAppCard> appCards;
  final List<AboutDeveloper> developers;
}

/// A class / branch an admin can take attendance for.
///
/// Classes come from `GET /admin/classes`, i.e. the cohorts that actually have
/// students, so every scan can be matched to a real student.
class AdminClass {
  const AdminClass({
    required this.course,
    required this.semester,
    this.group,
    this.studentCount = 0,
  });

  factory AdminClass.fromJson(Map<String, dynamic> j) {
    final group = (j['student_group'] as String?)?.trim();
    return AdminClass(
      course: (j['course'] as String? ?? '').trim(),
      semester: asInt(j['semester']),
      group: group == null || group.isEmpty ? null : group,
      studentCount: asInt(j['student_count']),
    );
  }

  final String course;
  final int semester;
  final String? group;
  final int studentCount;

  String get key => '$course|$semester|${group ?? ''}';

  String get label =>
      '$course · Semester $semester${group == null ? ' · All groups' : ' · Group $group'}';

  String get shortLabel => group == null
      ? '$course · Sem $semester'
      : '$course · Sem $semester · $group';
}

/// One attendance session as listed by `GET /admin/attendance/sessions`.
class AdminAttendanceSession {
  const AdminAttendanceSession({
    required this.id,
    required this.subject,
    required this.course,
    required this.semester,
    required this.teacherName,
    required this.status,
    this.group,
    this.classBranch,
    this.room = '',
    this.startsAt,
    this.endsAt,
    this.markedCount = 0,
    this.presentCount = 0,
    this.lateCount = 0,
    this.absentCount = 0,
    this.eligibleStudents = 0,
  });

  factory AdminAttendanceSession.fromJson(Map<String, dynamic> j) =>
      AdminAttendanceSession(
        id: asInt(j['id']),
        subject: (j['subject'] as String? ?? '').trim(),
        course: (j['course'] as String? ?? '').trim(),
        semester: asInt(j['semester']),
        group: (j['student_group'] as String?)?.trim(),
        classBranch: (j['class_branch'] as String? ?? j['classBranch'] as String?)?.trim(),
        room: (j['room'] as String? ?? '').trim(),
        teacherName: (j['faculty_name'] as String? ?? '').trim(),
        status: (j['status'] as String? ?? '').trim(),
        startsAt: parseDate(j['starts_at']),
        endsAt: parseDate(j['ends_at']),
        markedCount: asInt(j['total_marked']),
        presentCount: asInt(j['present_count']),
        lateCount: asInt(j['late_count']),
        absentCount: asInt(j['absent_count']),
        eligibleStudents: asInt(j['eligible_students']),
      );

  final int id;
  final String subject;
  final String course;
  final int semester;
  final String? group;
  final String? classBranch;
  final String room;
  final String teacherName;
  final String status;
  final DateTime? startsAt;
  final DateTime? endsAt;
  final int markedCount;
  final int presentCount;
  final int lateCount;
  final int absentCount;
  final int eligibleStudents;

  /// `CS · Sem 3 · Group A`, matching the web admin's session label.
  String get classLabel {
    if (classBranch != null && classBranch!.trim().isNotEmpty) {
      return classBranch!.trim();
    }
    return '$course · Sem $semester${group == null || group!.isEmpty ? '' : ' · Group $group'}';
  }

  /// A session left 'active' past its end time behaves like a closed one.
  bool get isExpired =>
      status == 'active' && endsAt != null && endsAt!.isBefore(DateTime.now());

  String get displayStatus => isExpired ? 'expired' : status;

  bool get isOpen => status == 'active' && !isExpired;
}

/// One student's attendance record inside a session.
class AdminAttendanceRecord {
  const AdminAttendanceRecord({
    required this.id,
    required this.sessionId,
    required this.studentId,
    required this.studentName,
    required this.enrollmentNumber,
    required this.status,
    this.method = '',
    this.markedAt,
  });

  factory AdminAttendanceRecord.fromJson(Map<String, dynamic> j) =>
      AdminAttendanceRecord(
        id: asInt(j['id']),
        sessionId: asInt(j['session_id']),
        studentId: asInt(j['student_id']),
        studentName: (j['student_name'] as String? ?? '').trim(),
        enrollmentNumber: (j['enrollment_number'] as String? ?? '').trim(),
        status: (j['status'] as String? ?? '').trim(),
        method: (j['method'] as String? ?? '').trim(),
        markedAt: parseDate(j['marked_at']),
      );

  final int id;
  final int sessionId;
  final int studentId;
  final String studentName;
  final String enrollmentNumber;
  final String status;
  final String method;
  final DateTime? markedAt;
}
