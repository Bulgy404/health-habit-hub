import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:go_router/go_router.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../../config/app_config.dart';
import '../../core/dio_provider.dart';
import '../../l10n/app_localizations.dart';
import '../../providers/auth_provider.dart';
import '../../widgets/offline_banner.dart';

/// Secure-storage keys recording locally which consent version was accepted.
/// The acceptance is additionally posted to the backend after authentication
/// (see PassphraseScreen) so the study keeps an auditable consent record.
const String kConsentVersionKey = 'consent_version';
const String kConsentLocaleKey = 'consent_locale';
const String kConsentAcceptedAtKey = 'consent_accepted_at';

/// Study information & informed-consent screen (HabConnect IC).
///
/// Shown as a mandatory onboarding step BEFORE account creation
/// (App Store Review Guideline 5.1.3 — health research requires informed
/// consent). The document is fetched from the backend so the latest
/// ethics-approved version is always displayed; its front-matter version is
/// recorded on acceptance.
class ConsentScreen extends ConsumerStatefulWidget {
  /// Creates the consent screen.
  ///
  /// With [isUpdate] true the screen runs in re-consent mode for already
  /// registered participants after a consent-document version bump (UC-31):
  /// acceptance is posted to the backend immediately, declining signs out.
  const ConsentScreen({this.isUpdate = false, super.key});

  /// Whether this is a re-consent prompt for an existing account.
  final bool isUpdate;

  @override
  ConsumerState<ConsentScreen> createState() => _ConsentScreenState();
}

class _ConsentScreenState extends ConsumerState<ConsentScreen> {
  WebViewController? _controller;
  bool _loading = true;
  bool _offline = false;
  String? _documentVersion;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadDocument());
  }

  Future<void> _loadDocument() async {
    if (!mounted) return;
    setState(() {
      _loading = true;
      _offline = false;
    });

    final dio = ref.read(dioProvider);
    final locale = Localizations.localeOf(context).languageCode;

    try {
      final response = await dio.get<Map<String, dynamic>>(
        '${AppConfig.appBaseUrl}/$locale/consent',
        options: Options(
          validateStatus: (status) => status != null && status < 500,
        ),
      );
      if (response.statusCode != 200) {
        throw DioException(
          requestOptions: response.requestOptions,
          response: response,
        );
      }

      final content = response.data?['content']?.toString();
      if (content == null || content.isEmpty) {
        throw StateError('Missing consent document content');
      }
      final docMeta = response.data?['document'];
      final version = docMeta is Map<String, dynamic>
          ? docMeta['version']?.toString()
          : null;

      final controller = WebViewController()
        ..setJavaScriptMode(JavaScriptMode.disabled)
        ..loadHtmlString(_wrapHtml(content));

      if (!mounted) return;
      setState(() {
        _controller = controller;
        _documentVersion = version ?? '1.0.0';
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _offline = true;
        _loading = false;
      });
    }
  }

  Future<void> _onAccept() async {
    const storage = FlutterSecureStorage();
    final locale = Localizations.localeOf(context).languageCode;
    await storage.write(key: kConsentVersionKey, value: _documentVersion);
    await storage.write(key: kConsentLocaleKey, value: locale);
    await storage.write(
      key: kConsentAcceptedAtKey,
      value: DateTime.now().toIso8601String(),
    );
    if (!mounted) return;
    if (widget.isUpdate) {
      // Already authenticated — record the new version server-side now.
      try {
        await ref.read(dioProvider).post<Map<String, dynamic>>(
          '${AppConfig.apiBaseUrl}/users/me/consent',
          data: {'consentVersion': _documentVersion, 'locale': locale},
        );
      } catch (_) {
        // Recorded locally; retried on next app start via the version check.
      }
      if (!mounted) return;
      context.go('/share');
      return;
    }
    context.go('/onboarding/passphrase');
  }

  Future<void> _onDecline() async {
    if (widget.isUpdate) {
      // Withdrawing consent: stop participation (sign out). Data deletion is
      // available separately under Settings → Delete account.
      await ref.read(authServiceProvider).logout();
      if (!mounted) return;
    }
    context.go('/onboarding/welcome');
  }

  String _wrapHtml(String body) {
    return '''
<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
      body {
        margin: 0;
        padding: 16px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        line-height: 1.5;
        color: #1f2937;
        background: #ffffff;
      }
      h1, h2, h3 { line-height: 1.25; margin-top: 1.25em; }
      p, li { font-size: 16px; }
      blockquote {
        margin: 0 0 1em;
        padding: 8px 12px;
        background: #f3f4f6;
        border-left: 4px solid #9ca3af;
        color: #4b5563;
        font-size: 14px;
      }
    </style>
  </head>
  <body>$body</body>
</html>
''';
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Scaffold(
      appBar: AppBar(
        title: Text(
            widget.isUpdate ? l10n.consentUpdatedTitle : l10n.consentTitle),
        automaticallyImplyLeading: !widget.isUpdate,
      ),
      body: _offline
          ? OfflineBanner(
              message: l10n.consentCouldNotLoad,
              onRetry: _loadDocument,
            )
          : _loading || _controller == null
              ? const Center(child: CircularProgressIndicator())
              : Column(
                  children: [
                    Expanded(child: WebViewWidget(controller: _controller!)),
                    SafeArea(
                      top: false,
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Text(
                              l10n.consentConfirmText,
                              style: Theme.of(context).textTheme.bodySmall,
                              textAlign: TextAlign.center,
                            ),
                            const SizedBox(height: 8),
                            FilledButton(
                              onPressed: _onAccept,
                              child: Text(l10n.consentAccept),
                            ),
                            TextButton(
                              onPressed: _onDecline,
                              child: Text(l10n.consentDecline),
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
