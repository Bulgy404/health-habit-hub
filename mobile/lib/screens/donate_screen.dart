import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../providers/auth_provider.dart';
import '../services/survey_service.dart';

/// Habit-donation survey screen.
///
/// Fetches the habit-donation survey from the backend, renders it via
/// a [WebView] pointing at `/api/v1/surveys/:id/render`, intercepts the
/// SurveyJS completion event, and submits the answers via [SurveyService].
class DonateScreen extends ConsumerStatefulWidget {
  const DonateScreen({super.key});

  @override
  ConsumerState<DonateScreen> createState() => _DonateScreenState();
}

class _DonateScreenState extends ConsumerState<DonateScreen> {
  static const _baseUrl = 'https://api.hhh.tu-dresden.de/api/v1';

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

  Future<void> _initSurvey() async {
    final surveyService = ref.read(surveyServiceProvider);
    final authService = ref.read(authServiceProvider);
    try {
      final survey = await surveyService.fetchSurvey('habit-donation');
      final token = await authService.getAccessToken();

      final controller = WebViewController()
        ..setJavaScriptMode(JavaScriptMode.unrestricted)
        ..addJavaScriptChannel(
          'SurveyComplete',
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
    try {
      final answers = jsonDecode(message) as Map<String, dynamic>;
      final surveyService = ref.read(surveyServiceProvider);
      await surveyService.submitResult(_surveyId!, answers);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Habit donated successfully!')),
        );
        context.pop();
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Donate a Habit')),
      body: Stack(
        children: [
          if (_offline)
            _OfflineBanner(onRetry: () {
              setState(() {
                _loading = true;
                _offline = false;
              });
              _initSurvey();
            })
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
                  'Could not load survey.\nPlease check your connection.',
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
