import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:go_router/go_router.dart';

import '../../config/app_config.dart';
import '../../utils/bip39_wordlist.dart';
import 'welcome_screen.dart';

// ---------------------------------------------------------------------------
// Secure-storage key constants
// ---------------------------------------------------------------------------
const _kUsername = 'username';
const _kPassword = 'password';
const _kAccessToken = 'access_token';
const _kRefreshToken = 'refresh_token';

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

/// Derives a 36-word BIP39-style passphrase from [username] (UUID) and
/// [password] (64-char hex string).
///
/// Encoding layout:
/// * Words  0–11  (12 words) → 16-byte UUID without dashes
/// * Words 12–35  (24 words) → 32-byte password
List<String> passphraseFromCredentials(String username, String password) {
  final uuidBytes = _hexToBytes(username.replaceAll('-', ''));
  final passBytes = _hexToBytes(password);
  return [
    ..._bytesToWords(uuidBytes, 12),
    ..._bytesToWords(passBytes, 24),
  ];
}

/// Decodes a 36-word passphrase back into `(username UUID, password hex)`.
///
/// Returns `null` if the list does not contain exactly 36 words.
(String, String)? credentialsFromPassphrase(List<String> words) {
  if (words.length != 36) return null;
  final uuidBytes = _wordsToBytes(words.sublist(0, 12), 16);
  final passBytes = _wordsToBytes(words.sublist(12), 32);
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

/// Onboarding step 2: auto-creates a Keycloak account, derives a 36-word
/// BIP39-style recovery passphrase, and stores credentials on confirmation.
class PassphraseScreen extends StatefulWidget {
  const PassphraseScreen({super.key});

  @override
  State<PassphraseScreen> createState() => _PassphraseScreenState();
}

class _PassphraseScreenState extends State<PassphraseScreen> {
  _ScreenState _state = _ScreenState.loading;
  List<String> _words = [];
  String _username = '';
  String _password = '';
  String _accessToken = '';
  String _refreshToken = '';
  bool _confirmed = false;
  String _errorMessage = '';

  @override
  void initState() {
    super.initState();
    _fetchCredentials();
  }

  /// Calls POST /api/v1/onboard to auto-create a Keycloak user and derives
  /// the BIP39-style passphrase from the returned credentials.
  Future<void> _fetchCredentials() async {
    setState(() => _state = _ScreenState.loading);
    try {
      final response = await Dio().post<Map<String, dynamic>>(
        '${AppConfig.apiBaseUrl}/onboard',
      );
      if (!mounted) return;
      final data = response.data!;
      final username = data['username'] as String;
      final password = data['password'] as String;
      final accessToken = data['access_token'] as String;
      final refreshToken = data['refresh_token'] as String;
      setState(() {
        _state = _ScreenState.success;
        _username = username;
        _password = password;
        _accessToken = accessToken;
        _refreshToken = refreshToken;
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
    await storage.write(key: _kPassword, value: _password);
    await storage.write(key: _kAccessToken, value: _accessToken);
    await storage.write(key: _kRefreshToken, value: _refreshToken);
    await storage.write(key: kOnboardingCompleteKey, value: 'true');
    if (!mounted) return;
    context.go('/onboarding/study-code');
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
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Warning banner
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.amber.shade100,
              border: Border.all(color: Colors.amber.shade600),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.warning_amber_rounded, color: Colors.amber.shade800),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Write these words down. '
                    'This is the only way to recover your account '
                    'if you lose your phone.',
                    style: TextStyle(
                      color: Colors.amber.shade900,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          const Text(
            'Your recovery passphrase',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 4),
          Text(
            '36 words — store them somewhere safe',
            style: TextStyle(color: Colors.grey.shade600, fontSize: 13),
          ),
          const SizedBox(height: 12),
          // Word grid
          _WordGrid(words: _words),
          const SizedBox(height: 16),
          // Copy to clipboard
          OutlinedButton.icon(
            onPressed: _copyToClipboard,
            icon: const Icon(Icons.copy),
            label: const Text('Copy to clipboard'),
          ),
          const SizedBox(height: 16),
          // Confirmation checkbox
          CheckboxListTile(
            value: _confirmed,
            onChanged: (v) => setState(() => _confirmed = v ?? false),
            title: const Text('I have written it down'),
            controlAffinity: ListTileControlAffinity.leading,
            contentPadding: EdgeInsets.zero,
          ),
          const SizedBox(height: 8),
          // Continue (disabled until checkbox ticked)
          FilledButton(
            onPressed: _confirmed ? _onContinue : null,
            child: const Text('Continue'),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Word grid widget
// ---------------------------------------------------------------------------

class _WordGrid extends StatelessWidget {
  const _WordGrid({required this.words});

  final List<String> words;

  @override
  Widget build(BuildContext context) {
    const cols = 3;
    final rows = (words.length / cols).ceil();
    return Table(
      border: TableBorder.all(color: Colors.grey.shade300, width: 0.5),
      children: List.generate(rows, (row) {
        return TableRow(
          children: List.generate(cols, (col) {
            final idx = row * cols + col;
            if (idx >= words.length) {
              return const SizedBox.shrink();
            }
            return Padding(
              padding:
                  const EdgeInsets.symmetric(vertical: 8, horizontal: 6),
              child: RichText(
                text: TextSpan(
                  children: [
                    TextSpan(
                      text: '${idx + 1}. ',
                      style: TextStyle(
                        color: Colors.grey.shade500,
                        fontSize: 11,
                      ),
                    ),
                    TextSpan(
                      text: words[idx],
                      style: const TextStyle(
                        color: Colors.black87,
                        fontWeight: FontWeight.w500,
                        fontSize: 13,
                      ),
                    ),
                  ],
                ),
              ),
            );
          }),
        );
      }),
    );
  }
}
