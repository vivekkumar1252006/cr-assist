import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

import '../core/services.dart';
import '../core/session.dart';
import '../core/theme.dart';

/// Animated launch splash: shown briefly on app launch then navigates to login
/// (or home if already signed in). The logo is static — only the circular
/// loading indicator rotates.
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with TickerProviderStateMixin {
  /// Minimum time the splash is visible on every launch/restart.
  static const Duration _minDuration = Duration(milliseconds: 1000);

  static const Duration _fadeIn = Duration(milliseconds: 300);
  static const Duration _fadeOut = Duration(milliseconds: 250);

  late final AnimationController _fade;
  late final AnimationController _rotate;
  late final Animation<double> _fadeCurve;
  late final Animation<double> _scaleCurve;
  Timer? _minTimer;
  Timer? _watchdog;

  /// True once the splash has been on screen for [_minDuration].
  bool _minElapsed = false;

  /// Guards the fade-out → navigate handover so it runs exactly once.
  bool _leaving = false;

  @override
  void initState() {
    super.initState();
    _fade = AnimationController(vsync: this, duration: _fadeIn);
    _rotate = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 4),
    )..repeat();
    _fadeCurve = CurvedAnimation(parent: _fade, curve: Curves.easeOut);
    _scaleCurve = Tween<double>(begin: 0.93, end: 1.0).animate(_fadeCurve);

    _fade.forward();

    // Navigation waits for BOTH the minimum display time and a resolved
    // session. On slow devices the secure-storage read can take longer than the
    // minimum, and navigating while `status == unknown` made the router bounce
    // `/login` back to `/splash`, leaving the spinner up forever.
    session.addListener(_onSessionChanged);

    _minTimer = Timer(_minDuration, () {
      _minElapsed = true;
      _tryNavigate();
    });

    // Last-resort watchdog: never leave the user stranded on the splash.
    _watchdog = Timer(const Duration(seconds: 8), () {
      if (!mounted) return;
      if (session.status == SessionStatus.unknown) {
        session.forceSignOut();
      }
    });
  }

  @override
  void dispose() {
    session.removeListener(_onSessionChanged);
    _minTimer?.cancel();
    _watchdog?.cancel();
    _fade.dispose();
    _rotate.dispose();
    super.dispose();
  }

  void _onSessionChanged() {
    if (!mounted) return;
    _tryNavigate();
  }

  /// Fades out and navigates once the splash has been visible long enough and
  /// the session has resolved (signed in or signed out).
  void _tryNavigate() {
    if (_leaving || !mounted || !_minElapsed) return;
    if (session.status == SessionStatus.unknown) return;
    _leaving = true;

    _fade.duration = _fadeOut;
    _fade.reverse().whenCompleteOrCancel(() {
      if (!mounted) return;
      if (session.status == SessionStatus.signedIn) {
        final home = session.user!.isStudent ? '/profile' : '/admin/attendance';
        context.go(home);
      } else {
        context.go('/login');
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: const SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Brightness.light,
        statusBarBrightness: Brightness.dark,
      ),
      child: Scaffold(
        body: DecoratedBox(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                AppColors.navy,
                AppColors.navyLight,
                AppColors.royalBlue,
              ],
            ),
          ),
          child: SafeArea(
            child: FadeTransition(
              opacity: _fadeCurve,
              child: ScaleTransition(
                scale: _scaleCurve,
                child: Center(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const _StaticLogo(),
                        const SizedBox(height: 28),
                        const Text.rich(
                          TextSpan(
                            children: [
                              TextSpan(text: 'Class Representative\n'),
                              TextSpan(
                                text: 'Assist',
                                style: TextStyle(color: AppColors.tealLight),
                              ),
                            ],
                          ),
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            fontSize: 26,
                            fontWeight: FontWeight.w800,
                            height: 1.25,
                            letterSpacing: 0.5,
                            color: Colors.white,
                          ),
                        ),
                        const SizedBox(height: 40),
                        _RotatingLoader(rotate: _rotate),
                        const SizedBox(height: 14),
                        Text(
                          'Loading...',
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w500,
                            letterSpacing: 0.3,
                            color: Colors.white.withValues(alpha: 0.75),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Static circular logo widget with halo.
class _StaticLogo extends StatelessWidget {
  const _StaticLogo();

  @override
  Widget build(BuildContext context) {
    return Stack(
      alignment: Alignment.center,
      children: [
        Container(
          width: 176,
          height: 176,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            gradient: RadialGradient(
              colors: [
                Colors.white.withValues(alpha: 0.22),
                Colors.white.withValues(alpha: 0.0),
              ],
            ),
          ),
        ),
        Container(
          width: 128,
          height: 128,
          clipBehavior: Clip.antiAlias,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: Colors.white,
            border: Border.all(
              color: Colors.white.withValues(alpha: 0.55),
              width: 3,
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.25),
                blurRadius: 24,
                offset: const Offset(0, 10),
              ),
              BoxShadow(
                color: Colors.white.withValues(alpha: 0.30),
                blurRadius: 44,
                spreadRadius: -6,
              ),
            ],
          ),
          padding: const EdgeInsets.all(10),
          child: Image.asset(
            'assets/images/logo.png',
            fit: BoxFit.contain,
            filterQuality: FilterQuality.medium,
            errorBuilder: (_, _, _) => const Icon(
              Icons.school_rounded,
              size: 60,
              color: AppColors.navy,
            ),
          ),
        ),
      ],
    );
  }
}

/// Rotating loader widget.
class _RotatingLoader extends StatelessWidget {
  const _RotatingLoader({required this.rotate});

  final Animation<double> rotate;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 34,
      height: 34,
      child: RotationTransition(
        turns: rotate,
        child: const CircularProgressIndicator(
          strokeWidth: 3,
          valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
        ),
      ),
    );
  }
}
