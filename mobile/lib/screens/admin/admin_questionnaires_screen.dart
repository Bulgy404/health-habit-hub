// Admin screen for managing native questionnaire definitions.
//
// Library tab: pre-loaded validated instruments (SLIQ, RAND-36, SRHI) — read-only preview.
// Custom tab: researcher-created questionnaires — create, edit, delete.
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/admin_questionnaire.dart';
import '../../services/admin_service.dart';

class AdminQuestionnairesScreen extends ConsumerStatefulWidget {
  const AdminQuestionnairesScreen({super.key});

  @override
  ConsumerState<AdminQuestionnairesScreen> createState() =>
      _AdminQuestionnairesScreenState();
}

class _AdminQuestionnairesScreenState
    extends ConsumerState<AdminQuestionnairesScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs;
  List<AdminQuestionnaire> _all = [];
  bool _loading = true;
  bool _error = false;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 2, vsync: this);
    _load();
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  List<AdminQuestionnaire> get _library =>
      _all.where((q) => q.isLibrary).toList();
  List<AdminQuestionnaire> get _custom =>
      _all.where((q) => !q.isLibrary).toList();

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = false;
    });
    try {
      final items =
          await ref.read(adminServiceProvider).fetchAdminQuestionnaires();
      if (mounted) setState(() { _all = items; _loading = false; });
    } catch (_) {
      if (mounted) setState(() { _loading = false; _error = true; });
    }
  }

  void _showCreateDialog() {
    showDialog<void>(
      context: context,
      builder: (_) => _QuestionnaireEditorDialog(
        service: ref.read(adminServiceProvider),
        onSaved: _load,
      ),
    );
  }

  void _showEditDialog(AdminQuestionnaire q) {
    showDialog<void>(
      context: context,
      builder: (_) => _QuestionnaireEditorDialog(
        service: ref.read(adminServiceProvider),
        existing: q,
        onSaved: _load,
      ),
    );
  }

  Future<void> _delete(AdminQuestionnaire q) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete questionnaire?'),
        content: Text(
            'Delete "${q.title}"? This cannot be undone.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel')),
          TextButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Delete', style: TextStyle(color: Colors.red))),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await ref.read(adminServiceProvider).deleteQuestionnaire(q.id);
      await _load();
    } catch (e) {
      if (!mounted) return;
      final String message;
      if (e is DioException) {
        final status = e.response?.statusCode;
        if (status == 409) {
          message = 'Cannot delete: questionnaire is assigned to an active study.';
        } else if (status == 403) {
          message = 'Cannot delete a library questionnaire.';
        } else {
          message = 'Failed to delete questionnaire.';
        }
      } else {
        message = 'Failed to delete questionnaire.';
      }
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Questionnaires'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'Refresh',
            onPressed: _load,
          ),
        ],
        bottom: TabBar(
          controller: _tabs,
          tabs: const [Tab(text: 'Library'), Tab(text: 'Custom')],
        ),
      ),
      floatingActionButton: ListenableBuilder(
        listenable: _tabs,
        builder: (context, child) => _tabs.index == 1
            ? FloatingActionButton(
                onPressed: _showCreateDialog,
                tooltip: 'New questionnaire',
                child: const Icon(Icons.add),
              )
            : const SizedBox.shrink(),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error
              ? Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Text('Failed to load questionnaires.'),
                      const SizedBox(height: 12),
                      ElevatedButton(
                          onPressed: _load, child: const Text('Retry')),
                    ],
                  ),
                )
              : TabBarView(
                  controller: _tabs,
                  children: [
                    _QuestionnaireList(
                      items: _library,
                      readOnly: true,
                      emptyMessage: 'No library questionnaires found.',
                      onEdit: (_) {},
                      onDelete: (_) {},
                    ),
                    _QuestionnaireList(
                      items: _custom,
                      readOnly: false,
                      emptyMessage:
                          'No custom questionnaires yet.\nTap + to create one.',
                      onEdit: _showEditDialog,
                      onDelete: _delete,
                    ),
                  ],
                ),
    );
  }
}

// ---------------------------------------------------------------------------

class _QuestionnaireList extends StatelessWidget {
  const _QuestionnaireList({
    required this.items,
    required this.readOnly,
    required this.emptyMessage,
    required this.onEdit,
    required this.onDelete,
  });

  final List<AdminQuestionnaire> items;
  final bool readOnly;
  final String emptyMessage;
  final void Function(AdminQuestionnaire) onEdit;
  final void Function(AdminQuestionnaire) onDelete;

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) {
      return Center(
        child: Text(emptyMessage,
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.grey[600])),
      );
    }
    return ListView.separated(
      padding: const EdgeInsets.all(16),
      separatorBuilder: (context, index) => const SizedBox(height: 8),
      itemCount: items.length,
      itemBuilder: (context, i) {
        final q = items[i];
        return Card(
          child: ListTile(
            title: Text(q.title,
                style: const TextStyle(fontWeight: FontWeight.w600)),
            subtitle: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (q.description.isNotEmpty)
                  Text(q.description,
                      maxLines: 2, overflow: TextOverflow.ellipsis),
                const SizedBox(height: 4),
                Row(children: [
                  _Chip(
                      label: '${q.questionCount} items',
                      color: Colors.blueGrey),
                  const SizedBox(width: 6),
                  if (q.isLibrary)
                    _Chip(label: 'Library', color: Colors.teal),
                  if (!q.active) ...[
                    const SizedBox(width: 6),
                    _Chip(label: 'Inactive', color: Colors.orange),
                  ],
                ]),
              ],
            ),
            trailing: readOnly
                ? null
                : Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      IconButton(
                        icon: const Icon(Icons.edit_outlined),
                        tooltip: 'Edit',
                        onPressed: () => onEdit(q),
                      ),
                      IconButton(
                        icon: const Icon(Icons.delete_outline,
                            color: Colors.red),
                        tooltip: 'Delete',
                        onPressed: () => onDelete(q),
                      ),
                    ],
                  ),
          ),
        );
      },
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.label, required this.color});
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color.withAlpha(26),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withAlpha(77)),
      ),
      child: Text(label,
          style: TextStyle(fontSize: 11, color: color, fontWeight: FontWeight.w600)),
    );
  }
}

// ---------------------------------------------------------------------------
// Questionnaire editor dialog — create or edit a custom questionnaire.

class _QuestionnaireEditorDialog extends StatefulWidget {
  const _QuestionnaireEditorDialog({
    required this.service,
    required this.onSaved,
    this.existing,
  });

  final AdminService service;
  final AdminQuestionnaire? existing;
  final VoidCallback onSaved;

  @override
  State<_QuestionnaireEditorDialog> createState() =>
      _QuestionnaireEditorDialogState();
}

class _QuestionnaireEditorDialogState
    extends State<_QuestionnaireEditorDialog> {
  final _titleCtrl = TextEditingController();
  final _descCtrl = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  bool _saving = false;
  bool _loadingQuestions = false;

  // Each entry matches the backend question schema.
  final List<Map<String, dynamic>> _questions = [];

  @override
  void initState() {
    super.initState();
    final q = widget.existing;
    if (q != null) {
      _titleCtrl.text = q.title;
      _descCtrl.text = q.description;
      _fetchQuestions(q.id);
    }
  }

  @override
  void dispose() {
    _titleCtrl.dispose();
    _descCtrl.dispose();
    super.dispose();
  }

  Future<void> _fetchQuestions(String id) async {
    setState(() => _loadingQuestions = true);
    try {
      final full = await widget.service.fetchQuestionnaireFull(id);
      final rawQuestions = full['questions'] as List<dynamic>? ?? [];
      final questions = rawQuestions
          .map((q) => Map<String, dynamic>.from(q as Map))
          .toList();
      if (mounted) setState(() { _questions.addAll(questions); _loadingQuestions = false; });
    } catch (_) {
      if (mounted) setState(() => _loadingQuestions = false);
    }
  }

  void _addQuestion() {
    setState(() {
      // Use timestamp-based ID to avoid collisions when questions are removed and re-added.
      final id = 'q_${DateTime.now().millisecondsSinceEpoch}';
      _questions.add({
        'id': id,
        'text': '',
        'type': 'text',
        'required': true,
        'options': <Map<String, String>>[],
      });
    });
  }

  void _removeQuestion(int index) {
    setState(() => _questions.removeAt(index));
  }

  Future<void> _save() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    for (final q in _questions) {
      if ((q['text'] as String? ?? '').trim().isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('All questions must have text.')));
        return;
      }
    }
    setState(() => _saving = true);
    try {
      if (widget.existing == null) {
        await widget.service.createQuestionnaire(
          title: _titleCtrl.text.trim(),
          description: _descCtrl.text.trim(),
          questions: _questions,
        );
      } else {
        await widget.service.updateQuestionnaire(
          widget.existing!.id,
          title: _titleCtrl.text.trim(),
          description: _descCtrl.text.trim(),
          questions: _questions,
        );
      }
      widget.onSaved();
      if (mounted) Navigator.of(context).pop();
    } catch (_) {
      if (mounted) {
        setState(() => _saving = false);
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Failed to save questionnaire.')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final isEdit = widget.existing != null;
    return AlertDialog(
      title: Text(isEdit ? 'Edit Questionnaire' : 'New Questionnaire'),
      insetPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
      content: SizedBox(
        width: double.maxFinite,
        child: Form(
          key: _formKey,
          child: _loadingQuestions
              ? const SizedBox(
                  height: 120,
                  child: Center(child: CircularProgressIndicator()))
              : SingleChildScrollView(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      TextFormField(
                        controller: _titleCtrl,
                        decoration: const InputDecoration(labelText: 'Title *'),
                        validator: (v) =>
                            (v == null || v.trim().isEmpty) ? 'Required' : null,
                      ),
                      const SizedBox(height: 12),
                      TextFormField(
                        controller: _descCtrl,
                        decoration:
                            const InputDecoration(labelText: 'Description'),
                        maxLines: 3,
                      ),
                      const SizedBox(height: 20),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text('Questions (${_questions.length})',
                              style: const TextStyle(
                                  fontWeight: FontWeight.w600)),
                          TextButton.icon(
                            icon: const Icon(Icons.add, size: 18),
                            label: const Text('Add'),
                            onPressed: _addQuestion,
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      ..._questions.asMap().entries.map((entry) {
                        final idx = entry.key;
                        final q = entry.value;
                        return _QuestionEditor(
                          key: ValueKey(q['id']),
                          index: idx,
                          data: q,
                          onChanged: (updated) =>
                              setState(() => _questions[idx] = updated),
                          onRemove: () => _removeQuestion(idx),
                        );
                      }),
                      if (_questions.isEmpty)
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          child: Text(
                              'No questions yet. Tap "Add" to add one.',
                              style: TextStyle(
                                  color: Colors.grey[600], fontSize: 13)),
                        ),
                    ],
                  ),
                ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: (_saving || _loadingQuestions)
              ? null
              : () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: (_saving || _loadingQuestions) ? null : _save,
          child: _saving
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2))
              : Text(isEdit ? 'Save' : 'Create'),
        ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Inline question editor row.

class _QuestionEditor extends StatefulWidget {
  const _QuestionEditor({
    super.key,
    required this.index,
    required this.data,
    required this.onChanged,
    required this.onRemove,
  });

  final int index;
  final Map<String, dynamic> data;
  final void Function(Map<String, dynamic>) onChanged;
  final VoidCallback onRemove;

  @override
  State<_QuestionEditor> createState() => _QuestionEditorState();
}

class _QuestionEditorState extends State<_QuestionEditor> {
  late TextEditingController _textCtrl;
  late String _type;
  late bool _required;
  // Parallel list of controllers — one per option — avoids initialValue stale-on-rebuild.
  late List<Map<String, String>> _options;
  final List<TextEditingController> _optionCtrls = [];

  static const _types = [
    ('text', 'Open text'),
    ('single_choice', 'Single choice'),
    ('multi_choice', 'Multi choice'),
    ('scale', 'Scale'),
  ];

  @override
  void initState() {
    super.initState();
    _textCtrl = TextEditingController(
        text: widget.data['text'] as String? ?? '');
    _type = widget.data['type'] as String? ?? 'text';
    _required = widget.data['required'] as bool? ?? true;
    _options = List<Map<String, String>>.from(
        (widget.data['options'] as List<dynamic>? ?? [])
            .map((o) => Map<String, String>.from(o as Map)));
    _rebuildOptionControllers();
  }

  void _rebuildOptionControllers() {
    for (final c in _optionCtrls) {
      c.dispose();
    }
    _optionCtrls
      ..clear()
      ..addAll(_options.map((o) => TextEditingController(text: o['label'])));
  }

  @override
  void dispose() {
    _textCtrl.dispose();
    for (final c in _optionCtrls) {
      c.dispose();
    }
    super.dispose();
  }

  void _notify() {
    widget.onChanged({
      'id': widget.data['id'],
      'text': _textCtrl.text,
      'type': _type,
      'required': _required,
      if (_options.isNotEmpty) 'options': List<Map<String, String>>.from(_options),
    });
  }

  void _addOption() {
    setState(() {
      _options.add({'value': '${_options.length + 1}', 'label': ''});
      _optionCtrls.add(TextEditingController());
    });
    _notify();
  }

  void _removeOption(int i) {
    setState(() {
      _options.removeAt(i);
      _optionCtrls[i].dispose();
      _optionCtrls.removeAt(i);
    });
    _notify();
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text('Q${widget.index + 1}',
                      style: const TextStyle(
                          fontWeight: FontWeight.w700, fontSize: 12)),
                ),
                IconButton(
                  icon: const Icon(Icons.close, size: 18),
                  onPressed: widget.onRemove,
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(),
                ),
              ],
            ),
            const SizedBox(height: 6),
            TextFormField(
              controller: _textCtrl,
              decoration: const InputDecoration(
                  labelText: 'Question text', isDense: true),
              onChanged: (_) => _notify(),
            ),
            const SizedBox(height: 8),
            DropdownButtonFormField<String>(
              initialValue: _type,
              decoration:
                  const InputDecoration(labelText: 'Type', isDense: true),
              items: _types
                  .map((t) =>
                      DropdownMenuItem(value: t.$1, child: Text(t.$2)))
                  .toList(),
              onChanged: (v) {
                if (v == null) return;
                setState(() {
                  _type = v;
                  if (_type == 'text') {
                    _options.clear();
                    _rebuildOptionControllers();
                  }
                });
                _notify();
              },
            ),
            const SizedBox(height: 8),
            // Required toggle
            Row(
              children: [
                Checkbox(
                  value: _required,
                  onChanged: (v) {
                    setState(() => _required = v ?? true);
                    _notify();
                  },
                ),
                const Text('Required', style: TextStyle(fontSize: 13)),
              ],
            ),
            if (_type != 'text') ...[
              const SizedBox(height: 4),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text('Options (${_options.length})',
                      style: const TextStyle(fontSize: 12)),
                  TextButton.icon(
                    icon: const Icon(Icons.add, size: 16),
                    label: const Text('Add option'),
                    style: TextButton.styleFrom(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 4)),
                    onPressed: _addOption,
                  ),
                ],
              ),
              for (var i = 0; i < _options.length; i++)
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _optionCtrls[i],
                        decoration: InputDecoration(
                          labelText: 'Option ${i + 1} label',
                          isDense: true,
                        ),
                        onChanged: (v) {
                          _options[i] = {
                            'value': _options[i]['value']!,
                            'label': v,
                          };
                          _notify();
                        },
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.close,
                          size: 16, color: Colors.red),
                      onPressed: () => _removeOption(i),
                    ),
                  ],
                ),
            ],
          ],
        ),
      ),
    );
  }
}
