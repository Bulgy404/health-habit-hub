import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../models/admin_participant.dart';
import '../../services/admin_service.dart';

/// Admin screen that lists all enrolled participants.
///
/// Features:
///  - DataTable with columns: Username, Group, Enrolled, Last Active, Surveys %
///  - Search field filtering by username (case-insensitive)
///  - Group filter dropdown (All, G1–G4)
///  - Pagination: 50 rows per page with Previous / Next controls
///  - Tap any row to navigate to the participant detail screen
class AdminParticipantsScreen extends ConsumerStatefulWidget {
  const AdminParticipantsScreen({super.key});

  @override
  ConsumerState<AdminParticipantsScreen> createState() =>
      _AdminParticipantsScreenState();
}

class _AdminParticipantsScreenState
    extends ConsumerState<AdminParticipantsScreen> {
  static const _pageSize = 50;

  List<AdminParticipant> _all = [];
  bool _loading = true;
  bool _error = false;

  String _searchQuery = '';
  String _groupFilter = 'All';
  int _page = 0;

  final _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = false;
    });
    try {
      final service = ref.read(adminServiceProvider);
      final participants = await service.fetchParticipants();
      if (mounted) {
        setState(() {
          _all = participants;
          _loading = false;
          _page = 0;
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

  List<AdminParticipant> get _filtered {
    final q = _searchQuery.toLowerCase();
    return _all.where((p) {
      final matchesSearch = q.isEmpty || p.username.toLowerCase().contains(q);
      final matchesGroup =
          _groupFilter == 'All' || p.group == _groupFilter;
      return matchesSearch && matchesGroup;
    }).toList();
  }

  List<AdminParticipant> get _paginated {
    final filtered = _filtered;
    final start = _page * _pageSize;
    if (start >= filtered.length) return [];
    final end = (start + _pageSize).clamp(0, filtered.length);
    return filtered.sublist(start, end);
  }

  String _formatDate(DateTime? dt) {
    if (dt == null) return '—';
    return '${dt.year}-${dt.month.toString().padLeft(2, '0')}-'
        '${dt.day.toString().padLeft(2, '0')}';
  }

  String _formatSurveys(AdminParticipant p) {
    if (p.surveysTotal == null || p.surveysTotal == 0) return '—';
    final pct =
        ((p.surveysCompleted ?? 0) / p.surveysTotal! * 100).round();
    return '$pct %';
  }

  void _onSearch(String value) {
    setState(() {
      _searchQuery = value;
      _page = 0;
    });
  }

  void _onGroupFilter(String? value) {
    setState(() {
      _groupFilter = value ?? 'All';
      _page = 0;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Participants'),
        actions: [
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
              : Column(
                  children: [
                    _FilterBar(
                      searchController: _searchController,
                      groupFilter: _groupFilter,
                      onSearch: _onSearch,
                      onGroupFilter: _onGroupFilter,
                    ),
                    Expanded(
                      child: _filtered.isEmpty
                          ? const Center(child: Text('No participants found.'))
                          : SingleChildScrollView(
                              scrollDirection: Axis.vertical,
                              child: SingleChildScrollView(
                                scrollDirection: Axis.horizontal,
                                child: _ParticipantsTable(
                                  rows: _paginated,
                                  formatDate: _formatDate,
                                  formatSurveys: _formatSurveys,
                                  onTap: (p) => context.push(
                                    '/admin/participants/${p.id}',
                                  ),
                                ),
                              ),
                            ),
                    ),
                    _PaginationBar(
                      page: _page,
                      totalItems: _filtered.length,
                      pageSize: _pageSize,
                      onPrev: _page > 0
                          ? () => setState(() => _page--)
                          : null,
                      onNext:
                          (_page + 1) * _pageSize < _filtered.length
                              ? () => setState(() => _page++)
                              : null,
                    ),
                  ],
                ),
    );
  }
}

// ---------------------------------------------------------------------------
// Filter bar
// ---------------------------------------------------------------------------

class _FilterBar extends StatelessWidget {
  const _FilterBar({
    required this.searchController,
    required this.groupFilter,
    required this.onSearch,
    required this.onGroupFilter,
  });

  final TextEditingController searchController;
  final String groupFilter;
  final ValueChanged<String> onSearch;
  final ValueChanged<String?> onGroupFilter;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: searchController,
              decoration: const InputDecoration(
                hintText: 'Search by username…',
                prefixIcon: Icon(Icons.search),
                isDense: true,
                border: OutlineInputBorder(),
              ),
              onChanged: onSearch,
            ),
          ),
          const SizedBox(width: 12),
          DropdownButton<String>(
            value: groupFilter,
            items: const [
              DropdownMenuItem(value: 'All', child: Text('All groups')),
              DropdownMenuItem(value: 'G1', child: Text('G1')),
              DropdownMenuItem(value: 'G2', child: Text('G2')),
              DropdownMenuItem(value: 'G3', child: Text('G3')),
              DropdownMenuItem(value: 'G4', child: Text('G4')),
            ],
            onChanged: onGroupFilter,
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// DataTable
// ---------------------------------------------------------------------------

class _ParticipantsTable extends StatelessWidget {
  const _ParticipantsTable({
    required this.rows,
    required this.formatDate,
    required this.formatSurveys,
    required this.onTap,
  });

  final List<AdminParticipant> rows;
  final String Function(DateTime?) formatDate;
  final String Function(AdminParticipant) formatSurveys;
  final ValueChanged<AdminParticipant> onTap;

  @override
  Widget build(BuildContext context) {
    return DataTable(
      headingRowColor: WidgetStateProperty.all(
        Theme.of(context).colorScheme.surfaceContainerHighest,
      ),
      columns: const [
        DataColumn(label: Text('Username')),
        DataColumn(label: Text('Group')),
        DataColumn(label: Text('Enrolled')),
        DataColumn(label: Text('Last Active')),
        DataColumn(label: Text('Surveys %')),
      ],
      rows: rows
          .map(
            (p) => DataRow(
              onSelectChanged: (_) => onTap(p),
              cells: [
                DataCell(Text(p.username)),
                DataCell(Text(p.group.isNotEmpty ? p.group : '—')),
                DataCell(Text(formatDate(p.enrolledAt))),
                DataCell(Text(formatDate(p.lastActiveAt))),
                DataCell(Text(formatSurveys(p))),
              ],
            ),
          )
          .toList(),
    );
  }
}

// ---------------------------------------------------------------------------
// Pagination controls
// ---------------------------------------------------------------------------

class _PaginationBar extends StatelessWidget {
  const _PaginationBar({
    required this.page,
    required this.totalItems,
    required this.pageSize,
    required this.onPrev,
    required this.onNext,
  });

  final int page;
  final int totalItems;
  final int pageSize;
  final VoidCallback? onPrev;
  final VoidCallback? onNext;

  @override
  Widget build(BuildContext context) {
    final from = totalItems == 0 ? 0 : page * pageSize + 1;
    final to = ((page + 1) * pageSize).clamp(0, totalItems);

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.end,
        children: [
          Text(
            '$from–$to of $totalItems',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(width: 16),
          TextButton.icon(
            onPressed: onPrev,
            icon: const Icon(Icons.chevron_left),
            label: const Text('Previous'),
          ),
          const SizedBox(width: 8),
          TextButton.icon(
            onPressed: onNext,
            icon: const Icon(Icons.chevron_right),
            label: const Text('Next'),
            iconAlignment: IconAlignment.end,
          ),
        ],
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
          const Text('Failed to load participants.'),
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
