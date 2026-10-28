import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/complaint_feed.dart';
import '../../../core/format.dart';
import '../../../core/models.dart';
import '../../../core/services.dart';
import '../../../core/theme.dart';
import '../../../widgets/common.dart';

class ComplaintsScreen extends StatefulWidget {
  const ComplaintsScreen({super.key});

  @override
  State<ComplaintsScreen> createState() => _ComplaintsScreenState();
}

class _ComplaintsScreenState extends State<ComplaintsScreen> {
  String _statusFilter = 'all';
  String _searchQuery = '';
  final _searchController = TextEditingController();
  int _feedRevision = complaintFeedRevision.value;

  Future<Map<String, dynamic>> _loadComplaints() async {
    final query = <String, dynamic>{'limit': 50};
    if (_statusFilter != 'all') query['status'] = _statusFilter;
    if (_searchQuery.trim().isNotEmpty) query['q'] = _searchQuery.trim();
    return api.get('/complaints/my', query: query);
  }

  @override
  void initState() {
    super.initState();
    complaintFeedRevision.addListener(_onFeedChanged);
  }

  /// A complaint was submitted while this list stayed in the background; the
  /// revision bump recreates [AsyncView] so the new row is fetched.
  void _onFeedChanged() {
    if (!mounted) return;
    setState(() => _feedRevision = complaintFeedRevision.value);
  }

  @override
  void dispose() {
    complaintFeedRevision.removeListener(_onFeedChanged);
    _searchController.dispose();
    super.dispose();
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
            const Text('Problem & Complaints'),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: AppColors.navy,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.add),
        label: const Text('New Complaint'),
        onPressed: () => context.push('/complaints/new'),
      ),
      body: Column(
        children: [
          // Search & Filter header
          Container(
            color: Colors.white,
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: Column(
              children: [
                TextField(
                  controller: _searchController,
                  decoration: InputDecoration(
                    hintText: 'Search by title or ID (e.g. CMP-...)',
                    prefixIcon: const Icon(Icons.search, size: 20),
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 10,
                    ),
                    suffixIcon: _searchController.text.isNotEmpty
                        ? IconButton(
                            icon: const Icon(Icons.clear, size: 18),
                            onPressed: () {
                              _searchController.clear();
                              setState(() => _searchQuery = '');
                            },
                          )
                        : null,
                  ),
                  onSubmitted: (v) => setState(() => _searchQuery = v),
                ),
                const SizedBox(height: 10),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      for (final (id, label) in [
                        ('all', 'All Complaints'),
                        ('submitted', 'Submitted'),
                        ('under_review', 'Under Review'),
                        ('in_progress', 'In Progress'),
                        ('resolved', 'Resolved'),
                        ('rejected', 'Rejected'),
                      ])
                        Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: FilterChip(
                            label: Text(label),
                            selected: _statusFilter == id,
                            onSelected: (val) {
                              if (val && _statusFilter != id) {
                                setState(() => _statusFilter = id);
                              }
                            },
                          ),
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const Divider(height: 1),

          // List
          Expanded(
            child: AsyncView(
              key: ValueKey('$_statusFilter:$_searchQuery:$_feedRevision'),
              load: _loadComplaints,
              builder: (context, data, reload) {
                final items = (data['items'] as List<dynamic>? ?? [])
                    .cast<Map<String, dynamic>>();

                if (items.isEmpty) {
                  return EmptyView(
                    icon: Icons.assignment_outlined,
                    title: 'No complaints found',
                    message: _statusFilter == 'all' && _searchQuery.isEmpty
                        ? 'You have not submitted any complaints yet. Use the button below to report an issue.'
                        : 'No complaints match your filter or search criteria.',
                    action: FilledButton.icon(
                      onPressed: () => context.push('/complaints/new'),
                      icon: const Icon(Icons.add),
                      label: const Text('Submit a Complaint'),
                    ),
                  );
                }

                return RefreshIndicator(
                  onRefresh: reload,
                  child: ListView.separated(
                    padding: const EdgeInsets.fromLTRB(16, 16, 16, 80),
                    itemCount: items.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 10),
                    itemBuilder: (context, index) {
                      final item = items[index];
                      final id = asInt(item['id']);
                      final number =
                          item['complaintNumber'] as String? ?? 'CMP-$id';
                      final title = item['title'] as String? ?? 'Complaint';
                      final categoryLabel =
                          item['categoryLabel'] as String? ??
                          item['category'] ??
                          'General';
                      final status = item['status'] as String? ?? 'submitted';
                      final priority = item['priority'] as String? ?? 'medium';
                      final createdAt = parseDate(item['createdAt']);
                      final attachmentCount = asInt(item['attachmentCount']);
                      final assigned =
                          item['assignedTo'] as Map<String, dynamic>?;

                      return Card(
                        child: InkWell(
                          borderRadius: BorderRadius.circular(16),
                          onTap: () => context.push('/complaints/$id'),
                          child: Padding(
                            padding: const EdgeInsets.all(16),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Container(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 8,
                                        vertical: 3,
                                      ),
                                      decoration: BoxDecoration(
                                        color: AppColors.background,
                                        borderRadius: BorderRadius.circular(6),
                                        border: Border.all(
                                          color: AppColors.border,
                                        ),
                                      ),
                                      child: Text(
                                        number,
                                        style: const TextStyle(
                                          fontWeight: FontWeight.w700,
                                          fontSize: 12,
                                          color: AppColors.navy,
                                        ),
                                      ),
                                    ),
                                    const Spacer(),
                                    StatusChip.complaint(status),
                                  ],
                                ),
                                const SizedBox(height: 10),
                                Text(
                                  title,
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w700,
                                    fontSize: 16,
                                    color: AppColors.navy,
                                  ),
                                ),
                                const SizedBox(height: 6),
                                Text(
                                  categoryLabel,
                                  style: const TextStyle(
                                    fontSize: 13,
                                    color: AppColors.teal,
                                    fontWeight: FontWeight.w500,
                                  ),
                                ),
                                const SizedBox(height: 10),
                                const Divider(height: 1),
                                const SizedBox(height: 10),
                                Row(
                                  children: [
                                    const Icon(
                                      Icons.calendar_today,
                                      size: 14,
                                      color: AppColors.muted,
                                    ),
                                    const SizedBox(width: 4),
                                    Text(
                                      formatDate(createdAt),
                                      style: const TextStyle(
                                        fontSize: 12,
                                        color: AppColors.muted,
                                      ),
                                    ),
                                    const Spacer(),
                                    if (attachmentCount > 0) ...[
                                      const Icon(
                                        Icons.attach_file,
                                        size: 14,
                                        color: AppColors.muted,
                                      ),
                                      const SizedBox(width: 2),
                                      Text(
                                        '$attachmentCount',
                                        style: const TextStyle(
                                          fontSize: 12,
                                          color: AppColors.muted,
                                        ),
                                      ),
                                      const SizedBox(width: 10),
                                    ],
                                    Container(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 6,
                                        vertical: 2,
                                      ),
                                      decoration: BoxDecoration(
                                        color: priority == 'high'
                                            ? AppColors.absent.withValues(
                                                alpha: 0.1,
                                              )
                                            : priority == 'medium'
                                            ? AppColors.late.withValues(
                                                alpha: 0.1,
                                              )
                                            : AppColors.present.withValues(
                                                alpha: 0.1,
                                              ),
                                        borderRadius: BorderRadius.circular(4),
                                      ),
                                      child: Text(
                                        priority.toUpperCase(),
                                        style: TextStyle(
                                          fontSize: 10,
                                          fontWeight: FontWeight.w700,
                                          color: priority == 'high'
                                              ? AppColors.absent
                                              : priority == 'medium'
                                              ? AppColors.late
                                              : AppColors.present,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                                if (assigned != null) ...[
                                  const SizedBox(height: 6),
                                  Text(
                                    'Assigned to: ${assigned['name']}',
                                    style: const TextStyle(
                                      fontSize: 12,
                                      color: AppColors.muted,
                                      fontStyle: FontStyle.italic,
                                    ),
                                  ),
                                ],
                              ],
                            ),
                          ),
                        ),
                      );
                    },
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
