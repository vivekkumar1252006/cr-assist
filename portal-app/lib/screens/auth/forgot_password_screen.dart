import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../core/api_client.dart';
import '../../../core/services.dart';
import '../../../core/theme.dart';
import '../../widgets/common.dart';
import 'auth_layout.dart';

enum _Step { email, otp, password }

class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  final _emailForm = GlobalKey<FormState>();
  final _otpForm = GlobalKey<FormState>();
  final _passwordForm = GlobalKey<FormState>();

  final _email = TextEditingController();
  final _otp = TextEditingController();
  final _password = TextEditingController();
  final _confirm = TextEditingController();

  _Step _step = _Step.email;
  bool _busy = false;
  String? _error;
  String? _notice;
  String _resetToken = '';
  int _cooldown = 0;
  int _expiresIn = 0;
  int? _attemptsLeft;
  bool _locked = false;
  Timer? _ticker;

  @override
  void dispose() {
    _ticker?.cancel();
    _email.dispose();
    _otp.dispose();
    _password.dispose();
    _confirm.dispose();
    super.dispose();
  }

  void _startTicker() {
    _ticker?.cancel();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() {
        if (_cooldown > 0) _cooldown--;
        if (_expiresIn > 0) _expiresIn--;
      });
    });
  }

  void _stopTicker() {
    _ticker?.cancel();
    _ticker = null;
  }

  static String _clock(int total) =>
      '${total ~/ 60}:${(total % 60).toString().padLeft(2, '0')}';

  static String? _passwordError(String value) {
    if (value.length < 8) return 'Password must be at least 8 characters';
    if (!RegExp(r'[a-z]').hasMatch(value) ||
        !RegExp(r'[A-Z]').hasMatch(value) ||
        !RegExp(r'[0-9]').hasMatch(value)) {
      return 'Password must include uppercase, lowercase letters and a number';
    }
    return null;
  }

  Future<void> _requestCode({bool resend = false}) async {
    if (!resend && !(_emailForm.currentState?.validate() ?? false)) return;
    setState(() {
      _busy = true;
      _error = null;
      if (!resend) _notice = null;
    });
    try {
      final res = await api.post('/auth/forgot-password', {
        'email': _email.text.trim(),
      });
      if (!mounted) return;
      setState(() {
        _step = _Step.otp;
        _otp.clear();
        _locked = false;
        _attemptsLeft = null;
        _cooldown = (res['resendAfterSeconds'] as num?)?.toInt() ?? 60;
        _expiresIn = (res['expiresInSeconds'] as num?)?.toInt() ?? 300;
        _notice = res['message'] as String?;
      });
      _startTicker();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (e) {
      if (mounted) {
        setState(
          () => _error = 'Unable to connect to server. Please check your network or server URL.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _verify() async {
    if (!(_otpForm.currentState?.validate() ?? false)) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final res = await api.post('/auth/verify-otp', {
        'email': _email.text.trim(),
        'otp': _otp.text.trim(),
      });
      if (!mounted) return;
      _stopTicker();
      setState(() {
        _resetToken = res['resetToken'] as String? ?? '';
        _step = _Step.password;
        _otp.clear();
        _notice = null;
        _attemptsLeft = null;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        if (e.code == 'OTP_ATTEMPTS_EXCEEDED') _locked = true;
      });
    } catch (e) {
      if (mounted) {
        setState(
          () => _error = 'Unable to connect to server. Please check your network or server URL.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _resetPassword() async {
    if (!(_passwordForm.currentState?.validate() ?? false)) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final res = await api.post('/auth/reset-password', {
        'resetToken': _resetToken,
        'password': _password.text,
        'confirmPassword': _confirm.text,
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            res['message'] as String? ?? 'Your password has been reset.',
          ),
          backgroundColor: AppColors.present,
        ),
      );
      Navigator.of(context).maybePop();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (e) {
      if (mounted) {
        setState(
          () => _error = 'Unable to connect to server. Please check your network or server URL.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _restart() {
    _stopTicker();
    setState(() {
      _step = _Step.email;
      _otp.clear();
      _password.clear();
      _confirm.clear();
      _resetToken = '';
      _error = null;
      _notice = null;
      _cooldown = 0;
      _expiresIn = 0;
      _attemptsLeft = null;
      _locked = false;
    });
  }

  String get _title => switch (_step) {
    _Step.email => 'Forgot password',
    _Step.otp => 'Enter verification code',
    _Step.password => 'Set a new password',
  };

  String get _subtitle => switch (_step) {
    _Step.email => 'We\'ll email you a 6-digit verification code',
    _Step.otp => 'Enter the code we sent to ${_email.text.trim()}',
    _Step.password => 'Choose a strong password you haven\'t used before',
  };

  @override
  Widget build(BuildContext context) {
    return AuthLayout(
      title: _title,
      subtitle: _subtitle,
      showBack: true,
      child: switch (_step) {
        _Step.email => _buildEmailStep(),
        _Step.otp => _buildOtpStep(),
        _Step.password => _buildPasswordStep(),
      },
    );
  }

  Widget _buildEmailStep() {
    return Form(
      key: _emailForm,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (_error != null) ...[
            NoticeBox(message: _error!),
            const SizedBox(height: 16),
          ],
          const Text(
            'Enter the email address registered with your SmartAttend account.',
            style: TextStyle(color: AppColors.muted),
          ),
          const SizedBox(height: 16),
          TextFormField(
            controller: _email,
            keyboardType: TextInputType.emailAddress,
            autocorrect: false,
            onFieldSubmitted: (_) => _requestCode(),
            decoration: const InputDecoration(
              labelText: 'Email address',
              prefixIcon: Icon(Icons.mail_outline),
            ),
            validator: (v) =>
                RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]{2,}$')
                    .hasMatch(v?.trim() ?? '')
                ? null
                : 'Enter a valid email address',
          ),
          const SizedBox(height: 20),
          FilledButton(
            onPressed: _busy ? null : _requestCode,
            child: _busy
                ? const SizedBox.square(
                    dimension: 22,
                    child: CircularProgressIndicator(
                      strokeWidth: 2.5,
                      color: Colors.white,
                    ),
                  )
                : const Text('Send verification code'),
          ),
        ],
      ),
    );
  }

  Widget _buildOtpStep() {
    final canVerify = !_busy && !_locked && _expiresIn > 0;
    return Form(
      key: _otpForm,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (_error != null) ...[
            NoticeBox(message: _error!),
            const SizedBox(height: 16),
          ] else if (_notice != null) ...[
            NoticeBox.info(message: _notice!),
            const SizedBox(height: 16),
          ],
          TextFormField(
            controller: _otp,
            keyboardType: TextInputType.number,
            textAlign: TextAlign.center,
            maxLength: 6,
            autofocus: true,
            style: const TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.w700,
              letterSpacing: 10,
            ),
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            onFieldSubmitted: (_) => canVerify ? _verify() : null,
            decoration: const InputDecoration(
              labelText: '6-digit code',
              counterText: '',
            ),
            validator: (v) => RegExp(r'^\d{6}$').hasMatch(v?.trim() ?? '')
                ? null
                : 'Enter the 6-digit code from the email',
          ),
          if (_attemptsLeft != null) ...[
            const SizedBox(height: 6),
            Text(
              '$_attemptsLeft attempt${_attemptsLeft == 1 ? '' : 's'} left for this code',
              style: const TextStyle(fontSize: 12, color: AppColors.muted),
            ),
          ],
          const SizedBox(height: 4),
          Row(
            children: [
              Expanded(
                child: Text(
                  _expiresIn > 0
                      ? 'Code expires in ${_clock(_expiresIn)}'
                      : 'This code has expired',
                  style: TextStyle(
                    fontSize: 12,
                    color: _expiresIn > 0 ? AppColors.muted : AppColors.absent,
                    fontWeight: _expiresIn > 0
                        ? FontWeight.normal
                        : FontWeight.w600,
                  ),
                ),
              ),
              TextButton(
                onPressed: (_busy || _cooldown > 0)
                    ? null
                    : () => _requestCode(resend: true),
                child: Text(
                  _cooldown > 0 ? 'Resend in ${_cooldown}s' : 'Resend code',
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: canVerify ? _verify : null,
            child: _busy
                ? const SizedBox.square(
                    dimension: 22,
                    child: CircularProgressIndicator(
                      strokeWidth: 2.5,
                      color: Colors.white,
                    ),
                  )
                : const Text('Verify code'),
          ),
          TextButton(
            onPressed: _busy ? null : _restart,
            child: const Text('Use a different email'),
          ),
        ],
      ),
    );
  }

  Widget _buildPasswordStep() {
    return Form(
      key: _passwordForm,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (_error != null) ...[
            NoticeBox(message: _error!),
            const SizedBox(height: 16),
          ],
          TextFormField(
            controller: _password,
            obscureText: true,
            autofocus: true,
            autofillHints: const [AutofillHints.newPassword],
            decoration: const InputDecoration(
              labelText: 'New password',
              prefixIcon: Icon(Icons.lock_outline),
            ),
            validator: (v) => _passwordError(v ?? ''),
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _confirm,
            obscureText: true,
            autofillHints: const [AutofillHints.newPassword],
            decoration: const InputDecoration(
              labelText: 'Confirm new password',
              prefixIcon: Icon(Icons.lock_outline),
            ),
            validator: (v) =>
                v == _password.text ? null : 'Passwords do not match',
          ),
          const SizedBox(height: 8),
          const Text(
            'At least 8 characters with upper & lowercase letters and a number.',
            style: TextStyle(fontSize: 12, color: AppColors.muted),
          ),
          const SizedBox(height: 20),
          FilledButton(
            onPressed: _busy ? null : _resetPassword,
            child: _busy
                ? const SizedBox.square(
                    dimension: 22,
                    child: CircularProgressIndicator(
                      strokeWidth: 2.5,
                      color: Colors.white,
                    ),
                  )
                : const Text('Reset password'),
          ),
          TextButton(
            onPressed: _busy ? null : _restart,
            child: const Text('Start over'),
          ),
        ],
      ),
    );
  }
}
