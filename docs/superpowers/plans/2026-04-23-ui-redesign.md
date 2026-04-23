# UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the Clean Bold design system across all user-facing Flutter screens, replacing the current dark nav bar and grey-surface theme with white surfaces, elevated shadows, a white+pill bottom nav, and a merged Account tab (Profile + Settings).

**Architecture:** Token-first approach — update the Material 3 theme in `main.dart` first, then update the bottom nav shell, then each screen in dependency order (shell → account → onboarding → main tabs). Each task is independently committable.

**Tech Stack:** Flutter/Dart, Material 3 (`NavigationBar`, `Card`, `AppBar`), Riverpod, GoRouter, Google Fonts (Figtree), Material Symbols Rounded icons.

---

## Design token reference

| Token | Value | Dart constant |
|---|---|---|
| Background | `#F4F5F2` | `const Color(0xFFF4F5F2)` |
| Surface (card) | `#FFFFFF` | `Colors.white` |
| Primary green | `#45B700` | `const Color(0xFF45B700)` |
| Dark green | `#2E8C00` | `const Color(0xFF2E8C00)` |
| Green tint | `#EDF7E5` | `const Color(0xFFEDF7E5)` |
| Accent pink | `#E679AB` | `const Color(0xFFE679AB)` |
| Pink tint | `#FCE4F0` | `const Color(0xFFFCE4F0)` |
| Text | `#111827` | `const Color(0xFF111827)` |
| Muted | `#6B7280` | `const Color(0xFF6B7280)` |
| Border | `#E5E7EB` | `const Color(0xFFE5E7EB)` |
| Card shadow | `0 4px 20px rgba(0,0,0,0.08)` | See `_kCardShadow` below |
| Green glow | `0 8px 28px rgba(69,183,0,0.28)` | See `_kGreenGlow` below |
| Card radius | 20 px | `BorderRadius.circular(20)` |
| Small radius | 14 px | `BorderRadius.circular(14)` |
| Pill radius | 100 px | `BorderRadius.circular(100)` |

```dart
// Reusable shadow constants (add at top of any file that needs them)
const _kCardShadow = [BoxShadow(color: Color(0x14000000), blurRadius: 20, offset: Offset(0, 4))];
const _kGreenGlow = [BoxShadow(color: Color(0x4745B700), blurRadius: 28, offset: Offset(0, 8))];
```

---

## File map

| File | Change |
|---|---|
| `mobile/lib/main.dart` | Update `_buildLightTheme()` tokens; remove `/profile` shell branch; add `/settings/profile` sub-route |
| `mobile/lib/screens/shell_screen.dart` | Remove Profile tab; rename Settings→Account; update icons; fix `_adminBranchIndex` |
| `mobile/lib/screens/user_settings_screen.dart` | Full rebuild as Account screen (profile card, questionnaire row, prefs, legal, sign out) |
| `mobile/lib/screens/onboarding/welcome_screen.dart` | Redesign `_WelcomePage` and `_WalkthroughPage` |
| `mobile/lib/screens/onboarding/passphrase_screen.dart` | Redesign `_buildSuccess()` and replace `_WordGrid` |
| `mobile/lib/screens/donate_screen.dart` | Add hero card landing state + community stats; WebView shows on demand |
| `mobile/lib/features/recommendation/goal_input_screen.dart` | Add pink icon box, goal chips, update form styling |
| `mobile/lib/screens/explore_screen.dart` | Update app bar style; apply new chip/sheet colours |
| `mobile/lib/services/habit_service.dart` | Add `habitStatsProvider` Riverpod provider |

---

## Task 1: Update the light theme

**Files:**
- Modify: `mobile/lib/main.dart`

- [ ] **Step 1: Replace the colour constants and add shadow constants**

In `main.dart`, replace the existing colour block (lines ~251–256) with:

```dart
const _kPrimary    = Color(0xFF45B700);
const _kPrimaryDark = Color(0xFF2E8C00);
const _kAccent     = Color(0xFFE679AB);
const _kBg         = Color(0xFFF4F5F2);
const _kText       = Color(0xFF111827);
const _kMuted      = Color(0xFF6B7280);
const _kBorder     = Color(0xFFE5E7EB);
const _kGreenLight = Color(0xFFEDF7E5);
const _kCardShadow = [BoxShadow(color: Color(0x14000000), blurRadius: 20, offset: Offset(0, 4))];
```

Remove the old constants `_kSurface`, `_kNavBar`, `_kChipGreen`.

- [ ] **Step 2: Rewrite `_buildLightTheme()`**

Replace the entire `_buildLightTheme()` function body with:

```dart
ThemeData _buildLightTheme() {
  final colorScheme = ColorScheme.fromSeed(
    seedColor: _kPrimary,
    primary: _kPrimary,
    secondary: _kAccent,
    surface: Colors.white,
    onPrimary: Colors.white,
    onSecondary: Colors.white,
    brightness: Brightness.light,
  );

  final base = ThemeData(
    useMaterial3: true,
    colorScheme: colorScheme,
    scaffoldBackgroundColor: _kBg,
  );

  return base.copyWith(
    textTheme: GoogleFonts.figtreeTextTheme(base.textTheme),
    primaryColor: _kPrimary,
    appBarTheme: AppBarTheme(
      backgroundColor: Colors.white,
      foregroundColor: _kText,
      elevation: 0,
      shadowColor: Colors.transparent,
      surfaceTintColor: Colors.transparent,
      iconTheme: const IconThemeData(color: _kText),
      actionsIconTheme: IconThemeData(color: _kMuted),
      titleTextStyle: GoogleFonts.figtree(
        color: _kText,
        fontWeight: FontWeight.w800,
        fontSize: 17,
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: Colors.white,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      indicatorColor: _kGreenLight,
      iconTheme: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.selected)) {
          return const IconThemeData(color: _kPrimaryDark, size: 22);
        }
        return IconThemeData(color: _kMuted, size: 22);
      }),
      labelTextStyle: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.selected)) {
          return GoogleFonts.figtree(
            color: _kPrimaryDark,
            fontWeight: FontWeight.w700,
            fontSize: 11,
          );
        }
        return GoogleFonts.figtree(color: _kMuted, fontSize: 11);
      }),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: _kPrimary,
        foregroundColor: Colors.white,
        textStyle: GoogleFonts.figtree(fontWeight: FontWeight.w800),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(100)),
        minimumSize: const Size(double.infinity, 52),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: _kPrimary,
        foregroundColor: Colors.white,
        textStyle: GoogleFonts.figtree(fontWeight: FontWeight.w800),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(100)),
        minimumSize: const Size(double.infinity, 52),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: _kMuted,
        side: const BorderSide(color: _kBorder, width: 1.5),
        textStyle: GoogleFonts.figtree(fontWeight: FontWeight.w600),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(100)),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: _kPrimary,
        textStyle: GoogleFonts.figtree(fontWeight: FontWeight.w600),
      ),
    ),
    cardTheme: CardThemeData(
      color: Colors.white,
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: Colors.white,
      side: const BorderSide(color: _kBorder),
      labelStyle: GoogleFonts.figtree(color: _kMuted, fontWeight: FontWeight.w600),
      selectedColor: _kGreenLight,
    ),
    dividerTheme: const DividerThemeData(color: _kBorder, thickness: 1, space: 1),
    listTileTheme: ListTileThemeData(
      iconColor: _kMuted,
      titleTextStyle: GoogleFonts.figtree(
        color: _kText,
        fontWeight: FontWeight.w600,
        fontSize: 15,
      ),
    ),
  );
}
```

- [ ] **Step 3: Add a top border to the NavigationBar in the shell**

The theme doesn't expose a border. Open `mobile/lib/screens/shell_screen.dart` and wrap `NavigationBar(...)` in a `DecoratedBox`:

```dart
bottomNavigationBar: DecoratedBox(
  decoration: const BoxDecoration(
    border: Border(top: BorderSide(color: Color(0xFFE5E7EB), width: 1)),
  ),
  child: NavigationBar(
    selectedIndex: currentVisibleIndex,
    indicatorColor: const Color(0xFFEDF7E5),
    onDestinationSelected: (visibleIndex) {
      // ... existing logic unchanged
    },
    destinations: visibleTabs
        .map((tab) => NavigationDestination(icon: Icon(tab.icon), label: tab.label))
        .toList(),
  ),
),
```

- [ ] **Step 4: Verify no analysis errors**

```bash
cd mobile && flutter analyze lib/main.dart lib/screens/shell_screen.dart
```

Expected: `No issues found.`

- [ ] **Step 5: Commit**

```bash
git add mobile/lib/main.dart mobile/lib/screens/shell_screen.dart
git commit -m "feat: apply Clean Bold light theme tokens and white nav bar"
```

---

## Task 2: Redesign the shell navigation (4 tabs, merged Account)

**Files:**
- Modify: `mobile/lib/screens/shell_screen.dart`
- Modify: `mobile/lib/main.dart` (remove Profile branch, add /settings/profile sub-route)

- [ ] **Step 1: Update `_allTabs` and `_adminBranchIndex` in `shell_screen.dart`**

Replace the `_allTabs` and `_adminBranchIndex` constants:

```dart
static const _allTabs = [
  _TabConfig(label: 'Share',   icon: Icons.volunteer_activism, path: '/share'),
  _TabConfig(label: 'Explore', icon: Icons.hub,                path: '/explore'),
  _TabConfig(label: 'Recs',    icon: Icons.lightbulb,          path: '/recommend'),
  _TabConfig(label: 'Account', icon: Icons.manage_accounts,    path: '/settings'),
  _TabConfig(label: 'Admin',   icon: Icons.admin_panel_settings, path: '/admin'),
];

static const int _adminBranchIndex = 4;
```

- [ ] **Step 2: Fix the `currentVisibleIndex` guard**

The guard checking `>= _adminBranchIndex` still works because `_adminBranchIndex` is now 4. Verify the condition at the bottom of `build()` reads:

```dart
if (!isAdminOrResearcher &&
    widget.navigationShell.currentIndex >= _adminBranchIndex) {
  currentVisibleIndex = _adminBranchIndex - 1;
}
```

No change needed — verify it is already correct (it references the constant).

- [ ] **Step 3: Remove the Profile branch from the router in `main.dart`**

In the `StatefulShellRoute.indexedStack` in `routerProvider`, delete the entire `StatefulShellBranch` block for `/profile` (currently branch index 3):

```dart
// DELETE this entire block:
StatefulShellBranch(
  routes: [
    GoRoute(
      path: '/profile',
      builder: (context, state) => const ProfileScreen(),
    ),
  ],
),
```

After deletion the branches are: share(0), explore(1), recommend(2), settings(3), admin(4).

- [ ] **Step 4: Add `/settings/profile` as a sub-route of the settings branch**

In the settings `StatefulShellBranch`, the `GoRoute` for `/settings` already has sub-routes (`privacy`, `accessibility`, `imprint`). Add `profile` to that list:

```dart
GoRoute(
  path: 'profile',
  builder: (context, state) => const ProfileScreen(),
),
```

The full settings branch routes list becomes:

```dart
GoRoute(
  path: '/settings',
  builder: (context, state) => const UserSettingsScreen(),
  routes: [
    GoRoute(
      path: 'profile',
      builder: (context, state) => const ProfileScreen(),
    ),
    GoRoute(
      path: 'privacy',
      builder: (context, state) => const LegalDocumentScreen(
        documentType: LegalDocumentType.privacy,
      ),
    ),
    GoRoute(
      path: 'accessibility',
      builder: (context, state) => const LegalDocumentScreen(
        documentType: LegalDocumentType.accessibility,
      ),
    ),
    GoRoute(
      path: 'imprint',
      builder: (context, state) => const LegalDocumentScreen(
        documentType: LegalDocumentType.imprint,
      ),
    ),
  ],
),
```

- [ ] **Step 5: Verify analysis**

```bash
cd mobile && flutter analyze lib/main.dart lib/screens/shell_screen.dart
```

Expected: `No issues found.`

- [ ] **Step 6: Commit**

```bash
git add mobile/lib/main.dart mobile/lib/screens/shell_screen.dart
git commit -m "feat: merge Profile into Account tab, reduce to 4-tab nav"
```

---

## Task 3: Rebuild the Account screen

**Files:**
- Modify: `mobile/lib/screens/user_settings_screen.dart`

The new Account screen replaces the old Settings screen. It contains (top to bottom): a green profile hero card, a Profile section with the questionnaire row, a Preferences section (language + appearance), a Legal section (privacy, imprint), and a danger Sign out row.

- [ ] **Step 1: Replace the entire `user_settings_screen.dart` file**

```dart
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
            if (trailing != null) trailing!,
          ],
        ),
      ),
    );
  }
}
```

- [ ] **Step 2: Verify analysis**

```bash
cd mobile && flutter analyze lib/screens/user_settings_screen.dart
```

Expected: `No issues found.`

- [ ] **Step 3: Commit**

```bash
git add mobile/lib/screens/user_settings_screen.dart
git commit -m "feat: rebuild Settings as Account screen with profile card and sign out"
```

---

## Task 4: Redesign the Welcome screen

**Files:**
- Modify: `mobile/lib/screens/onboarding/welcome_screen.dart`

- [ ] **Step 1: Redesign `_WelcomePage`**

Replace the entire `_WelcomePage.build()` method body:

```dart
@override
Widget build(BuildContext context) {
  return Scaffold(
    backgroundColor: Colors.white,
    body: SafeArea(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            // Icon box
            Container(
              width: 80, height: 80,
              decoration: BoxDecoration(
                color: const Color(0xFFEDF7E5),
                borderRadius: BorderRadius.circular(24),
                boxShadow: const [BoxShadow(color: Color(0x2E45B700), blurRadius: 24, offset: Offset(0, 8))],
              ),
              child: const Icon(Icons.favorite, size: 44, color: Color(0xFF45B700)),
            ),
            const SizedBox(height: 28),
            const Text(
              'Health\nHabit Hub',
              style: TextStyle(
                fontSize: 36,
                fontWeight: FontWeight.w900,
                color: Color(0xFF111827),
                height: 1.1,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 14),
            const Text(
              'A citizen-science platform where your habits help build a richer understanding of everyday behaviour.',
              style: TextStyle(fontSize: 15, color: Color(0xFF6B7280), height: 1.55),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 40),
            FilledButton(
              onPressed: onGetStarted,
              child: const Text('Get Started'),
            ),
            const SizedBox(height: 12),
            TextButton(
              onPressed: onRestore,
              child: const Text('Restore existing account'),
            ),
            const SizedBox(height: 4),
            TextButton(
              onPressed: onAdminLogin,
              style: TextButton.styleFrom(
                foregroundColor: const Color(0xFF9CA3AF),
                textStyle: const TextStyle(fontSize: 12),
              ),
              child: const Text('Admin login'),
            ),
          ],
        ),
      ),
    ),
  );
}
```

- [ ] **Step 2: Redesign `_WalkthroughPage`**

Replace the entire `_WalkthroughPage.build()` method body:

```dart
@override
Widget build(BuildContext context) {
  return Scaffold(
    backgroundColor: Colors.white,
    body: SafeArea(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32),
        child: Column(
          children: [
            Align(
              alignment: Alignment.topRight,
              child: onSkip != null
                  ? TextButton(onPressed: onSkip, child: const Text('Skip'))
                  : const SizedBox(height: 40),
            ),
            Expanded(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Container(
                    width: 80, height: 80,
                    decoration: BoxDecoration(
                      color: const Color(0xFFEDF7E5),
                      borderRadius: BorderRadius.circular(24),
                      boxShadow: const [BoxShadow(color: Color(0x2E45B700), blurRadius: 24, offset: Offset(0, 8))],
                    ),
                    child: Icon(step.icon, size: 44, color: const Color(0xFF45B700)),
                  ),
                  const SizedBox(height: 32),
                  Text(
                    step.title,
                    style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w900, color: Color(0xFF111827)),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 14),
                  Text(
                    step.description,
                    style: const TextStyle(fontSize: 15, color: Color(0xFF6B7280), height: 1.55),
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.only(bottom: 32),
              child: FilledButton(
                onPressed: onNext,
                child: Text(isLast ? 'Continue' : 'Next'),
              ),
            ),
          ],
        ),
      ),
    ),
  );
}
```

- [ ] **Step 3: Verify analysis**

```bash
cd mobile && flutter analyze lib/screens/onboarding/welcome_screen.dart
```

Expected: `No issues found.`

- [ ] **Step 4: Commit**

```bash
git add mobile/lib/screens/onboarding/welcome_screen.dart
git commit -m "feat: redesign Welcome screen with Clean Bold icon box and layout"
```

---

## Task 5: Redesign the Passphrase screen

**Files:**
- Modify: `mobile/lib/screens/onboarding/passphrase_screen.dart`

- [ ] **Step 1: Replace `_WordGrid` with a card-chip grid**

Delete the existing `_WordGrid` class and replace it with:

```dart
class _WordGrid extends StatelessWidget {
  const _WordGrid({required this.words});
  final List<String> words;

  @override
  Widget build(BuildContext context) {
    return GridView.count(
      crossAxisCount: 3,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 6,
      crossAxisSpacing: 6,
      childAspectRatio: 2.5,
      children: [
        for (var i = 0; i < words.length; i++)
          _WordChip(number: i + 1, word: words[i]),
      ],
    );
  }
}

class _WordChip extends StatelessWidget {
  const _WordChip({required this.number, required this.word});
  final int number;
  final String word;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(10),
        boxShadow: const [BoxShadow(color: Color(0x14000000), blurRadius: 8, offset: Offset(0, 2))],
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            '$number',
            style: const TextStyle(fontSize: 9, color: Color(0xFF6B7280)),
          ),
          Text(
            word,
            style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Color(0xFF111827)),
          ),
        ],
      ),
    );
  }
}
```

- [ ] **Step 2: Redesign `_buildSuccess()` in `_PassphraseScreenState`**

Replace the `_buildSuccess()` method:

```dart
Widget _buildSuccess() {
  return SingleChildScrollView(
    padding: const EdgeInsets.all(16),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
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
                  'Write these 36 words down — the only way to recover your account if you lose your phone.',
                  style: TextStyle(color: Color(0xFF92400E), fontWeight: FontWeight.w600, fontSize: 13),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        // Word grid
        _WordGrid(words: _words),
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
          onTap: () => setState(() => _confirmed = !_confirmed),
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
```

- [ ] **Step 3: Verify analysis**

```bash
cd mobile && flutter analyze lib/screens/onboarding/passphrase_screen.dart
```

Expected: `No issues found.`

- [ ] **Step 4: Commit**

```bash
git add mobile/lib/screens/onboarding/passphrase_screen.dart
git commit -m "feat: redesign Passphrase screen with card-chip grid and bold warning banner"
```

---

## Task 6: Add `habitStatsProvider` and redesign the Share screen

**Files:**
- Modify: `mobile/lib/services/habit_service.dart`
- Modify: `mobile/lib/screens/donate_screen.dart`

- [ ] **Step 1: Add `habitStatsProvider` to `habit_service.dart`**

Append after the existing `habitServiceProvider`:

```dart
/// Fetches aggregated habit statistics (community totals).
/// Cached per Riverpod lifecycle; re-evaluated when the provider is re-created.
final habitStatsProvider = FutureProvider<HabitStats>((ref) {
  return ref.read(habitServiceProvider).fetchStats();
});
```

- [ ] **Step 2: Rewrite `ShareHabitScreen` as a ConsumerStatefulWidget with landing + WebView states**

Replace the entire content of `mobile/lib/screens/donate_screen.dart`:

```dart
import 'dart:convert';

import 'package:flutter/material.dart';
import '../l10n/app_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../config/app_config.dart';
import '../models/habit_stats.dart';
import '../providers/auth_provider.dart';
import '../providers/locale_provider.dart';
import '../services/habit_service.dart';
import '../services/survey_service.dart';
import '../widgets/offline_banner.dart';

const _kCardShadow = [BoxShadow(color: Color(0x14000000), blurRadius: 20, offset: Offset(0, 4))];
const _kGreenGlow  = [BoxShadow(color: Color(0x4745B700), blurRadius: 28, offset: Offset(0, 8))];

class ShareHabitScreen extends ConsumerStatefulWidget {
  const ShareHabitScreen({super.key});

  @override
  ConsumerState<ShareHabitScreen> createState() => _ShareHabitScreenState();
}

class _ShareHabitScreenState extends ConsumerState<ShareHabitScreen> {
  static const _baseUrl = AppConfig.apiBaseUrl;

  WebViewController? _controller;
  String? _surveyId;
  bool _surveyReady = false;
  bool _surveyMode = false;
  bool _offline = false;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _initSurvey();
  }

  Uri _buildSurveyUri(String surveyId, String lang) {
    return Uri.parse('$_baseUrl/surveys/$surveyId/render')
        .replace(queryParameters: {'lang': lang});
  }

  WebViewController _buildWebController(Uri uri, String? token) {
    return WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..addJavaScriptChannel(
        'SurveyComplete',
        onMessageReceived: (msg) {
          try {
            final data = jsonDecode(msg.message);
            if (data is! Map<String, dynamic>) return;
            _onSurveyComplete(msg.message);
          } catch (e) {
            debugPrint('SurveyComplete: invalid message: $e');
          }
        },
      )
      ..setNavigationDelegate(NavigationDelegate(
        onPageFinished: (_) => _injectCompletionHook(),
        onNavigationRequest: (request) {
          final allowed = request.url.startsWith(AppConfig.appBaseUrl);
          return allowed ? NavigationDecision.navigate : NavigationDecision.prevent;
        },
      ))
      ..loadRequest(uri, headers: token != null ? {'Authorization': 'Bearer $token'} : const {});
  }

  Future<void> _initSurvey() async {
    final surveyService = ref.read(surveyServiceProvider);
    final authService = ref.read(authServiceProvider);
    final lang = ref.read(localeProvider).languageCode;
    try {
      final survey = await surveyService.fetchSurvey('habit-donation');
      final token = await authService.getAccessToken();
      final uri = _buildSurveyUri(survey.id, lang);
      final controller = _buildWebController(uri, token);
      if (mounted) {
        setState(() {
          _controller = controller;
          _surveyId = survey.id;
          _surveyReady = true;
        });
      }
    } catch (e) {
      debugPrint('ShareHabitScreen._initSurvey: $e');
      if (mounted) setState(() => _offline = true);
    }
  }

  Future<void> _injectCompletionHook() async {
    await _controller?.runJavaScript('''
      (function() {
        var iv = setInterval(function() {
          if (typeof survey !== 'undefined' && survey && survey.onComplete) {
            clearInterval(iv);
            survey.onComplete.add(function(s) {
              SurveyComplete.postMessage(JSON.stringify(s.data));
            });
          }
        }, 200);
      })();
    ''');
  }

  Future<void> _onSurveyComplete(String message) async {
    if (_submitting || _surveyId == null) return;
    setState(() => _submitting = true);
    final l10n = AppLocalizations.of(context)!;
    try {
      final answers = jsonDecode(message) as Map<String, dynamic>;
      final surveyService = ref.read(surveyServiceProvider);
      await surveyService.submitResult(_surveyId!, answers);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l10n.habitSharedSuccess)),
        );
        // Return to landing state after submission.
        setState(() {
          _surveyMode = false;
          _surveyReady = false;
          _controller = null;
          _surveyId = null;
        });
        _initSurvey();
      }
    } catch (e) {
      debugPrint('ShareHabitScreen._onSurveyComplete: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l10n.submissionFailed)),
        );
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final statsAsync = ref.watch(habitStatsProvider);

    if (_offline) {
      return Scaffold(
        appBar: AppBar(title: Text(l10n.shareHabit)),
        body: OfflineBanner(
          message: l10n.couldNotLoadSurvey,
          onRetry: () => setState(() {
            _offline = false;
            _initSurvey();
          }),
        ),
      );
    }

    if (_surveyMode && _controller != null) {
      return Scaffold(
        appBar: AppBar(
          title: Text(l10n.shareHabit),
          leading: IconButton(
            icon: const Icon(Icons.close),
            onPressed: () => setState(() => _surveyMode = false),
          ),
        ),
        body: Stack(
          children: [
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

    return Scaffold(
      appBar: AppBar(
        title: const Text('Health Habit Hub'),
        titleSpacing: 16,
        actions: const [Padding(padding: EdgeInsets.only(right: 16), child: Icon(Icons.notifications_outlined))],
      ),
      body: ListView(
        padding: const EdgeInsets.only(bottom: 24),
        children: [
          // ── Hero card ──────────────────────────────────────────────
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
            child: Container(
              decoration: BoxDecoration(
                color: const Color(0xFF45B700),
                borderRadius: BorderRadius.circular(20),
                boxShadow: _kGreenGlow,
              ),
              padding: const EdgeInsets.all(18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    "TODAY'S TASK",
                    style: TextStyle(color: Colors.white70, fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 1),
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'Share a habit with science',
                    style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w900, height: 1.2),
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'Anonymous · ~2 min · Helps researchers worldwide',
                    style: TextStyle(color: Colors.white70, fontSize: 13),
                  ),
                  const SizedBox(height: 14),
                  GestureDetector(
                    onTap: _surveyReady ? () => setState(() => _surveyMode = true) : null,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
                      decoration: BoxDecoration(
                        color: _surveyReady ? Colors.white : Colors.white54,
                        borderRadius: BorderRadius.circular(100),
                      ),
                      child: Text(
                        _surveyReady ? 'Start survey' : 'Loading…',
                        style: const TextStyle(
                          color: Color(0xFF2E8C00),
                          fontWeight: FontWeight.w800,
                          fontSize: 14,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),

          // ── Stats row ──────────────────────────────────────────────
          statsAsync.when(
            loading: () => const SizedBox(height: 80),
            error: (_, __) => const SizedBox(height: 12),
            data: (stats) => Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
              child: Row(
                children: [
                  _StatCard(value: '${stats.total}', label: 'Donated'),
                  const SizedBox(width: 10),
                  _StatCard(value: '${stats.byCategory.length}', label: 'Categories'),
                  const SizedBox(width: 10),
                  _StatCard(icon: Icons.military_tech, label: 'Top habit'),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({this.value, this.icon, required this.label});
  final String? value;
  final IconData? icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          boxShadow: _kCardShadow,
        ),
        child: Column(
          children: [
            if (icon != null)
              Icon(icon, color: const Color(0xFF45B700), size: 22)
            else
              Text(
                value ?? '-',
                style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: Color(0xFF45B700)),
              ),
            const SizedBox(height: 3),
            Text(label, style: const TextStyle(fontSize: 11, color: Color(0xFF6B7280))),
          ],
        ),
      ),
    );
  }
}
```

- [ ] **Step 3: Verify analysis**

```bash
cd mobile && flutter analyze lib/services/habit_service.dart lib/screens/donate_screen.dart
```

Expected: `No issues found.`

- [ ] **Step 4: Commit**

```bash
git add mobile/lib/services/habit_service.dart mobile/lib/screens/donate_screen.dart
git commit -m "feat: redesign Share screen with hero card, stats row, and on-demand survey WebView"
```

---

## Task 7: Redesign the Recommendations screen

**Files:**
- Modify: `mobile/lib/features/recommendation/goal_input_screen.dart`

- [ ] **Step 1: Read the full current file**

Read `mobile/lib/features/recommendation/goal_input_screen.dart` to find where `build()` ends (approximately line 80+).

- [ ] **Step 2: Replace the `build()` method**

Replace `GoalInputScreen.build()` — keep all logic, only change the UI layout:

```dart
@override
Widget build(BuildContext context) {
  final l10n = AppLocalizations.of(context)!;
  return Scaffold(
    appBar: AppBar(title: Text(l10n.getRecommendations)),
    body: SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 32),
      child: Form(
        key: _formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Pink icon box
            Center(
              child: Container(
                width: 72, height: 72,
                decoration: BoxDecoration(
                  color: const Color(0xFFFCE4F0),
                  borderRadius: BorderRadius.circular(22),
                  boxShadow: const [BoxShadow(color: Color(0x2EE679AB), blurRadius: 20, offset: Offset(0, 6))],
                ),
                child: const Icon(Icons.lightbulb, size: 36, color: Color(0xFFE679AB)),
              ),
            ),
            const SizedBox(height: 20),
            const Text(
              "What's your health goal?",
              style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: Color(0xFF111827), height: 1.2),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              l10n.healthGoalPrompt,
              style: const TextStyle(fontSize: 14, color: Color(0xFF6B7280), height: 1.5),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 20),
            // Text input
            TextFormField(
              controller: _controller,
              maxLines: 3,
              style: const TextStyle(fontSize: 14),
              decoration: InputDecoration(
                hintText: 'e.g. I want to sleep better and reduce stress…',
                hintStyle: const TextStyle(color: Color(0xFF9CA3AF)),
                filled: true,
                fillColor: Colors.white,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                  borderSide: const BorderSide(color: Color(0xFFE5E7EB)),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                  borderSide: const BorderSide(color: Color(0xFFE5E7EB)),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                  borderSide: const BorderSide(color: Color(0xFF45B700), width: 1.5),
                ),
                contentPadding: const EdgeInsets.all(14),
              ),
              validator: (v) {
                if (v == null || v.trim().isEmpty) return 'Please describe your goal';
                return null;
              },
            ),
            const SizedBox(height: 20),
            // Popular goal chips
            const Align(
              alignment: Alignment.centerLeft,
              child: Text(
                'POPULAR GOALS',
                style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 0.8, color: Color(0xFF6B7280)),
              ),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                _GoalChip(label: 'Sleep better', highlight: true, onTap: (l) => _controller.text = l),
                _GoalChip(label: 'Reduce stress',   onTap: (l) => _controller.text = l),
                _GoalChip(label: 'More active',      onTap: (l) => _controller.text = l),
                _GoalChip(label: 'Eat healthier',    onTap: (l) => _controller.text = l),
              ],
            ),
            const SizedBox(height: 28),
            FilledButton(
              onPressed: _submit,
              child: Text(l10n.getRecommendations),
            ),
          ],
        ),
      ),
    ),
  );
}
```

Also add the `_GoalChip` private widget at the bottom of the file (outside the State class):

```dart
class _GoalChip extends StatelessWidget {
  const _GoalChip({required this.label, required this.onTap, this.highlight = false});
  final String label;
  final void Function(String) onTap;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => onTap(label),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
        decoration: BoxDecoration(
          color: highlight ? const Color(0xFFFCE4F0) : Colors.white,
          border: Border.all(
            color: highlight ? const Color(0xFFE679AB) : const Color(0xFFE5E7EB),
          ),
          borderRadius: BorderRadius.circular(100),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: highlight ? const Color(0xFFE679AB) : const Color(0xFF6B7280),
          ),
        ),
      ),
    );
  }
}
```

- [ ] **Step 3: Verify analysis**

```bash
cd mobile && flutter analyze lib/features/recommendation/goal_input_screen.dart
```

Expected: `No issues found.`

- [ ] **Step 4: Commit**

```bash
git add mobile/lib/features/recommendation/goal_input_screen.dart
git commit -m "feat: redesign Recommendations screen with pink icon box and goal chips"
```

---

## Task 8: Update the Explore screen app bar

**Files:**
- Modify: `mobile/lib/screens/explore_screen.dart`

The Explore screen keeps its structure (graph + tab bar + category filter). Only the app bar colour and bottom sheet styling need updating to match the new theme. The theme tokens applied in Task 1 handle most of this automatically, but the bottom sheet modal needs a consistent border-radius.

- [ ] **Step 1: Update the bottom sheet shape in `_showNodeDetail`**

The `showModalBottomSheet` call already sets `shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20)))`. Verify this is already present at line ~87. If not, add it.

- [ ] **Step 2: Update the drag handle colour**

Inside the bottom sheet builder, the drag handle `Container` uses `Colors.grey.shade300`. Change to:

```dart
Container(
  width: 40, height: 4,
  decoration: BoxDecoration(
    color: const Color(0xFFE5E7EB),
    borderRadius: BorderRadius.circular(2),
  ),
),
```

- [ ] **Step 3: Update category filter bar background**

In `_CategoryFilterBar.build()`, the container uses:
```dart
color: Theme.of(context).colorScheme.surfaceContainerHighest.withAlpha(80),
```

Change to:
```dart
color: const Color(0xFFF4F5F2),
```

- [ ] **Step 4: Verify analysis**

```bash
cd mobile && flutter analyze lib/screens/explore_screen.dart
```

Expected: `No issues found.`

- [ ] **Step 5: Commit**

```bash
git add mobile/lib/screens/explore_screen.dart
git commit -m "feat: update Explore screen bottom sheet and filter bar to new design tokens"
```

---

## Task 9: Final smoke test

- [ ] **Step 1: Run full analysis**

```bash
cd mobile && flutter analyze lib/
```

Expected: `No issues found.`

- [ ] **Step 2: Run existing tests**

```bash
cd mobile && flutter test
```

Expected: all tests pass.

- [ ] **Step 3: Run the app and verify all screens**

```bash
cd mobile && flutter run
```

Walk through each screen and verify:
- [ ] Welcome screen: white bg, green icon box, bold title, pill button
- [ ] Passphrase screen: chip grid for words, warning banner, green checkbox
- [ ] Bottom nav: white bar, green pill behind active tab, 4 tabs (Share/Explore/Recs/Account)
- [ ] Share screen: green hero card, stat row, "Start survey" button reveals WebView
- [ ] Explore screen: white app bar, consistent bottom sheet
- [ ] Recs screen: pink icon box, popular goal chips, text input
- [ ] Account screen: green profile card, questionnaire row, language/appearance rows (bottom sheet picker), legal links, red sign out row
- [ ] Profile questionnaire: accessible via Account → Health profile questionnaire row (push to `/settings/profile`)
- [ ] Sign out: confirmation dialog → calls logout

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: ui-redesign complete — Clean Bold design system applied across all user screens"
```
