import 'package:flutter/material.dart';

const _kCardShadow = [
  BoxShadow(color: Color(0x14000000), blurRadius: 20, offset: Offset(0, 4)),
];

/// Uppercase, small-caps-style label used above a [SettingsCard] group.
class SectionLabel extends StatelessWidget {
  /// Creates a [SectionLabel] with the given [text].
  const SectionLabel(this.text, {super.key});

  /// The label text (rendered uppercased).
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

/// Rounded, shadowed card grouping one or more [SettingsRow]s.
class SettingsCard extends StatelessWidget {
  /// Creates a [SettingsCard] wrapping [children].
  const SettingsCard({required this.children, super.key});

  /// Rows (and dividers) rendered inside the card.
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

/// A single tappable row inside a [SettingsCard]: leading icon, title, and
/// optional trailing widget (chevron, value text, switch, ...).
class SettingsRow extends StatelessWidget {
  /// Creates a [SettingsRow].
  const SettingsRow({
    required this.icon,
    required this.title,
    this.trailing,
    this.onTap,
    this.iconColor,
    this.titleColor,
    super.key,
  });

  /// Leading icon.
  final IconData icon;

  /// Row title.
  final String title;

  /// Optional trailing widget (chevron, value label, switch, ...).
  final Widget? trailing;

  /// Tap handler. When null, the row is not tappable.
  final VoidCallback? onTap;

  /// Override for the leading icon color.
  final Color? iconColor;

  /// Override for the title text color.
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
