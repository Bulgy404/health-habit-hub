// Admin screen for the donated habits feed monitor.
//
// Features:
//  - ListView of habit donations (anonymized participantId, habitName,
//    category, donatedAt).
//  - Filter row: group dropdown, date range picker, category dropdown.
//  - Apply Filters button reloads the list with query params.
//  - Export CSV button opens the export URL via url_launcher.
//  - Auto-refresh every 30 seconds (toggle-able).
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../models/admin_habit_donation.dart';
import '../../services/admin_service.dart';

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

/// Live feed of donated habits with filters and CSV export.
class AdminHabitsScreen extends ConsumerStatefulWidget {
  const AdminHabitsScreen({super.key});

  @override
  ConsumerState<AdminHabitsScreen> createState() => _AdminHabitsScreenState();
}

class _AdminHabitsScreenState extends ConsumerState<AdminHabitsScreen> {
  // Filter state
  String _selectedGroup = '';
  String _selectedCategory = '';
  DateTimeRange? _dateRange;

  // Applied filter state (what was last used for the fetch)
  String _appliedGroup = '';
  String _appliedCategory = '';
  DateTimeRange? _appliedDateRange;

  // Data state
  List<HabitDonation> _donations = [];
  bool _loading = true;
  bool _error = false;

  // Auto-refresh
  bool _autoRefresh = true;
  Timer? _refreshTimer;

  static const _groups = ['', 'G1', 'G2', 'G3', 'G4'];
  static const _categories = [
    '',
    'exercise',
    'nutrition',
    'sleep',
    'mindfulness',
    'social',
    'other',
  ];

  @override
  void initState() {
    super.initState();
    _load();
    _startTimer();
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    super.dispose();
  }

  void _startTimer() {
    _refreshTimer?.cancel();
    if (_autoRefresh) {
      _refreshTimer = Timer.periodic(
        const Duration(seconds: 30),
        (_) => _load(silent: true),
      );
    }
  }

  void _toggleAutoRefresh() {
    setState(() => _autoRefresh = !_autoRefresh);
    _startTimer();
  }

  Future<void> _load({bool silent = false}) async {
    if (!silent) {
      setState(() {
        _loading = true;
        _error = false;
      });
    }
    try {
      final result = await ref.read(adminServiceProvider).fetchHabitsFeed(
            group: _appliedGroup,
            category: _appliedCategory,
            dateFrom: _appliedDateRange != null
                ? _isoDate(_appliedDateRange!.start)
                : null,
            dateTo: _appliedDateRange != null
                ? _isoDate(_appliedDateRange!.end)
                : null,
          );
      if (mounted) {
        setState(() {
          _donations = result.results;
          _loading = false;
          _error = false;
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

  void _applyFilters() {
    setState(() {
      _appliedGroup = _selectedGroup;
      _appliedCategory = _selectedCategory;
      _appliedDateRange = _dateRange;
    });
    _load();
  }

  Future<void> _exportCsv() async {
    try {
      final url = await ref.read(adminServiceProvider).exportHabitsCsvUrl(
            group: _appliedGroup,
            category: _appliedCategory,
            dateFrom:
                _appliedDateRange != null ? _isoDate(_appliedDateRange!.start) : null,
            dateTo:
                _appliedDateRange != null ? _isoDate(_appliedDateRange!.end) : null,
          );
      final uri = Uri.parse(url);
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not open export URL')),
        );
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('CSV export failed')),
        );
      }
    }
  }

  Future<void> _pickDateRange() async {
    final now = DateTime.now();
    final picked = await showDateRangePicker(
      context: context,
      firstDate: DateTime(2020),
      lastDate: now,
      initialDateRange: _dateRange ??
          DateTimeRange(
            start: now.subtract(const Duration(days: 30)),
            end: now,
          ),
    );
    if (picked != null) {
      setState(() => _dateRange = picked);
    }
  }

  String _isoDate(DateTime dt) =>
      '${dt.year.toString().padLeft(4, '0')}-'
      '${dt.month.toString().padLeft(2, '0')}-'
      '${dt.day.toString().padLeft(2, '0')}';

  String _dateRangeLabel() {
    if (_dateRange == null) return 'All dates';
    return '${_isoDate(_dateRange!.start)} – ${_isoDate(_dateRange!.end)}';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Donated Habits'),
        actions: [
          Tooltip(
            message: _autoRefresh ? 'Auto-refresh on' : 'Auto-refresh off',
            child: IconButton(
              icon: Icon(
                _autoRefresh ? Icons.timer : Icons.timer_off,
                color: _autoRefresh ? Colors.green : null,
              ),
              onPressed: _toggleAutoRefresh,
            ),
          ),
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'Refresh',
            onPressed: _load,
          ),
        ],
      ),
      body: Column(
        children: [
          _FilterBar(
            selectedGroup: _selectedGroup,
            selectedCategory: _selectedCategory,
            dateRangeLabel: _dateRangeLabel(),
            groups: _groups,
            categories: _categories,
            onGroupChanged: (v) => setState(() => _selectedGroup = v ?? ''),
            onCategoryChanged: (v) =>
                setState(() => _selectedCategory = v ?? ''),
            onPickDateRange: _pickDateRange,
            onClearDateRange: () => setState(() => _dateRange = null),
            onApply: _applyFilters,
            onExportCsv: _exportCsv,
          ),
          const Divider(height: 1),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _error
                    ? _ErrorView(onRetry: _load)
                    : _DonationListView(donations: _donations),
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
    required this.selectedGroup,
    required this.selectedCategory,
    required this.dateRangeLabel,
    required this.groups,
    required this.categories,
    required this.onGroupChanged,
    required this.onCategoryChanged,
    required this.onPickDateRange,
    required this.onClearDateRange,
    required this.onApply,
    required this.onExportCsv,
  });

  final String selectedGroup;
  final String selectedCategory;
  final String dateRangeLabel;
  final List<String> groups;
  final List<String> categories;
  final void Function(String?) onGroupChanged;
  final void Function(String?) onCategoryChanged;
  final VoidCallback onPickDateRange;
  final VoidCallback onClearDateRange;
  final VoidCallback onApply;
  final VoidCallback onExportCsv;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Row 1: group + category dropdowns
          Row(
            children: [
              Expanded(
                child: DropdownButtonHideUnderline(
                  child: InputDecorator(
                    decoration: const InputDecoration(
                      labelText: 'Group',
                      isDense: true,
                      border: OutlineInputBorder(),
                      contentPadding:
                          EdgeInsets.symmetric(horizontal: 8, vertical: 8),
                    ),
                    child: DropdownButton<String>(
                      value: selectedGroup,
                      isExpanded: true,
                      isDense: true,
                      onChanged: onGroupChanged,
                      items: groups
                          .map(
                            (g) => DropdownMenuItem(
                              value: g,
                              child: Text(g.isEmpty ? 'All' : g),
                            ),
                          )
                          .toList(),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: DropdownButtonHideUnderline(
                  child: InputDecorator(
                    decoration: const InputDecoration(
                      labelText: 'Category',
                      isDense: true,
                      border: OutlineInputBorder(),
                      contentPadding:
                          EdgeInsets.symmetric(horizontal: 8, vertical: 8),
                    ),
                    child: DropdownButton<String>(
                      value: selectedCategory,
                      isExpanded: true,
                      isDense: true,
                      onChanged: onCategoryChanged,
                      items: categories
                          .map(
                            (c) => DropdownMenuItem(
                              value: c,
                              child: Text(c.isEmpty ? 'All' : c),
                            ),
                          )
                          .toList(),
                    ),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          // Row 2: date range + action buttons
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: onPickDateRange,
                  icon: const Icon(Icons.date_range, size: 16),
                  label: Text(
                    dateRangeLabel,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 13),
                  ),
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                  ),
                ),
              ),
              if (dateRangeLabel != 'All dates')
                IconButton(
                  icon: const Icon(Icons.clear, size: 18),
                  tooltip: 'Clear date range',
                  onPressed: onClearDateRange,
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(),
                ),
              const SizedBox(width: 8),
              FilledButton(
                onPressed: onApply,
                style: FilledButton.styleFrom(
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  minimumSize: const Size(0, 36),
                ),
                child: const Text('Apply'),
              ),
              const SizedBox(width: 8),
              OutlinedButton.icon(
                onPressed: onExportCsv,
                icon: const Icon(Icons.download, size: 16),
                label: const Text('CSV'),
                style: OutlinedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  minimumSize: const Size(0, 36),
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Donation list
// ---------------------------------------------------------------------------

class _DonationListView extends StatelessWidget {
  const _DonationListView({required this.donations});

  final List<HabitDonation> donations;

  @override
  Widget build(BuildContext context) {
    if (donations.isEmpty) {
      return const Center(child: Text('No habit donations found'));
    }
    return ListView.separated(
      itemCount: donations.length,
      separatorBuilder: (_, _) => const Divider(height: 1),
      itemBuilder: (context, index) {
        final d = donations[index];
        return _DonationTile(donation: d);
      },
    );
  }
}

class _DonationTile extends StatelessWidget {
  const _DonationTile({required this.donation});

  final HabitDonation donation;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final dateStr =
        '${donation.donatedAt.year.toString().padLeft(4, '0')}-'
        '${donation.donatedAt.month.toString().padLeft(2, '0')}-'
        '${donation.donatedAt.day.toString().padLeft(2, '0')}';
    return ListTile(
      dense: true,
      title: Text(donation.habitName),
      subtitle: Text('${donation.participantId}  ·  ${donation.category}'),
      trailing: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Text(dateStr, style: const TextStyle(fontSize: 12)),
          if (donation.group != null)
            Container(
              margin: const EdgeInsets.only(top: 2),
              padding:
                  const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
              decoration: BoxDecoration(
                color: colorScheme.primaryContainer,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                donation.group!,
                style: TextStyle(
                  fontSize: 11,
                  color: colorScheme.onPrimaryContainer,
                ),
              ),
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
          const Icon(Icons.error_outline, size: 48, color: Colors.red),
          const SizedBox(height: 8),
          const Text('Failed to load habit donations'),
          const SizedBox(height: 8),
          TextButton.icon(
            onPressed: onRetry,
            icon: const Icon(Icons.refresh),
            label: const Text('Retry'),
          ),
        ],
      ),
    );
  }
}
