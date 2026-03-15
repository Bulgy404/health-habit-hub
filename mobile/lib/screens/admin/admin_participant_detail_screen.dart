import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';

import '../../models/participant_progress.dart';
import '../../services/admin_service.dart';

/// Detail screen showing a participant's full progress timeline.
///
/// Features:
///  - Profile completion status (checkmark / cross)
///  - Surveys completed list with timestamps
///  - Habits donated count with expandable section
///  - Recommendations accepted / dismissed counts
///  - Timeline ListView with icons in chronological order
///  - Export JSON button (shares progress JSON via share_plus)
class AdminParticipantDetailScreen extends ConsumerStatefulWidget {
  const AdminParticipantDetailScreen({
    super.key,
    required this.participantId,
  });

  final String participantId;

  @override
  ConsumerState<AdminParticipantDetailScreen> createState() =>
      _AdminParticipantDetailScreenState();
}

class _AdminParticipantDetailScreenState
    extends ConsumerState<AdminParticipantDetailScreen> {
  ParticipantProgress? _progress;
  bool _loading = true;
  bool _error = false;
  bool _exporting = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = false;
    });
    try {
      final service = ref.read(adminServiceProvider);
      final progress =
          await service.fetchParticipantProgress(widget.participantId);
      if (mounted) {
        setState(() {
          _progress = progress;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = true;
        });
      }
    }
  }

  Future<void> _exportJson() async {
    setState(() => _exporting = true);
    try {
      final service = ref.read(adminServiceProvider);
      final progress =
          await service.fetchParticipantProgress(widget.participantId);
      final jsonStr =
          const JsonEncoder.withIndent('  ').convert(progress.toJson());
      await Share.share(
        jsonStr,
        subject: 'Participant ${widget.participantId} Progress',
      );
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Failed to export progress data.')),
        );
      }
    } finally {
      if (mounted) setState(() => _exporting = false);
    }
  }

  String _formatDate(DateTime? dt) {
    if (dt == null) return '—';
    return '${dt.year}-${dt.month.toString().padLeft(2, '0')}-'
        '${dt.day.toString().padLeft(2, '0')}';
  }

  String _formatDateTime(DateTime? dt) {
    if (dt == null) return '—';
    final date = _formatDate(dt);
    final h = dt.hour.toString().padLeft(2, '0');
    final m = dt.minute.toString().padLeft(2, '0');
    return '$date $h:$m';
  }

  IconData _timelineIcon(String type) {
    switch (type) {
      case 'enrolled':
        return Icons.person_add_alt_1;
      case 'survey_completed':
        return Icons.assignment_turned_in;
      case 'recommendation_accepted':
        return Icons.thumb_up;
      case 'recommendation_dismissed':
        return Icons.thumb_down;
      default:
        return Icons.circle_outlined;
    }
  }

  Color _timelineColor(BuildContext context, String type) {
    final cs = Theme.of(context).colorScheme;
    switch (type) {
      case 'enrolled':
        return cs.primary;
      case 'survey_completed':
        return Colors.green;
      case 'recommendation_accepted':
        return Colors.teal;
      case 'recommendation_dismissed':
        return cs.error;
      default:
        return cs.outline;
    }
  }

  String _timelineLabel(String type) {
    switch (type) {
      case 'enrolled':
        return 'Enrolled';
      case 'survey_completed':
        return 'Survey completed';
      case 'recommendation_accepted':
        return 'Recommendation accepted';
      case 'recommendation_dismissed':
        return 'Recommendation dismissed';
      default:
        return type;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Participant ${widget.participantId}'),
        actions: [
          if (_exporting)
            const Padding(
              padding: EdgeInsets.all(14),
              child: SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            )
          else
            IconButton(
              icon: const Icon(Icons.download),
              tooltip: 'Export JSON',
              onPressed: _exportJson,
            ),
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'Refresh',
            onPressed: _load,
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error
              ? _ErrorView(onRetry: _load)
              : _ProgressBody(
                  progress: _progress!,
                  formatDate: _formatDate,
                  formatDateTime: _formatDateTime,
                  timelineIcon: _timelineIcon,
                  timelineColor: _timelineColor,
                  timelineLabel: _timelineLabel,
                ),
    );
  }
}

// ---------------------------------------------------------------------------
// Progress body
// ---------------------------------------------------------------------------

class _ProgressBody extends StatelessWidget {
  const _ProgressBody({
    required this.progress,
    required this.formatDate,
    required this.formatDateTime,
    required this.timelineIcon,
    required this.timelineColor,
    required this.timelineLabel,
  });

  final ParticipantProgress progress;
  final String Function(DateTime?) formatDate;
  final String Function(DateTime?) formatDateTime;
  final IconData Function(String) timelineIcon;
  final Color Function(BuildContext, String) timelineColor;
  final String Function(String) timelineLabel;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        _ProfileCard(profile: progress.profile, formatDate: formatDate),
        const SizedBox(height: 16),
        _SurveysSection(
          surveys: progress.surveys,
          formatDateTime: formatDateTime,
        ),
        const SizedBox(height: 16),
        _HabitsSection(habitsCount: progress.habitsCount),
        const SizedBox(height: 16),
        _RecommendationsCard(recommendations: progress.recommendations),
        const SizedBox(height: 16),
        _TimelineSection(
          timeline: progress.timeline,
          formatDateTime: formatDateTime,
          timelineIcon: timelineIcon,
          timelineColor: timelineColor,
          timelineLabel: timelineLabel,
        ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Profile card
// ---------------------------------------------------------------------------

class _ProfileCard extends StatelessWidget {
  const _ProfileCard({required this.profile, required this.formatDate});

  final ProfileStatus profile;
  final String Function(DateTime?) formatDate;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Icon(
              profile.completed ? Icons.check_circle : Icons.cancel,
              color: profile.completed ? Colors.green : cs.error,
              size: 32,
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Profile',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    profile.completed
                        ? 'Completed on ${formatDate(profile.completedAt)}'
                        : 'Not yet completed',
                    style: Theme.of(context).textTheme.bodyMedium,
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

// ---------------------------------------------------------------------------
// Surveys section
// ---------------------------------------------------------------------------

class _SurveysSection extends StatelessWidget {
  const _SurveysSection({
    required this.surveys,
    required this.formatDateTime,
  });

  final List<SurveyEntry> surveys;
  final String Function(DateTime?) formatDateTime;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.assignment_turned_in),
                const SizedBox(width: 8),
                Text(
                  'Surveys Completed (${surveys.length})',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ],
            ),
            if (surveys.isEmpty) ...[
              const SizedBox(height: 12),
              const Text('No surveys completed yet.'),
            ] else ...[
              const SizedBox(height: 8),
              ...surveys.map(
                (s) => ListTile(
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.check, size: 18),
                  title: Text(s.title.isNotEmpty ? s.title : s.id),
                  trailing: Text(
                    formatDateTime(s.completedAt),
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Habits section
// ---------------------------------------------------------------------------

class _HabitsSection extends StatelessWidget {
  const _HabitsSection({required this.habitsCount});

  final int habitsCount;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ExpansionTile(
        leading: const Icon(Icons.volunteer_activism),
        title: Text(
          'Habits Donated ($habitsCount)',
          style: Theme.of(context).textTheme.titleMedium,
        ),
        childrenPadding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        children: [
          Align(
            alignment: Alignment.centerLeft,
            child: Text(
              habitsCount == 0
                  ? 'No habits donated yet.'
                  : '$habitsCount habit${habitsCount == 1 ? '' : 's'} donated. '
                      'Individual habit details are available in the Habits Monitor.',
              style: Theme.of(context).textTheme.bodyMedium,
            ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Recommendations card
// ---------------------------------------------------------------------------

class _RecommendationsCard extends StatelessWidget {
  const _RecommendationsCard({required this.recommendations});

  final RecommendationCounts recommendations;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.recommend),
                const SizedBox(width: 8),
                Text(
                  'Recommendations',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: _CountChip(
                    icon: Icons.thumb_up,
                    label: 'Accepted',
                    count: recommendations.accepted,
                    color: Colors.teal,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _CountChip(
                    icon: Icons.thumb_down,
                    label: 'Dismissed',
                    count: recommendations.dismissed,
                    color: Theme.of(context).colorScheme.error,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _CountChip extends StatelessWidget {
  const _CountChip({
    required this.icon,
    required this.label,
    required this.count,
    required this.color,
  });

  final IconData icon;
  final String label;
  final int count;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: color.withAlpha(24),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withAlpha(80)),
      ),
      child: Row(
        children: [
          Icon(icon, color: color, size: 20),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '$count',
                style: Theme.of(context)
                    .textTheme
                    .titleLarge
                    ?.copyWith(color: color, fontWeight: FontWeight.bold),
              ),
              Text(
                label,
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Timeline section
// ---------------------------------------------------------------------------

class _TimelineSection extends StatelessWidget {
  const _TimelineSection({
    required this.timeline,
    required this.formatDateTime,
    required this.timelineIcon,
    required this.timelineColor,
    required this.timelineLabel,
  });

  final List<TimelineEntry> timeline;
  final String Function(DateTime?) formatDateTime;
  final IconData Function(String) timelineIcon;
  final Color Function(BuildContext, String) timelineColor;
  final String Function(String) timelineLabel;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.timeline),
                const SizedBox(width: 8),
                Text(
                  'Timeline',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ],
            ),
            if (timeline.isEmpty) ...[
              const SizedBox(height: 12),
              const Text('No timeline events yet.'),
            ] else ...[
              const SizedBox(height: 8),
              ...timeline.asMap().entries.map((entry) {
                final i = entry.key;
                final item = entry.value;
                final isLast = i == timeline.length - 1;
                final color = timelineColor(context, item.type);
                return IntrinsicHeight(
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      SizedBox(
                        width: 32,
                        child: Column(
                          children: [
                            CircleAvatar(
                              radius: 14,
                              backgroundColor: color.withAlpha(32),
                              child: Icon(
                                timelineIcon(item.type),
                                size: 16,
                                color: color,
                              ),
                            ),
                            if (!isLast)
                              Expanded(
                                child: Container(
                                  width: 2,
                                  color: Theme.of(context)
                                      .colorScheme
                                      .outlineVariant,
                                ),
                              ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Padding(
                          padding: EdgeInsets.only(bottom: isLast ? 0 : 16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                timelineLabel(item.type),
                                style: Theme.of(context)
                                    .textTheme
                                    .bodyMedium
                                    ?.copyWith(fontWeight: FontWeight.w600),
                              ),
                              if (item.detail.isNotEmpty)
                                Text(
                                  item.detail,
                                  style:
                                      Theme.of(context).textTheme.bodySmall,
                                ),
                              Text(
                                formatDateTime(item.timestamp),
                                style: Theme.of(context)
                                    .textTheme
                                    .bodySmall
                                    ?.copyWith(
                                      color: Theme.of(context)
                                          .colorScheme
                                          .outline,
                                    ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                );
              }),
            ],
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Error view
// ---------------------------------------------------------------------------

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.error_outline, size: 64, color: Colors.red),
          const SizedBox(height: 16),
          const Text('Failed to load participant progress.'),
          const SizedBox(height: 16),
          ElevatedButton.icon(
            onPressed: onRetry,
            icon: const Icon(Icons.refresh),
            label: const Text('Retry'),
          ),
        ],
      ),
    );
  }
}
