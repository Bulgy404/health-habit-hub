// Admin screens for survey management.
//
// Contains two screens:
//  - AdminSurveysScreen  : list of all surveys with status badges and actions
//  - AdminSurveyEditorScreen : full JSON editor for a single survey
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../models/admin_survey.dart';
import '../../services/admin_service.dart';

// ---------------------------------------------------------------------------
// Survey List Screen
// ---------------------------------------------------------------------------

/// Lists all surveys with title, type badge, status badge, and group chips.
///
/// Publish / Archive action buttons are shown per row.
/// FAB opens a dialog to create a new survey.
/// Tapping a row navigates to [AdminSurveyEditorScreen].
class AdminSurveysScreen extends ConsumerStatefulWidget {
  const AdminSurveysScreen({super.key});

  @override
  ConsumerState<AdminSurveysScreen> createState() =>
      _AdminSurveysScreenState();
}

class _AdminSurveysScreenState extends ConsumerState<AdminSurveysScreen> {
  List<AdminSurvey> _surveys = [];
  bool _loading = true;
  bool _error = false;

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
      final surveys = await ref.read(adminServiceProvider).fetchSurveys();
      if (mounted) setState(() { _surveys = surveys; _loading = false; });
    } catch (_) {
      if (mounted) setState(() { _loading = false; _error = true; });
    }
  }

  Future<void> _changeStatus(AdminSurvey survey, String status) async {
    try {
      await ref.read(adminServiceProvider).updateSurveyStatus(survey.id, status);
      await _load();
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Failed to update status')),
        );
      }
    }
  }

  void _showCreateDialog() {
    showDialog<void>(
      context: context,
      builder: (_) => _CreateSurveyDialog(
        service: ref.read(adminServiceProvider),
        onCreated: _load,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Surveys'),
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
        tooltip: 'New survey',
        child: const Icon(Icons.add),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error
              ? _ErrorView(onRetry: _load)
              : _SurveyListView(
                  surveys: _surveys,
                  onStatusChange: _changeStatus,
                  onTap: (s) =>
                      context.push('/admin/surveys/${s.id}', extra: s),
                ),
    );
  }
}

// ---------------------------------------------------------------------------
// Survey list view
// ---------------------------------------------------------------------------

class _SurveyListView extends StatelessWidget {
  const _SurveyListView({
    required this.surveys,
    required this.onStatusChange,
    required this.onTap,
  });

  final List<AdminSurvey> surveys;
  final void Function(AdminSurvey, String) onStatusChange;
  final void Function(AdminSurvey) onTap;

  @override
  Widget build(BuildContext context) {
    if (surveys.isEmpty) {
      return const Center(child: Text('No surveys found'));
    }
    return ListView.separated(
      itemCount: surveys.length,
      separatorBuilder: (_, _) => const Divider(height: 1),
      itemBuilder: (context, index) {
        final s = surveys[index];
        return _SurveyTile(
          survey: s,
          onStatusChange: (status) => onStatusChange(s, status),
          onTap: () => onTap(s),
        );
      },
    );
  }
}

class _SurveyTile extends StatelessWidget {
  const _SurveyTile({
    required this.survey,
    required this.onStatusChange,
    required this.onTap,
  });

  final AdminSurvey survey;
  final void Function(String) onStatusChange;
  final VoidCallback onTap;

  Color _statusColor(String status) => switch (status) {
        'published' => Colors.green,
        'archived' => Colors.grey,
        _ => Colors.orange, // draft
      };

  @override
  Widget build(BuildContext context) {
    final statusColor = _statusColor(survey.status);
    return ListTile(
      onTap: onTap,
      title: Text(survey.title),
      subtitle: Wrap(
        spacing: 4,
        runSpacing: 4,
        children: [
          Chip(
            label: Text(survey.type),
            materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
            padding: EdgeInsets.zero,
            visualDensity: VisualDensity.compact,
          ),
          ...survey.assignedGroups.map(
            (g) => Chip(
              label: Text(g),
              materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
              padding: EdgeInsets.zero,
              visualDensity: VisualDensity.compact,
            ),
          ),
        ],
      ),
      trailing: Wrap(
        spacing: 4,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
            decoration: BoxDecoration(
              color: statusColor.withAlpha(30),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: statusColor),
            ),
            child: Text(
              survey.status,
              style: TextStyle(color: statusColor, fontSize: 12),
            ),
          ),
          if (survey.status != 'published')
            TextButton(
              onPressed: () => onStatusChange('published'),
              style: TextButton.styleFrom(
                padding: const EdgeInsets.symmetric(horizontal: 6),
                minimumSize: Size.zero,
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
              child: const Text('Publish'),
            ),
          if (survey.status != 'archived')
            TextButton(
              onPressed: () => onStatusChange('archived'),
              style: TextButton.styleFrom(
                padding: const EdgeInsets.symmetric(horizontal: 6),
                minimumSize: Size.zero,
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
              child: const Text('Archive'),
            ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Create survey dialog
// ---------------------------------------------------------------------------

class _CreateSurveyDialog extends StatefulWidget {
  const _CreateSurveyDialog({
    required this.service,
    required this.onCreated,
  });

  final AdminService service;
  final VoidCallback onCreated;

  @override
  State<_CreateSurveyDialog> createState() => _CreateSurveyDialogState();
}

class _CreateSurveyDialogState extends State<_CreateSurveyDialog> {
  final _titleController = TextEditingController();
  String _type = 'habit-donation';
  bool _loading = false;
  String? _error;

  static const _types = ['habit-donation', 'profile', 'custom'];

  @override
  void dispose() {
    _titleController.dispose();
    super.dispose();
  }

  Future<void> _create() async {
    final title = _titleController.text.trim();
    if (title.isEmpty) {
      setState(() => _error = 'Title is required');
      return;
    }
    setState(() { _loading = true; _error = null; });
    try {
      await widget.service.createSurvey(title: title, type: _type);
      if (mounted) {
        Navigator.of(context).pop();
        widget.onCreated();
      }
    } catch (_) {
      if (mounted) {
        setState(() { _loading = false; _error = 'Failed to create survey'; });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('New Survey'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          TextField(
            controller: _titleController,
            decoration: const InputDecoration(labelText: 'Title'),
            enabled: !_loading,
            autofocus: true,
          ),
          const SizedBox(height: 12),
          DropdownButtonHideUnderline(
            child: InputDecorator(
              decoration: const InputDecoration(labelText: 'Type'),
              child: DropdownButton<String>(
                value: _type,
                isExpanded: true,
                onChanged: _loading
                    ? null
                    : (v) => setState(() => _type = v ?? _type),
                items: _types
                    .map((t) => DropdownMenuItem(value: t, child: Text(t)))
                    .toList(),
              ),
            ),
          ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                _error!,
                style: const TextStyle(color: Colors.red),
              ),
            ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: _loading ? null : () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        ElevatedButton(
          onPressed: _loading ? null : _create,
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
          const Text('Failed to load surveys'),
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

// ---------------------------------------------------------------------------
// Survey Editor Screen
// ---------------------------------------------------------------------------

/// Full JSON editor for a single survey.
///
/// Pre-populates the editor with [initialSurvey] if provided; otherwise
/// fetches the survey by [surveyId] from the API.
class AdminSurveyEditorScreen extends ConsumerStatefulWidget {
  const AdminSurveyEditorScreen({
    super.key,
    required this.surveyId,
    this.initialSurvey,
  });

  final String surveyId;
  final AdminSurvey? initialSurvey;

  @override
  ConsumerState<AdminSurveyEditorScreen> createState() =>
      _AdminSurveyEditorScreenState();
}

class _AdminSurveyEditorScreenState
    extends ConsumerState<AdminSurveyEditorScreen> {
  final _jsonController = TextEditingController();

  AdminSurvey? _survey;
  List<String> _selectedGroups = [];
  bool _loading = true;
  bool _saving = false;
  bool _error = false;

  @override
  void initState() {
    super.initState();
    final initial = widget.initialSurvey;
    if (initial != null) {
      _initFromSurvey(initial);
      setState(() => _loading = false);
    } else {
      _load();
    }
  }

  @override
  void dispose() {
    _jsonController.dispose();
    super.dispose();
  }

  void _initFromSurvey(AdminSurvey survey) {
    _survey = survey;
    _selectedGroups = List<String>.from(survey.assignedGroups);
    final pretty = const JsonEncoder.withIndent('  ').convert(survey.jsonSchema);
    _jsonController.text = pretty;
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = false; });
    try {
      final surveys = await ref.read(adminServiceProvider).fetchSurveys();
      final survey = surveys.firstWhere(
        (s) => s.id == widget.surveyId,
        orElse: () => throw StateError('survey not found'),
      );
      if (mounted) {
        _initFromSurvey(survey);
        setState(() => _loading = false);
      }
    } catch (_) {
      if (mounted) setState(() { _loading = false; _error = true; });
    }
  }

  Future<void> _save() async {
    Map<String, dynamic> parsed;
    try {
      parsed = jsonDecode(_jsonController.text) as Map<String, dynamic>;
    } catch (_) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Invalid JSON — please fix before saving')),
      );
      return;
    }

    setState(() => _saving = true);
    try {
      final service = ref.read(adminServiceProvider);
      await service.updateSurvey(widget.surveyId, {'jsonSchema': parsed});
      await service.updateSurveyGroups(widget.surveyId, _selectedGroups);
      if (mounted) {
        setState(() => _saving = false);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Survey saved')),
        );
      }
    } catch (_) {
      if (mounted) {
        setState(() => _saving = false);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Failed to save survey')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_survey?.title ?? 'Survey Editor'),
        actions: [
          if (!_loading)
            _saving
                ? const Padding(
                    padding: EdgeInsets.all(12),
                    child: SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                  )
                : TextButton(
                    onPressed: _save,
                    child: const Text('Save'),
                  ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error
              ? Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Text('Failed to load survey'),
                      const SizedBox(height: 8),
                      TextButton.icon(
                        onPressed: _load,
                        icon: const Icon(Icons.refresh),
                        label: const Text('Retry'),
                      ),
                    ],
                  ),
                )
              : _EditorBody(
                  jsonController: _jsonController,
                  selectedGroups: _selectedGroups,
                  onGroupToggle: (g, v) => setState(() {
                    if (v) {
                      _selectedGroups = [..._selectedGroups, g];
                    } else {
                      _selectedGroups =
                          _selectedGroups.where((x) => x != g).toList();
                    }
                  }),
                ),
    );
  }
}

// ---------------------------------------------------------------------------
// Editor body widget
// ---------------------------------------------------------------------------

class _EditorBody extends StatelessWidget {
  const _EditorBody({
    required this.jsonController,
    required this.selectedGroups,
    required this.onGroupToggle,
  });

  final TextEditingController jsonController;
  final List<String> selectedGroups;
  final void Function(String group, bool value) onGroupToggle;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          TextField(
            controller: jsonController,
            maxLines: null,
            style: const TextStyle(fontFamily: 'monospace', fontSize: 13),
            decoration: const InputDecoration(
              labelText: 'JSON Schema',
              border: OutlineInputBorder(),
              alignLabelWithHint: true,
            ),
          ),
          const SizedBox(height: 16),
          const Text(
            'Assign to Groups',
            style: TextStyle(fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            children: ['G1', 'G2', 'G3', 'G4'].map((g) {
              return FilterChip(
                label: Text(g),
                selected: selectedGroups.contains(g),
                onSelected: (v) => onGroupToggle(g, v),
              );
            }).toList(),
          ),
        ],
      ),
    );
  }
}
