import 'dart:async';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:path_provider/path_provider.dart';

import '../../../core/format.dart';
import '../../../core/models.dart';
import '../../../core/services.dart';
import '../../../core/theme.dart';
import '../../../widgets/common.dart';

class AboutScreen extends StatefulWidget {
  const AboutScreen({super.key});

  @override
  State<AboutScreen> createState() => _AboutScreenState();
}

class _AboutScreenState extends State<AboutScreen> with WidgetsBindingObserver {
  AboutData? _data;
  bool _loading = true;
  String? _error;

  // Version update state. The newest release is always read from the backend,
  // so a version only appears here after an admin publishes it.
  AppBuildInfo? _currentApp;
  ApkRelease? _latestRelease;
  bool _updateAvailable = false;
  bool _checkingUpdate = false;
  bool _releaseChecked = false;
  String? _versionError;

  /// Developer photos fetched through the authenticated API, keyed by id.
  final Map<int, Uint8List?> _photoCache = {};

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _loadAbout();
    _loadAppVersion();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Returning from the package installer (or from an admin publishing a new
    // APK while this screen was open) should refresh the published version.
    if (state == AppLifecycleState.resumed) _refreshRelease();
  }

  Future<void> _loadAbout() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final data = await aboutService.fetchAbout();
      if (mounted) {
        setState(() {
          _data = data;
          _loading = false;
        });
        _loadDeveloperPhotos(data.developers);
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e.toString();
          _loading = false;
        });
      }
    }
  }

  Future<void> _loadAppVersion() async {
    try {
      final info = await updateService.currentAppInfo();
      if (!mounted) return;
      setState(() => _currentApp = info);
      await _refreshRelease();
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _versionError = 'Could not read the installed app version.';
      });
    }
  }

  /// Fetches the latest published APK and compares it with the installed build.
  /// When [interactive] is true (the student tapped Update App), opens the update
  /// prompt or the "latest version" confirmation.
  Future<void> _refreshRelease({bool interactive = false}) async {
    if (_checkingUpdate) return;

    setState(() {
      _checkingUpdate = true;
      _versionError = null;
    });

    try {
      final release = await updateService.fetchLatestRelease();
      final current = _currentApp ?? await updateService.currentAppInfo();
      final newer =
          release != null &&
          release.isAvailable &&
          updateService.isNewer(release, current);

      if (!mounted) return;
      setState(() {
        _currentApp = current;
        _latestRelease = release;
        _updateAvailable = newer;
        _checkingUpdate = false;
        _releaseChecked = true;
      });

      if (!interactive) return;

      if (release == null) {
        _showUpToDateDialog();
      } else if (!release.isAvailable) {
        _showError(
          'Version ${release.versionName} was published, but its APK file is not '
          'available on the server. Please contact the administrator.',
        );
      } else if (newer) {
        _showUpdateSheet(release);
      } else {
        _showUpToDateDialog();
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _checkingUpdate = false;
        _releaseChecked = false;
        _versionError = 'Could not check for updates.';
      });
      if (interactive) _showError('Could not check for updates: $e');
    }
  }

  Future<void> _loadDeveloperPhotos(List<AboutDeveloper> developers) async {
    for (final dev in developers) {
      if (!dev.hasPhoto || _photoCache.containsKey(dev.id)) continue;
      try {
        final bytes = await aboutService.fetchDeveloperPhoto(dev.id);
        if (!mounted) return;
        setState(() => _photoCache[dev.id] = bytes);
      } catch (_) {
        // A missing photo just falls back to the initials avatar.
      }
    }
  }

  // --- Update prompt ---

  void _showUpdateSheet(ApkRelease release) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      isDismissible: false,
      enableDrag: false,
      backgroundColor: Colors.transparent,
      builder: (_) => _UpdateSheet(
        release: release,
        currentVersion: _currentApp?.label ?? 'Unknown',
      ),
    );
  }

  void _showUpToDateDialog() {
    if (!mounted) return;
    final current = _currentApp;

    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: AppColors.tealLight,
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Icon(
                Icons.check_circle_rounded,
                color: AppColors.teal,
                size: 20,
              ),
            ),
            const SizedBox(width: 10),
            const Expanded(
              child: Text(
                'You’re using the latest version',
                style: TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.w700,
                  color: AppColors.navy,
                ),
              ),
            ),
          ],
        ),
        content: Text(
          current == null
              ? 'No newer APK has been published yet.'
              : 'Version ${current.label} is the newest published release.',
          style: const TextStyle(
            fontSize: 13,
            color: AppColors.muted,
            height: 1.5,
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('OK'),
          ),
        ],
      ),
    );
  }

  // --- UI Methods ---

  void _showError(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: AppColors.absent,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
  }

  // --- Build Methods ---

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('About & Developer'),
        actions: [
          // Update App button replacing refresh
          _buildUpdateAppBarButton(),
        ],
      ),
      body: _buildBody(cs),
    );
  }

  // Update App button in the app bar (replaces the old refresh action).
  Widget _buildUpdateAppBarButton() {
    final checking = _checkingUpdate;

    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: TextButton.icon(
        onPressed: checking ? null : () => _refreshRelease(interactive: true),
        icon: checking
            ? const SizedBox.square(
                dimension: 14,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: Colors.white,
                ),
              )
            : Badge(
                isLabelVisible: _updateAvailable,
                smallSize: 8,
                backgroundColor: AppColors.teal,
                child: const Icon(Icons.system_update_rounded, size: 18),
              ),
        label: Text(
          checking ? 'Checking…' : 'Update App',
          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
        ),
        style: TextButton.styleFrom(
          foregroundColor: Colors.white,
          disabledForegroundColor: Colors.white70,
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
        ),
      ),
    );
  }

  Widget _buildBody(ColorScheme cs) {
    if (_loading && _data == null) {
      return ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _buildSkeletonCard(),
          const SizedBox(height: 16),
          _buildSkeletonCard(),
          const SizedBox(height: 16),
          _buildSkeletonCard(),
        ],
      );
    }

    if (_error != null && _data == null) {
      return _ErrorState(message: _error!, onRetry: _loadAbout);
    }

    if (_data == null) return const SizedBox.shrink();

    final appCards = _data!.appCards;
    final developers = _data!.developers;

    return RefreshIndicator(
      onRefresh: () async {
        await Future.wait([_loadAbout(), _refreshRelease()]);
      },
      color: AppColors.teal,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        children: [
          // CARD 1: ABOUT APP (Portal purpose & key features) with update info
          ...appCards.map((app) => _buildAppCardWithUpdateInfo(app, cs)),

          const SizedBox(height: 32),

          // CARD 2: ABOUT DEVELOPER
          _buildDeveloperSectionHeader(developers.length),
          const SizedBox(height: 12),
          _buildDevelopersGrid(developers, cs),
        ],
      ),
    );
  }

  Widget _buildSkeletonCard() {
    return Container(
      height: 140,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.border),
      ),
    );
  }

  Widget _buildUpdateStatus() {
    final release = _latestRelease;

    if (_updateAvailable && release != null) {
      return Wrap(
        crossAxisAlignment: WrapCrossAlignment.center,
        spacing: 2,
        runSpacing: 2,
        children: [
          Text(
            'New version v${release.versionName} available',
            style: const TextStyle(
              fontSize: 12,
              color: AppColors.teal,
              fontWeight: FontWeight.w600,
            ),
          ),
          TextButton(
            onPressed: () => _showUpdateSheet(release),
            style: TextButton.styleFrom(
              foregroundColor: AppColors.teal,
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              minimumSize: const Size(0, 32),
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              textStyle: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
              ),
            ),
            child: const Text('Update App'),
          ),
        ],
      );
    }

    if (_checkingUpdate) {
      return const Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox.square(
            dimension: 12,
            child: CircularProgressIndicator(
              strokeWidth: 2,
              color: AppColors.teal,
            ),
          ),
          SizedBox(width: 6),
          Text(
            'Checking for updates…',
            style: TextStyle(fontSize: 12, color: AppColors.muted),
          ),
        ],
      );
    }

    if (_versionError != null) {
      return Text(
        _versionError!,
        style: const TextStyle(
          fontSize: 12,
          color: AppColors.late,
          fontWeight: FontWeight.w500,
        ),
      );
    }

    if (_releaseChecked) {
      return const Text(
        'You’re using the latest version',
        style: TextStyle(
          fontSize: 12,
          color: AppColors.teal,
          fontWeight: FontWeight.w500,
        ),
      );
    }

    return const SizedBox.shrink();
  }

  Widget _buildAppCardWithUpdateInfo(AboutAppCard app, ColorScheme cs) {
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      color: Colors.white,
      margin: const EdgeInsets.only(bottom: 16),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header with icon and title
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: AppColors.tealLight,
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: const Icon(
                    Icons.auto_awesome_rounded,
                    color: AppColors.teal,
                    size: 22,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        app.title,
                        style: const TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w800,
                          color: AppColors.navy,
                          height: 1.2,
                        ),
                      ),
                      if (app.subtitle.isNotEmpty) ...[
                        const SizedBox(height: 4),
                        Text(
                          app.subtitle,
                          style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: AppColors.teal,
                          ),
                        ),
                      ],
                      if (app.badge.isNotEmpty) ...[
                        const SizedBox(height: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 4,
                          ),
                          decoration: BoxDecoration(
                            color: AppColors.lightBlue,
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(
                              color: AppColors.navy.withValues(alpha: 0.2),
                            ),
                          ),
                          child: Text(
                            app.badge,
                            style: const TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              color: AppColors.navy,
                            ),
                          ),
                        ),
                      ],
                      // Version info and update status
                      const SizedBox(height: 8),
                      Text(
                        _currentApp == null
                            ? 'Version: —'
                            : 'Version: ${_currentApp!.label}',
                        style: const TextStyle(
                          fontSize: 12,
                          color: AppColors.muted,
                        ),
                      ),
                      const SizedBox(height: 4),
                      _buildUpdateStatus(),
                      // Release notes come from the published APK, never from
                      // an unpublished or stale About card.
                      if (_updateAvailable &&
                          _latestRelease?.hasReleaseNotes == true) ...[
                        const SizedBox(height: 8),
                        Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: AppColors.tealLight.withValues(alpha: 0.3),
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(
                              color: AppColors.teal.withValues(alpha: 0.2),
                            ),
                          ),
                          child: Text(
                            'What’s new in v${_latestRelease!.versionName}\n'
                            '${_latestRelease!.releaseNotes!.trim()}',
                            style: const TextStyle(
                              fontSize: 11,
                              color: AppColors.teal,
                              height: 1.4,
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            // Description
            Text(
              app.description,
              style: const TextStyle(
                fontSize: 14,
                height: 1.6,
                color: Colors.black87,
              ),
            ),
            // Key Features
            if (app.features.isNotEmpty) ...[
              const SizedBox(height: 20),
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(6),
                    decoration: BoxDecoration(
                      color: AppColors.tealLight,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Icon(
                      Icons.layers_rounded,
                      color: AppColors.teal,
                      size: 16,
                    ),
                  ),
                  const SizedBox(width: 8),
                  const Text(
                    'Key Features & Capabilities',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: AppColors.muted,
                      letterSpacing: 0.5,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              _buildFeaturesList(app.features),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildFeaturesList(List<AboutFeature> features) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final isMobile = constraints.maxWidth < 480;
        final itemWidth = isMobile
            ? constraints.maxWidth
            : (constraints.maxWidth - 12) / 2;

        return Wrap(
          spacing: 12,
          runSpacing: 12,
          children: features.map((feat) {
            return SizedBox(
              width: itemWidth,
              child: Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: AppColors.background,
                  border: Border.all(color: AppColors.border),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          padding: const EdgeInsets.all(5),
                          decoration: BoxDecoration(
                            color: AppColors.tealLight,
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: const Icon(
                            Icons.check_circle_rounded,
                            color: AppColors.teal,
                            size: 16,
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            feat.title,
                            style: const TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w700,
                              color: AppColors.navy,
                              height: 1.3,
                            ),
                          ),
                        ),
                      ],
                    ),
                    if (feat.description.isNotEmpty) ...[
                      const SizedBox(height: 8),
                      Text(
                        feat.description,
                        style: const TextStyle(
                          fontSize: 12,
                          height: 1.4,
                          color: AppColors.muted,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            );
          }).toList(),
        );
      },
    );
  }

  Widget _buildDeveloperSectionHeader(int count) {
    return Row(
      children: [
        Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: AppColors.lightBlue,
            borderRadius: BorderRadius.circular(14),
          ),
          child: const Icon(
            Icons.code_rounded,
            color: AppColors.navy,
            size: 22,
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'About Developer',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: AppColors.navy,
                ),
              ),
              Text(
                'Development team behind the portal',
                style: const TextStyle(fontSize: 12, color: AppColors.muted),
              ),
            ],
          ),
        ),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(
            color: AppColors.lightBlue,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.navy.withValues(alpha: 0.2)),
          ),
          child: Text(
            '$count ${count == 1 ? 'Developer' : 'Developers'}',
            style: const TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: AppColors.navy,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildDevelopersGrid(List<AboutDeveloper> developers, ColorScheme cs) {
    return Column(
      children: [
        for (int i = 0; i < developers.length; i++) ...[
          _DeveloperCard(
            developer: developers[i],
            photoBytes: _photoCache[developers[i].id],
            onCopyEmail: () => _copyToClipboard(developers[i].email, 'Email'),
            onCopyPhone: () =>
                _copyToClipboard(developers[i].phone, 'Phone number'),
          ),
          if (i < developers.length - 1) const SizedBox(height: 16),
        ],
      ],
    );
  }

  void _copyToClipboard(String text, String label) async {
    await Clipboard.setData(ClipboardData(text: text));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('$label copied!'),
        duration: const Duration(seconds: 2),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        backgroundColor: AppColors.teal,
      ),
    );
  }
}

class _DeveloperCard extends StatefulWidget {
  const _DeveloperCard({
    required this.developer,
    required this.photoBytes,
    required this.onCopyEmail,
    required this.onCopyPhone,
  });

  final AboutDeveloper developer;
  final Uint8List? photoBytes;
  final VoidCallback onCopyEmail;
  final VoidCallback onCopyPhone;

  @override
  State<_DeveloperCard> createState() => _DeveloperCardState();
}

class _DeveloperCardState extends State<_DeveloperCard> {
  String? _copiedEmail;
  String? _copiedPhone;
  Timer? _resetTimer;

  @override
  void dispose() {
    _resetTimer?.cancel();
    super.dispose();
  }

  void _handleCopyEmail() {
    widget.onCopyEmail();
    setState(() => _copiedEmail = 'Copied!');
    _resetTimer?.cancel();
    _resetTimer = Timer(const Duration(seconds: 2), () {
      if (mounted) setState(() => _copiedEmail = null);
    });
  }

  void _handleCopyPhone() {
    widget.onCopyPhone();
    setState(() => _copiedPhone = 'Copied!');
    _resetTimer?.cancel();
    _resetTimer = Timer(const Duration(seconds: 2), () {
      if (mounted) setState(() => _copiedPhone = null);
    });
  }

  @override
  Widget build(BuildContext context) {
    final dev = widget.developer;
    final photo = widget.photoBytes;

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.border),
        boxShadow: [
          BoxShadow(
            color: AppColors.navy.withValues(alpha: 0.03),
            blurRadius: 12,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Avatar & Name
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                dev.hasPhoto && photo != null
                    ? ClipRRect(
                        borderRadius: BorderRadius.circular(16),
                        child: Image.memory(
                          photo,
                          width: 64,
                          height: 64,
                          fit: BoxFit.cover,
                        ),
                      )
                    : UserAvatar(name: dev.name, radius: 32),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        dev.name,
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                          color: AppColors.navy,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 2,
                        ),
                        decoration: BoxDecoration(
                          color: AppColors.lightBlue,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          dev.role,
                          style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            color: AppColors.navy,
                          ),
                        ),
                      ),
                      if (dev.bio.isNotEmpty) ...[
                        const SizedBox(height: 6),
                        Text(
                          dev.bio,
                          style: const TextStyle(
                            fontSize: 12,
                            color: AppColors.muted,
                            height: 1.4,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            // Contact Chips
            Column(
              children: [
                // Email
                InkWell(
                  onTap: _handleCopyEmail,
                  borderRadius: BorderRadius.circular(14),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 150),
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 12,
                    ),
                    decoration: BoxDecoration(
                      color: _copiedEmail != null
                          ? AppColors.tealLight
                          : AppColors.background,
                      border: Border.all(
                        color: _copiedEmail != null
                            ? AppColors.teal
                            : AppColors.border,
                      ),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Row(
                      children: [
                        const Icon(
                          Icons.mail_outline_rounded,
                          size: 18,
                          color: AppColors.navy,
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            dev.email,
                            style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: Colors.black87,
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        if (_copiedEmail != null) ...[
                          const SizedBox(width: 8),
                          const Icon(
                            Icons.check_rounded,
                            size: 16,
                            color: AppColors.teal,
                          ),
                          const SizedBox(width: 4),
                          const Text(
                            'Copied!',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              color: AppColors.teal,
                            ),
                          ),
                        ] else ...[
                          const SizedBox(width: 8),
                          const Text(
                            'Copy',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              color: AppColors.navy,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 10),
                // Phone
                InkWell(
                  onTap: _handleCopyPhone,
                  borderRadius: BorderRadius.circular(14),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 150),
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 12,
                    ),
                    decoration: BoxDecoration(
                      color: _copiedPhone != null
                          ? AppColors.tealLight
                          : AppColors.background,
                      border: Border.all(
                        color: _copiedPhone != null
                            ? AppColors.teal
                            : AppColors.border,
                      ),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Row(
                      children: [
                        const Icon(
                          Icons.phone_outlined,
                          size: 18,
                          color: AppColors.teal,
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            dev.phone,
                            style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: Colors.black87,
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        if (_copiedPhone != null) ...[
                          const SizedBox(width: 8),
                          const Icon(
                            Icons.check_rounded,
                            size: 16,
                            color: AppColors.teal,
                          ),
                          const SizedBox(width: 4),
                          const Text(
                            'Copied!',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              color: AppColors.teal,
                            ),
                          ),
                        ] else ...[
                          const SizedBox(width: 8),
                          const Text(
                            'Copy',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              color: AppColors.navy,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _ErrorState extends StatefulWidget {
  final String message;
  final VoidCallback onRetry;

  const _ErrorState({required this.message, required this.onRetry});

  @override
  State<_ErrorState> createState() => _ErrorStateState();
}

class _ErrorStateState extends State<_ErrorState> {
  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.red.shade50,
                borderRadius: BorderRadius.circular(16),
              ),
              child: const Icon(
                Icons.error_outline_rounded,
                size: 48,
                color: Colors.red,
              ),
            ),
            const SizedBox(height: 16),
            const Text(
              'Something went wrong',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w700,
                color: AppColors.navy,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              widget.message,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 13,
                color: AppColors.muted,
                height: 1.5,
              ),
            ),
            const SizedBox(height: 20),
            FilledButton.icon(
              onPressed: widget.onRetry,
              icon: const Icon(Icons.refresh_rounded, size: 18),
              label: const Text('Try Again'),
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.navy,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(
                  horizontal: 24,
                  vertical: 14,
                ),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Bottom sheet that shows the published version, release notes, download
/// progress and the hand-off to Android's package installer.
class _UpdateSheet extends StatefulWidget {
  const _UpdateSheet({required this.release, required this.currentVersion});

  final ApkRelease release;
  final String currentVersion;

  @override
  State<_UpdateSheet> createState() => _UpdateSheetState();
}

class _UpdateSheetState extends State<_UpdateSheet> {
  bool _downloading = false;
  bool _installing = false;
  bool _installerOpened = false;
  double _progress = 0;
  int _received = 0;
  int _total = 0;
  String? _filePath;
  String? _error;
  CancelToken? _cancelToken;

  @override
  void dispose() {
    _cancelToken?.cancel('closed');
    super.dispose();
  }

  Future<void> _download() async {
    setState(() {
      _downloading = true;
      _installing = false;
      _installerOpened = false;
      _progress = 0;
      _received = 0;
      _total = widget.release.fileSize;
      _filePath = null;
      _error = null;
    });

    final token = CancelToken();
    _cancelToken = token;

    try {
      // App-specific external storage needs no storage permission and is
      // exposed to the package installer through open_filex's FileProvider.
      final dir =
          await getExternalStorageDirectory() ??
          await getApplicationDocumentsDirectory();
      final safeVersion = widget.release.versionName.replaceAll(
        RegExp(r'[^a-zA-Z0-9._-]'),
        '_',
      );
      final path = '${dir.path}/cr-assist-$safeVersion.apk';

      final existing = File(path);
      if (await existing.exists()) await existing.delete();

      await updateService.downloadRelease(
        widget.release,
        path,
        cancelToken: token,
        onProgress: (received, total) {
          if (!mounted) return;
          setState(() {
            _received = received;
            if (total > 0) _total = total;
            _progress = _total > 0 ? (received / _total).clamp(0.0, 1.0) : 0.0;
          });
        },
      );

      if (!mounted) return;
      setState(() {
        _downloading = false;
        _filePath = path;
        _progress = 1;
        if (_received > 0) _total = _received;
      });
    } catch (e) {
      if (!mounted) return;
      final cancelled = e.toString().toLowerCase().contains('cancel');
      setState(() {
        _downloading = false;
        _progress = 0;
        _error = cancelled ? 'Download cancelled.' : 'Download failed: $e';
      });
    } finally {
      _cancelToken = null;
    }
  }

  Future<void> _install() async {
    final path = _filePath;
    if (path == null) return;

    setState(() {
      _installing = true;
      _error = null;
    });

    final result = await updateService.installApk(path);
    if (!mounted) return;
    setState(() {
      _installing = false;
      if (result.success) {
        _installerOpened = true;
      } else {
        _error = result.message;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final release = widget.release;
    final canClose = !_downloading;

    return PopScope(
      canPop: canClose,
      child: Container(
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: SafeArea(
          top: false,
          child: SingleChildScrollView(
            padding: EdgeInsets.fromLTRB(
              20,
              8,
              20,
              20 + MediaQuery.viewInsetsOf(context).bottom,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Center(
                  child: Container(
                    width: 40,
                    height: 4,
                    decoration: BoxDecoration(
                      color: AppColors.border,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: AppColors.tealLight,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Icon(
                        Icons.system_update_rounded,
                        color: AppColors.teal,
                        size: 22,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'App Update',
                            style: TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.w800,
                              color: AppColors.navy,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            'Version ${release.versionName} is available',
                            style: const TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              color: AppColors.teal,
                            ),
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      onPressed: canClose ? () => Navigator.pop(context) : null,
                      icon: const Icon(Icons.close_rounded),
                      tooltip: 'Close',
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: AppColors.background,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: AppColors.border),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _buildMetaRow(
                        Icons.smartphone_rounded,
                        'Installed',
                        widget.currentVersion,
                      ),
                      const SizedBox(height: 8),
                      _buildMetaRow(
                        Icons.new_releases_rounded,
                        'Latest',
                        release.displayVersion,
                      ),
                      const SizedBox(height: 8),
                      _buildMetaRow(
                        Icons.sd_storage_rounded,
                        'APK',
                        release.fileSize > 0
                            ? '${formatBytes(release.fileSize)} · ${release.fileName}'
                            : release.fileName,
                      ),
                      if (release.uploadedAt != null) ...[
                        const SizedBox(height: 8),
                        _buildMetaRow(
                          Icons.schedule_rounded,
                          'Published',
                          formatDateTime(release.uploadedAt),
                        ),
                      ],
                    ],
                  ),
                ),
                if (release.hasReleaseNotes) ...[
                  const SizedBox(height: 18),
                  const Text(
                    'What’s new',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: AppColors.navy,
                    ),
                  ),
                  const SizedBox(height: 8),
                  ConstrainedBox(
                    constraints: const BoxConstraints(maxHeight: 170),
                    child: SingleChildScrollView(
                      child: Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: AppColors.tealLight.withValues(alpha: 0.3),
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(
                            color: AppColors.teal.withValues(alpha: 0.2),
                          ),
                        ),
                        child: Text(
                          release.releaseNotes!.trim(),
                          style: const TextStyle(
                            fontSize: 12,
                            color: AppColors.teal,
                            height: 1.5,
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
                if (_error != null) ...[
                  const SizedBox(height: 16),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AppColors.absent.withValues(alpha: 0.08),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(
                        color: AppColors.absent.withValues(alpha: 0.3),
                      ),
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Icon(
                          Icons.error_outline_rounded,
                          size: 18,
                          color: AppColors.absent,
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            _error!,
                            style: const TextStyle(
                              fontSize: 12,
                              color: AppColors.absent,
                              height: 1.4,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
                if (_downloading) ...[
                  const SizedBox(height: 20),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(6),
                    child: LinearProgressIndicator(
                      value: _progress > 0 ? _progress : null,
                      minHeight: 8,
                      backgroundColor: AppColors.border,
                      color: AppColors.teal,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Text(
                        '${(_progress * 100).clamp(0, 100).toStringAsFixed(0)}%',
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: AppColors.teal,
                        ),
                      ),
                      const Spacer(),
                      Text(
                        _total > 0
                            ? '${formatBytes(_received)} of ${formatBytes(_total)}'
                            : formatBytes(_received),
                        style: const TextStyle(
                          fontSize: 12,
                          color: AppColors.muted,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  TextButton.icon(
                    onPressed: () => _cancelToken?.cancel('cancelled'),
                    icon: const Icon(Icons.close_rounded, size: 16),
                    label: const Text('Cancel download'),
                    style: TextButton.styleFrom(
                      foregroundColor: AppColors.muted,
                    ),
                  ),
                ] else if (_installerOpened) ...[
                  const SizedBox(height: 20),
                  const Text(
                    'Follow the prompts in the Android installer to finish updating.',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 12,
                      color: AppColors.muted,
                      height: 1.4,
                    ),
                  ),
                  const SizedBox(height: 12),
                  FilledButton.icon(
                    onPressed: () => Navigator.pop(context),
                    icon: const Icon(Icons.check_rounded),
                    label: const Text('Done'),
                  ),
                ] else if (_filePath != null) ...[
                  const SizedBox(height: 20),
                  const Row(
                    children: [
                      Icon(
                        Icons.check_circle_rounded,
                        color: AppColors.present,
                        size: 18,
                      ),
                      SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          'Download complete',
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: AppColors.navy,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  FilledButton.icon(
                    onPressed: _installing ? null : _install,
                    icon: _installing
                        ? const SizedBox.square(
                            dimension: 16,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Icon(Icons.install_mobile_rounded),
                    label: Text(
                      _installing ? 'Opening installer…' : 'Install Update',
                    ),
                  ),
                  const SizedBox(height: 4),
                  TextButton(
                    onPressed: _installing ? null : _download,
                    child: const Text('Download again'),
                  ),
                ] else ...[
                  const SizedBox(height: 20),
                  FilledButton.icon(
                    onPressed: _download,
                    icon: const Icon(Icons.download_rounded),
                    label: const Text('Download Update'),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'The update downloads from the college portal and installs '
                    'through Android’s package installer.',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 11,
                      color: AppColors.muted,
                      height: 1.4,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildMetaRow(IconData icon, String label, String value) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 16, color: AppColors.teal),
        const SizedBox(width: 8),
        SizedBox(
          width: 70,
          child: Text(
            label,
            style: const TextStyle(fontSize: 12, color: AppColors.muted),
          ),
        ),
        Expanded(
          child: Text(
            value,
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: AppColors.navy,
              height: 1.3,
            ),
          ),
        ),
      ],
    );
  }
}
