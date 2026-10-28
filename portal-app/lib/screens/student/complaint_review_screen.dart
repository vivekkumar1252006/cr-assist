import 'package:flutter/material.dart';

import '../../../core/api_client.dart';
import '../../../core/theme.dart';
import '../../widgets/common.dart';
import 'complaint_attachment.dart';

/// What the API returns once a complaint row was created.
class ComplaintSubmitResult {
  const ComplaintSubmitResult({
    required this.id,
    required this.complaintNumber,
    required this.assigned,
  });

  final int id;
  final String complaintNumber;
  final bool assigned;
}

/// Read-only confirmation of the complaint before it is written to the
/// database. Mirrors the web portal's "Submit this complaint?" dialog, expanded
/// into a full screen so the attachments can be reviewed on a phone.
class ComplaintReviewScreen extends StatefulWidget {
  const ComplaintReviewScreen({
    super.key,
    required this.title,
    required this.typeLabel,
    required this.description,
    required this.attachments,
    required this.onSubmit,
    this.attendanceDate,
    this.sessionLabel,
    this.currentStatusLabel,
    this.requestedCorrectionLabel,
  });

  final String title;
  final String typeLabel;
  final String description;
  final List<ComplaintAttachment> attachments;
  final String? attendanceDate;
  final String? sessionLabel;
  final String? currentStatusLabel;
  final String? requestedCorrectionLabel;

  /// Performs the POST + attachment uploads, reporting a human-readable
  /// progress line. Throws [ApiException] when the server rejects the request.
  final Future<ComplaintSubmitResult> Function(
    void Function(String message) onProgress,
  )
  onSubmit;

  @override
  State<ComplaintReviewScreen> createState() => _ComplaintReviewScreenState();
}

class _ComplaintReviewScreenState extends State<ComplaintReviewScreen> {
  bool _submitting = false;
  String _progress = 'Submitting complaint…';
  String? _error;

  Future<void> _submit() async {
    if (_submitting) return;
    setState(() {
      _submitting = true;
      _error = null;
      _progress = 'Submitting complaint…';
    });

    try {
      final result = await widget.onSubmit((message) {
        if (mounted) setState(() => _progress = message);
      });
      if (!mounted) return;
      Navigator.of(context).pop(result);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _error = e.message;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _error = 'Could not submit the complaint. $e';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text('Review & Submit')),
      body: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
              children: [
                const Text(
                  'Review your complaint',
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w700,
                    color: AppColors.navy,
                  ),
                ),
                const SizedBox(height: 4),
                const Text(
                  'Check the details below before sending it to your college.',
                  style: TextStyle(
                    fontSize: 13,
                    color: AppColors.muted,
                    height: 1.4,
                  ),
                ),
                const SizedBox(height: 16),

                if (_error != null) ...[
                  NoticeBox(message: _error!),
                  const SizedBox(height: 16),
                ],

                SectionCard(
                  title: 'Complaint details',
                  icon: Icons.assignment_outlined,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _SummaryRow(label: 'Complaint title', value: widget.title),
                      const Divider(height: 20),
                      _SummaryRow(
                        label: 'Complaint type',
                        value: widget.typeLabel,
                      ),
                      if (widget.attendanceDate != null) ...[
                        const Divider(height: 20),
                        _SummaryRow(
                          label: 'Attendance date',
                          value: widget.attendanceDate!,
                        ),
                      ],
                      if (widget.sessionLabel != null) ...[
                        const Divider(height: 20),
                        _SummaryRow(
                          label: 'Class / session',
                          value: widget.sessionLabel!,
                        ),
                      ],
                      if (widget.currentStatusLabel != null) ...[
                        const Divider(height: 20),
                        _SummaryRow(
                          label: 'Current attendance status',
                          value: widget.currentStatusLabel!,
                        ),
                      ],
                      if (widget.requestedCorrectionLabel != null) ...[
                        const Divider(height: 20),
                        _SummaryRow(
                          label: 'Requested correction',
                          value: widget.requestedCorrectionLabel!,
                        ),
                      ],
                      const Divider(height: 20),
                      _SummaryRow(
                        label: 'Detailed description',
                        value: widget.description.isEmpty
                            ? 'No description provided.'
                            : widget.description,
                        muted: widget.description.isEmpty,
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),

                SectionCard(
                  title:
                      'Supporting attachments (${widget.attachments.length})',
                  icon: Icons.attach_file,
                  child: widget.attachments.isEmpty
                      ? const Text(
                          'No attachments selected.',
                          style: TextStyle(
                            fontSize: 13,
                            color: AppColors.muted,
                          ),
                        )
                      : Column(
                          children: [
                            for (var i = 0; i < widget.attachments.length; i++)
                              Padding(
                                padding: EdgeInsets.only(
                                  bottom: i == widget.attachments.length - 1
                                      ? 0
                                      : 8,
                                ),
                                child: AttachmentTile(
                                  attachment: widget.attachments[i],
                                  onPreview: () => showAttachmentPreview(
                                    context,
                                    widget.attachments[i],
                                  ),
                                ),
                              ),
                          ],
                        ),
                ),
                const SizedBox(height: 12),
                const Text(
                  'You won’t be able to edit these details after submitting, '
                  'but you can add follow-up messages and files while it is open.',
                  style: TextStyle(
                    fontSize: 12,
                    color: AppColors.muted,
                    height: 1.4,
                  ),
                ),
                const SizedBox(height: 16),
              ],
            ),
          ),
          SafeArea(
            top: false,
            child: Container(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
              decoration: const BoxDecoration(
                color: Colors.white,
                border: Border(top: BorderSide(color: AppColors.border)),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: _submitting
                          ? null
                          : () => Navigator.of(context).pop(),
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size(0, 48),
                      ),
                      child: const Text('Back'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    flex: 2,
                    child: FilledButton.icon(
                      onPressed: _submitting ? null : _submit,
                      style: FilledButton.styleFrom(
                        minimumSize: const Size(0, 48),
                      ),
                      icon: _submitting
                          ? const SizedBox.square(
                              dimension: 18,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : const Icon(Icons.send_rounded, size: 18),
                      label: Text(
                        _submitting ? _progress : 'Submit complaint',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _SummaryRow extends StatelessWidget {
  const _SummaryRow({
    required this.label,
    required this.value,
    this.muted = false,
  });

  final String label;
  final String value;
  final bool muted;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w600,
            letterSpacing: 0.3,
            color: AppColors.muted,
          ),
        ),
        const SizedBox(height: 3),
        Text(
          value,
          style: TextStyle(
            fontSize: 14,
            height: 1.45,
            fontWeight: muted ? FontWeight.w400 : FontWeight.w600,
            color: muted ? AppColors.muted : AppColors.navy,
          ),
        ),
      ],
    );
  }
}
