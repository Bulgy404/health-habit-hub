/// Reusable illustrated empty-state: icon-in-rounded-tile (the same motif
/// used on the onboarding walkthrough) + message + an optional primary CTA.
library;

import 'package:flutter/material.dart';

import '../theme/app_colors.dart';

class EmptyState extends StatelessWidget {
  const EmptyState({
    super.key,
    required this.icon,
    required this.message,
    this.ctaLabel,
    this.onCta,
  });

  final IconData icon;
  final String message;
  final String? ctaLabel;
  final VoidCallback? onCta;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    // LayoutBuilder + a min-height ConstrainedBox keeps the content centred
    // when it fits, but lets it scroll instead of overflowing when the
    // available space (e.g. a SliverFillRemaining on a short screen) is
    // smaller than the icon + message + CTA stack needs.
    return LayoutBuilder(
      builder: (context, constraints) {
        return SingleChildScrollView(
          padding: const EdgeInsets.all(32),
          child: ConstrainedBox(
            constraints: BoxConstraints(minHeight: constraints.maxHeight),
            child: Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 72,
                    height: 72,
                    decoration: BoxDecoration(
                      color: colors.greenLight,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Icon(icon, size: 34, color: colors.primary),
                  ),
                  const SizedBox(height: 20),
                  Text(
                    message,
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: Theme.of(
                        context,
                      ).colorScheme.onSurface.withAlpha(180),
                    ),
                  ),
                  if (ctaLabel != null && onCta != null) ...[
                    const SizedBox(height: 20),
                    FilledButton(
                      onPressed: onCta,
                      style: FilledButton.styleFrom(
                        minimumSize: const Size(200, 44),
                      ),
                      child: Text(ctaLabel!),
                    ),
                  ],
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}
