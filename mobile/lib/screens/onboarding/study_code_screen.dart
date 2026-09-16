import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:go_router/go_router.dart';

import '../../analytics/analytics_service.dart';
import 'consent_screen.dart' show kPendingStudyConsentSlugKey;

import '../../config/app_config.dart';
import '../../core/dio_provider.dart';
import '../../l10n/app_localizations.dart';
import '../../providers/auth_provider.dart';

// ---------------------------------------------------------------------------
// Secure-storage key constants
// ---------------------------------------------------------------------------

/// Key used to record that the participant has completed study enrollment.
const String kStudyEnrolledKey = 'study_enrolled';

/// Key for the enrolled study ID.
const String kStudyIdKey = 'study_id';

/// Key for the enrolled group ID.
const String kGroupIdKey = 'group_id';

/// Study-local subject code, for verified-identity studies only.
///
/// A pseudonym — safe to store on the device and to show the participant, so
/// they can quote it to the study site. It is NOT a credential.
const String kSubjectCodeKey = 'subject_code';

/// 'verified' when this study identifies its participants, else absent.
const String kIdentityModeKey = 'identity_mode';

// ---------------------------------------------------------------------------
// Code format
// ---------------------------------------------------------------------------
// Kept at file level rather than inside the State class so it is testable
// without building a widget tree — and because the client-side format MUST
// agree with the backend's. A release that predates the backend change would
// reject valid verified codes with a confusing local error, which is why the
// widened build has to ship before any HHV code is minted.

/// Anonymous study code: HHH-XXXXX.
final RegExp _anonymousCodePattern = RegExp(r'^HHH-[A-Z0-9]{5}$');

/// Verified-identity enrolment code: HHV-XXXXX-XXXXX over Crockford base32
/// (no I, L, O or U — the characters misread off a printed sheet).
final RegExp _verifiedCodePattern = RegExp(
  r'^HHV-[0-9ABCDEFGHJKMNPQRSTVWXYZ]{5}-[0-9ABCDEFGHJKMNPQRSTVWXYZ]{5}$',
);

/// Normalises a code for submission.
///
/// Trim and uppercase always. The I/L -> 1 and O -> 0 repair is applied ONLY
/// to verified (HHV-) codes, whose Crockford alphabet excludes those
/// characters so the substitution can only rescue a mistyped code.
///
/// It must NEVER be applied to anonymous HHH- codes: those are drawn from the
/// full A-Z0-9 alphabet, so I, L and O are legitimate characters. Repairing
/// them there corrupts a valid code — about 35% of existing codes contain at
/// least one — turning a working enrolment into "invalid code".
String normalizeStudyCode(String input) {
  final base = input.trim().toUpperCase().replaceAll(RegExp(r'\s+'), '');
  if (!base.startsWith('HHV')) return base;
  return base.replaceAll(RegExp('[IL]'), '1').replaceAll('O', '0');
}

/// Accepts either code format. The backend routes on the prefix; the client
/// must not reject a valid verified code before it ever gets there.
bool isValidStudyCode(String code) {
  final c = normalizeStudyCode(code);
  return _anonymousCodePattern.hasMatch(c) || _verifiedCodePattern.hasMatch(c);
}

// ---------------------------------------------------------------------------
// StudyCodeScreen
// ---------------------------------------------------------------------------

/// Onboarding step 3: lets the participant redeem an optional study code.
///
/// The screen is shown once, immediately after the passphrase screen.
/// If the user has already been enrolled (storage key [kStudyEnrolledKey])
/// the screen auto-skips to the main app.
class StudyCodeScreen extends ConsumerStatefulWidget {
  /// Creates a [StudyCodeScreen].
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
      context.go('/share');
    }
  }

  bool _isValidCode(String code) => isValidStudyCode(code);

  /// Calls POST /api/v1/onboarding/redeem-code and stores the result.
  Future<void> _onSubmit() async {
    final l10n = AppLocalizations.of(context)!;
    final code = normalizeStudyCode(_codeController.text);
    if (!_isValidCode(code)) {
      setState(() => _errorMessage = l10n.studyCodeInvalidFormat);
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
      // Present only for verified-identity studies.
      final subjectCode = data['subjectCode'] as String?;

      const storage = FlutterSecureStorage();
      await storage.write(key: kStudyIdKey, value: studyId);
      await storage.write(key: kGroupIdKey, value: groupId);
      await storage.write(key: kStudyEnrolledKey, value: 'true');
      if (subjectCode != null && subjectCode.isNotEmpty) {
        await storage.write(key: kSubjectCodeKey, value: subjectCode);
        await storage.write(key: kIdentityModeKey, value: 'verified');
      }
      // A verified study may require its own consent document. It can only be
      // known now — the study is unknown until the code is redeemed — so the
      // slug is stored and the router gates on it from here on.
      final consentSlug = data['identityConsentSlug'] as String?;
      if (data['identityConsentRequired'] == true &&
          consentSlug != null &&
          consentSlug.isNotEmpty) {
        await storage.write(
          key: kPendingStudyConsentSlugKey,
          value: consentSlug,
        );
      }

      final analytics = ref.read(analyticsProvider);
      final userId = await ref.read(userIdProvider.future);
      if (userId != null) {
        await analytics.identify(userId, studyId: studyId, groupId: groupId);
      }
      unawaited(
        analytics.capture('onboarding_step_completed', {'step': 'study_code'}),
      );
      unawaited(
        analytics.capture('onboarding_completed', {'study_code_used': true}),
      );

      if (!mounted) return;
      context.go('/share');
    } on DioException catch (e) {
      if (!mounted) return;
      final statusCode = e.response?.statusCode;
      final body = e.response?.data;
      String message;
      if (statusCode == 404) {
        message = l10n.studyCodeInvalid;
      } else if (statusCode == 410) {
        message = l10n.studyCodeExpired;
      } else if (statusCode == 409) {
        message = l10n.studyCodeAlreadyUsed;
      } else if (body is Map && body['error'] != null) {
        message = body['error'] as String;
      } else {
        message = l10n.studyCodeGenericError;
      }
      setState(() {
        _isLoading = false;
        _errorMessage = message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _isLoading = false;
        _errorMessage = l10n.studyCodeGenericError;
      });
    }
  }

  /// Calls POST /api/v1/onboarding/skip-code to enrol in the default study.
  ///
  /// Only marks onboarding complete and navigates on if the call actually
  /// succeeds — this used to swallow the error and proceed regardless,
  /// which left the participant permanently unenrolled server-side (nothing
  /// re-attempts skip-code on a later launch, since this screen auto-skips
  /// once [kStudyEnrolledKey] is set — see _redirectIfAlreadyEnrolled).
  Future<void> _onSkip() async {
    final l10n = AppLocalizations.of(context)!;
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final dio = ref.read(dioProvider);
      await dio.post<void>('${AppConfig.apiBaseUrl}/onboarding/skip-code');
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _isLoading = false;
        _errorMessage = l10n.studyCodeSkipError;
      });
      return;
    }

    const storage = FlutterSecureStorage();
    await storage.write(key: kStudyEnrolledKey, value: 'true');

    final analytics = ref.read(analyticsProvider);
    unawaited(
      analytics.capture('onboarding_step_completed', {'step': 'study_code'}),
    );
    unawaited(
      analytics.capture('onboarding_completed', {'study_code_used': false}),
    );

    if (!mounted) return;
    context.go('/share');
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.studyCodeAppBarTitle)),
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
              l10n.studyCodeQuestion,
              style: Theme.of(
                context,
              ).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              l10n.studyCodeSubtitle,
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
                labelText: l10n.studyCodeLabel,
                hintText:
                    'HHH-XXXXX', // or HHV-XXXXX-XXXXX for verified studies
                border: const OutlineInputBorder(),
                errorText: _errorMessage,
                errorMaxLines: 3,
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
                  : Text(l10n.studyCodeContinueButton),
            ),
            const SizedBox(height: 16),
            TextButton(
              onPressed: _isLoading ? null : _onSkip,
              child: Text(l10n.studyCodeSkipButton),
            ),
          ],
        ),
      ),
    );
  }
}
