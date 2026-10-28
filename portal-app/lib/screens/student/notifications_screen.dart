import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/format.dart';
import '../../../core/models.dart';
import '../../../core/notice_store.dart';
import '../../../core/theme.dart';
import '../../../widgets/common.dart';

/// Dedicated screen for everything the admin publishes in Manage Notices plus
/// the student's own updates. Details expand inline — no dialogs.
class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen>
    with WidgetsBindingObserver {
  /// Keys (`kind-id`) of the notices whose full text is currently open.
  final Set<String> _expanded = {};

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    noticeStore.refresh(showSpinner: !noticeStore.hasLoaded);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Coming back to the app is a good moment to pick up newly published notices.
    if (state == AppLifecycleState.resumed) noticeStore.refresh();
  }

  void _back() {
    if (context.canPop()) {
      context.pop();
    } else {
      context.go('/profile');
    }
  }

  /// Tapping a row expands it on this screen. Opening an unread notice marks it
  /// read (the expanded panel can flip it back to unread).
  Future<void> _toggleExpanded(Notice notice) async {
    if (_expanded.contains(notice.key)) {
      setState(() => _expanded.remove(notice.key));
      return;
    }
    setState(() => _expanded.add(notice.key));
    if (notice.isRead) return;

    final error = await noticeStore.setRead(notice, read: true);
    if (error != null && mounted) showMessage(context, error, error: true);
  }

  Future<void> _setRead(Notice notice, bool read) async {
    final error = await noticeStore.setRead(notice, read: read);
    if (!mounted) return;
    if (error != null) {
      showMessage(context, error, error: true);
    } else {
      showMessage(context, read ? 'Marked as read' : 'Marked as unread');
    }
  }

  Future<void> _dismiss(Notice notice) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Dismiss notice'),
        content: Text(
          'Remove “${notice.title}” from your list? Other students keep it, and the admin’s copy is not deleted.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text(
              'Dismiss',
              style: TextStyle(color: AppColors.absent),
            ),
          ),
        ],
      ),
    );
    if (confirm != true) return;

    final error = await noticeStore.dismiss(notice);
    if (!mounted) return;
    if (error != null) {
      showMessage(context, error, error: true);
    } else {
      setState(() => _expanded.remove(notice.key));
      showMessage(context, 'Notice dismissed');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          tooltip: 'Back to profile',
          onPressed: _back,
        ),
        title: const Text('Notifications & Notices'),
        actions: [
          ListenableBuilder(
            listenable: noticeStore,
            builder: (context, _) {
              final unread = noticeStore.unreadCount;
              if (unread == 0) return const SizedBox.shrink();
              return Padding(
                padding: const EdgeInsets.only(right: 6),
                child: Center(
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.16),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: Colors.white24),
                    ),
                    child: Text(
                      '$unread unread',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ),
              );
            },
          ),
          ListenableBuilder(
            listenable: noticeStore,
            builder: (context, _) => IconButton(
              icon: noticeStore.isLoading
                  ? const SizedBox.square(
                      dimension: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Icon(Icons.refresh),
              tooltip: 'Refresh',
              onPressed: noticeStore.isLoading
                  ? null
                  : () => noticeStore.refresh(showSpinner: true),
            ),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => noticeStore.refresh(),
        child: ListenableBuilder(
          listenable: noticeStore,
          builder: (context, _) => _buildBody(),
        ),
      ),
    );
  }

  Widget _buildBody() {
    final notices = noticeStore.adminNotices;
    final updates = noticeStore.updates;

    if (!noticeStore.hasLoaded && noticeStore.isLoading) {
      return _buildSkeleton();
    }

    if (noticeStore.items.isEmpty && noticeStore.error != null) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          SizedBox(
            height: 380,
            child: ErrorView(
              message: noticeStore.error!,
              onRetry: () => noticeStore.refresh(showSpinner: true),
            ),
          ),
        ],
      );
    }

    if (noticeStore.items.isEmpty) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: const [
          SizedBox(height: 40),
          EmptyView(
            icon: Icons.notifications_none_rounded,
            title: 'No notices yet',
            message: 'When the admin publishes a notice in Manage Notices it appears here for every student. Pull down to refresh.',
          ),
        ],
      );
    }

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
      children: [
        _buildSummary(),
        const SizedBox(height: 18),
        _sectionHeader(
          icon: Icons.campaign_outlined,
          title: 'Notices from Admin',
          count: notices.length,
          unread: noticeStore.adminUnreadCount,
        ),
        const SizedBox(height: 8),
        if (notices.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 12),
            child: Text(
              'No admin notices right now.',
              style: TextStyle(fontSize: 13, color: AppColors.muted),
            ),
          )
        else
          for (final notice in notices) ...[
            _NoticeTile(
              notice: notice,
              expanded: _expanded.contains(notice.key),
              onTap: () => _toggleExpanded(notice),
              onToggleRead: (read) => _setRead(notice, read),
              onDismiss: () => _dismiss(notice),
            ),
            const SizedBox(height: 10),
          ],
        if (updates.isNotEmpty) ...[
          const SizedBox(height: 12),
          _sectionHeader(
            icon: Icons.mark_email_unread_outlined,
            title: 'Your Updates',
            count: updates.length,
          ),
          const SizedBox(height: 8),
          for (final notice in updates) ...[
            _NoticeTile(
              notice: notice,
              expanded: _expanded.contains(notice.key),
              onTap: () => _toggleExpanded(notice),
              onToggleRead: (read) => _setRead(notice, read),
              onDismiss: () => _dismiss(notice),
            ),
            const SizedBox(height: 10),
          ],
        ],
        const SizedBox(height: 8),
        const Text(
          'Notices are published by the college admin. Read and dismissed state is saved to your account only.',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 11, color: AppColors.muted, height: 1.4),
        ),
      ],
    );
  }

  Widget _buildSummary() {
    final unread = noticeStore.unreadCount;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
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
              Icons.notifications_active_outlined,
              color: AppColors.royalBlue,
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  unread == 0
                      ? "You're all caught up"
                      : '$unread unread ${unread == 1 ? 'item' : 'items'}',
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: AppColors.navy,
                  ),
                ),
                const SizedBox(height: 2),
                const Text(
                  'Tap a notice to read the full text',
                  style: TextStyle(fontSize: 12, color: AppColors.muted),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _sectionHeader({
    required IconData icon,
    required String title,
    required int count,
    int unread = 0,
  }) {
    return Row(
      children: [
        Icon(icon, size: 18, color: AppColors.teal),
        const SizedBox(width: 8),
        Text(
          title,
          style: const TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w700,
            color: AppColors.navy,
          ),
        ),
        const SizedBox(width: 8),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
          decoration: BoxDecoration(
            color: AppColors.background,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: AppColors.border),
          ),
          child: Text(
            '$count',
            style: const TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: AppColors.muted,
            ),
          ),
        ),
        const Spacer(),
        if (unread > 0)
          Text(
            '$unread unread',
            style: const TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: AppColors.royalBlue,
            ),
          ),
      ],
    );
  }

  Widget _buildSkeleton() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        for (var i = 0; i < 4; i++) ...[
          if (i > 0) const SizedBox(height: 10),
          Container(
            height: 76,
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppColors.border),
            ),
          ),
        ],
      ],
    );
  }
}

/// One notice row. Collapsed: title, date and read status. Expanded: the full
/// title and description plus read/unread and dismiss actions.
class _NoticeTile extends StatelessWidget {
  const _NoticeTile({
    required this.notice,
    required this.expanded,
    required this.onTap,
    required this.onToggleRead,
    required this.onDismiss,
  });

  final Notice notice;
  final bool expanded;
  final VoidCallback onTap;
  final ValueChanged<bool> onToggleRead;
  final VoidCallback onDismiss;

  bool get _isAdminNotice => notice.kind != 'notification';

  @override
  Widget build(BuildContext context) {
    final unread = !notice.isRead;

    return Card(
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          InkWell(
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(14, 12, 8, 12),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 9,
                    height: 9,
                    margin: const EdgeInsets.only(top: 5),
                    decoration: BoxDecoration(
                      color: unread ? AppColors.royalBlue : AppColors.border,
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          notice.title,
                          maxLines: expanded ? 3 : 2,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 14.5,
                            height: 1.3,
                            fontWeight: unread
                                ? FontWeight.w700
                                : FontWeight.w500,
                            color: unread ? AppColors.navy : AppColors.muted,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Row(
                          children: [
                            const Icon(
                              Icons.event_outlined,
                              size: 12,
                              color: AppColors.muted,
                            ),
                            const SizedBox(width: 4),
                            Text(
                              formatDate(
                                notice.publishedAt ?? notice.createdAt,
                              ),
                              style: const TextStyle(
                                fontSize: 11,
                                color: AppColors.muted,
                              ),
                            ),
                            if (!_isAdminNotice) ...[
                              const SizedBox(width: 8),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 6,
                                  vertical: 1,
                                ),
                                decoration: BoxDecoration(
                                  color: AppColors.tealLight,
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: const Text(
                                  'Update',
                                  style: TextStyle(
                                    fontSize: 10,
                                    fontWeight: FontWeight.w600,
                                    color: AppColors.teal,
                                  ),
                                ),
                              ),
                            ],
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  StatusChip(
                    unread ? 'Unread' : 'Read',
                    color: unread ? AppColors.royalBlue : AppColors.muted,
                  ),
                  Icon(
                    expanded ? Icons.expand_less : Icons.expand_more,
                    color: AppColors.muted,
                    size: 22,
                  ),
                ],
              ),
            ),
          ),
          AnimatedSize(
            duration: const Duration(milliseconds: 180),
            curve: Curves.easeOut,
            alignment: Alignment.topCenter,
            child: expanded
                ? Container(
                    width: double.infinity,
                    padding: const EdgeInsets.fromLTRB(16, 14, 16, 6),
                    decoration: const BoxDecoration(
                      color: AppColors.background,
                      border: Border(top: BorderSide(color: AppColors.border)),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        // Full title, even when the collapsed row had to truncate it.
                        Text(
                          notice.title,
                          style: const TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w700,
                            color: AppColors.navy,
                            height: 1.35,
                          ),
                        ),
                        const SizedBox(height: 8),
                        SelectableText(
                          notice.description.isEmpty
                              ? 'No description provided.'
                              : notice.description,
                          style: const TextStyle(
                            fontSize: 13.5,
                            height: 1.55,
                            color: AppColors.navy,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Wrap(
                          spacing: 4,
                          children: [
                            TextButton.icon(
                              onPressed: () => onToggleRead(!notice.isRead),
                              icon: Icon(
                                notice.isRead
                                    ? Icons.mark_email_unread_outlined
                                    : Icons.mark_email_read_outlined,
                                size: 18,
                                color: AppColors.royalBlue,
                              ),
                              label: Text(
                                notice.isRead
                                    ? 'Mark as unread'
                                    : 'Mark as read',
                                style: const TextStyle(
                                  color: AppColors.royalBlue,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                            if (notice.isDismissible)
                              TextButton.icon(
                                onPressed: onDismiss,
                                icon: const Icon(
                                  Icons.delete_outline,
                                  size: 18,
                                  color: AppColors.absent,
                                ),
                                label: const Text(
                                  'Dismiss',
                                  style: TextStyle(
                                    color: AppColors.absent,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ],
                    ),
                  )
                : const SizedBox(width: double.infinity),
          ),
        ],
      ),
    );
  }
}
