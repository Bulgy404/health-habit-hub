import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../l10n/app_localizations.dart';
import '../my_habits/my_habits_provider.dart';
import 'recommendation_feature_service.dart';
import 'recommendation_models.dart';

/// Shows recommendation results after loading completes.
///
/// Handles three states:
/// - Error: shows error message with retry option
/// - Empty: shows message to share habits first
/// - Results: shows recommendation cards
class RecommendationResultsScreen extends ConsumerWidget {
  /// The user's stated health goal.
  final String goal;

  /// The recommendation response, or `null` if loading failed.
  final RecommendationResponse? response;

  /// Error message to display when [response] is `null`.
  final String? error;

  /// Creates a [RecommendationResultsScreen].
  const RecommendationResultsScreen({
    super.key,
    required this.goal,
    required this.response,
    this.error,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.recommendationResultsTitle),
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
    final l10n = AppLocalizations.of(context)!;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline, size: 56, color: Colors.red),
            const SizedBox(height: 16),
            Text(error!, textAlign: TextAlign.center),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: () => Navigator.of(context).pop(),
              child: Text(l10n.recommendationTryAgain),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildEmpty(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.lightbulb_outline, size: 64),
            const SizedBox(height: 16),
            Text(
              l10n.recommendationEmptyMessage,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 24),
            FilledButton.icon(
              onPressed: () => Navigator.of(context).pop(),
              icon: const Icon(Icons.refresh),
              label: Text(l10n.recommendationTryAgain),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildResults(BuildContext context, List<RecommendationItem> recs) {
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
    final l10n = AppLocalizations.of(context)!;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
        child: OutlinedButton.icon(
          onPressed: () => Navigator.of(context).pop(),
          icon: const Icon(Icons.refresh),
          label: Text(l10n.recommendationTryDifferentGoal),
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
  bool _addingToHabits = false;
  String? _submitError;

  /// Derives a stable snake_case key from the title, matching the
  /// normalisation used by the free-entry behaviour form.
  String _slugify(String label) {
    final slug = label
        .trim()
        .toLowerCase()
        .replaceAll(RegExp(r'\s+'), '_')
        .replaceAll(RegExp(r'[^a-z0-9_]'), '');
    return slug.isEmpty ? 'custom' : slug;
  }

  /// Forwards this recommendation into the habit-creation flow: the behaviour
  /// is prefilled from the recommendation, then the user picks a cue, the
  /// implementation intention is stitched, and the confirm screen lets them
  /// verify/adjust the intention, set a reminder, and share with the
  /// community.
  Future<void> _addToHabits() async {
    setState(() => _addingToHabits = true);
    try {
      final config = await ref.read(habitConfigProvider.future);
      if (!mounted) return;
      context.push(
        '/habits/new/cue',
        extra: {
          'behaviorKey': _slugify(widget.item.title),
          'behaviorLabel': widget.item.title,
          'config': config,
          'initialCue': widget.item.suggestedCue.isNotEmpty
              ? widget.item.suggestedCue
              : null,
        },
      );
    } catch (_) {
      if (mounted) {
        final l10n = AppLocalizations.of(context)!;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l10n.recommendationHabitFlowError)),
        );
      }
    } finally {
      if (mounted) setState(() => _addingToHabits = false);
    }
  }

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
        final l10n = AppLocalizations.of(context)!;
        setState(() {
          _submitError = l10n.recommendationFeedbackFailed;
          _submitting = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
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
              style: textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 8),
            // Body
            Text(widget.item.body, style: textTheme.bodyMedium),
            const SizedBox(height: 8),
            // Rationale
            Text(
              l10n.recommendationWhyThisHelps,
              style: textTheme.labelMedium?.copyWith(
                color: colorScheme.secondary,
              ),
            ),
            Text(widget.item.rationale, style: textTheme.bodySmall),
            // Suggested implementation-intention cue
            if (widget.item.suggestedCue.isNotEmpty) ...[
              const SizedBox(height: 8),
              Row(
                children: [
                  Icon(Icons.bolt, size: 16, color: colorScheme.tertiary),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      widget.item.suggestedCue,
                      style: textTheme.bodySmall?.copyWith(
                        fontStyle: FontStyle.italic,
                        color: colorScheme.tertiary,
                      ),
                    ),
                  ),
                ],
              ),
            ],
            // Sources (collapsible)
            if (widget.item.sources.isNotEmpty) ...[
              const SizedBox(height: 4),
              ExpansionTile(
                tilePadding: EdgeInsets.zero,
                title: Text(
                  l10n.recommendationSourcesCount(widget.item.sources.length),
                  style: textTheme.labelMedium?.copyWith(
                    color: colorScheme.primary,
                  ),
                ),
                children: widget.item.sources
                    .map((s) => _SourceLink(source: s))
                    .toList(),
              ),
            ],
            const SizedBox(height: 12),
            // Adopt this recommendation as a habit
            SizedBox(
              width: double.infinity,
              child: FilledButton.tonalIcon(
                onPressed: _addingToHabits ? null : _addToHabits,
                icon: _addingToHabits
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.playlist_add),
                label: Text(l10n.recommendationAddToHabits),
              ),
            ),
            const Divider(height: 24),
            // Feedback section
            if (_submitted)
              Text(
                l10n.recommendationFeedbackSubmitted,
                style: textTheme.bodySmall?.copyWith(
                  color: colorScheme.primary,
                ),
              )
            else ...[
              Text(
                l10n.recommendationLeaveComment,
                style: textTheme.labelMedium,
              ),
              const SizedBox(height: 6),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _commentController,
                      decoration: InputDecoration(
                        hintText: l10n.recommendationFeedbackHint,
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
                  style: textTheme.bodySmall?.copyWith(
                    color: colorScheme.error,
                  ),
                ),
              ],
            ],
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Source citation link
// ---------------------------------------------------------------------------

/// A tappable academic-paper citation that opens the paper's link.
class _SourceLink extends StatelessWidget {
  const _SourceLink({required this.source});

  final RecommendationSourceRef source;

  Future<void> _open(BuildContext context) async {
    final uri = Uri.tryParse(source.url);
    if (uri == null) return;
    final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!ok && context.mounted) {
      final l10n = AppLocalizations.of(context)!;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.recommendationSourceLinkError)),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final colorScheme = Theme.of(context).colorScheme;
    final hasLink = source.url.isNotEmpty;

    return InkWell(
      onTap: hasLink ? () => _open(context) : null,
      borderRadius: BorderRadius.circular(8),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(
              hasLink ? Icons.open_in_new : Icons.description_outlined,
              size: 16,
              color: hasLink ? colorScheme.primary : colorScheme.outline,
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (source.quote.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 3),
                      child: Text(
                        '“${source.quote}”',
                        maxLines: 4,
                        overflow: TextOverflow.ellipsis,
                        style: textTheme.bodySmall?.copyWith(
                          fontStyle: FontStyle.italic,
                          color: colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ),
                  Text(
                    source.displayLabel,
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                    style: textTheme.bodySmall?.copyWith(
                      color: hasLink ? colorScheme.primary : null,
                      decoration: hasLink ? TextDecoration.underline : null,
                      decorationColor: colorScheme.primary,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
