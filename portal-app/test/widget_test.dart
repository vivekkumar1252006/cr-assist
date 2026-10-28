import 'package:flutter_test/flutter_test.dart';
import 'package:smartattend_app/core/services.dart';
import 'package:smartattend_app/core/session.dart';
import 'package:smartattend_app/main.dart';
import 'package:smartattend_app/screens/auth/login_screen.dart';
import 'package:smartattend_app/screens/splash_screen.dart';

void main() {
  testWidgets('SmartAttendApp initializes smoke test', (WidgetTester tester) async {
    await tester.pumpWidget(const SmartAttendApp());
    expect(find.byType(SmartAttendApp), findsOneWidget);

    // The splash screen schedules a short navigation delay; drain it so the
    // test does not finish with a pending timer.
    await tester.pump(const Duration(milliseconds: 2300));
  });

  testWidgets('launch flow: splash holds ~2s, fades out, then shows the login screen',
      (WidgetTester tester) async {
    await tester.pumpWidget(const SmartAttendApp());

    // The splash is the app's initial screen with the animated brand content.
    expect(find.byType(SplashScreen), findsOneWidget);
    expect(find.byType(LoginScreen), findsNothing);
    expect(find.textContaining('Class Representative'), findsOneWidget);
    expect(find.text('Loading...'), findsOneWidget);

    // Session restore finishes with no stored session while the splash shows.
    session.status = SessionStatus.signedOut;
    session.notifyListeners();
    await tester.pump();

    // The splash owns launch navigation: it still holds until its ~2s minimum.
    expect(find.byType(SplashScreen), findsOneWidget);
    expect(find.byType(LoginScreen), findsNothing);

    // Minimum duration elapses → 350ms fade-out → handover to the login screen.
    await tester.pump(const Duration(milliseconds: 2000));
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pump();

    expect(find.byType(SplashScreen), findsNothing);
    expect(find.byType(LoginScreen), findsOneWidget);
  });
}
