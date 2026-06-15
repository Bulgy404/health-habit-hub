import 'package:dio/dio.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../config/app_config.dart';
import '../core/dio_provider.dart';
import '../features/questionnaire/questionnaire_service.dart';
import '../l10n/app_localizations.dart';
import '../screens/onboarding/profile_fields.dart';
import '../widgets/offline_banner.dart';

/// Shows the user's profile, driven by admin-configured field definitions.
///
/// Fetches field definitions from [GET /api/v1/profile-field-definitions] and
/// the user's existing answers from [GET /api/v1/user-profile], then renders
/// a native form.  Answers are saved to [POST /api/v1/user-profile].
class ProfileScreen extends ConsumerStatefulWidget {
  /// Creates a [ProfileScreen].
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  static const _baseUrl = AppConfig.apiBaseUrl;

  bool _loading = true;
  bool _offline = false;

  List<ProfileFieldDefinition> _definitions = [];
  final Map<String, dynamic> _values = {};
  final Map<String, TextEditingController> _controllers = {};

  /// Whether the edit form is shown (vs. the summary card).
  bool _editing = false;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    for (final c in _controllers.values) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _offline = false;
    });
    try {
      final dio = ref.read(dioProvider);

      final defsResp = await dio.get<dynamic>(
        '$_baseUrl/profile-field-definitions',
      );
      final defsData = defsResp.data as List<dynamic>? ?? [];
      final defs = defsData
          .map(
            (e) => ProfileFieldDefinition.fromJson(e as Map<String, dynamic>),
          )
          .toList()
        ..sort((a, b) => a.order.compareTo(b.order));

      // Fetch existing profile — 404 means no profile yet, which is fine.
      final Map<String, dynamic> existing = {};
      try {
        final profileResp = await dio.get<Map<String, dynamic>>(
          '$_baseUrl/user-profile',
        );
        final fields =
            profileResp.data?['fields'] as List<dynamic>? ?? [];
        for (final f in fields) {
          final field = f as Map<String, dynamic>;
          final qid = field['questionId'] as String?;
          final type = field['type'] as String?;
          var value = field['value'];
          if (qid != null && value != null) {
            if (type == 'date' && value is String) {
              value = DateTime.tryParse(value) ?? value;
            }
            existing[qid] = value;
          }
        }
      } on DioException catch (e) {
        if (e.response?.statusCode != 404) rethrow;
      }

      // Initialise text/number controllers with existing values.
      for (final def in defs) {
        if (def.type == 'text' || def.type == 'number') {
          final val = existing[def.fieldId];
          final ctrl = _controllers[def.fieldId];
          if (ctrl != null) {
            ctrl.text = val?.toString() ?? '';
          } else {
            _controllers[def.fieldId] =
                TextEditingController(text: val?.toString() ?? '');
          }
        }
      }

      if (mounted) {
        _values
          ..clear()
          ..addAll(existing);
        setState(() {
          _definitions = defs;
          _editing = existing.isEmpty;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _loading = false;
          _offline = true;
        });
      }
    }
  }

  bool get _hasProfile =>
      _definitions.any((d) => _values.containsKey(d.fieldId));

  bool get _canSubmit {
    if (_submitting) return false;
    return _definitions
        .where((d) => d.required)
        .every((d) => _values.containsKey(d.fieldId));
  }

  Future<void> _showDatePicker(ProfileFieldDefinition def) async {
    if (_submitting) return;
    DateTime temp = _values[def.fieldId] is DateTime
        ? _values[def.fieldId] as DateTime
        : DateTime(1990);

    await showModalBottomSheet<void>(
      context: context,
      builder: (ctx) => SafeArea(
        child: SizedBox(
          height: 320,
          child: Column(
            children: [
              Align(
                alignment: Alignment.centerRight,
                child: TextButton(
                  onPressed: () {
                    setState(() => _values[def.fieldId] = temp);
                    Navigator.of(ctx).pop();
                  },
                  child: const Text('Done'),
                ),
              ),
              Expanded(
                child: CupertinoDatePicker(
                  mode: CupertinoDatePickerMode.date,
                  initialDateTime: temp,
                  maximumDate: DateTime.now(),
                  minimumDate: DateTime(1900),
                  onDateTimeChanged: (dt) => temp = dt,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _showSelectPicker(ProfileFieldDefinition def) async {
    if (_submitting) return;
    final options = def.options;
    if (options.isEmpty) return;
    String temp = _values[def.fieldId] as String? ?? options.first;
    final initialIndex = options.indexOf(temp);
    final sc = FixedExtentScrollController(
      initialItem: initialIndex < 0 ? 0 : initialIndex,
    );

    await showModalBottomSheet<void>(
      context: context,
      builder: (ctx) => SafeArea(
        child: SizedBox(
          height: 320,
          child: Column(
            children: [
              Align(
                alignment: Alignment.centerRight,
                child: TextButton(
                  onPressed: () {
                    setState(() => _values[def.fieldId] = temp);
                    Navigator.of(ctx).pop();
                  },
                  child: const Text('Done'),
                ),
              ),
              Expanded(
                child: CupertinoPicker(
                  itemExtent: 36,
                  scrollController: sc,
                  onSelectedItemChanged: (i) => temp = options[i],
                  children: [
                    for (final opt in options) Center(child: Text(opt)),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
    sc.dispose();
  }

  String _displayValue(ProfileFieldDefinition def) {
    final val = _values[def.fieldId];
    if (val == null) return '';
    if (def.type == 'date' && val is DateTime) return formatDate(val);
    return val.toString();
  }

  List<Map<String, dynamic>> _buildPayload() {
    final result = <Map<String, dynamic>>[];
    for (final def in _definitions) {
      final val = _values[def.fieldId];
      if (val == null) continue;
      dynamic submittedValue;
      String label;
      if (def.type == 'date' && val is DateTime) {
        submittedValue = isoDate(val);
        label = formatDate(val);
      } else if (def.type == 'number') {
        final n = double.tryParse(val.toString()) ?? 0.0;
        submittedValue = n;
        label = n.toString();
      } else {
        submittedValue = val.toString();
        label = val.toString();
      }
      result.add({
        'questionId': def.fieldId,
        'questionText': def.label,
        'type': def.type,
        'value': submittedValue,
        'label': label,
      });
    }
    return result;
  }

  Future<void> _submit() async {
    final fields = _buildPayload();
    if (fields.isEmpty) {
      setState(() => _editing = false);
      return;
    }
    setState(() => _submitting = true);
    final l10n = AppLocalizations.of(context)!;
    try {
      final dio = ref.read(dioProvider);
      await dio.post<void>('$_baseUrl/user-profile', data: {'fields': fields});
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l10n.profileSavedSuccess)),
        );
        setState(() {
          _editing = false;
          _submitting = false;
        });
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l10n.submissionFailed)),
        );
        setState(() => _submitting = false);
      }
    }
  }

  Widget _buildFieldInput(ProfileFieldDefinition def) {
    final cs = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;
    final hasValue = _values.containsKey(def.fieldId);
    final displayText = hasValue ? _displayValue(def) : null;

    if (def.type == 'date' || def.type == 'select') {
      return InkWell(
        onTap: def.type == 'date'
            ? () => _showDatePicker(def)
            : () => _showSelectPicker(def),
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          decoration: BoxDecoration(
            color: cs.surfaceContainerHighest,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: cs.outlineVariant),
          ),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  displayText ??
                      (def.type == 'date' ? 'Select date' : 'Select option'),
                  style: tt.bodyLarge?.copyWith(
                    color: displayText == null
                        ? cs.onSurfaceVariant
                        : cs.onSurface,
                    fontWeight: displayText == null
                        ? FontWeight.w500
                        : FontWeight.w700,
                  ),
                ),
              ),
              Icon(Icons.unfold_more_rounded, color: cs.onSurfaceVariant),
            ],
          ),
        ),
      );
    }

    final ctrl = _controllers.putIfAbsent(
      def.fieldId,
      () => TextEditingController(text: _values[def.fieldId]?.toString() ?? ''),
    );
    return TextField(
      controller: ctrl,
      keyboardType: def.type == 'number'
          ? const TextInputType.numberWithOptions(decimal: true)
          : TextInputType.text,
      decoration: InputDecoration(
        filled: true,
        fillColor: cs.surfaceContainerHighest,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(color: cs.outlineVariant),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(color: cs.outlineVariant),
        ),
        hintText: def.type == 'number' ? 'Enter a number' : 'Enter text',
      ),
      onChanged: (v) {
        if (def.type == 'number') {
          final n = double.tryParse(v);
          setState(
            () => n != null
                ? _values[def.fieldId] = n
                : _values.remove(def.fieldId),
          );
        } else {
          setState(() {
            if (v.isNotEmpty) {
              _values[def.fieldId] = v;
            } else {
              _values.remove(def.fieldId);
            }
          });
        }
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.myProfile),
        actions: [
          IconButton(
            icon: const Icon(Icons.settings),
            tooltip: l10n.settings,
            onPressed: () => context.push('/settings'),
          ),
        ],
      ),
      body: _offline
          ? OfflineBanner(message: l10n.couldNotLoadProfile, onRetry: _load)
          : _loading
              ? const Center(child: CircularProgressIndicator())
              : _editing
                  ? _buildForm(l10n)
                  : _buildSummary(l10n),
    );
  }

  // ── Edit form ──────────────────────────────────────────────────────────────

  Widget _buildForm(AppLocalizations l10n) {
    final cs = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(24, 24, 24, 32),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (_definitions.isEmpty)
            Center(
              child: Padding(
                padding: const EdgeInsets.only(top: 48),
                child: Text(
                  'No profile fields have been configured yet.',
                  style: tt.bodyMedium?.copyWith(color: cs.onSurfaceVariant),
                  textAlign: TextAlign.center,
                ),
              ),
            )
          else ...[
            for (final def in _definitions) ...[
              Row(
                children: [
                  Text(
                    def.label,
                    style:
                        tt.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                  ),
                  if (def.required)
                    Text(
                      ' *',
                      style: tt.titleSmall?.copyWith(color: cs.error),
                    ),
                ],
              ),
              const SizedBox(height: 10),
              _buildFieldInput(def),
              const SizedBox(height: 24),
            ],
            FilledButton(
              onPressed: _canSubmit ? _submit : null,
              child: _submitting
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : Text(l10n.save),
            ),
            if (_hasProfile) ...[
              const SizedBox(height: 12),
              TextButton(
                onPressed: () => setState(() => _editing = false),
                child: Text(l10n.cancel),
              ),
            ],
          ],
        ],
      ),
    );
  }

  // ── Summary view ───────────────────────────────────────────────────────────

  Widget _buildSummary(AppLocalizations l10n) {
    final cs = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;
    final filledDefs =
        _definitions.where((d) => _values.containsKey(d.fieldId)).toList();

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(24, 24, 24, 32),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(Icons.person_outline, color: cs.primary, size: 22),
                      const SizedBox(width: 8),
                      Text(
                        l10n.myProfile,
                        style: tt.titleMedium?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const Spacer(),
                      TextButton.icon(
                        onPressed: () => setState(() => _editing = true),
                        icon: const Icon(Icons.edit, size: 16),
                        label: Text(l10n.edit),
                      ),
                    ],
                  ),
                  Divider(color: cs.outlineVariant, height: 24),
                  if (filledDefs.isEmpty)
                    Text(
                      'No profile data entered yet.',
                      style:
                          tt.bodyMedium?.copyWith(color: cs.onSurfaceVariant),
                    )
                  else
                    for (final def in filledDefs) ...[
                      Text(
                        def.label,
                        style: tt.labelSmall?.copyWith(
                          color: cs.onSurfaceVariant,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        _displayValue(def),
                        style: tt.bodyLarge
                            ?.copyWith(fontWeight: FontWeight.w600),
                      ),
                      if (def != filledDefs.last) const SizedBox(height: 14),
                    ],
                ],
              ),
            ),
          ),
          const SizedBox(height: 24),
          _StudyQuestionnairesSection(l10n: l10n),
          const SizedBox(height: 16),
          OutlinedButton.icon(
            onPressed: () => context.push('/onboarding/restore'),
            icon: const Icon(Icons.lock_reset),
            label: Text(l10n.restoreAccountOnDevice),
            style: OutlinedButton.styleFrom(
              minimumSize: const Size(double.infinity, 48),
            ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Study-specific questionnaire section
// ---------------------------------------------------------------------------

class _StudyQuestionnairesSection extends ConsumerWidget {
  const _StudyQuestionnairesSection({required this.l10n});

  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final questionnairesAsync = ref.watch(participantQuestionnairesProvider);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          l10n.healthQuestionnaires,
          style: const TextStyle(fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 8),
        questionnairesAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, stack) => Text(
            l10n.failedToLoadQuestionnaire,
            style: TextStyle(
              color: Theme.of(context).colorScheme.error,
            ),
          ),
          data: (questionnaires) {
            if (questionnaires.isEmpty) {
              return Text(
                l10n.noQuestionnairesAssigned,
                style: TextStyle(
                  color: Theme.of(context)
                      .colorScheme
                      .onSurface
                      .withAlpha(153),
                ),
              );
            }
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (final q in questionnaires) ...[
                  OutlinedButton.icon(
                    onPressed: () =>
                        context.push('/questionnaire/${q.slug}'),
                    icon: const Icon(Icons.assignment),
                    label: Text(q.title),
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size(double.infinity, 48),
                    ),
                  ),
                  const SizedBox(height: 8),
                ],
              ],
            );
          },
        ),
      ],
    );
  }
}
