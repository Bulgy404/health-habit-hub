import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

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

  Future<void> _changeGroup(AdminParticipant p, String newGroup) async {
    // Optimistic update
    setState(() {
      final idx = _all.indexWhere((e) => e.id == p.id);
      if (idx >= 0) {
        final updated = AdminParticipant(
          id: p.id,
          username: p.username,
          group: newGroup,
          enrolledAt: p.enrolledAt,
          lastActiveAt: p.lastActiveAt,
          surveysCompleted: p.surveysCompleted,
          surveysTotal: p.surveysTotal,
        );
        _all = List.of(_all)..[idx] = updated;
      }
    });
    try {
      await ref.read(adminServiceProvider).updateParticipantGroup(p.id, newGroup);
    } catch (_) {
      await _load();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Failed to update group.')),
        );
      }
    }
  }

  Future<void> _confirmDelete(AdminParticipant p) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Participant'),
        content: const Text(
          'This will anonymize participant data. Cannot be undone.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: Theme.of(ctx).colorScheme.error,
              foregroundColor: Theme.of(ctx).colorScheme.onError,
            ),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await ref.read(adminServiceProvider).deleteParticipant(p.id);
      setState(() {
        _all = _all.where((e) => e.id != p.id).toList();
      });
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Failed to delete participant.')),
        );
      }
    }
  }

  Future<void> _showCreateDialog() async {
    await showDialog<void>(
      context: context,
      builder: (ctx) => _CreateParticipantDialog(
        onCreated: (username, tokenCardUrl) async {
          // Show snackbar
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text('Participant $username created')),
            );
          }
          // Open token card URL
          final uri = Uri.parse(tokenCardUrl);
          if (await canLaunchUrl(uri)) {
            await launchUrl(uri, mode: LaunchMode.externalApplication);
          }
          // Reload list
          await _load();
        },
        adminService: ref.read(adminServiceProvider),
      ),
    );
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
      floatingActionButton: FloatingActionButton(
        onPressed: _showCreateDialog,
        tooltip: 'Create participant',
        child: const Icon(Icons.person_add),
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
                                  onGroupChange: _changeGroup,
                                  onDelete: _confirmDelete,
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
    required this.onGroupChange,
    required this.onDelete,
  });

  final List<AdminParticipant> rows;
  final String Function(DateTime?) formatDate;
  final String Function(AdminParticipant) formatSurveys;
  final ValueChanged<AdminParticipant> onTap;
  final void Function(AdminParticipant, String) onGroupChange;
  final ValueChanged<AdminParticipant> onDelete;

  static const _groups = ['G1', 'G2', 'G3', 'G4'];

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
        DataColumn(label: Text('Actions')),
      ],
      rows: rows
          .map(
            (p) => DataRow(
              onSelectChanged: (_) => onTap(p),
              cells: [
                DataCell(Text(p.username)),
                DataCell(
                  DropdownButtonHideUnderline(
                    child: DropdownButton<String>(
                      value: _groups.contains(p.group) ? p.group : null,
                      isDense: true,
                      hint: const Text('—'),
                      items: _groups
                          .map(
                            (g) =>
                                DropdownMenuItem(value: g, child: Text(g)),
                          )
                          .toList(),
                      onChanged: (v) {
                        if (v != null) onGroupChange(p, v);
                      },
                    ),
                  ),
                ),
                DataCell(Text(formatDate(p.enrolledAt))),
                DataCell(Text(formatDate(p.lastActiveAt))),
                DataCell(Text(formatSurveys(p))),
                DataCell(
                  IconButton(
                    icon: const Icon(Icons.delete_outline),
                    tooltip: 'Delete participant',
                    color: Theme.of(context).colorScheme.error,
                    onPressed: () => onDelete(p),
                  ),
                ),
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

// ---------------------------------------------------------------------------
// Create participant dialog
// ---------------------------------------------------------------------------

/// Dialog for creating a new participant.
///
/// Shows a group selector (G1–G4) and a token card format selector
/// (QR / Print / Both). On confirm, calls POST /api/v1/admin/participants
/// and invokes [onCreated] with the new username and the token card URL.
class _CreateParticipantDialog extends StatefulWidget {
  const _CreateParticipantDialog({
    required this.onCreated,
    required this.adminService,
  });

  /// Called after a successful creation with the new username and the
  /// token card URL to open.
  final Future<void> Function(String username, String tokenCardUrl) onCreated;
  final AdminService adminService;

  @override
  State<_CreateParticipantDialog> createState() =>
      _CreateParticipantDialogState();
}

class _CreateParticipantDialogState extends State<_CreateParticipantDialog> {
  String _group = 'G1';
  String _format = 'both';
  bool _loading = false;
  String? _error;

  static const _groups = ['G1', 'G2', 'G3', 'G4'];
  static const _formats = [
    ('both', 'QR + Print'),
    ('qr', 'QR only'),
    ('print', 'Print only'),
  ];

  Future<void> _submit() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final result = await widget.adminService.createParticipant(
        group: _group,
        tokenCardFormat: _format,
      );
      final username = (result['username'] ?? '').toString();
      final userId = (result['userId'] ?? '').toString();
      // Prefer tokenCardUrl returned by backend; fall back to derived URL.
      final tokenCardUrl = result['tokenCardUrl']?.toString() ??
          widget.adminService.tokenCardUrl(userId, _format);
      if (mounted) Navigator.of(context).pop();
      await widget.onCreated(username, tokenCardUrl);
    } catch (e) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = 'Failed to create participant. Please try again.';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Create Participant'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Study group'),
          const SizedBox(height: 4),
          InputDecorator(
            decoration: const InputDecoration(
              border: OutlineInputBorder(),
              isDense: true,
              contentPadding:
                  EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            ),
            child: DropdownButtonHideUnderline(
              child: DropdownButton<String>(
                value: _group,
                isDense: true,
                isExpanded: true,
                items: _groups
                    .map(
                      (g) => DropdownMenuItem(value: g, child: Text(g)),
                    )
                    .toList(),
                onChanged: _loading
                    ? null
                    : (v) => setState(() => _group = v ?? _group),
              ),
            ),
          ),
          const SizedBox(height: 16),
          const Text('Token card format'),
          const SizedBox(height: 4),
          InputDecorator(
            decoration: const InputDecoration(
              border: OutlineInputBorder(),
              isDense: true,
              contentPadding:
                  EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            ),
            child: DropdownButtonHideUnderline(
              child: DropdownButton<String>(
                value: _format,
                isDense: true,
                isExpanded: true,
                items: _formats
                    .map(
                      (f) =>
                          DropdownMenuItem(value: f.$1, child: Text(f.$2)),
                    )
                    .toList(),
                onChanged: _loading
                    ? null
                    : (v) => setState(() => _format = v ?? _format),
              ),
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(
              _error!,
              style: TextStyle(
                color: Theme.of(context).colorScheme.error,
                fontSize: 13,
              ),
            ),
          ],
        ],
      ),
      actions: [
        TextButton(
          onPressed: _loading ? null : () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: _loading ? null : _submit,
          child: _loading
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Text('Create'),
        ),
      ],
    );
  }
}
