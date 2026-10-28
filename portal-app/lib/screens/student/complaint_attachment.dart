import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../../core/format.dart';
import '../../../core/theme.dart';

/// Extensions the server accepts for complaint attachments
/// (mirrors `ACCEPTED_TYPES` in `portal-web/src/shared/lib/complaints.js`).
const attachmentExtensions = <String>{'jpg', 'jpeg', 'png', 'webp', 'pdf'};
const attachmentImageExtensions = <String>{'jpg', 'jpeg', 'png', 'webp'};

String attachmentExtension(String name) {
  final dot = name.lastIndexOf('.');
  if (dot < 0 || dot == name.length - 1) return '';
  return name.substring(dot + 1).toLowerCase();
}

bool isSupportedAttachmentName(String name) =>
    attachmentExtensions.contains(attachmentExtension(name));

/// One file the student picked from storage, the gallery or the camera.
///
/// Upload state is mutated by the form while the complaint is submitted so the
/// confirmation screen can show per-file progress and failures.
class ComplaintAttachment {
  ComplaintAttachment({
    required this.name,
    required this.size,
    required this.file,
  });

  final String name;
  final int size;
  final XFile file;

  String? uploadError;
  bool uploaded = false;

  String get extension => attachmentExtension(name);
  bool get isImage => attachmentImageExtensions.contains(extension);
  bool get isPdf => extension == 'pdf';
}

/// Small square preview: the image itself, or a PDF badge.
class AttachmentThumbnail extends StatelessWidget {
  const AttachmentThumbnail({super.key, required this.attachment, this.size = 56});

  final ComplaintAttachment attachment;
  final double size;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(10),
      child: SizedBox.square(
        dimension: size,
        child: attachment.isImage
            ? Image.file(
                File(attachment.file.path),
                fit: BoxFit.cover,
                errorBuilder: (_, _, _) => _fallbackIcon(),
              )
            : _fallbackIcon(),
      ),
    );
  }

  Widget _fallbackIcon() {
    final color = attachment.isPdf ? AppColors.absent : AppColors.teal;
    return ColoredBox(
      color: attachment.isPdf
          ? AppColors.absent.withValues(alpha: 0.08)
          : AppColors.tealLight,
      child: Icon(
        attachment.isPdf
            ? Icons.picture_as_pdf_outlined
            : Icons.image_outlined,
        color: color,
        size: size * 0.45,
      ),
    );
  }
}

/// A file row used by the form and by the review screen.
class AttachmentTile extends StatelessWidget {
  const AttachmentTile({
    super.key,
    required this.attachment,
    this.onRemove,
    this.onPreview,
    this.statusLabel,
    this.statusColor,
    this.trailing,
  });

  final ComplaintAttachment attachment;
  final VoidCallback? onRemove;
  final VoidCallback? onPreview;
  final String? statusLabel;
  final Color? statusColor;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          GestureDetector(
            onTap: onPreview,
            child: AttachmentThumbnail(attachment: attachment),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  attachment.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: AppColors.navy,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  formatBytes(attachment.size),
                  style: const TextStyle(fontSize: 11, color: AppColors.muted),
                ),
                if (statusLabel != null && statusLabel!.isNotEmpty) ...[
                  const SizedBox(height: 3),
                  Text(
                    statusLabel!,
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: statusColor ?? AppColors.teal,
                    ),
                  ),
                ],
              ],
            ),
          ),
          if (onPreview != null)
            IconButton(
              tooltip: attachment.isImage ? 'Preview image' : 'File details',
              visualDensity: VisualDensity.compact,
              icon: const Icon(Icons.visibility_outlined, size: 19),
              color: AppColors.muted,
              onPressed: onPreview,
            ),
          if (onRemove != null)
            IconButton(
              tooltip: 'Remove attachment',
              visualDensity: VisualDensity.compact,
              icon: const Icon(Icons.close, size: 19),
              color: AppColors.absent,
              onPressed: onRemove,
            ),
          if (trailing != null) ?trailing,
        ],
      ),
    );
  }
}

/// Opens a full-screen preview for images. PDFs cannot be rendered without a
/// native viewer, so they get a details dialog instead of a blank preview.
void showAttachmentPreview(
  BuildContext context,
  ComplaintAttachment attachment,
) {
  if (attachment.isImage) {
    showDialog<void>(
      context: context,
      builder: (ctx) => Dialog(
        backgroundColor: Colors.black,
        insetPadding: const EdgeInsets.all(12),
        child: Stack(
          children: [
            Positioned.fill(
              child: InteractiveViewer(
                maxScale: 4,
                child: Image.file(
                  File(attachment.file.path),
                  fit: BoxFit.contain,
                  errorBuilder: (_, _, _) => const Center(
                    child: Text(
                      'Preview is not available for this image.',
                      style: TextStyle(color: Colors.white),
                    ),
                  ),
                ),
              ),
            ),
            Positioned(
              right: 4,
              top: 4,
              child: IconButton(
                icon: const Icon(Icons.close, color: Colors.white),
                onPressed: () => Navigator.pop(ctx),
              ),
            ),
          ],
        ),
      ),
    );
    return;
  }

  showDialog<void>(
    context: context,
    builder: (ctx) => AlertDialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      title: const Text('PDF attachment'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            attachment.name,
            style: const TextStyle(
              fontWeight: FontWeight.w600,
              color: AppColors.navy,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            formatBytes(attachment.size),
            style: const TextStyle(fontSize: 12, color: AppColors.muted),
          ),
          const SizedBox(height: 12),
          const Text(
            'In-app PDF preview is not available on mobile. The file will be '
            'uploaded with your complaint and can be opened from the web portal.',
            style: TextStyle(fontSize: 13, color: AppColors.muted, height: 1.4),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(ctx),
          child: const Text('Close'),
        ),
      ],
    ),
  );
}
