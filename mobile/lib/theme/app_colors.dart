/// Brand color tokens exposed as a [ThemeExtension] so screens can read
/// `Theme.of(context).extension<AppColors>()!` instead of hardcoding hex
/// literals that silently break in dark mode.
library;

import 'package:flutter/material.dart';

class AppColors extends ThemeExtension<AppColors> {
  const AppColors({
    required this.primary,
    required this.primaryDark,
    required this.accent,
    required this.text,
    required this.muted,
    required this.border,
    required this.greenLight,
    required this.error,
  });

  final Color primary;
  final Color primaryDark;
  final Color accent;
  final Color text;
  final Color muted;
  final Color border;
  final Color greenLight;
  final Color error;

  static const light = AppColors(
    primary: Color(0xFF45B700),
    primaryDark: Color(0xFF2E8C00),
    accent: Color(0xFFE679AB),
    text: Color(0xFF111827),
    muted: Color(0xFF6B7280),
    border: Color(0xFFE5E7EB),
    greenLight: Color(0xFFEDF7E5),
    error: Color(0xFFDC2626),
  );

  static const dark = AppColors(
    primary: Color(0xFF45B700),
    primaryDark: Color(0xFF2E8C00),
    accent: Color(0xFFE679AB),
    text: Color(0xFFF0F0F0),
    muted: Color(0xFFA1A1AA),
    border: Color(0xFF3A3A3A),
    greenLight: Color(0xFF203A17),
    error: Color(0xFFF87171),
  );

  @override
  AppColors copyWith({
    Color? primary,
    Color? primaryDark,
    Color? accent,
    Color? text,
    Color? muted,
    Color? border,
    Color? greenLight,
    Color? error,
  }) {
    return AppColors(
      primary: primary ?? this.primary,
      primaryDark: primaryDark ?? this.primaryDark,
      accent: accent ?? this.accent,
      text: text ?? this.text,
      muted: muted ?? this.muted,
      border: border ?? this.border,
      greenLight: greenLight ?? this.greenLight,
      error: error ?? this.error,
    );
  }

  @override
  AppColors lerp(ThemeExtension<AppColors>? other, double t) {
    if (other is! AppColors) return this;
    return AppColors(
      primary: Color.lerp(primary, other.primary, t)!,
      primaryDark: Color.lerp(primaryDark, other.primaryDark, t)!,
      accent: Color.lerp(accent, other.accent, t)!,
      text: Color.lerp(text, other.text, t)!,
      muted: Color.lerp(muted, other.muted, t)!,
      border: Color.lerp(border, other.border, t)!,
      greenLight: Color.lerp(greenLight, other.greenLight, t)!,
      error: Color.lerp(error, other.error, t)!,
    );
  }
}

extension AppColorsContext on BuildContext {
  /// Falls back to [AppColors.light]/[AppColors.dark] (by ambient
  /// brightness) when the extension isn't registered on the current Theme —
  /// e.g. widget tests that build a bare [MaterialApp] without [HhhApp]'s
  /// theme. Production code always goes through `_buildLightTheme`/
  /// `_buildDarkTheme` in app.dart, which register it.
  AppColors get appColors {
    final theme = Theme.of(this);
    return theme.extension<AppColors>() ??
        (theme.brightness == Brightness.dark
            ? AppColors.dark
            : AppColors.light);
  }
}
