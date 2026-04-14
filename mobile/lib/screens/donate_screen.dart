import 'dart:convert';

import 'package:flutter/material.dart';
import '../l10n/app_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../config/app_config.dart';
import '../providers/auth_provider.dart';
import '../providers/locale_provider.dart';
import '../services/survey_service.dart';
import '../widgets/offline_banner.dart';

/// Habit-sharing survey screen.
///
/// Fetches the legacy `habit-donation` survey from the backend, renders it via
/// a [WebView] pointing at `/api/v1/surveys/:id/render`, intercepts the
/// SurveyJS completion event, and submits the answers via [SurveyService].
class ShareHabitScreen extends ConsumerStatefulWidget {
  const ShareHabitScreen({super.key});

  @override
  ConsumerState<ShareHabitScreen> createState() => _ShareHabitScreenState();
}

class _ShareHabitScreenState extends ConsumerState<ShareHabitScreen> {
  static const _baseUrl = AppConfig.apiBaseUrl;

  WebViewController? _controller;
  String? _surveyId;
  bool _loading = true;
  bool _offline = false;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _initSurvey();
  }

  Uri _buildSurveyUri(String surveyId, String lang) {
    return Uri.parse('$_baseUrl/surveys/$surveyId/render')
        .replace(queryParameters: {'lang': lang});
  }

  WebViewController _buildWebController(Uri uri, String? token) {
    return WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..addJavaScriptChannel(
        'SurveyComplete',
        onMessageReceived: (msg) {
          try {
            final data = jsonDecode(msg.message);
            if (data is! Map<String, dynamic>) return;
            _onSurveyComplete(msg.message);
          } catch (e) {
            debugPrint('SurveyComplete: invalid message ignored: $e');
          }
        },
      )
      ..setNavigationDelegate(NavigationDelegate(
        onPageFinished: (_) => _injectCompletionHook(),
        onNavigationRequest: (NavigationRequest request) {
          final allowed = request.url.startsWith(AppConfig.appBaseUrl);
          return allowed
              ? NavigationDecision.navigate
              : NavigationDecision.prevent;
        },
      ))
      ..loadRequest(
        uri,
        headers: token != null ? {'Authorization': 'Bearer $token'} : const {},
      );
  }

  Future<void> _initSurvey() async {
    final surveyService = ref.read(surveyServiceProvider);
    final authService = ref.read(authServiceProvider);
    final lang = ref.read(localeProvider).languageCode;
    try {
      final survey = await surveyService.fetchSurvey('habit-donation');
      final token = await authService.getAccessToken();
      final uri = _buildSurveyUri(survey.id, lang);
      final controller = _buildWebController(uri, token);

      if (mounted) {
        setState(() {
          _controller = controller;
          _surveyId = survey.id;
          _loading = false;
        });
      }
    } catch (e, st) {
      debugPrint('ERROR in ShareHabitScreen._initSurvey: $e\n$st');
      if (mounted) {
        setState(() {
          _loading = false;
          _offline = true;
        });
      }
    }
  }

  /// Inject JS that hooks into the SurveyJS `onComplete` event and forwards
  /// the answers to the Flutter [SurveyComplete] JavaScript channel.
  Future<void> _injectCompletionHook() async {
    await _controller?.runJavaScript('''
      (function() {
        var interval = setInterval(function() {
          if (typeof survey !== 'undefined' && survey && survey.onComplete) {
            clearInterval(interval);
            survey.onComplete.add(function(sender) {
              SurveyComplete.postMessage(JSON.stringify(sender.data));
            });
          }
        }, 200);
      })();
    ''');
  }

  Future<void> _onSurveyComplete(String message) async {
    if (_submitting || _surveyId == null) return;
    setState(() => _submitting = true);
    final l10n = AppLocalizations.of(context)!;
    try {
      final answers = jsonDecode(message) as Map<String, dynamic>;
      final surveyService = ref.read(surveyServiceProvider);
      await surveyService.submitResult(_surveyId!, answers);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l10n.habitSharedSuccess)),
        );
        context.pop();
      }
    } catch (e, st) {
      debugPrint('ERROR in ShareHabitScreen._onSurveyComplete: $e\n$st');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l10n.submissionFailed)),
        );
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.shareHabit)),
      body: Stack(
        children: [
          if (_offline)
            OfflineBanner(
              message: l10n.couldNotLoadSurvey,
              onRetry: () {
                setState(() {
                  _loading = true;
                  _offline = false;
                });
                _initSurvey();
              },
            )
          else if (_loading)
            const Center(child: CircularProgressIndicator())
          else if (_controller != null)
            WebViewWidget(controller: _controller!),
          if (_submitting)
            const ColoredBox(
              color: Color(0x44000000),
              child: Center(child: CircularProgressIndicator()),
            ),
        ],
      ),
    );
  }
}
