import 'package:flutter/material.dart';
import '../models/recommendation.dart';

/// Card widget displaying a single habit [Recommendation].
///
/// Shows the habit name, category chip, confidence score bar, and rationale.
/// A "Why?" button opens a bottom sheet with the full rationale and optional
/// RAG citation. Accept and Dismiss buttons appear in the card footer and
/// call [onAccept]/[onDismiss] respectively.
class RecommendationCard extends StatelessWidget {
  /// The recommendation to display.
  final Recommendation recommendation;

  /// Called when the user taps the Accept button.
  final VoidCallback onAccept;

  /// Called when the user taps the Dismiss button.
  final VoidCallback onDismiss;

  /// Creates a [RecommendationCard].
  const RecommendationCard({
    super.key,
    required this.recommendation,
    required this.onAccept,
    required this.onDismiss,
  });

  void _showWhySheet(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final colorScheme = Theme.of(context).colorScheme;
    final citation = recommendation.ragCitation;

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.5,
        minChildSize: 0.3,
        maxChildSize: 0.85,
        builder: (_, controller) => ListView(
          controller: controller,
          padding: const EdgeInsets.fromLTRB(24, 16, 24, 32),
          children: [
            // Drag handle
            Center(
              child: Container(
                width: 40,
                height: 4,
                margin: const EdgeInsets.only(bottom: 16),
                decoration: BoxDecoration(
                  color: colorScheme.outlineVariant,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            Text(
              'Why "${recommendation.habitName}"?',
              style: textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 12),
            Text(recommendation.rationale, style: textTheme.bodyMedium),
            if (citation != null) ...[
              const SizedBox(height: 20),
              Divider(color: colorScheme.outlineVariant),
              const SizedBox(height: 12),
              Text(
                'Evidence',
                style: textTheme.labelLarge?.copyWith(color: colorScheme.secondary),
              ),
              const SizedBox(height: 6),
              Text(
                citation.sourceTitle,
                style: textTheme.bodySmall?.copyWith(fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 4),
              Text(citation.excerpt, style: textTheme.bodySmall),
            ],
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final textTheme = Theme.of(context).textTheme;

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Habit name — large
            Text(
              recommendation.habitName,
              style: textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            // Category chip
            Chip(
              label: Text(recommendation.category),
              backgroundColor: colorScheme.primaryContainer,
              labelStyle: TextStyle(color: colorScheme.onPrimaryContainer),
              padding: EdgeInsets.zero,
              visualDensity: VisualDensity.compact,
            ),
            const SizedBox(height: 8),
            // Confidence score bar
            Row(
              children: [
                Text(
                  'Confidence',
                  style: textTheme.bodySmall,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(4),
                    child: LinearProgressIndicator(
                      value: recommendation.confidenceScore.clamp(0.0, 1.0),
                      minHeight: 8,
                      backgroundColor:
                          colorScheme.surfaceContainerHighest,
                      valueColor:
                          AlwaysStoppedAnimation<Color>(colorScheme.primary),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  '${(recommendation.confidenceScore * 100).round()}%',
                  style: textTheme.bodySmall,
                ),
              ],
            ),
            const SizedBox(height: 8),
            // Rationale preview — tap "Why?" for full text
            Text(
              recommendation.rationale,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: textTheme.bodyMedium,
            ),
            const SizedBox(height: 8),
            // Footer: Why? / Dismiss / Accept
            Row(
              children: [
                TextButton.icon(
                  onPressed: () => _showWhySheet(context),
                  icon: const Icon(Icons.info_outline, size: 16),
                  label: const Text('Why?'),
                  style: TextButton.styleFrom(
                    foregroundColor: colorScheme.secondary,
                    padding: EdgeInsets.zero,
                    minimumSize: const Size(0, 36),
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                ),
                const Spacer(),
                IconButton(
                  icon: const Icon(Icons.close),
                  tooltip: 'Dismiss',
                  onPressed: onDismiss,
                  color: colorScheme.error,
                ),
                const SizedBox(width: 4),
                IconButton(
                  icon: const Icon(Icons.check),
                  tooltip: 'Accept',
                  onPressed: onAccept,
                  color: colorScheme.primary,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
