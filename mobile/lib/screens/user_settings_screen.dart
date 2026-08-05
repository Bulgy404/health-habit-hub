import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:go_router/go_router.dart';
import 'package:share_plus/share_plus.dart';

import '../config/app_config.dart';
import '../core/dio_provider.dart';
import '../features/my_habits/my_habits_provider.dart';
import '../features/my_habits/my_habits_service.dart';
import '../l10n/app_localizations.dart';
import '../providers/auth_provider.dart';
import '../providers/comments_enabled_provider.dart';
import '../providers/locale_provider.dart';
import '../providers/package_info_provider.dart';
import '../providers/theme_provider.dart';
import '../theme/app_colors.dart';
import '../theme/app_icons.dart';
import '../theme/motion.dart';
import '../widgets/settings_card.dart';

/// App settings screen for theme, language, and account management.
class UserSettingsScreen extends ConsumerWidget {
  /// Creates a [UserSettingsScreen].
  const UserSettingsScreen({super.key});

  /// §7.3 — persist the Information Overload opt-out, then refresh the prefs so
  /// the toggle reflects the server's (authoritative) value.
  Future<void> _setOverloadOptOut(WidgetRef ref, bool value) async {
    try {
      await ref
          .read(myHabitsServiceProvider)
          .setInformationOverloadOptOut(value);
    } catch (_) {
      // Non-fatal: the provider refresh below re-reads the true state.
    }
    ref.invalidate(informationOverloadPrefsProvider);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final currentLocale = ref.watch(localeProvider);
    final themeMode = ref.watch(themeModeProvider);
    final commentsEnabled = ref.watch(commentsEnabledProvider);
    final packageInfo = ref.watch(packageInfoProvider);

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
                boxShadow: AppShadows.greenGlow,
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
          SectionLabel(l10n.myProfile),
          SettingsCard(
            children: [
              SettingsRow(
                icon: Icons.assignment_ind,
                title: l10n.myProfile,
                trailing: const Icon(Icons.chevron_right, size: 18),
                onTap: () => context.push('/settings/profile'),
              ),
            ],
          ),

          // ── Preferences ────────────────────────────────────────────
          SectionLabel(l10n.settings),
          SettingsCard(
            children: [
              SettingsRow(
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
              SettingsRow(
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

          // ── Community ───────────────────────────────────────────────
          SectionLabel(l10n.communitySection),
          SettingsCard(
            children: [
              SettingsRow(
                icon: Icons.forum_outlined,
                title: l10n.communityComments,
                subtitle: l10n.communityCommentsSubtitle,
                trailing: Switch(
                  value: commentsEnabled,
                  onChanged: (value) => ref
                      .read(commentsEnabledProvider.notifier)
                      .setEnabled(value),
                ),
                onTap: () => ref
                    .read(commentsEnabledProvider.notifier)
                    .setEnabled(!commentsEnabled),
              ),
            ],
          ),

          // ── §7.5 Gamification — level + XP progress ──────────────────
          // Shown as soon as gamification is enabled for this participant's
          // study/group — including at zero XP for a brand-new user. An
          // empty bar is deliberate: it signals there's a progression system
          // to discover, rather than hiding until there's something to show.
          // Only truly hidden when the admin has disabled it (`g.enabled`).
          ...ref.watch(gamificationProvider).maybeWhen(
                data: (g) => !g.enabled
                    ? const <Widget>[]
                    : [
                        SectionLabel(l10n.progressSection),
                        SettingsCard(
                          children: [
                            InkWell(
                              borderRadius: BorderRadius.circular(14),
                              onTap: () =>
                                  context.push('/settings/achievements'),
                              child: Padding(
                                padding: const EdgeInsets.all(16),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Row(
                                      children: [
                                        const Icon(Icons.stars_outlined,
                                            size: 20),
                                        const SizedBox(width: 10),
                                        Text('Level ${g.level}',
                                            style: const TextStyle(
                                                fontWeight: FontWeight.w700)),
                                        const Spacer(),
                                        Text('${g.xpToNextLevel} XP to next'),
                                        const SizedBox(width: 4),
                                        Icon(Icons.chevron_right,
                                            size: 18,
                                            color: Theme.of(context)
                                                .colorScheme
                                                .onSurfaceVariant),
                                      ],
                                    ),
                                    const SizedBox(height: 10),
                                    ClipRRect(
                                      borderRadius: BorderRadius.circular(8),
                                      child: LinearProgressIndicator(
                                        value: (g.xpIntoLevel +
                                                    g.xpToNextLevel) >
                                                0
                                            ? (g.xpIntoLevel /
                                                    (g.xpIntoLevel +
                                                        g.xpToNextLevel))
                                                .clamp(0.0, 1.0)
                                            : 0.0,
                                        minHeight: 8,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ],
                        ),
                      ],
                orElse: () => const <Widget>[],
              ),

          // ── §7.3 Information Overload opt-out ────────────────────────
          // Only shown when the participant's study enables the guard AND
          // permits opting out; otherwise the section is omitted entirely.
          ...ref.watch(informationOverloadPrefsProvider).maybeWhen(
                data: (prefs) => (prefs.guardEnabled && prefs.optOutAllowed)
                    ? [
                        SectionLabel(l10n.habitsSection),
                        SettingsCard(
                          children: [
                            SettingsRow(
                              icon: Icons.filter_1,
                              title: l10n.informationOverloadOptOutTitle,
                              subtitle:
                                  l10n.informationOverloadOptOutSubtitle,
                              trailing: Switch(
                                value: prefs.optOut,
                                onChanged: (value) =>
                                    _setOverloadOptOut(ref, value),
                              ),
                              onTap: () =>
                                  _setOverloadOptOut(ref, !prefs.optOut),
                            ),
                          ],
                        ),
                      ]
                    : const <Widget>[],
                orElse: () => const <Widget>[],
              ),

          // ── Help & Support ───────────────────────────────────────────
          SectionLabel(l10n.helpAndSupport),
          SettingsCard(
            children: [
              SettingsRow(
                icon: Icons.help_outline,
                title: l10n.helpAndSupport,
                trailing: const Icon(Icons.chevron_right, size: 18),
                onTap: () => context.push('/settings/help'),
              ),
              const Divider(height: 1, indent: 52),
              SettingsRow(
                icon: Icons.key_outlined,
                title: l10n.changeRecoveryPassphrase,
                trailing: const Icon(Icons.chevron_right, size: 18),
                onTap: () => context.push('/settings/rotate-passphrase'),
              ),
            ],
          ),

          // ── Legal ──────────────────────────────────────────────────
          SectionLabel(l10n.legalSection),
          SettingsCard(
            children: [
              SettingsRow(
                icon: Icons.lock_outline,
                title: l10n.privacyStatement,
                trailing: const Icon(Icons.chevron_right, size: 18),
                onTap: () => context.push('/settings/privacy'),
              ),
              const Divider(height: 1, indent: 52),
              SettingsRow(
                icon: Icons.fact_check_outlined,
                title: l10n.studyConsent,
                trailing: const Icon(Icons.chevron_right, size: 18),
                onTap: () => context.push('/settings/consent'),
              ),
              const Divider(height: 1, indent: 52),
              SettingsRow(
                icon: Icons.info_outline,
                title: l10n.imprint,
                trailing: const Icon(Icons.chevron_right, size: 18),
                onTap: () => context.push('/settings/imprint'),
              ),
            ],
          ),

          // ── My data (GDPR) ─────────────────────────────────────────
          SectionLabel(l10n.myDataSection),
          SettingsCard(
            children: [
              SettingsRow(
                icon: Icons.download_outlined,
                title: l10n.exportMyData,
                trailing: const Icon(Icons.chevron_right, size: 18),
                onTap: () => _exportMyData(context, ref),
              ),
            ],
          ),

          // ── Sign out ───────────────────────────────────────────────
          const SizedBox(height: 8),
          SettingsCard(
            children: [
              SettingsRow(
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
          SettingsCard(
            children: [
              SettingsRow(
                icon: Icons.delete_forever,
                title: l10n.deleteAccount,
                iconColor: const Color(0xFFDC2626),
                titleColor: const Color(0xFFDC2626),
                onTap: () => _confirmDeleteAccount(context, ref),
              ),
            ],
          ),

          // ── App info footer ─────────────────────────────────────────
          const SizedBox(height: 16),
          Center(
            child: packageInfo.when(
              data: (info) => Text(
                l10n.appVersion(info.version, info.buildNumber),
                style: TextStyle(
                  fontSize: 12,
                  color: Theme.of(context).colorScheme.outline,
                ),
              ),
              loading: () => const SizedBox.shrink(),
              error: (_, _) => const SizedBox.shrink(),
            ),
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
    // shape: now comes from the app-wide BottomSheetThemeData (app.dart).
    showModalBottomSheet<void>(
      context: context,
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
                    ? Icon(AppIcons.selected, color: context.appColors.primary)
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

  Future<void> _showAppearancePicker(
    BuildContext context,
    WidgetRef ref,
    ThemeMode current,
  ) async {
    final l10n = AppLocalizations.of(context)!;
    // Return the picked mode instead of applying it from inside the sheet's
    // onTap: changing themeModeProvider synchronously rebuilds MaterialApp
    // (and its Theme InheritedWidget) while the closing sheet's own Elements
    // — which read Theme.of(sheetContext) — are still mid-teardown, which
    // trips Flutter's InheritedElement `_dependents.isEmpty` assertion.
    // shape: now comes from the app-wide BottomSheetThemeData (app.dart).
    final selected = await showModalBottomSheet<ThemeMode>(
      context: context,
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
                    ? Icon(AppIcons.selected, color: context.appColors.primary)
                    : null,
                onTap: () => Navigator.of(sheetContext).pop(mode),
              ),
            ],
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
    if (selected != null) {
      // showModalBottomSheet's future resolves as soon as the route is
      // popped (Route.didComplete fires inside NavigatorState.pop, before
      // the reverse transition runs) — the sheet's Elements are still very
      // much mounted and depending on Theme.of(sheetContext) for the ~200ms
      // exit animation that follows. Applying the theme change immediately
      // races that teardown and re-trips the same `_dependents.isEmpty`
      // assertion the comment above describes. Waiting for the scheduler to
      // go idle (no more frames scheduled) means the exit transition — and
      // the sheet's element deactivation — has actually finished.
      while (SchedulerBinding.instance.hasScheduledFrame) {
        await SchedulerBinding.instance.endOfFrame;
      }
      await ref.read(themeModeProvider.notifier).setMode(selected);
    }
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
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(l10n.deleteAccountContent),
              const SizedBox(height: 12),
              InkWell(
                onTap: () {
                  Navigator.of(ctx).pop();
                  context.push('/settings/privacy');
                },
                child: Text(
                  l10n.privacyStatement,
                  style: const TextStyle(
                    color: Color(0xFF2563EB),
                    decoration: TextDecoration.underline,
                  ),
                ),
              ),
              const SizedBox(height: 4),
              InkWell(
                onTap: () {
                  Navigator.of(ctx).pop();
                  context.push('/settings/imprint');
                },
                child: Text(
                  l10n.imprint,
                  style: const TextStyle(
                    color: Color(0xFF2563EB),
                    decoration: TextDecoration.underline,
                  ),
                ),
              ),
            ],
          ),
        ),
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
    // The backend only removes the account's identity/credentials (see
    // usersRouter.js DELETE /me) — contributed data (profile, logs,
    // questionnaire answers, donated habits) stays server-side, kept only
    // under a random UUID with no identity record, so it can't be traced
    // back to this device/account. Local storage is wiped regardless, since
    // there's no account left to sign back into either way.
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
              context.go('/signing-out');
            },
            child: Text(l10n.signOut),
          ),
        ],
      ),
    );
  }
}
