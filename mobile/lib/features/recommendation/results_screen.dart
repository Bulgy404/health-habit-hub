import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'recommendation_feature_service.dart';
import 'recommendation_models.dart';

/// Shows recommendation results after loading completes.
///
/// Handles three states:
/// - Error: shows error message with retry option
/// - Empty: shows message to share habits first
/// - Results: shows recommendation cards
class RecommendationResultsScreen extends ConsumerWidget {
  final String goal;
  final RecommendationResponse? response;
  final String? error;

  const RecommendationResultsScreen({
    super.key,
    required this.goal,
    required this.response,
    this.error,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Recommendations'),
        automaticallyImplyLeading: false,
      ),
      body: _buildBody(context),
      bottomNavigationBar: _buildBottomBar(context),
    );
  }

  Widget _buildBody(BuildContext context) {
    if (error != null) return _buildError(context);
    final recs = response?.recommendations ?? [];
    if (recs.isEmpty) return _buildEmpty(context);
    return _buildResults(context, recs);
  }

  Widget _buildError(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline, size: 56, color: Colors.red),
            const SizedBox(height: 16),
            Text(
              error!,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Try again'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildEmpty(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.lightbulb_outline, size: 64),
            const SizedBox(height: 16),
            Text(
              'No recommendations were generated. Try describing your goal in more detail — the more context you share, the better.',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 24),
            FilledButton.icon(
              onPressed: () => Navigator.of(context).pop(),
              icon: const Icon(Icons.refresh),
              label: const Text('Try again'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildResults(
    BuildContext context,
    List<RecommendationItem> recs,
  ) {
    return ListView.builder(
      padding: const EdgeInsets.symmetric(vertical: 8),
      itemCount: recs.length,
      itemBuilder: (context, index) => _RecommendationCard(
        item: recs[index],
        recommendationId: response!.recommendationId,
      ),
    );
  }

  Widget _buildBottomBar(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
        child: OutlinedButton.icon(
          onPressed: () => Navigator.of(context).pop(),
          icon: const Icon(Icons.refresh),
          label: const Text('Try a different goal'),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Recommendation card
// ---------------------------------------------------------------------------

class _RecommendationCard extends ConsumerStatefulWidget {
  final RecommendationItem item;
  final String recommendationId;

  const _RecommendationCard({
    required this.item,
    required this.recommendationId,
  });

  @override
  ConsumerState<_RecommendationCard> createState() =>
      _RecommendationCardState();
}

class _RecommendationCardState extends ConsumerState<_RecommendationCard> {
  final _commentController = TextEditingController();
  bool _submitting = false;
  bool _submitted = false;
  String? _submitError;

  @override
  void dispose() {
    _commentController.dispose();
    super.dispose();
  }

  Future<void> _submitComment() async {
    final comment = _commentController.text.trim();
    if (comment.isEmpty) return;
    setState(() {
      _submitting = true;
      _submitError = null;
    });
    try {
      final service = ref.read(recommendationFeatureServiceProvider);
      await service.submitFeedback(
        recommendationId: widget.recommendationId,
        comment: comment,
      );
      if (mounted) {
        setState(() {
          _submitted = true;
          _submitting = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _submitError = 'Failed to submit feedback';
          _submitting = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final colorScheme = Theme.of(context).colorScheme;

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Title
            Text(
              widget.item.title,
              style: textTheme.titleMedium
                  ?.copyWith(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            // Body
            Text(widget.item.body, style: textTheme.bodyMedium),
            const SizedBox(height: 8),
            // Rationale
            Text(
              'Why this helps:',
              style: textTheme.labelMedium
                  ?.copyWith(color: colorScheme.secondary),
            ),
            Text(widget.item.rationale, style: textTheme.bodySmall),
            // Sources (collapsible)
            if (widget.item.sources.isNotEmpty) ...[
              const SizedBox(height: 4),
              ExpansionTile(
                tilePadding: EdgeInsets.zero,
                title: Text(
                  'Sources (${widget.item.sources.length})',
                  style: textTheme.labelMedium
                      ?.copyWith(color: colorScheme.primary),
                ),
                children: widget.item.sources
                    .map(
                      (s) => Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              s.filename,
                              style: textTheme.labelSmall?.copyWith(
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              s.excerpt,
                              style: textTheme.bodySmall,
                            ),
                          ],
                        ),
                      ),
                    )
                    .toList(),
              ),
            ],
            const Divider(height: 24),
            // Feedback section
            if (_submitted)
              Text(
                'Feedback submitted — thank you!',
                style: textTheme.bodySmall?.copyWith(
                  color: colorScheme.primary,
                ),
              )
            else ...[
              Text('Leave a comment:', style: textTheme.labelMedium),
              const SizedBox(height: 6),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _commentController,
                      decoration: const InputDecoration(
                        hintText: 'Your feedback\u2026',
                        isDense: true,
                        border: OutlineInputBorder(),
                        contentPadding: EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 8,
                        ),
                      ),
                      maxLines: 2,
                      enabled: !_submitting,
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton.filled(
                    onPressed: _submitting ? null : _submitComment,
                    icon: _submitting
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.send),
                  ),
                ],
              ),
              if (_submitError != null) ...[
                const SizedBox(height: 4),
                Text(
                  _submitError!,
                  style: textTheme.bodySmall
                      ?.copyWith(color: colorScheme.error),
                ),
              ],
            ],
          ],
        ),
      ),
    );
  }
}
