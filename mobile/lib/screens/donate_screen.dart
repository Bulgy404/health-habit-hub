import 'dart:convert';

import 'package:flutter/material.dart';
import '../l10n/app_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../config/app_config.dart';
import '../providers/auth_provider.dart';
import '../providers/locale_provider.dart';
import '../services/habit_service.dart';
import '../services/survey_service.dart';
import '../widgets/offline_banner.dart';

const _kCardShadow = [BoxShadow(color: Color(0x14000000), blurRadius: 20, offset: Offset(0, 4))];
const _kGreenGlow  = [BoxShadow(color: Color(0x4745B700), blurRadius: 28, offset: Offset(0, 8))];

class ShareHabitScreen extends ConsumerStatefulWidget {
  const ShareHabitScreen({super.key});

  @override
  ConsumerState<ShareHabitScreen> createState() => _ShareHabitScreenState();
}

class _ShareHabitScreenState extends ConsumerState<ShareHabitScreen> {
  static const _baseUrl = AppConfig.apiBaseUrl;

  WebViewController? _controller;
  String? _surveyId;
  bool _surveyReady = false;
  bool _surveyMode = false;
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
            debugPrint('SurveyComplete: invalid message: $e');
          }
        },
      )
      ..setNavigationDelegate(NavigationDelegate(
        onPageFinished: (_) => _injectCompletionHook(),
        onNavigationRequest: (request) {
          final allowed = request.url.startsWith(AppConfig.appBaseUrl);
          return allowed ? NavigationDecision.navigate : NavigationDecision.prevent;
        },
      ))
      ..loadRequest(uri, headers: token != null ? {'Authorization': 'Bearer $token'} : const {});
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
          _surveyReady = true;
        });
      }
    } catch (e) {
      debugPrint('ShareHabitScreen._initSurvey: $e');
      if (mounted) setState(() => _offline = true);
    }
  }

  Future<void> _injectCompletionHook() async {
    await _controller?.runJavaScript('''
      (function() {
        var iv = setInterval(function() {
          if (typeof survey !== 'undefined' && survey && survey.onComplete) {
            clearInterval(iv);
            survey.onComplete.add(function(s) {
              SurveyComplete.postMessage(JSON.stringify(s.data));
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
        setState(() {
          _surveyMode = false;
          _surveyReady = false;
          _controller = null;
          _surveyId = null;
        });
        _initSurvey();
      }
    } catch (e) {
      debugPrint('ShareHabitScreen._onSurveyComplete: $e');
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
    final statsAsync = ref.watch(habitStatsProvider);

    if (_offline) {
      return Scaffold(
        appBar: AppBar(title: Text(l10n.shareHabit)),
        body: OfflineBanner(
          message: l10n.couldNotLoadSurvey,
          onRetry: () {
            setState(() => _offline = false);
            _initSurvey();
          },
        ),
      );
    }

    if (_surveyMode && _controller != null) {
      return Scaffold(
        appBar: AppBar(
          title: Text(l10n.shareHabit),
          leading: IconButton(
            icon: const Icon(Icons.close),
            onPressed: () => setState(() => _surveyMode = false),
          ),
        ),
        body: Stack(
          children: [
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

    return Scaffold(
      appBar: AppBar(
        title: const Text('Health Habit Hub'),
        titleSpacing: 16,
        actions: const [Padding(padding: EdgeInsets.only(right: 16), child: Icon(Icons.notifications_outlined))],
      ),
      body: ListView(
        padding: const EdgeInsets.only(bottom: 24),
        children: [
          // ── Hero card ──────────────────────────────────────────────
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
            child: Container(
              decoration: BoxDecoration(
                color: const Color(0xFF45B700),
                borderRadius: BorderRadius.circular(20),
                boxShadow: _kGreenGlow,
              ),
              padding: const EdgeInsets.all(18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    "TODAY'S TASK",
                    style: TextStyle(color: Colors.white70, fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 1),
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'Share a habit with science',
                    style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w900, height: 1.2),
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'Anonymous · ~2 min · Helps researchers worldwide',
                    style: TextStyle(color: Colors.white70, fontSize: 13),
                  ),
                  const SizedBox(height: 14),
                  GestureDetector(
                    onTap: _surveyReady ? () => setState(() => _surveyMode = true) : null,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
                      decoration: BoxDecoration(
                        color: _surveyReady ? Colors.white : Colors.white54,
                        borderRadius: BorderRadius.circular(100),
                      ),
                      child: Text(
                        _surveyReady ? 'Start survey' : 'Loading…',
                        style: const TextStyle(
                          color: Color(0xFF2E8C00),
                          fontWeight: FontWeight.w800,
                          fontSize: 14,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),

          // ── Stats row ──────────────────────────────────────────────
          statsAsync.when(
            loading: () => const SizedBox(height: 80),
            error: (err, stack) => const SizedBox(height: 12),
            data: (stats) => Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
              child: Row(
                children: [
                  _StatCard(value: '${stats.total}', label: 'Donated'),
                  const SizedBox(width: 10),
                  _StatCard(value: '${stats.byCategory.length}', label: 'Categories'),
                  const SizedBox(width: 10),
                  _StatCard(icon: Icons.military_tech, label: 'Top habit'),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({this.value, this.icon, required this.label});
  final String? value;
  final IconData? icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          boxShadow: _kCardShadow,
        ),
        child: Column(
          children: [
            if (icon != null)
              Icon(icon, color: const Color(0xFF45B700), size: 22)
            else
              Text(
                value ?? '-',
                style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: Color(0xFF45B700)),
              ),
            const SizedBox(height: 3),
            Text(label, style: const TextStyle(fontSize: 11, color: Color(0xFF6B7280))),
          ],
        ),
      ),
    );
  }
}
