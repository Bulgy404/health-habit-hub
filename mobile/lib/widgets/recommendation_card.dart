import 'package:flutter/material.dart';
import '../models/recommendation.dart';

/// Card widget displaying a single habit [Recommendation].
///
/// Shows the habit name, category chip, confidence score bar, and rationale.
/// If [recommendation.ragCitation] is present, a collapsible RAG citation
/// section is shown via [ExpansionTile]. Accept and Dismiss buttons appear
/// in the card footer and call [onAccept]/[onDismiss] respectively.
class RecommendationCard extends StatelessWidget {
  final Recommendation recommendation;
  final VoidCallback onAccept;
  final VoidCallback onDismiss;

  const RecommendationCard({
    super.key,
    required this.recommendation,
    required this.onAccept,
    required this.onDismiss,
  });

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
            // Rationale — max 2 lines
            Text(
              recommendation.rationale,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: textTheme.bodyMedium,
            ),
            // RAG citation (optional)
            if (recommendation.ragCitation != null) ...[
              const SizedBox(height: 4),
              ExpansionTile(
                tilePadding: EdgeInsets.zero,
                title: Text(
                  'Source: ${recommendation.ragCitation!.sourceTitle}',
                  style: textTheme.bodySmall
                      ?.copyWith(color: colorScheme.secondary),
                ),
                children: [
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Text(
                      recommendation.ragCitation!.excerpt,
                      style: textTheme.bodySmall,
                    ),
                  ),
                ],
              ),
            ],
            const SizedBox(height: 8),
            // Accept / Dismiss footer
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                IconButton(
                  icon: const Icon(Icons.close),
                  tooltip: 'Dismiss',
                  onPressed: onDismiss,
                  color: colorScheme.error,
                ),
                const SizedBox(width: 8),
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
