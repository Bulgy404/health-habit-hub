import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import '../l10n/app_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../config/app_config.dart';
import '../core/dio_provider.dart';
import '../features/questionnaire/questionnaire_service.dart';
import '../providers/auth_provider.dart';
import '../services/survey_service.dart';
import '../widgets/offline_banner.dart';

/// Profile questionnaire screen.
///
/// Checks whether the participant has already completed their profile
/// (GET /api/v1/profile). If yes, shows a summary card with the completion
/// date and an Edit button. If not, renders the profile survey via a
/// [WebView] and POSTs answers to /api/v1/profile on completion.
class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  static const _baseUrl = AppConfig.apiBaseUrl;

  late final Dio _dio;

  /// Whether we are still loading (checking profile or fetching survey).
  bool _loading = true;

  /// Set when network call fails (offline / error).
  bool _offline = false;

  /// Non-null when the participant has an existing profile.
  DateTime? _completedAt;

  /// Set to true when user taps Edit to re-show the survey.
  bool _editing = false;

  // WebView state
  WebViewController? _controller;
  String? _surveyId;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _dio = ref.read(dioProvider);
    _init();
  }

  Future<void> _init() async {
    setState(() {
      _loading = true;
      _offline = false;
    });
    try {
      final profileResp = await _dio.get<Map<String, dynamic>>(
        '$_baseUrl/profile',
        options: Options(
          validateStatus: (status) => status != null && status < 500,
        ),
      );
      if (profileResp.statusCode == 200) {
        _onProfileLoaded(profileResp.data);
      } else {
        await _initSurvey();
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _loading = false;
          _offline = true;
        });
      }
    }
  }

  void _onProfileLoaded(Map<String, dynamic>? data) {
    if (!mounted) return;
    DateTime? completedAt;
    if (data != null && data['completedAt'] != null) {
      completedAt = DateTime.tryParse(data['completedAt'].toString());
    }
    setState(() {
      _completedAt = completedAt ?? DateTime.now();
      _loading = false;
    });
  }

  Future<void> _initSurvey() async {
    final surveyService = ref.read(surveyServiceProvider);
    final authService = ref.read(authServiceProvider);
    try {
      final survey = await surveyService.fetchSurvey('profile');
      final token = await authService.getAccessToken();

      final controller = WebViewController()
        ..setJavaScriptMode(JavaScriptMode.unrestricted)
        ..addJavaScriptChannel(
          'ProfileSurveyComplete',
          onMessageReceived: (msg) => _onSurveyComplete(msg.message),
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
          Uri.parse('$_baseUrl/surveys/${survey.id}/render'),
          headers:
              token != null ? {'Authorization': 'Bearer $token'} : const {},
        );

      if (mounted) {
        setState(() {
          _controller = controller;
          _surveyId = survey.id;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _loading = false;
          _offline = true;
        });
      }
    }
  }

  Future<void> _injectCompletionHook() async {
    await _controller?.runJavaScript('''
      (function() {
        var interval = setInterval(function() {
          if (typeof survey !== 'undefined' && survey && survey.onComplete) {
            clearInterval(interval);
            survey.onComplete.add(function(sender) {
              ProfileSurveyComplete.postMessage(JSON.stringify(sender.data));
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
      await _dio.post<void>(
        '$_baseUrl/profile',
        data: {'answers': answers, 'completedAt': DateTime.now().toIso8601String()},
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l10n.profileSavedSuccess)),
        );
        // Return to summary view.
        setState(() {
          _completedAt = DateTime.now();
          _editing = false;
          _controller = null;
          _surveyId = null;
        });
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l10n.submissionFailed)),
        );
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  void _startEdit() {
    setState(() {
      _completedAt = null;
      _editing = true;
      _loading = true;
      _controller = null;
      _surveyId = null;
    });
    _initSurvey();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.myProfile),
        actions: [
          IconButton(
            icon: const Icon(Icons.settings),
            tooltip: l10n.settings,
            onPressed: () => context.push('/settings'),
          ),
        ],
      ),
      body: Stack(
        children: [
          if (_offline)
            OfflineBanner(
              message: l10n.couldNotLoadProfile,
              onRetry: _init,
            )
          else if (_loading)
            const Center(child: CircularProgressIndicator())
          else if (_completedAt != null && !_editing)
            Column(
              children: [
                Expanded(
                  child: _ProfileSummaryCard(
                    completedAt: _completedAt!,
                    onEdit: _startEdit,
                  ),
                ),
                _StudyQuestionnairesSection(l10n: l10n),
                Padding(
                  padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
                  child: OutlinedButton.icon(
                    onPressed: () => context.push('/onboarding/restore'),
                    icon: const Icon(Icons.lock_reset),
                    label: Text(l10n.restoreAccountOnDevice),
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size(double.infinity, 48),
                    ),
                  ),
                ),
              ],
            )
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

// ---------------------------------------------------------------------------
// Profile summary card shown when profile is already completed.
// ---------------------------------------------------------------------------

class _ProfileSummaryCard extends StatelessWidget {
  const _ProfileSummaryCard({
    required this.completedAt,
    required this.onEdit,
  });

  final DateTime completedAt;
  final VoidCallback onEdit;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final dateStr =
        '${completedAt.year}-${completedAt.month.toString().padLeft(2, '0')}-${completedAt.day.toString().padLeft(2, '0')}';
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Card(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.check_circle, size: 64, color: Colors.teal),
                const SizedBox(height: 16),
                Text(
                  l10n.profileCompleted,
                  style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 8),
                Text(
                  l10n.completedOn(dateStr),
                  style: const TextStyle(color: Colors.grey),
                ),
                const SizedBox(height: 24),
                ElevatedButton.icon(
                  onPressed: onEdit,
                  icon: const Icon(Icons.edit),
                  label: Text(l10n.edit),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Study-specific questionnaire section — fetched from the backend.
// ---------------------------------------------------------------------------

class _StudyQuestionnairesSection extends ConsumerWidget {
  const _StudyQuestionnairesSection({required this.l10n});

  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final questionnairesAsync = ref.watch(participantQuestionnairesProvider);

    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 0, 24, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            l10n.healthQuestionnaires,
            style: const TextStyle(fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 8),
          questionnairesAsync.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (error, stackTrace) => Text(
              l10n.failedToLoadQuestionnaire,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
            data: (questionnaires) {
              if (questionnaires.isEmpty) {
                return Text(
                  l10n.noQuestionnairesAssigned,
                  style: TextStyle(
                    color: Theme.of(context)
                        .colorScheme
                        .onSurface
                        .withAlpha(153),
                  ),
                );
              }
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  for (final q in questionnaires) ...[
                    OutlinedButton.icon(
                      onPressed: () =>
                          context.push('/questionnaire/${q.slug}'),
                      icon: const Icon(Icons.assignment),
                      label: Text(q.title),
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size(double.infinity, 48),
                      ),
                    ),
                    const SizedBox(height: 8),
                  ],
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}

