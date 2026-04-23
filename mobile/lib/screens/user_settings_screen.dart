import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../l10n/app_localizations.dart';
import '../providers/auth_provider.dart';
import '../providers/locale_provider.dart';
import '../providers/theme_provider.dart';

const _kCardShadow = [BoxShadow(color: Color(0x14000000), blurRadius: 20, offset: Offset(0, 4))];
const _kGreenGlow  = [BoxShadow(color: Color(0x4745B700), blurRadius: 28, offset: Offset(0, 8))];

class UserSettingsScreen extends ConsumerWidget {
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
                    width: 48, height: 48,
                    decoration: BoxDecoration(
                      color: Colors.white.withAlpha(51),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(Icons.person, color: Colors.white, size: 26),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Participant',
                          style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 15),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          'Anonymous contributor',
                          style: TextStyle(color: Colors.white.withAlpha(191), fontSize: 12),
                        ),
                      ],
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: Colors.white.withAlpha(51),
                      borderRadius: BorderRadius.circular(100),
                    ),
                    child: const Text(
                      'Active',
                      style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 11),
                    ),
                  ),
                ],
              ),
            ),
          ),

          // ── Profile section ────────────────────────────────────────
          _SectionLabel(l10n.myProfile),
          _SettingsCard(children: [
            _SettingsRow(
              icon: Icons.assignment_ind,
              title: l10n.myProfile,
              trailing: const Icon(Icons.chevron_right, size: 18),
              onTap: () => context.push('/settings/profile'),
            ),
          ]),

          // ── Preferences ────────────────────────────────────────────
          _SectionLabel(l10n.settings),
          _SettingsCard(children: [
            _SettingsRow(
              icon: Icons.language,
              title: 'Language',
              trailing: Text(
                currentLocale.languageCode == 'de' ? 'Deutsch' : 'English',
                style: const TextStyle(color: Color(0xFF6B7280), fontSize: 13),
              ),
              onTap: () => _showLanguagePicker(context, ref, currentLocale.languageCode),
            ),
            const Divider(height: 1, indent: 52),
            _SettingsRow(
              icon: Icons.dark_mode,
              title: l10n.appearance,
              trailing: Text(
                _themeModeLabel(themeMode, l10n),
                style: const TextStyle(color: Color(0xFF6B7280), fontSize: 13),
              ),
              onTap: () => _showAppearancePicker(context, ref, themeMode),
            ),
          ]),

          // ── Legal ──────────────────────────────────────────────────
          _SectionLabel('Legal'),
          _SettingsCard(children: [
            _SettingsRow(
              icon: Icons.lock_outline,
              title: l10n.privacyStatement,
              trailing: const Icon(Icons.chevron_right, size: 18),
              onTap: () => context.push('/settings/privacy'),
            ),
            const Divider(height: 1, indent: 52),
            _SettingsRow(
              icon: Icons.info_outline,
              title: l10n.imprint,
              trailing: const Icon(Icons.chevron_right, size: 18),
              onTap: () => context.push('/settings/imprint'),
            ),
          ]),

          // ── Sign out ───────────────────────────────────────────────
          const SizedBox(height: 8),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: _SettingsCard(children: [
              _SettingsRow(
                icon: Icons.logout,
                title: 'Sign out',
                iconColor: const Color(0xFFDC2626),
                titleColor: const Color(0xFFDC2626),
                onTap: () => _confirmSignOut(context, ref, l10n),
              ),
            ]),
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

  void _showLanguagePicker(BuildContext context, WidgetRef ref, String current) {
    showModalBottomSheet<void>(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 8),
            Container(width: 36, height: 4, decoration: BoxDecoration(color: const Color(0xFFE5E7EB), borderRadius: BorderRadius.circular(2))),
            const SizedBox(height: 16),
            for (final (code, label) in [('en', 'English'), ('de', 'Deutsch')]) ...[
              ListTile(
                title: Text(label),
                trailing: current == code ? const Icon(Icons.check, color: Color(0xFF45B700)) : null,
                onTap: () async {
                  Navigator.of(context).pop();
                  await ref.read(localeProvider.notifier).setLocale(Locale(code));
                },
              ),
            ],
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  void _showAppearancePicker(BuildContext context, WidgetRef ref, ThemeMode current) {
    final l10n = AppLocalizations.of(context)!;
    showModalBottomSheet<void>(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 8),
            Container(width: 36, height: 4, decoration: BoxDecoration(color: const Color(0xFFE5E7EB), borderRadius: BorderRadius.circular(2))),
            const SizedBox(height: 16),
            for (final (mode, label, icon) in [
              (ThemeMode.light, l10n.light, Icons.light_mode),
              (ThemeMode.system, l10n.system, Icons.brightness_auto),
              (ThemeMode.dark, l10n.dark, Icons.dark_mode),
            ]) ...[
              ListTile(
                leading: Icon(icon),
                title: Text(label),
                trailing: current == mode ? const Icon(Icons.check, color: Color(0xFF45B700)) : null,
                onTap: () {
                  Navigator.of(context).pop();
                  ref.read(themeModeProvider.notifier).setMode(mode);
                },
              ),
            ],
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  void _confirmSignOut(BuildContext context, WidgetRef ref, AppLocalizations l10n) {
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Sign out'),
        content: const Text('Are you sure you want to sign out?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancel'),
          ),
          TextButton(
            style: TextButton.styleFrom(foregroundColor: const Color(0xFFDC2626)),
            onPressed: () {
              Navigator.of(ctx).pop();
              ref.read(authServiceProvider).logout();
            },
            child: const Text('Sign out'),
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
        style: const TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.8,
          color: Color(0xFF6B7280),
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
          color: Colors.white,
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
            Icon(icon, size: 20, color: iconColor ?? const Color(0xFF6B7280)),
            const SizedBox(width: 14),
            Expanded(
              child: Text(
                title,
                style: TextStyle(
                  fontWeight: FontWeight.w600,
                  fontSize: 15,
                  color: titleColor ?? const Color(0xFF111827),
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
