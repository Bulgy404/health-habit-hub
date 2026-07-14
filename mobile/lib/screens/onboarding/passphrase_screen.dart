import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:go_router/go_router.dart';

import '../../config/app_config.dart';
import '../../core/dio_provider.dart';
import '../../providers/auth_provider.dart';
import '../../utils/bip39_wordlist.dart';
import '../../widgets/passphrase_word_grid.dart';
import 'welcome_screen.dart';

// ---------------------------------------------------------------------------
// Secure-storage key constants
// ---------------------------------------------------------------------------
const _kUsername = 'username';
const _kAccessToken = 'access_token';
const _kRefreshToken = 'refresh_token';
const _kExpiryKey = 'token_expiry';

// ---------------------------------------------------------------------------
// BIP39-style encode / decode helpers
// ---------------------------------------------------------------------------

/// Converts [hex] to a [Uint8List] byte array.
Uint8List _hexToBytes(String hex) {
  return Uint8List.fromList(
    List.generate(
      hex.length ~/ 2,
      (i) => int.parse(hex.substring(i * 2, i * 2 + 2), radix: 16),
    ),
  );
}

/// Converts [bytes] to a lowercase hex string.
String _bytesToHex(Uint8List bytes) {
  return bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
}

/// Encodes [bytes] into exactly [wordCount] words from [kBip39Words].
///
/// The bytes are first converted to a bit stream; every 11-bit chunk selects
/// a word by index.  The bit stream is zero-padded to [wordCount] × 11 bits.
List<String> _bytesToWords(Uint8List bytes, int wordCount) {
  // Build bit list (MSB first)
  final bits = <int>[];
  for (final b in bytes) {
    for (var i = 7; i >= 0; i--) {
      bits.add((b >> i) & 1);
    }
  }
  // Zero-pad to wordCount * 11 bits
  while (bits.length < wordCount * 11) {
    bits.add(0);
  }
  return List.generate(wordCount, (w) {
    var idx = 0;
    for (var b = 0; b < 11; b++) {
      idx = (idx << 1) | bits[w * 11 + b];
    }
    return kBip39Words[idx];
  });
}

/// Decodes [words] back into a [Uint8List] of length [byteCount].
Uint8List _wordsToBytes(List<String> words, int byteCount) {
  final wordIndex = <String, int>{
    for (var i = 0; i < kBip39Words.length; i++) kBip39Words[i]: i,
  };
  final bits = <int>[];
  for (final word in words) {
    final idx = wordIndex[word.toLowerCase()] ?? 0;
    for (var b = 10; b >= 0; b--) {
      bits.add((idx >> b) & 1);
    }
  }
  return Uint8List.fromList(
    List.generate(byteCount, (i) {
      var byte = 0;
      for (var b = 0; b < 8; b++) {
        byte = (byte << 1) | bits[i * 8 + b];
      }
      return byte;
    }),
  );
}

/// Derives a 24-word BIP39-style passphrase from [username] (UUID) and
/// [password] (32-char hex string).
///
/// Encoding layout:
/// * Words  0–11  (12 words) → 16-byte UUID without dashes
/// * Words 12–23  (12 words) → 16-byte password
List<String> passphraseFromCredentials(String username, String password) {
  final uuidBytes = _hexToBytes(username.replaceAll('-', ''));
  final passBytes = _hexToBytes(password);
  return [
    ..._bytesToWords(uuidBytes, 12),
    ..._bytesToWords(passBytes, 12),
  ];
}

/// Decodes a 24-word passphrase back into `(username UUID, password hex)`.
///
/// Returns `null` if the list does not contain exactly 24 words.
(String, String)? credentialsFromPassphrase(List<String> words) {
  if (words.length != 24) return null;
  final uuidBytes = _wordsToBytes(words.sublist(0, 12), 16);
  final passBytes = _wordsToBytes(words.sublist(12), 16);
  final hex = _bytesToHex(uuidBytes);
  final uuid = '${hex.substring(0, 8)}-'
      '${hex.substring(8, 12)}-'
      '${hex.substring(12, 16)}-'
      '${hex.substring(16, 20)}-'
      '${hex.substring(20)}';
  return (uuid, _bytesToHex(passBytes));
}

// ---------------------------------------------------------------------------
// PassphraseScreen
// ---------------------------------------------------------------------------

enum _ScreenState { loading, success, error }

/// Onboarding step 2: auto-creates a Keycloak account, derives a 24-word
/// BIP39-style recovery passphrase, and stores credentials on confirmation.
class PassphraseScreen extends ConsumerStatefulWidget {
  /// Creates a [PassphraseScreen].
  const PassphraseScreen({super.key});

  @override
  ConsumerState<PassphraseScreen> createState() => _PassphraseScreenState();
}

class _PassphraseScreenState extends ConsumerState<PassphraseScreen> {
  _ScreenState _state = _ScreenState.loading;
  List<String> _words = [];
  String _username = '';
  String _accessToken = '';
  String _refreshToken = '';
  int _expiresIn = 300;
  bool _confirmed = false;
  String _errorMessage = '';
  final ScrollController _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _fetchCredentials();
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _toggleConfirmed() {
    setState(() => _confirmed = !_confirmed);
    if (!_confirmed) return;
    // Scroll the Continue button into view once confirmed, so the user
    // doesn't have to manually scroll down to tap it.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_scrollController.hasClients) return;
      _scrollController.animateTo(
        _scrollController.position.maxScrollExtent,
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeOut,
      );
    });
  }

  /// Calls POST /api/v1/onboard to auto-create a Keycloak user and derives
  /// the BIP39-style passphrase from the returned credentials.
  Future<void> _fetchCredentials() async {
    setState(() => _state = _ScreenState.loading);
    try {
      final response = await ref.read(dioProvider).post<Map<String, dynamic>>(
        '${AppConfig.apiBaseUrl}/onboard',
      );
      if (!mounted) return;
      final data = response.data!;
      final username = data['username'] as String;
      final password = data['password'] as String;
      final accessToken = data['access_token'] as String;
      final refreshToken = data['refresh_token'] as String;
      final expiresIn = data['expires_in'] as int? ?? 300;
      setState(() {
        _state = _ScreenState.success;
        _username = username;
        _accessToken = accessToken;
        _refreshToken = refreshToken;
        _expiresIn = expiresIn;
        _words = passphraseFromCredentials(username, password);
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _state = _ScreenState.error;
        _errorMessage =
            'Could not reach the server. Please check your connection and try again.';
      });
    }
  }

  /// Stores all credentials in secure storage, marks onboarding complete,
  /// and navigates to the main shell.
  Future<void> _onContinue() async {
    const storage = FlutterSecureStorage();
    await storage.write(key: _kUsername, value: _username);
    // Note: the raw account password (_password) is intentionally NOT
    // persisted. It's only used in-memory to derive the recovery passphrase
    // above; storing it would let it be replayed later for silent
    // reauthentication (ROPC), which has been removed as a security risk.
    await storage.write(key: _kAccessToken, value: _accessToken);
    await storage.write(key: _kRefreshToken, value: _refreshToken);
    final expiry = DateTime.now().add(Duration(seconds: _expiresIn));
    await storage.write(key: _kExpiryKey, value: expiry.toIso8601String());
    await storage.write(key: kOnboardingCompleteKey, value: 'true');
    // Clear any stale study enrollment from a previous install so the
    // study-code screen is always shown for a fresh account.
    await storage.delete(key: 'study_enrolled');
    // Record the informed-consent acceptance (made on the consent screen,
    // before account creation) against the new account. Best-effort: the
    // local record in secure storage remains the fallback audit anchor.
    await _syncConsentRecord(storage);
    // This screen writes tokens directly to secure storage rather than going
    // through AuthService.login(), so onLogin never fires — invalidate the
    // user-scoped providers explicitly, otherwise the new account would
    // start out showing whatever data was last loaded for a previous one.
    invalidateUserScopedProvidersFromWidget(ref);
    if (!mounted) return;
    context.go('/onboarding/profile-setup');
  }

  /// Posts the locally stored consent acceptance to the backend so the study
  /// keeps an auditable record of which consent version this participant
  /// accepted (App Store Review Guideline 5.1.3).
  Future<void> _syncConsentRecord(FlutterSecureStorage storage) async {
    try {
      final consentVersion = await storage.read(key: 'consent_version');
      if (consentVersion == null) return;
      final consentLocale = await storage.read(key: 'consent_locale');
      await ref.read(dioProvider).post<Map<String, dynamic>>(
        '${AppConfig.apiBaseUrl}/users/me/consent',
        data: {
          'consentVersion': consentVersion,
          'locale': ?consentLocale,
        },
        options: Options(headers: {'Authorization': 'Bearer $_accessToken'}),
      );
    } catch (_) {
      // Offline or transient server error — consent acceptance remains
      // recorded locally in secure storage as the audit anchor.
    }
  }

  void _copyToClipboard() {
    Clipboard.setData(ClipboardData(text: _words.join(' ')));
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Passphrase copied to clipboard')),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Recovery Passphrase')),
      body: switch (_state) {
        _ScreenState.loading => const Center(
            child: CircularProgressIndicator(),
          ),
        _ScreenState.error => Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.error_outline,
                      size: 48, color: Colors.red),
                  const SizedBox(height: 16),
                  Text(_errorMessage, textAlign: TextAlign.center),
                  const SizedBox(height: 24),
                  FilledButton(
                    onPressed: _fetchCredentials,
                    child: const Text('Retry'),
                  ),
                ],
              ),
            ),
          ),
        _ScreenState.success => _buildSuccess(),
      },
    );
  }

  Widget _buildSuccess() {
    return SingleChildScrollView(
      controller: _scrollController,
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Give a user who landed here without meaning to (e.g. after an
          // unexpected logout, without noticing "Restore account" on the
          // welcome screen) one more chance to recover their existing
          // account instead of settling for this freshly created one.
          Center(
            child: TextButton(
              onPressed: () => context.push('/onboarding/restore'),
              child: const Text('Already have an account? Restore it instead'),
            ),
          ),
          const SizedBox(height: 4),
          // Warning banner
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              color: const Color(0xFFFFFBEB),
              border: Border.all(color: const Color(0xFFFCD34D)),
              borderRadius: BorderRadius.circular(14),
            ),
            child: const Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.warning_amber_rounded, color: Color(0xFFB45309), size: 18),
                SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Write these 24 words down: the only way to recover your account if you lose your phone.',
                    style: TextStyle(color: Color(0xFF92400E), fontWeight: FontWeight.w600, fontSize: 13),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          // Word grid
          PassphraseWordGrid(words: _words),
          const SizedBox(height: 16),
          // Copy button
          OutlinedButton.icon(
            onPressed: _copyToClipboard,
            icon: const Icon(Icons.content_copy, size: 16),
            label: const Text('Copy to clipboard'),
          ),
          const SizedBox(height: 14),
          // Checkbox
          InkWell(
            onTap: _toggleConfirmed,
            borderRadius: BorderRadius.circular(8),
            child: Row(
              children: [
                Container(
                  width: 20, height: 20,
                  decoration: BoxDecoration(
                    color: _confirmed ? const Color(0xFF45B700) : Colors.transparent,
                    border: Border.all(
                      color: _confirmed ? const Color(0xFF45B700) : const Color(0xFFD1D5DB),
                      width: 1.5,
                    ),
                    borderRadius: BorderRadius.circular(5),
                  ),
                  child: _confirmed
                      ? const Icon(Icons.check, size: 14, color: Colors.white)
                      : null,
                ),
                const SizedBox(width: 10),
                const Text(
                  'I have written it down',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: _confirmed ? _onContinue : null,
            child: const Text('Continue'),
          ),
        ],
      ),
    );
  }
}
