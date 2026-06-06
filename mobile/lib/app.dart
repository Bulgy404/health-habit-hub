/// Root application widget and Material theme definitions.
///
/// [HhhApp] is the top-level [ConsumerWidget] that wires together the
/// GoRouter, theming, and localisation delegates.
library;

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';

import 'l10n/app_localizations.dart';
import 'providers/locale_provider.dart';
import 'providers/theme_provider.dart';
import 'router/app_router.dart';

// ---------------------------------------------------------------------------
// Brand colors
// ---------------------------------------------------------------------------

// Health Habit Hub brand colors.
const _kPrimary    = Color(0xFF45B700);
const _kPrimaryDark = Color(0xFF2E8C00);
const _kAccent     = Color(0xFFE679AB);
const _kBg         = Color(0xFFF4F5F2);
const _kText       = Color(0xFF111827);
const _kMuted      = Color(0xFF6B7280);
const _kBorder     = Color(0xFFE5E7EB);
const _kGreenLight = Color(0xFFEDF7E5);

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

ThemeData _buildDarkTheme() {
  const kDarkBackground = Color(0xFF1a1a1a);
  const kDarkSurface = Color(0xFF2a2a2a);
  const kDarkOnSurface = Color(0xFFf0f0f0);

  final colorScheme = ColorScheme.fromSeed(
    seedColor: _kPrimary,
    primary: _kPrimary,
    secondary: _kAccent,
    surface: kDarkSurface,
    onPrimary: Colors.white,
    onSecondary: Colors.white,
    onSurface: kDarkOnSurface,
    brightness: Brightness.dark,
  );

  final base = ThemeData(
    useMaterial3: true,
    colorScheme: colorScheme,
    scaffoldBackgroundColor: kDarkBackground,
  );

  return base.copyWith(
    textTheme: GoogleFonts.figtreeTextTheme(base.textTheme),
    primaryColor: _kPrimary,
    appBarTheme: const AppBarTheme(
      backgroundColor: Color(0xFF454446),
      foregroundColor: Colors.white,
      iconTheme: IconThemeData(color: Colors.white),
      actionsIconTheme: IconThemeData(color: Colors.white),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: const Color(0xFF454446),
      indicatorColor: _kPrimary,
      iconTheme: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.selected)) {
          return const IconThemeData(color: Colors.white);
        }
        return IconThemeData(color: Colors.white.withAlpha(153));
      }),
      labelTextStyle: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.selected)) {
          return GoogleFonts.figtree(
            color: Colors.white,
            fontWeight: FontWeight.bold,
            fontSize: 12,
          );
        }
        return GoogleFonts.figtree(
          color: Colors.white.withAlpha(153),
          fontSize: 12,
        );
      }),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: _kPrimary,
        foregroundColor: Colors.white,
        textStyle: GoogleFonts.figtree(fontWeight: FontWeight.bold),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
        ),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: _kPrimary,
        foregroundColor: Colors.white,
        textStyle: GoogleFonts.figtree(fontWeight: FontWeight.bold),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
        ),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: _kPrimary,
        side: const BorderSide(color: _kPrimary, width: 1.5),
        textStyle: GoogleFonts.figtree(fontWeight: FontWeight.w600),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
        ),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: _kPrimary,
        textStyle: GoogleFonts.figtree(),
      ),
    ),
    cardTheme: CardThemeData(
      color: kDarkSurface,
      elevation: 4,
      shadowColor: const Color(0x40000000),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
        side: const BorderSide(color: _kPrimary, width: 2),
      ),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: kDarkSurface,
      labelStyle: const TextStyle(color: Colors.white),
      selectedColor: _kPrimaryDark,
    ),
  );
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

/// Root application widget.
///
/// Reads [routerProvider], [themeModeProvider], and [localeProvider] from
/// Riverpod and wires them into [MaterialApp.router].
class HhhApp extends ConsumerWidget {
  /// Creates the root application widget.
  const HhhApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // ── State reads ───────────────────────────────────────────────────────────
    final router = ref.watch(routerProvider);
    final themeMode = ref.watch(themeModeProvider);
    final locale = ref.watch(localeProvider);

    // ── Main layout ───────────────────────────────────────────────────────────
    return MaterialApp.router(
      title: 'Health Habit Hub',
      theme: _buildLightTheme(),
      darkTheme: _buildDarkTheme(),
      themeMode: themeMode,
      locale: locale,
      routerConfig: router,
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: const [
        Locale('en'),
        Locale('de'),
      ],
    );
  }
}
