import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'core/services.dart';
import 'core/session.dart';
import 'screens/student/profile_screen.dart';
import 'screens/student/edit_profile_screen.dart';
import 'screens/student/attendance_screen.dart';
import 'screens/student/attendance_history_screen.dart';
import 'screens/student/complaints_screen.dart';
import 'screens/student/complaint_form_screen.dart';
import 'screens/student/complaint_detail_screen.dart';
import 'screens/student/help_screen.dart';
import 'screens/student/about_screen.dart';
import 'screens/student/notifications_screen.dart';
import 'screens/admin/admin_attendance_screen.dart';
import 'screens/auth/forgot_password_screen.dart';
import 'screens/auth/login_screen.dart';
import 'screens/auth/register_screen.dart';
import 'screens/main_shell.dart';
import 'screens/splash_screen.dart';

const _publicRoutes = {'/login', '/register', '/forgot-password'};

final router = GoRouter(
  initialLocation: '/splash',
  refreshListenable: session,
  redirect: (context, state) {
    final loc = state.matchedLocation;
    switch (session.status) {
      case SessionStatus.unknown:
        return loc == '/splash' ? null : '/splash';
      case SessionStatus.signedOut:
        // The splash owns launch navigation: it holds for its minimum duration,
        // fades out and then goes to /login itself. Signing out mid-app (not
        // on the splash) still lands directly on /login.
        return (loc == '/splash' || _publicRoutes.contains(loc))
            ? null
            : '/login';
      case SessionStatus.signedIn:
        // Admin accounts land on the attendance dashboard; the five tabs are
        // the student app.
        final user = session.user!;
        final home = user.isStudent ? '/profile' : '/admin/attendance';
        if (loc == '/splash') {
          return null; // splash fades out, then routes to home itself
        }
        if (_publicRoutes.contains(loc)) return home;
        if (user.isStudent) {
          if (loc == '/scanner' || loc.startsWith('/admin')) return home;
          return null;
        }
        if (loc != '/admin/attendance') return '/admin/attendance';
        return null;
    }
  },
  routes: [
    GoRoute(path: '/splash', builder: (_, _) => const SplashScreen()),
    GoRoute(path: '/login', builder: (_, _) => const LoginScreen()),
    GoRoute(path: '/register', builder: (_, _) => const RegisterScreen()),
    GoRoute(
      path: '/forgot-password',
      builder: (_, _) => const ForgotPasswordScreen(),
    ),
    GoRoute(path: '/scanner', redirect: (_, _) => '/admin/attendance'),
    GoRoute(
      path: '/admin/attendance',
      builder: (_, _) => const AdminAttendanceScreen(),
    ),
    // Pushed over the shell (no bottom bar) from the Profile notification bell.
    GoRoute(
      path: '/notifications',
      builder: (_, _) => const NotificationsScreen(),
    ),
    StatefulShellRoute.indexedStack(
      builder: (context, state, shell) => MainShell(shell: shell),
      branches: [
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: '/profile',
              builder: (_, _) => const ProfileScreen(),
              routes: [
                GoRoute(
                  path: 'edit',
                  builder: (_, _) => const EditProfileScreen(),
                ),
              ],
            ),
          ],
        ),
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: '/attendance',
              builder: (_, _) => const AttendanceScreen(),
              routes: [
                GoRoute(
                  path: 'history',
                  builder: (_, _) => const AttendanceHistoryScreen(),
                ),
              ],
            ),
          ],
        ),
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: '/complaints',
              builder: (_, _) => const ComplaintsScreen(),
              routes: [
                GoRoute(
                  path: 'new',
                  builder: (_, state) => ComplaintFormScreen(
                    prefill: state.extra as ComplaintPrefill?,
                  ),
                ),
                GoRoute(
                  path: ':id',
                  builder: (_, state) => ComplaintDetailScreen(
                    id: int.parse(state.pathParameters['id']!),
                  ),
                ),
              ],
            ),
          ],
        ),
        StatefulShellBranch(
          routes: [
            GoRoute(path: '/help', builder: (_, _) => const HelpScreen()),
          ],
        ),
        StatefulShellBranch(
          routes: [
            GoRoute(path: '/about', builder: (_, _) => const AboutScreen()),
          ],
        ),
      ],
    ),
  ],
  errorBuilder: (context, state) => Scaffold(
    appBar: AppBar(title: const Text('Not found')),
    body: Center(child: Text('Page not found: ${state.uri}')),
  ),
);
