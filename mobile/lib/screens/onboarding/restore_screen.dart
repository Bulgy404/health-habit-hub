import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:go_router/go_router.dart';

import '../../config/app_config.dart';
import '../../core/dio_provider.dart';
import '../../providers/auth_provider.dart';
import 'welcome_screen.dart';

// ---------------------------------------------------------------------------
// Secure-storage key constants (mirror passphrase_screen.dart)
// ---------------------------------------------------------------------------
const _kUsername = 'username';
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
class RestoreScreen extends ConsumerStatefulWidget {
  /// Creates a [RestoreScreen].
  ///
  /// [storage] overrides where the restored credentials are persisted; tests
  /// inject a fake to avoid touching the secure-storage platform channel.
  const RestoreScreen({
    super.key,
    this.storage = const FlutterSecureStorage(),
  });

  /// Secure storage used to persist the restored session credentials.
  final FlutterSecureStorage storage;

  @override
  ConsumerState<RestoreScreen> createState() => _RestoreScreenState();
}

class _RestoreScreenState extends ConsumerState<RestoreScreen> {
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

    if (words.length != 24) {
      setState(() {
        _loading = false;
        _error = 'Invalid passphrase or account not found';
      });
      return;
    }

    try {
      // The phrase is decoded and exchanged for tokens entirely server-side
      // (POST /restore), via a confidential Keycloak client the backend
      // holds the secret for. The phone never performs the password grant
      // directly — hhh-flutter (the public client) has direct access grants
      // disabled precisely so this capability isn't exposed to anyone who
      // extracts the public client_id from the app.
      final response =
          await ref.read(dioProvider).post<Map<String, dynamic>>(
        '${AppConfig.apiBaseUrl}/restore',
        data: {'phrase': words.join(' ')},
        options: Options(
          validateStatus: (status) => status != null && status < 600,
        ),
      );

      if (!mounted) return;

      final statusCode = response.statusCode ?? 0;
      if (statusCode == 200 && response.data != null) {
        final data = response.data!;
        await widget.storage.write(
          key: _kUsername,
          value: data['username']?.toString() ?? '',
        );
        // Note: the raw account password is intentionally never sent to or
        // stored on this device — the backend decodes the phrase and mints
        // tokens itself, returning only the token pair below.
        await widget.storage.write(
          key: _kAccessToken,
          value: data['access_token']?.toString() ?? '',
        );
        await widget.storage.write(
          key: _kRefreshToken,
          value: data['refresh_token']?.toString() ?? '',
        );
        await widget.storage.write(key: kOnboardingCompleteKey, value: 'true');
        // Tokens are written directly above rather than via AuthService, so
        // onLogin never fires — invalidate the user-scoped providers
        // explicitly. Otherwise the restored account could briefly show
        // whatever data (e.g. a different account's habits) was last loaded
        // in this app process, exactly the stale-heatmap bug this restore
        // flow exists to recover from.
        invalidateUserScopedProvidersFromWidget(ref);
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
