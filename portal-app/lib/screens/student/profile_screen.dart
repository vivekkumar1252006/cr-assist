import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../../../core/api_client.dart';
import '../../../core/format.dart';
import '../../../core/models.dart';
import '../../../core/notice_store.dart';
import '../../../core/services.dart';
import '../../../core/theme.dart';
import '../../../widgets/common.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final _picker = ImagePicker();
  bool _uploadingPhoto = false;

  @override
  void initState() {
    super.initState();
    // The bell badge and the notices card listen to the shared store, so this
    // one call also keeps them current after a notice was read on the notices
    // screen (the store is refreshed there).
    noticeStore.refresh();
  }

  Future<void> _openNotifications() async {
    await context.push('/notifications');
    // Pick up anything the student read, marked unread or dismissed.
    if (mounted) await noticeStore.refresh();
  }

  Future<StudentProfile> _loadData() async {
    final profileRes = await api.get('/student/profile');
    return StudentProfile(profileRes['profile'] as Map<String, dynamic>);
  }

  Future<void> _pickAndUploadPhoto(VoidCallback onRefresh) async {
    final picked = await _picker.pickImage(
      source: ImageSource.gallery,
      maxWidth: 1024,
      maxHeight: 1024,
    );
    if (picked == null) return;

    // Same accepted formats as the web portal (the server re-checks the bytes).
    final extension = picked.name.toLowerCase().split('.').last;
    const allowedTypes = {'jpg', 'jpeg', 'png', 'webp'};
    if (!allowedTypes.contains(extension)) {
      if (mounted) {
        showMessage(context, 'Choose a JPG, PNG or WebP image', error: true);
      }
      return;
    }

    final length = await picked.length();
    if (length > 2 * 1024 * 1024) {
      if (mounted) {
        showMessage(context, 'Photo must be 2 MB or smaller', error: true);
      }
      return;
    }

    setState(() => _uploadingPhoto = true);
    try {
      await api.upload(
        '/student/profile/photo',
        field: 'photo',
        read: picked.openRead,
        length: length,
        filename: picked.name,
      );
      if (mounted) {
        showMessage(context, 'Profile photo updated successfully');
        onRefresh();
      }
    } on ApiException catch (e) {
      if (mounted) showMessage(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => _uploadingPhoto = false);
    }
  }

  Future<void> _removePhoto(VoidCallback onRefresh) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Remove photo'),
        content: const Text(
          'Are you sure you want to remove your profile photo?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text(
              'Remove',
              style: TextStyle(color: AppColors.absent),
            ),
          ),
        ],
      ),
    );
    if (confirm != true) return;

    try {
      await api.delete('/student/profile/photo');
      if (mounted) {
        showMessage(context, 'Profile photo removed');
        onRefresh();
      }
    } on ApiException catch (e) {
      if (mounted) showMessage(context, e.message, error: true);
    }
  }

  void _showPhotoOptions(
    BuildContext context,
    bool hasPhoto,
    VoidCallback onRefresh,
  ) {
    showModalBottomSheet(
      context: context,
      builder: (ctx) => SafeArea(
        child: Wrap(
          children: [
            ListTile(
              leading: const Icon(
                Icons.photo_library_outlined,
                color: AppColors.navy,
              ),
              title: const Text('Upload new photo'),
              subtitle: const Text(
                'JPG, PNG or WebP · max 2 MB',
                style: TextStyle(fontSize: 12, color: AppColors.muted),
              ),
              onTap: () {
                Navigator.pop(ctx);
                _pickAndUploadPhoto(onRefresh);
              },
            ),
            if (hasPhoto)
              ListTile(
                leading: const Icon(
                  Icons.delete_outline,
                  color: AppColors.absent,
                ),
                title: const Text(
                  'Remove photo',
                  style: TextStyle(color: AppColors.absent),
                ),
                onTap: () {
                  Navigator.pop(ctx);
                  _removePhoto(onRefresh);
                },
              ),
          ],
        ),
      ),
    );
  }

  Future<void> _confirmLogout() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Sign out'),
        content: const Text('Are you sure you want to sign out?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text(
              'Sign out',
              style: TextStyle(color: AppColors.absent),
            ),
          ),
        ],
      ),
    );
    if (confirm != true) return;
    // The router redirects to /login as soon as the status becomes signedOut.
    await session.logout();
  }

  /// "Academic Year · Semester" when the profile has them.
  String _academicLabel(StudentProfile p) {
    final parts = <String>[
      if (p.academicYear.isNotEmpty) p.academicYear,
      if (p.semester > 0) 'Semester ${p.semester}',
    ];
    return parts.isEmpty ? 'Not provided' : parts.join(' · ');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 28,
              height: 28,
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(8),
              ),
              clipBehavior: Clip.antiAlias,
              padding: const EdgeInsets.all(3),
              child: Image.asset('assets/images/logo.png', fit: BoxFit.contain),
            ),
            const SizedBox(width: 10),
            const Text('Student Profile'),
          ],
        ),
        actions: [
          ListenableBuilder(
            listenable: noticeStore,
            builder: (context, _) => IconButton(
              key: const Key('profile-notifications-bell'),
              icon: _buildBellIcon(noticeStore.unreadCount),
              tooltip: noticeStore.unreadCount > 0
                  ? '${noticeStore.unreadCount} unread notifications'
                  : 'Notifications',
              onPressed: _openNotifications,
            ),
          ),
        ],
      ),
      body: AsyncView<StudentProfile>(
        load: _loadData,
        builder: (context, p, reload) {
          return RefreshIndicator(
            onRefresh: () async {
              await Future.wait([noticeStore.refresh(), reload()]);
            },
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                // Header card with avatar and basic info.
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(20),
                    child: Column(
                      children: [
                        Stack(
                          alignment: Alignment.bottomRight,
                          children: [
                            UserAvatar(
                              name: p.fullName,
                              photoUrl: p.photoUrl,
                              radius: 46,
                            ),
                            if (_uploadingPhoto)
                              const Positioned.fill(
                                child: CircleAvatar(
                                  backgroundColor: Colors.black38,
                                  child: SizedBox.square(
                                    dimension: 24,
                                    child: CircularProgressIndicator(
                                      color: Colors.white,
                                      strokeWidth: 2,
                                    ),
                                  ),
                                ),
                              )
                            else
                              CircleAvatar(
                                radius: 16,
                                backgroundColor: AppColors.navy,
                                child: IconButton(
                                  padding: EdgeInsets.zero,
                                  iconSize: 18,
                                  icon: const Icon(
                                    Icons.camera_alt,
                                    color: Colors.white,
                                  ),
                                  tooltip: 'Change Photo',
                                  onPressed: () => _showPhotoOptions(
                                    context,
                                    p.photoUrl != null,
                                    reload,
                                  ),
                                ),
                              ),
                          ],
                        ),
                        const SizedBox(height: 14),
                        Text(
                          p.fullName,
                          style: const TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.w700,
                            color: AppColors.navy,
                          ),
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 4),
                        Text(
                          p.email,
                          style: const TextStyle(
                            fontSize: 14,
                            color: AppColors.muted,
                          ),
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 10),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 6,
                          ),
                          decoration: BoxDecoration(
                            color: AppColors.tealLight,
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Image.asset(
                                'assets/images/logo.png',
                                width: 16,
                                height: 16,
                                fit: BoxFit.contain,
                              ),
                              const SizedBox(width: 6),
                              Text(
                                p.classLabel,
                                style: const TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                  color: AppColors.teal,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),

                // Combined details card.
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        InfoRow(
                          icon: Icons.person_outlined,
                          label: 'Full Name',
                          value: p.fullName,
                        ),
                        const Divider(height: 1),
                        InfoRow(
                          icon: Icons.email_outlined,
                          label: 'Email',
                          value: p.email,
                        ),
                        const Divider(height: 1),
                        InfoRow(
                          icon: Icons.badge_outlined,
                          label: 'Enrollment Number',
                          value: p.enrollmentNumber,
                        ),
                        const Divider(height: 1),
                        InfoRow(
                          icon: Icons.perm_identity,
                          label: 'Student ID',
                          value: p.studentId,
                        ),
                        const Divider(height: 1),
                        InfoRow(
                          icon: Icons.menu_book_outlined,
                          label: 'Course / Branch',
                          value: p.courseName,
                        ),
                        const Divider(height: 1),
                        InfoRow(
                          icon: Icons.calendar_today_outlined,
                          label: 'Academic Year · Semester',
                          value: _academicLabel(p),
                        ),
                        const Divider(height: 1),
                        InfoRow(
                          icon: Icons.groups_outlined,
                          label: 'Group',
                          value: p.group.isEmpty
                              ? 'Not provided'
                              : 'Group ${p.group}',
                        ),
                        const Divider(height: 1),
                        InfoRow(
                          icon: Icons.phone_outlined,
                          label: 'Mobile Number',
                          value: p.mobile ?? 'Not provided',
                        ),
                        const Divider(height: 1),
                        InfoRow(
                          icon: Icons.cake_outlined,
                          label: 'Date of Birth',
                          value: formatDob(p.dob) ?? 'Not provided',
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),

                // Notices entry point — the full list lives on its own screen.
                _buildNoticesEntry(),

                const SizedBox(height: 16),

                FilledButton.icon(
                  onPressed: () async {
                    final updated = await context.push<bool>('/profile/edit');
                    if (updated == true && mounted) reload();
                  },
                  icon: const Icon(Icons.edit_outlined),
                  label: const Text('Edit Profile'),
                ),
                const SizedBox(height: 8),
                TextButton.icon(
                  onPressed: _confirmLogout,
                  icon: const Icon(Icons.logout, color: AppColors.absent),
                  label: const Text(
                    'Sign out',
                    style: TextStyle(color: AppColors.absent),
                  ),
                ),
                const SizedBox(height: 24),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildBellIcon(int unreadCount) {
    return Stack(
      clipBehavior: Clip.none,
      children: [
        const Icon(Icons.notifications_outlined, size: 28, color: Colors.white),
        if (unreadCount > 0)
          Positioned(
            right: -4,
            top: -4,
            child: Container(
              padding: const EdgeInsets.all(2),
              decoration: BoxDecoration(
                color: AppColors.absent,
                borderRadius: BorderRadius.circular(12),
              ),
              constraints: const BoxConstraints(minWidth: 16, minHeight: 16),
              child: Text(
                unreadCount > 99 ? '99+' : '$unreadCount',
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 10,
                  fontWeight: FontWeight.bold,
                ),
                textAlign: TextAlign.center,
              ),
            ),
          ),
      ],
    );
  }

  /// Compact card that opens the Notifications & Notices screen. Keeps the
  /// unread count in sync with the bell through [noticeStore].
  Widget _buildNoticesEntry() {
    return ListenableBuilder(
      listenable: noticeStore,
      builder: (context, _) {
        final unread = noticeStore.unreadCount;
        final total = noticeStore.items.length;
        final String subtitle;
        if (!noticeStore.hasLoaded && noticeStore.isLoading) {
          subtitle = 'Loading notices…';
        } else if (noticeStore.error != null && total == 0) {
          subtitle = 'Could not load notices — tap to retry';
        } else if (total == 0) {
          subtitle = 'No notices published yet';
        } else if (unread == 0) {
          subtitle = 'You’re all caught up';
        } else {
          subtitle =
              '$unread unread of $total ${total == 1 ? 'notice' : 'notices'}';
        }

        return Card(
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            key: const Key('profile-notices-entry'),
            onTap: _openNotifications,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              child: Row(
                children: [
                  Container(
                    width: 44,
                    height: 44,
                    decoration: const BoxDecoration(
                      color: AppColors.lightBlue,
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Icons.notifications_outlined,
                      color: AppColors.royalBlue,
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            const Flexible(
                              child: Text(
                                'Notices & Announcements',
                                style: TextStyle(
                                  fontSize: 15,
                                  fontWeight: FontWeight.w600,
                                  color: AppColors.navy,
                                ),
                              ),
                            ),
                            if (unread > 0) ...[
                              const SizedBox(width: 8),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 7,
                                  vertical: 1,
                                ),
                                decoration: BoxDecoration(
                                  color: AppColors.royalBlue,
                                  borderRadius: BorderRadius.circular(10),
                                ),
                                child: Text(
                                  unread > 99 ? '99+' : '$unread',
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 11,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ),
                            ],
                          ],
                        ),
                        const SizedBox(height: 3),
                        Text(
                          subtitle,
                          style: const TextStyle(
                            fontSize: 12,
                            color: AppColors.muted,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  const Icon(
                    Icons.chevron_right,
                    color: AppColors.muted,
                    size: 22,
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}
