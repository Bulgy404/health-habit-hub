import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:go_router/go_router.dart';

import '../../config/app_config.dart';
import '../../core/dio_provider.dart';

// ---------------------------------------------------------------------------
// Secure-storage key constants
// ---------------------------------------------------------------------------

/// Key used to record that the participant has completed study enrollment.
const String kStudyEnrolledKey = 'study_enrolled';

/// Key for the enrolled study ID.
const String kStudyIdKey = 'study_id';

/// Key for the enrolled group ID.
const String kGroupIdKey = 'group_id';

// ---------------------------------------------------------------------------
// StudyCodeScreen
// ---------------------------------------------------------------------------

/// Onboarding step 3: lets the participant redeem an optional study code.
///
/// The screen is shown once, immediately after the passphrase screen.
/// If the user has already been enrolled (storage key [kStudyEnrolledKey])
/// the screen auto-skips to the main app.
class StudyCodeScreen extends ConsumerStatefulWidget {
  const StudyCodeScreen({super.key});

  @override
  ConsumerState<StudyCodeScreen> createState() => _StudyCodeScreenState();
}

class _StudyCodeScreenState extends ConsumerState<StudyCodeScreen> {
  final _codeController = TextEditingController();
  bool _isLoading = false;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _redirectIfAlreadyEnrolled();
  }

  @override
  void dispose() {
    _codeController.dispose();
    super.dispose();
  }

  /// If the user is already enrolled (e.g. navigated here directly on a
  /// subsequent launch) redirect immediately to the main app.
  Future<void> _redirectIfAlreadyEnrolled() async {
    const storage = FlutterSecureStorage();
    final value = await storage.read(key: kStudyEnrolledKey);
    if (value == 'true' && mounted) {
      context.go('/donate');
    }
  }

  /// Validates that the code matches the HHH-XXXXX pattern.
  bool _isValidCode(String code) {
    return RegExp(r'^HHH-[A-Z0-9]{5}$').hasMatch(code);
  }

  /// Calls POST /api/v1/onboarding/redeem-code and stores the result.
  Future<void> _onSubmit() async {
    final code = _codeController.text.trim();
    if (!_isValidCode(code)) {
      setState(() => _errorMessage = 'Enter a valid code in HHH-XXXXX format.');
      return;
    }

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final dio = ref.read(dioProvider);
      final response = await dio.post<Map<String, dynamic>>(
        '${AppConfig.apiBaseUrl}/onboarding/redeem-code',
        data: {'code': code},
      );
      if (!mounted) return;

      final data = response.data ?? {};
      final studyId = data['studyId'] as String? ?? '';
      final groupId = data['groupId'] as String? ?? '';

      const storage = FlutterSecureStorage();
      await storage.write(key: kStudyIdKey, value: studyId);
      await storage.write(key: kGroupIdKey, value: groupId);
      await storage.write(key: kStudyEnrolledKey, value: 'true');

      if (!mounted) return;
      context.go('/donate');
    } on DioException catch (e) {
      if (!mounted) return;
      final statusCode = e.response?.statusCode;
      final body = e.response?.data;
      String message;
      if (statusCode == 404) {
        message = 'Invalid code. Please check and try again.';
      } else if (statusCode == 410) {
        message = 'This code has expired.';
      } else if (statusCode == 409) {
        message = 'This code has already been used.';
      } else if (body is Map && body['error'] != null) {
        message = body['error'] as String;
      } else {
        message = 'Could not redeem code. Please check your connection.';
      }
      setState(() {
        _isLoading = false;
        _errorMessage = message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _isLoading = false;
        _errorMessage = 'Could not redeem code. Please check your connection.';
      });
    }
  }

  /// Calls POST /api/v1/onboarding/skip-code to enrol in the default study.
  Future<void> _onSkip() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final dio = ref.read(dioProvider);
      await dio.post<void>('${AppConfig.apiBaseUrl}/onboarding/skip-code');
    } catch (_) {
      // Silently ignore network errors for skip — enrolment in default study
      // can be retried server-side.
    }

    const storage = FlutterSecureStorage();
    await storage.write(key: kStudyEnrolledKey, value: 'true');

    if (!mounted) return;
    context.go('/donate');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Study Code'),
        actions: [
          TextButton(
            onPressed: _isLoading ? null : _onSkip,
            child: const Text(
              'Skip',
              style: TextStyle(color: Colors.white, fontSize: 16),
            ),
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const SizedBox(height: 32),
            Icon(
              Icons.school_outlined,
              size: 72,
              color: Theme.of(context).colorScheme.primary,
            ),
            const SizedBox(height: 24),
            Text(
              'Do you have a study code?',
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              'If a researcher gave you a study code, enter it here to '
              'join their study. You can also skip this step.',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: Theme.of(context).colorScheme.onSurface.withAlpha(153),
                  ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 32),
            TextField(
              controller: _codeController,
              enabled: !_isLoading,
              decoration: InputDecoration(
                labelText: 'Study code',
                hintText: 'HHH-XXXXX',
                border: const OutlineInputBorder(),
                errorText: _errorMessage,
              ),
              textCapitalization: TextCapitalization.characters,
              inputFormatters: [
                TextInputFormatter.withFunction((oldValue, newValue) {
                  return newValue.copyWith(
                    text: newValue.text.toUpperCase(),
                    selection: newValue.selection,
                  );
                }),
              ],
              onChanged: (_) {
                if (_errorMessage != null) {
                  setState(() => _errorMessage = null);
                }
              },
            ),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: _isLoading ? null : _onSubmit,
              child: _isLoading
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Text('Continue with code'),
            ),
            const SizedBox(height: 16),
            TextButton(
              onPressed: _isLoading ? null : _onSkip,
              child: const Text('Skip — join without a study code'),
            ),
          ],
        ),
      ),
    );
  }
}
