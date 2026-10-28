import 'package:flutter/material.dart';
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';

import '../../../core/api_client.dart';
import '../../../core/format.dart';
import '../../../core/models.dart';
import '../../../core/services.dart';
import '../../../core/theme.dart';
import '../../../widgets/common.dart';

class ComplaintDetailScreen extends StatefulWidget {
  const ComplaintDetailScreen({super.key, required this.id});

  final int id;

  @override
  State<ComplaintDetailScreen> createState() => _ComplaintDetailScreenState();
}

class _ComplaintDetailScreenState extends State<ComplaintDetailScreen> {
  int? _downloadingAttachmentId;

  Future<Map<String, dynamic>> _loadComplaint() =>
      api.get('/complaints/${widget.id}');

  Future<void> _reopenComplaint(VoidCallback reload) async {
    final reasonController = TextEditingController();
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Reopen Complaint'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Provide a reason for reopening this resolved complaint:',
            ),
            const SizedBox(height: 12),
            TextField(
              controller: reasonController,
              maxLines: 3,
              decoration: const InputDecoration(
                hintText: 'Enter reason (min 10 characters)',
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              if (reasonController.text.trim().length >= 10) {
                Navigator.pop(ctx, true);
              } else {
                showMessage(
                  ctx,
                  'Reason must be at least 10 characters',
                  error: true,
                );
              }
            },
            child: const Text('Reopen'),
          ),
        ],
      ),
    );

    if (confirm == true) {
      try {
        await api.post('/complaints/${widget.id}/reopen', {
          'reason': reasonController.text.trim(),
        });
        reload();
        if (mounted) showMessage(context, 'Complaint reopened');
      } on ApiException catch (e) {
        if (mounted) showMessage(context, e.message, error: true);
      }
    }
  }

  Future<void> _openAttachment(Map<String, dynamic> attachment) async {
    final attId = asInt(attachment['id']);
    final filename = attachment['name'] as String? ?? 'attachment';
    final url =
        attachment['url'] as String? ??
        '/api/complaints/${widget.id}/attachments/$attId';

    setState(() => _downloadingAttachmentId = attId);
    try {
      final tempDir = await getTemporaryDirectory();
      final savePath = '${tempDir.path}/$filename';
      await api.download(url, savePath);
      await OpenFilex.open(savePath);
    } catch (e) {
      if (mounted) showMessage(context, 'Failed to open file: $e', error: true);
    } finally {
      if (mounted) setState(() => _downloadingAttachmentId = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Complaint Details')),
      body: AsyncView(
        load: _loadComplaint,
        builder: (context, data, reload) {
          final c = data['complaint'] as Map<String, dynamic>;
          final permissions =
              data['permissions'] as Map<String, dynamic>? ?? {};
          final number = c['complaintNumber'] as String? ?? 'CMP-${widget.id}';
          final title = c['title'] as String? ?? '';
          final status = c['status'] as String? ?? 'submitted';
          final categoryLabel =
              c['categoryLabel'] as String? ?? c['category'] ?? '';
          final summary = c['summary'] as String? ?? '';
          final description = c['description'] as String? ?? '';
          final createdAt = parseDate(c['createdAt']);
          final assigned = c['assignedTo'] as Map<String, dynamic>?;
          final resolutionNote = c['resolutionNote'] as String?;
          final correction = c['correction'] as Map<String, dynamic>?;
          final attachments = (c['attachments'] as List<dynamic>? ?? [])
              .cast<Map<String, dynamic>>();

          final canReopen = permissions['canReopen'] == true;

          return RefreshIndicator(
            onRefresh: () async => reload(),
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                // Header Card
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 10,
                                vertical: 4,
                              ),
                              decoration: BoxDecoration(
                                color: AppColors.background,
                                borderRadius: BorderRadius.circular(8),
                                border: Border.all(color: AppColors.border),
                              ),
                              child: Text(
                                number,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 13,
                                  color: AppColors.navy,
                                ),
                              ),
                            ),
                            const Spacer(),
                            StatusChip.complaint(status),
                          ],
                        ),
                        const SizedBox(height: 12),
                        Text(
                          title,
                          style: const TextStyle(
                            fontWeight: FontWeight.w700,
                            fontSize: 18,
                            color: AppColors.navy,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          categoryLabel,
                          style: const TextStyle(
                            fontSize: 14,
                            color: AppColors.teal,
                            fontWeight: FontWeight.w600,
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
                              'Submitted on ${formatDateTime(createdAt)}',
                              style: const TextStyle(
                                fontSize: 12,
                                color: AppColors.muted,
                              ),
                            ),
                          ],
                        ),
                        if (assigned != null) ...[
                          const SizedBox(height: 6),
                          Row(
                            children: [
                              const Icon(
                                Icons.person_pin,
                                size: 14,
                                color: AppColors.muted,
                              ),
                              const SizedBox(width: 4),
                              Text(
                                'Assigned to: ${assigned['name']}',
                                style: const TextStyle(
                                  fontSize: 12,
                                  color: AppColors.muted,
                                ),
                              ),
                            ],
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),

                // Description Card
                SectionCard(
                  title: 'Description',
                  icon: Icons.notes,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (summary.isNotEmpty) ...[
                        Text(
                          summary,
                          style: const TextStyle(
                            fontWeight: FontWeight.w600,
                            fontSize: 14,
                            color: AppColors.navy,
                          ),
                        ),
                        const SizedBox(height: 8),
                      ],
                      Text(
                        description,
                        style: const TextStyle(
                          fontSize: 14,
                          height: 1.5,
                          color: Colors.black87,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),

                // Attendance Correction Status (if any)
                if (correction != null) ...[
                  SectionCard(
                    title: 'Attendance Correction Request',
                    icon: Icons.fact_check,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        InfoRow(
                          icon: Icons.replay,
                          label: 'Original Status',
                          value:
                              (correction['originalStatus'] as String? ??
                                      'Not recorded')
                                  .toUpperCase(),
                        ),
                        const Divider(height: 1),
                        InfoRow(
                          icon: Icons.edit_calendar,
                          label: 'Requested Status',
                          value:
                              (correction['requestedStatus'] as String? ?? '')
                                  .toUpperCase(),
                        ),
                        const Divider(height: 1),
                        InfoRow(
                          icon: Icons.gavel,
                          label: 'Decision',
                          value:
                              (correction['decision'] as String? ?? 'Pending')
                                  .toUpperCase(),
                        ),
                        if (correction['reason'] != null) ...[
                          const Divider(height: 1),
                          InfoRow(
                            icon: Icons.comment,
                            label: 'Decision Reason',
                            value: correction['reason'] as String,
                          ),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                ],

                // Resolution Note (if resolved)
                if (resolutionNote != null && resolutionNote.isNotEmpty) ...[
                  SectionCard(
                    title: 'Resolution Details',
                    icon: Icons.task_alt,
                    child: Text(
                      resolutionNote,
                      style: const TextStyle(
                        fontSize: 14,
                        color: AppColors.present,
                        height: 1.4,
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                ],

                // Attachments List
                if (attachments.isNotEmpty) ...[
                  SectionCard(
                    title: 'Attachments (${attachments.length})',
                    icon: Icons.attach_file,
                    child: Column(
                      children: [
                        for (final att in attachments)
                          ListTile(
                            contentPadding: EdgeInsets.zero,
                            leading: Icon(
                              (att['name'] as String? ?? '')
                                      .toLowerCase()
                                      .endsWith('.pdf')
                                  ? Icons.picture_as_pdf
                                  : Icons.image,
                              color: AppColors.teal,
                            ),
                            title: Text(
                              att['name'] as String? ?? 'File',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            subtitle: Text(formatBytes(asInt(att['size']))),
                            trailing:
                                _downloadingAttachmentId == asInt(att['id'])
                                ? const SizedBox.square(
                                    dimension: 20,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                    ),
                                  )
                                : IconButton(
                                    icon: const Icon(
                                      Icons.open_in_new,
                                      color: AppColors.navy,
                                    ),
                                    tooltip: 'Open',
                                    onPressed: () => _openAttachment(att),
                                  ),
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                ],

                // Reopen Button
                if (canReopen) ...[
                  OutlinedButton.icon(
                    onPressed: () => _reopenComplaint(reload),
                    icon: const Icon(Icons.replay),
                    label: const Text('Reopen Complaint'),
                  ),
                  const SizedBox(height: 16),
                ],
              ],
            ),
          );
        },
      ),
    );
  }
}
