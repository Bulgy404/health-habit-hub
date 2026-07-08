import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:go_router/go_router.dart';
import 'package:share_plus/share_plus.dart';

import '../config/app_config.dart';
import '../core/dio_provider.dart';
import '../l10n/app_localizations.dart';
import '../providers/auth_provider.dart';
import '../providers/locale_provider.dart';
import '../providers/theme_provider.dart';

const _kCardShadow = [
  BoxShadow(color: Color(0x14000000), blurRadius: 20, offset: Offset(0, 4)),
];
const _kGreenGlow = [
  BoxShadow(color: Color(0x4745B700), blurRadius: 28, offset: Offset(0, 8)),
];

/// App settings screen for theme, language, and account management.
class UserSettingsScreen extends ConsumerWidget {
  /// Creates a [UserSettingsScreen].
  const UserSettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final currentLocale = ref.watch(localeProvider);
    final themeMode = ref.watch(themeModeProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Account')),
      body: ListView(
        padding: const EdgeInsets.only(bottom: 32),
        children: [
          // ── Profile hero card ──────────────────────────────────────
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
            child: Container(
              decoration: BoxDecoration(
                color: const Color(0xFF45B700),
                borderRadius: BorderRadius.circular(20),
                boxShadow: _kGreenGlow,
              ),
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  Container(
                    width: 48,
                    height: 48,
                    decoration: BoxDecoration(
                      color: Colors.white.withAlpha(51),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Icons.person,
                      color: Colors.white,
                      size: 26,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Participant',
                          style: TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w800,
                            fontSize: 15,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          'Anonymous contributor',
                          style: TextStyle(
                            color: Colors.white.withAlpha(191),
                            fontSize: 12,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.white.withAlpha(51),
                      borderRadius: BorderRadius.circular(100),
                    ),
                    child: const Text(
                      'Active',
                      style: TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                        fontSize: 11,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),

          // ── Profile section ────────────────────────────────────────
          _SectionLabel(l10n.myProfile),
          _SettingsCard(
            children: [
              _SettingsRow(
                icon: Icons.assignment_ind,
                title: l10n.myProfile,
                trailing: const Icon(Icons.chevron_right, size: 18),
                onTap: () => context.push('/settings/profile'),
              ),
            ],
          ),

          // ── Preferences ────────────────────────────────────────────
          _SectionLabel(l10n.settings),
          _SettingsCard(
            children: [
              _SettingsRow(
                icon: Icons.language,
                title: l10n.language,
                trailing: Text(
                  switch (currentLocale.languageCode) {
                    'de' => 'Deutsch',
                    'ja' => '日本語',
                    'fr' => 'Français',
                    'nl' => 'Nederlands',
                    _ => 'English',
                  },
                  style: const TextStyle(
                    color: Color(0xFF6B7280),
                    fontSize: 13,
                  ),
                ),
                onTap: () => _showLanguagePicker(
                  context,
                  ref,
                  currentLocale.languageCode,
                ),
              ),
              const Divider(height: 1, indent: 52),
              _SettingsRow(
                icon: Icons.dark_mode,
                title: l10n.appearance,
                trailing: Text(
                  _themeModeLabel(themeMode, l10n),
                  style: const TextStyle(
                    color: Color(0xFF6B7280),
                    fontSize: 13,
                  ),
                ),
                onTap: () => _showAppearancePicker(context, ref, themeMode),
              ),
            ],
          ),

          // ── Legal ──────────────────────────────────────────────────
          _SectionLabel(l10n.legalSection),
          _SettingsCard(
            children: [
              _SettingsRow(
                icon: Icons.lock_outline,
                title: l10n.privacyStatement,
                trailing: const Icon(Icons.chevron_right, size: 18),
                onTap: () => context.push('/settings/privacy'),
              ),
              const Divider(height: 1, indent: 52),
              _SettingsRow(
                icon: Icons.fact_check_outlined,
                title: l10n.studyConsent,
                trailing: const Icon(Icons.chevron_right, size: 18),
                onTap: () => context.push('/settings/consent'),
              ),
              const Divider(height: 1, indent: 52),
              _SettingsRow(
                icon: Icons.info_outline,
                title: l10n.imprint,
                trailing: const Icon(Icons.chevron_right, size: 18),
                onTap: () => context.push('/settings/imprint'),
              ),
            ],
          ),

          // ── My data (GDPR) ─────────────────────────────────────────
          _SectionLabel(l10n.myDataSection),
          _SettingsCard(
            children: [
              _SettingsRow(
                icon: Icons.download_outlined,
                title: l10n.exportMyData,
                trailing: const Icon(Icons.chevron_right, size: 18),
                onTap: () => _exportMyData(context, ref),
              ),
            ],
          ),

          // ── Sign out ───────────────────────────────────────────────
          const SizedBox(height: 8),
          _SettingsCard(
            children: [
              _SettingsRow(
                icon: Icons.logout,
                title: l10n.signOut,
                iconColor: const Color(0xFFDC2626),
                titleColor: const Color(0xFFDC2626),
                onTap: () => _confirmSignOut(context, ref, l10n),
              ),
            ],
          ),

          // ── Delete account (App Store Guideline 5.1.1(v)) ──────────
          const SizedBox(height: 8),
          _SettingsCard(
            children: [
              _SettingsRow(
                icon: Icons.delete_forever,
                title: l10n.deleteAccount,
                iconColor: const Color(0xFFDC2626),
                titleColor: const Color(0xFFDC2626),
                onTap: () => _confirmDeleteAccount(context, ref),
              ),
            ],
          ),
        ],
      ),
    );
  }

  String _themeModeLabel(ThemeMode mode, AppLocalizations l10n) {
    return switch (mode) {
      ThemeMode.light => l10n.light,
      ThemeMode.dark => l10n.dark,
      ThemeMode.system => l10n.system,
    };
  }

  void _showLanguagePicker(
    BuildContext context,
    WidgetRef ref,
    String current,
  ) {
    showModalBottomSheet<void>(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 8),
            Container(
              width: 36,
              height: 4,
              decoration: BoxDecoration(
                color: Theme.of(sheetContext).colorScheme.outlineVariant,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 16),
            for (final (code, label) in [
              ('en', 'English'),
              ('de', 'Deutsch'),
              ('ja', '日本語'),
              ('fr', 'Français'),
              ('nl', 'Nederlands'),
            ]) ...[
              ListTile(
                title: Text(label),
                trailing: current == code
                    ? const Icon(Icons.check, color: Color(0xFF45B700))
                    : null,
                onTap: () async {
                  Navigator.of(sheetContext).pop();
                  await ref
                      .read(localeProvider.notifier)
                      .setLocale(Locale(code));
                },
              ),
            ],
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  void _showAppearancePicker(
    BuildContext context,
    WidgetRef ref,
    ThemeMode current,
  ) {
    final l10n = AppLocalizations.of(context)!;
    showModalBottomSheet<void>(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 8),
            Container(
              width: 36,
              height: 4,
              decoration: BoxDecoration(
                color: Theme.of(sheetContext).colorScheme.outlineVariant,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 16),
            for (final (mode, label, icon) in [
              (ThemeMode.light, l10n.light, Icons.light_mode),
              (ThemeMode.system, l10n.system, Icons.brightness_auto),
              (ThemeMode.dark, l10n.dark, Icons.dark_mode),
            ]) ...[
              ListTile(
                leading: Icon(icon),
                title: Text(label),
                trailing: current == mode
                    ? const Icon(Icons.check, color: Color(0xFF45B700))
                    : null,
                onTap: () async {
                  Navigator.of(sheetContext).pop();
                  await Future<void>.delayed(Duration.zero);
                  await ref.read(themeModeProvider.notifier).setMode(mode);
                },
              ),
            ],
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  /// GDPR Art. 20 — downloads every document linked to this account as a
  /// JSON file and opens the system share sheet.
  Future<void> _exportMyData(BuildContext context, WidgetRef ref) async {
    final l10n = AppLocalizations.of(context)!;
    final messenger = ScaffoldMessenger.of(context);
    try {
      final dio = ref.read(dioProvider);
      final res = await dio.get<Map<String, dynamic>>(
        '${AppConfig.apiBaseUrl}/users/me/export',
      );
      final jsonStr = const JsonEncoder.withIndent('  ').convert(res.data);
      await SharePlus.instance.share(
        ShareParams(
          files: [
            XFile.fromData(
              utf8.encode(jsonStr),
              mimeType: 'application/json',
              name: 'health-habit-hub-export.json',
            ),
          ],
          subject: 'Health Habit Hub: my data export',
          fileNameOverrides: ['health-habit-hub-export.json'],
        ),
      );
    } catch (_) {
      messenger.showSnackBar(SnackBar(content: Text(l10n.exportFailed)));
    }
  }

  /// Two-step account deletion: explains exactly what is removed, then calls
  /// `DELETE /api/v1/users/me`, wipes local storage, and returns to onboarding.
  void _confirmDeleteAccount(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l10n.deleteAccountTitle),
        content: Text(l10n.deleteAccountContent),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: Text(l10n.cancel),
          ),
          TextButton(
            style: TextButton.styleFrom(
              foregroundColor: const Color(0xFFDC2626),
            ),
            onPressed: () async {
              Navigator.of(ctx).pop();
              await _deleteAccount(context, ref);
            },
            child: Text(l10n.deleteAccountConfirm),
          ),
        ],
      ),
    );
  }

  Future<void> _deleteAccount(BuildContext context, WidgetRef ref) async {
    final l10n = AppLocalizations.of(context)!;
    final messenger = ScaffoldMessenger.of(context);
    try {
      final dio = ref.read(dioProvider);
      await dio.delete<Map<String, dynamic>>(
        '${AppConfig.apiBaseUrl}/users/me',
      );
    } catch (_) {
      messenger.showSnackBar(SnackBar(content: Text(l10n.deleteAccountFailed)));
      return;
    }
    // Server-side data is gone — wipe everything locally and restart onboarding.
    const storage = FlutterSecureStorage();
    await storage.deleteAll();
    await ref.read(authServiceProvider).logout();
    if (context.mounted) context.go('/onboarding/welcome');
  }

  void _confirmSignOut(
    BuildContext context,
    WidgetRef ref,
    AppLocalizations l10n,
  ) {
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l10n.signOut),
        content: Text(l10n.signOutConfirm),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: Text(l10n.cancel),
          ),
          TextButton(
            style: TextButton.styleFrom(
              foregroundColor: const Color(0xFFDC2626),
            ),
            onPressed: () {
              Navigator.of(ctx).pop();
              ref.read(authServiceProvider).logout();
            },
            child: Text(l10n.signOut),
          ),
        ],
      ),
    );
  }
}

// ── Shared sub-widgets ──────────────────────────────────────────────────────

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(18, 20, 18, 6),
      child: Text(
        text.toUpperCase(),
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.8,
          color: Theme.of(context).colorScheme.outline,
        ),
      ),
    );
  }
}

class _SettingsCard extends StatelessWidget {
  const _SettingsCard({required this.children});
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Container(
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surface,
          borderRadius: BorderRadius.circular(14),
          boxShadow: _kCardShadow,
        ),
        child: Column(children: children),
      ),
    );
  }
}

class _SettingsRow extends StatelessWidget {
  const _SettingsRow({
    required this.icon,
    required this.title,
    this.trailing,
    this.onTap,
    this.iconColor,
    this.titleColor,
  });

  final IconData icon;
  final String title;
  final Widget? trailing;
  final VoidCallback? onTap;
  final Color? iconColor;
  final Color? titleColor;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
        child: Row(
          children: [
            Icon(
              icon,
              size: 20,
              color: iconColor ?? Theme.of(context).colorScheme.outline,
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Text(
                title,
                style: TextStyle(
                  fontWeight: FontWeight.w600,
                  fontSize: 15,
                  color: titleColor ?? Theme.of(context).colorScheme.onSurface,
                ),
              ),
            ),
            ?trailing,
          ],
        ),
      ),
    );
  }
}
