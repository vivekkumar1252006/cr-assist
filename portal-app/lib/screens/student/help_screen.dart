import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/services.dart';
import '../../../core/theme.dart';
import '../../../widgets/common.dart';

/// Help & Support screen displaying live in-charge and CR contacts from the backend API,
/// with fallbacks matching the web portal contacts.
class HelpScreen extends StatelessWidget {
  const HelpScreen({super.key});

  Future<List<Map<String, dynamic>>> _loadContacts() async {
    // 1. Try /incharges endpoint
    try {
      final res = await api.get('/incharges');
      final raw = res['contacts'] ?? res['incharges'] ?? res['data'];
      if (raw is List && raw.isNotEmpty) {
        return raw
            .whereType<Map>()
            .map((row) => Map<String, dynamic>.from(row))
            .toList();
      }
    } catch (_) {}

    // 2. Try /student/incharge endpoint
    try {
      final res = await api.get('/student/incharge');
      final incharge = res['incharge'];
      if (incharge is Map && incharge.isNotEmpty) {
        return [Map<String, dynamic>.from(incharge)];
      }
      final raw = res['contacts'] ?? res['incharges'];
      if (raw is List && raw.isNotEmpty) {
        return raw
            .whereType<Map>()
            .map((row) => Map<String, dynamic>.from(row))
            .toList();
      }
    } catch (_) {}

    // 3. Fallback to default contacts matching web portal (Shubhi Rajput & Vivek Kumar)
    return const [
      {
        'name': 'Shubhi Rajput',
        'designation': 'CR',
        'email': 'rajputshubhi165@gmail.com',
        'phone': '9329449829',
        'photoUrl': 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?q=80&w=400&auto=format&fit=crop',
      },
      {
        'name': 'Vivek Kumar',
        'designation': 'CR',
        'email': 'vk1967648@gmail.com',
        'phone': '8084768986',
        'photoUrl': 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=400&auto=format&fit=crop',
      },
    ];
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Help & Support')),
      body: AsyncView<List<Map<String, dynamic>>>(
        load: _loadContacts,
        builder: (context, contacts, reload) {
          if (contacts.isEmpty) {
            return RefreshIndicator(
              onRefresh: reload,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                children: const [
                  SizedBox(height: 80),
                  EmptyView(
                    icon: Icons.contact_support_outlined,
                    title: 'No contacts available',
                    message: 'Please check back later or contact the administration.',
                  ),
                ],
              ),
            );
          }

          return RefreshIndicator(
            onRefresh: reload,
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.all(16),
              children: [
                const Text(
                  'Contact a class in-charge for assistance.',
                  style: TextStyle(fontSize: 13, color: AppColors.muted),
                ),
                const SizedBox(height: 12),
                LayoutBuilder(
                  builder: (context, constraints) {
                    final wide = constraints.maxWidth >= 600;
                    if (wide) {
                      return Wrap(
                        spacing: 16,
                        runSpacing: 16,
                        children: [
                          for (final contact in contacts)
                            SizedBox(
                              width: (constraints.maxWidth - 16) / 2,
                              child: _ContactCard(contact: contact),
                            ),
                        ],
                      );
                    }
                    return Column(
                      children: [
                        for (int i = 0; i < contacts.length; i++) ...[
                          _ContactCard(contact: contacts[i]),
                          if (i < contacts.length - 1)
                            const SizedBox(height: 16),
                        ],
                      ],
                    );
                  },
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

/// In-charge / CR contact card displaying photo, name, designation, email, phone, and Call/Email action buttons.
class _ContactCard extends StatelessWidget {
  const _ContactCard({required this.contact});

  final Map<String, dynamic> contact;

  String get _name =>
      (contact['name'] as String? ?? contact['fullName'] as String? ?? '')
          .trim();
  String get _designation =>
      (contact['designation'] as String? ?? contact['role'] as String? ?? 'CR')
          .trim();
  String get _email => (contact['email'] as String? ?? '').trim();
  String get _phone =>
      (contact['phone'] as String? ?? contact['contactNumber'] as String? ?? '')
          .trim();
  String? get _photoUrl =>
      contact['photoUrl'] as String? ?? contact['photo'] as String?;

  Future<void> _launch(String uriString, BuildContext context) async {
    final uri = Uri.parse(uriString);
    try {
      final launched = await launchUrl(
        uri,
        mode: LaunchMode.externalApplication,
      );
      if (!launched && context.mounted) {
        Clipboard.setData(
          ClipboardData(text: uriString.contains('tel:') ? _phone : _email),
        );
        showMessage(context, 'Copied details to clipboard');
      }
    } catch (_) {
      if (context.mounted) {
        Clipboard.setData(
          ClipboardData(text: uriString.contains('tel:') ? _phone : _email),
        );
        showMessage(context, 'Copied details to clipboard');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 2,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
        side: const BorderSide(color: AppColors.border),
      ),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                _buildAvatar(_name, _photoUrl),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _name,
                        style: const TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 18,
                          color: AppColors.navy,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        _designation,
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: AppColors.royalBlue,
                        ),
                      ),
                      if (_email.isNotEmpty) ...[
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            const Icon(
                              Icons.mail_outline,
                              size: 14,
                              color: AppColors.muted,
                            ),
                            const SizedBox(width: 6),
                            Expanded(
                              child: Text(
                                _email,
                                style: const TextStyle(
                                  fontSize: 12,
                                  color: AppColors.muted,
                                ),
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ],
                        ),
                      ],
                      if (_phone.isNotEmpty) ...[
                        const SizedBox(height: 4),
                        Row(
                          children: [
                            const Icon(
                              Icons.phone_outlined,
                              size: 14,
                              color: AppColors.muted,
                            ),
                            const SizedBox(width: 6),
                            Text(
                              _phone,
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
              ],
            ),
            const SizedBox(height: 18),
            Row(
              children: [
                Expanded(
                  child: FilledButton.icon(
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.navy,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 10),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    icon: const Icon(Icons.call, size: 16),
                    label: const Text(
                      'Call',
                      style: TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 13,
                      ),
                    ),
                    onPressed: _phone.isEmpty
                        ? null
                        : () => _launch('tel:$_phone', context),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppColors.navy,
                      padding: const EdgeInsets.symmetric(vertical: 10),
                      side: const BorderSide(
                        color: AppColors.border,
                        width: 1.5,
                      ),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    icon: const Icon(Icons.mail_outline, size: 16),
                    label: const Text(
                      'Email',
                      style: TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 13,
                      ),
                    ),
                    onPressed: _email.isEmpty
                        ? null
                        : () => _launch('mailto:$_email', context),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildAvatar(String name, String? photoUrl) {
    if (photoUrl != null && photoUrl.startsWith('http')) {
      return CircleAvatar(
        radius: 36,
        backgroundColor: AppColors.tealLight,
        backgroundImage: NetworkImage(photoUrl),
      );
    }
    return UserAvatar(name: name, photoUrl: photoUrl, radius: 36);
  }
}
