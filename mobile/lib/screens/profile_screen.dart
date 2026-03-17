import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../providers/auth_provider.dart';
import '../services/survey_service.dart';

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
  static const _baseUrl = 'https://api.hhh.tu-dresden.de/api/v1';

  final _dio = Dio();

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
    _init();
  }

  Future<Map<String, String>> _authHeaders() async {
    final authService = ref.read(authServiceProvider);
    final token = await authService.getAccessToken();
    if (token == null) return {};
    return {'Authorization': 'Bearer $token'};
  }

  Future<void> _init() async {
    setState(() {
      _loading = true;
      _offline = false;
    });
    try {
      final headers = await _authHeaders();
      // Check if profile already exists.
      final profileResp = await _dio.get<Map<String, dynamic>>(
        '$_baseUrl/profile',
        options: Options(
          headers: headers,
          validateStatus: (status) => status != null && status < 500,
        ),
      );

      if (profileResp.statusCode == 200) {
        // Profile already completed — parse completion date.
        final data = profileResp.data;
        DateTime? completedAt;
        if (data != null && data['completedAt'] != null) {
          completedAt = DateTime.tryParse(data['completedAt'].toString());
        }
        if (mounted) {
          setState(() {
            _completedAt = completedAt ?? DateTime.now();
            _loading = false;
          });
        }
      } else {
        // No profile yet — load the survey WebView.
        await _initSurvey(headers);
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

  Future<void> _initSurvey([Map<String, String>? existingHeaders]) async {
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
    try {
      final answers = jsonDecode(message) as Map<String, dynamic>;
      final headers = await _authHeaders();
      await _dio.post<void>(
        '$_baseUrl/profile',
        data: {'answers': answers, 'completedAt': DateTime.now().toIso8601String()},
        options: Options(headers: headers),
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Profile saved successfully!')),
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
          const SnackBar(
            content: Text('Submission failed — please try again.'),
          ),
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
    return Scaffold(
      appBar: AppBar(title: const Text('My Profile')),
      body: Stack(
        children: [
          if (_offline)
            _OfflineBanner(onRetry: _init)
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
                Padding(
                  padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
                  child: OutlinedButton.icon(
                    onPressed: () => context.push('/onboarding/restore'),
                    icon: const Icon(Icons.lock_reset),
                    label: const Text('Restore account on this device'),
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
                const Text(
                  'Profile Completed',
                  style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 8),
                Text(
                  'Completed on $dateStr',
                  style: const TextStyle(color: Colors.grey),
                ),
                const SizedBox(height: 24),
                ElevatedButton.icon(
                  onPressed: onEdit,
                  icon: const Icon(Icons.edit),
                  label: const Text('Edit'),
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
// Offline banner — reused pattern from DonateScreen.
// ---------------------------------------------------------------------------

class _OfflineBanner extends StatelessWidget {
  const _OfflineBanner({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(
          width: double.infinity,
          color: Colors.orange,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: const Row(
            children: [
              Icon(Icons.wifi_off, color: Colors.white),
              SizedBox(width: 8),
              Text(
                'No connection',
                style: TextStyle(color: Colors.white, fontSize: 15),
              ),
            ],
          ),
        ),
        Expanded(
          child: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.cloud_off, size: 64, color: Colors.grey),
                const SizedBox(height: 16),
                const Text(
                  'Could not load profile.\nPlease check your connection.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.grey),
                ),
                const SizedBox(height: 24),
                ElevatedButton.icon(
                  onPressed: onRetry,
                  icon: const Icon(Icons.refresh),
                  label: const Text('Retry'),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
