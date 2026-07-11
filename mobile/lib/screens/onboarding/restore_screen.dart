import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:go_router/go_router.dart';

import '../../config/app_config.dart';
import 'passphrase_screen.dart';
import 'welcome_screen.dart';

// ---------------------------------------------------------------------------
// Secure-storage key constants (mirror passphrase_screen.dart)
// ---------------------------------------------------------------------------
const _kUsername = 'username';
const _kPassword = 'password';
const _kAccessToken = 'access_token';
const _kRefreshToken = 'refresh_token';

// ---------------------------------------------------------------------------
// RestoreScreen
// ---------------------------------------------------------------------------

/// Lets a returning user restore their account on a new device by entering
/// their 24-word recovery passphrase.
///
/// The screen is reachable from:
/// * The welcome screen's "Restore existing account" link (first-launch flow).
/// * The Profile screen's "Restore account" option (settings area).
class RestoreScreen extends StatefulWidget {
  /// Creates a [RestoreScreen].
  const RestoreScreen({super.key});

  @override
  State<RestoreScreen> createState() => _RestoreScreenState();
}

class _RestoreScreenState extends State<RestoreScreen> {
  final _controller = TextEditingController();
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _onSubmit() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    final raw = _controller.text.trim();
    final words =
        raw.split(RegExp(r'\s+')).where((w) => w.isNotEmpty).toList();

    final credentials = credentialsFromPassphrase(words);
    if (credentials == null) {
      setState(() {
        _loading = false;
        _error = 'Invalid passphrase or account not found';
      });
      return;
    }

    final (username, password) = credentials;

    try {
      final response = await Dio().post<Map<String, dynamic>>(
        '${AppConfig.keycloakUrl}/realms/hhh/protocol/openid-connect/token',
        data: {
          'grant_type': 'password',
          'client_id': 'hhh-flutter',
          'username': username,
          'password': password,
          'scope': 'openid profile email',
        },
        options: Options(
          contentType: 'application/x-www-form-urlencoded',
          validateStatus: (status) => status != null && status < 600,
        ),
      );

      if (!mounted) return;

      final statusCode = response.statusCode ?? 0;
      if (statusCode == 200 && response.data != null) {
        final data = response.data!;
        const storage = FlutterSecureStorage();
        await storage.write(key: _kUsername, value: username);
        await storage.write(key: _kPassword, value: password);
        await storage.write(
          key: _kAccessToken,
          value: data['access_token']?.toString() ?? '',
        );
        await storage.write(
          key: _kRefreshToken,
          value: data['refresh_token']?.toString() ?? '',
        );
        await storage.write(key: kOnboardingCompleteKey, value: 'true');
        if (!mounted) return;
        context.go('/share');
      } else {
        setState(() {
          _loading = false;
          _error = 'Invalid passphrase or account not found';
        });
      }
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Invalid passphrase or account not found';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Restore Account')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Icon(Icons.lock_reset, size: 64, color: Colors.teal),
            const SizedBox(height: 16),
            Text(
              'Restore your account',
              style: Theme.of(context)
                  .textTheme
                  .headlineSmall
                  ?.copyWith(fontWeight: FontWeight.bold),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              'Enter your 24-word passphrase to restore your account on this device.',
              style: Theme.of(context)
                  .textTheme
                  .bodyMedium
                  ?.copyWith(color: Colors.grey.shade600),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            TextField(
              controller: _controller,
              maxLines: 6,
              keyboardType: TextInputType.multiline,
              textInputAction: TextInputAction.newline,
              decoration: InputDecoration(
                labelText: '24-word recovery passphrase',
                hintText: 'word1 word2 word3 …',
                border: const OutlineInputBorder(),
                errorText: _error,
                errorMaxLines: 3,
              ),
            ),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: _loading ? null : _onSubmit,
              child: _loading
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Text('Restore account'),
            ),
          ],
        ),
      ),
    );
  }
}
