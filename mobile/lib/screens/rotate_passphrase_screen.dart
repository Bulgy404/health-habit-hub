import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../config/app_config.dart';
import '../core/dio_provider.dart';
import '../l10n/app_localizations.dart';
import '../widgets/passphrase_word_grid.dart';
import 'onboarding/passphrase_screen.dart' show passphraseFromCredentials;

enum _RotateState { idle, loading, success, error }

/// Lets a participant generate a brand-new 24-word recovery passphrase,
/// invalidating the old one immediately. The account itself (Keycloak
/// username, and therefore all linked data) is unchanged — only the
/// password half of the credential pair is rotated.
class RotatePassphraseScreen extends ConsumerStatefulWidget {
  /// Creates a [RotatePassphraseScreen].
  ///
  /// [storage] overrides where the rotated credentials are persisted; tests
  /// inject a fake to avoid touching the secure-storage platform channel.
  const RotatePassphraseScreen({
    this.storage = const FlutterSecureStorage(),
    super.key,
  });

  /// Secure storage used to persist the rotated credentials.
  final FlutterSecureStorage storage;

  @override
  ConsumerState<RotatePassphraseScreen> createState() =>
      _RotatePassphraseScreenState();
}

class _RotatePassphraseScreenState
    extends ConsumerState<RotatePassphraseScreen> {
  _RotateState _state = _RotateState.idle;
  List<String> _words = const [];
  bool _confirmed = false;
  final ScrollController _scrollController = ScrollController();

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _toggleConfirmed() {
    setState(() => _confirmed = !_confirmed);
    if (!_confirmed) return;
    // Scroll the Done button into view once confirmed, so the user doesn't
    // have to manually scroll down to tap it.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_scrollController.hasClients) return;
      _scrollController.animateTo(
        _scrollController.position.maxScrollExtent,
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeOut,
      );
    });
  }

  Future<void> _confirmAndRotate() async {
    final l10n = AppLocalizations.of(context)!;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l10n.rotatePassphraseTitle),
        content: Text(l10n.rotatePassphraseWarning),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text(l10n.cancel),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(l10n.rotatePassphraseConfirm),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    await _rotate();
  }

  Future<void> _rotate() async {
    setState(() => _state = _RotateState.loading);
    try {
      final dio = ref.read(dioProvider);
      final res = await dio.post<Map<String, dynamic>>(
        '${AppConfig.apiBaseUrl}/users/me/rotate-credentials',
      );
      final data = res.data!;
      final username = data['username'] as String;
      final password = data['password'] as String;
      final accessToken = data['access_token'] as String;
      final refreshToken = data['refresh_token'] as String;
      final expiresIn = data['expires_in'] as int? ?? 300;

      await widget.storage.write(key: 'username', value: username);
      // Note: the raw account password is intentionally NOT persisted — it's
      // only used in-memory just below to derive the new recovery
      // passphrase. Storing it would allow later replay for silent
      // reauthentication (ROPC), which has been removed as a security risk.
      await widget.storage.write(key: 'access_token', value: accessToken);
      await widget.storage.write(key: 'refresh_token', value: refreshToken);
      final expiry = DateTime.now().add(Duration(seconds: expiresIn));
      await widget.storage.write(
        key: 'token_expiry',
        value: expiry.toIso8601String(),
      );

      if (!mounted) return;
      setState(() {
        _words = passphraseFromCredentials(username, password);
        _state = _RotateState.success;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _state = _RotateState.error);
    }
  }

  void _copyToClipboard() {
    Clipboard.setData(ClipboardData(text: _words.join(' ')));
    final l10n = AppLocalizations.of(context)!;
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(l10n.passphraseCopied)));
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.changeRecoveryPassphrase)),
      body: switch (_state) {
        _RotateState.idle => _buildIdle(l10n),
        _RotateState.loading => const Center(
          child: CircularProgressIndicator(),
        ),
        _RotateState.error => _buildError(l10n),
        _RotateState.success => _buildSuccess(l10n),
      },
    );
  }

  Widget _buildIdle(AppLocalizations l10n) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              color: const Color(0xFFFFFBEB),
              border: Border.all(color: const Color(0xFFFCD34D)),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(
                  Icons.warning_amber_rounded,
                  color: Color(0xFFB45309),
                  size: 18,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    l10n.rotatePassphraseWarning,
                    style: const TextStyle(
                      color: Color(0xFF92400E),
                      fontWeight: FontWeight.w600,
                      fontSize: 13,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          FilledButton(
            onPressed: _confirmAndRotate,
            child: Text(l10n.rotatePassphraseConfirm),
          ),
        ],
      ),
    );
  }

  Widget _buildError(AppLocalizations l10n) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline, size: 48, color: Colors.red),
            const SizedBox(height: 16),
            Text(l10n.rotatePassphraseFailed, textAlign: TextAlign.center),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: _confirmAndRotate,
              child: Text(l10n.retry),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSuccess(AppLocalizations l10n) {
    return SingleChildScrollView(
      controller: _scrollController,
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            l10n.rotatePassphraseNewTitle,
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 6),
          Text(
            l10n.rotatePassphraseNewSubtitle,
            style: const TextStyle(color: Color(0xFF6B7280), fontSize: 13),
          ),
          const SizedBox(height: 16),
          PassphraseWordGrid(words: _words),
          const SizedBox(height: 16),
          OutlinedButton.icon(
            onPressed: _copyToClipboard,
            icon: const Icon(Icons.content_copy, size: 16),
            label: Text(l10n.copyToClipboard),
          ),
          const SizedBox(height: 14),
          InkWell(
            onTap: _toggleConfirmed,
            borderRadius: BorderRadius.circular(8),
            child: Row(
              children: [
                Container(
                  width: 20,
                  height: 20,
                  decoration: BoxDecoration(
                    color: _confirmed
                        ? const Color(0xFF45B700)
                        : Colors.transparent,
                    border: Border.all(
                      color: _confirmed
                          ? const Color(0xFF45B700)
                          : const Color(0xFFD1D5DB),
                      width: 1.5,
                    ),
                    borderRadius: BorderRadius.circular(5),
                  ),
                  child: _confirmed
                      ? const Icon(Icons.check, size: 14, color: Colors.white)
                      : null,
                ),
                const SizedBox(width: 10),
                Text(
                  l10n.rotatePassphraseSavedCheckbox,
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: _confirmed ? () => Navigator.of(context).pop() : null,
            child: Text(l10n.rotatePassphraseDone),
          ),
        ],
      ),
    );
  }
}
