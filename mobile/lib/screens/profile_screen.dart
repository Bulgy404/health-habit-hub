import 'package:dio/dio.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../config/app_config.dart';
import '../core/dio_provider.dart';
import '../features/my_habits/my_habits_provider.dart';
import '../features/questionnaire/questionnaire_models.dart';
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
          // Always land on the summary — profile fields are optional and
          // already offered once during onboarding, so an empty/incomplete
          // profile should surface as a banner there (see _buildSummary),
          // not force the edit form in front of the rest of the account
          // page (study membership, questionnaires, etc.) every time.
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
        hintText: def.type == 'number'
            ? AppLocalizations.of(context)!.profileEnterNumber
            : AppLocalizations.of(context)!.profileEnterText,
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
            const SizedBox(height: 12),
            TextButton(
              onPressed: () => setState(() => _editing = false),
              child: Text(l10n.cancel),
            ),
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
    final missingDefs =
        _definitions.where((d) => !_values.containsKey(d.fieldId)).toList();

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
                  if (missingDefs.isNotEmpty) ...[
                    _ProfileIncompleteBanner(
                      missingLabels: missingDefs.map((d) => d.label).toList(),
                      onCompleteNow: () => setState(() => _editing = true),
                      l10n: l10n,
                    ),
                    if (filledDefs.isNotEmpty) const SizedBox(height: 16),
                  ],
                  if (filledDefs.isEmpty && missingDefs.isEmpty)
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
          const _StudyMembershipSection(),
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

/// Indicator shown in the account summary when one or more (optional)
/// profile fields haven't been filled in yet — a nudge, not a gate: the rest
/// of the account page (study membership, questionnaires) is always visible
/// regardless of profile completeness.
class _ProfileIncompleteBanner extends StatelessWidget {
  const _ProfileIncompleteBanner({
    required this.missingLabels,
    required this.onCompleteNow,
    required this.l10n,
  });

  final List<String> missingLabels;
  final VoidCallback onCompleteNow;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: cs.tertiaryContainer,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.info_outline, color: cs.onTertiaryContainer, size: 20),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  l10n.profileIncompleteBanner(missingLabels.join(', ')),
                  style: TextStyle(color: cs.onTertiaryContainer),
                ),
              ),
            ],
          ),
          Align(
            alignment: Alignment.centerRight,
            child: TextButton(
              onPressed: onCompleteNow,
              child: Text(l10n.profileCompleteNow),
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

    return questionnairesAsync.when(
      loading: () => _sectionWithHeader(
        const Center(child: CircularProgressIndicator()),
      ),
      error: (error, stack) => _sectionWithHeader(
        Text(
          l10n.failedToLoadQuestionnaire,
          style: TextStyle(color: Theme.of(context).colorScheme.error),
        ),
      ),
      data: (questionnaires) {
        // Nothing assigned by a study admin (or the participant isn't
        // enrolled in a study, which the service layer also surfaces as an
        // empty list) — there is nothing to show, so the whole section,
        // including its header, is hidden rather than shown empty.
        if (questionnaires.isEmpty) {
          return const SizedBox.shrink();
        }

        final anyAvailable = questionnaires.any((q) => q.available);
        if (!anyAvailable) {
          // Assigned, but nothing is due right now — a neutral status
          // message rather than a wall of greyed-out "not yet available"
          // tiles for every assigned questionnaire.
          return _sectionWithHeader(
            Text(
              l10n.noQuestionnairesDue,
              style: TextStyle(
                color:
                    Theme.of(context).colorScheme.onSurface.withAlpha(153),
              ),
            ),
          );
        }

        return _sectionWithHeader(
          Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (final q in questionnaires) ...[
                _QuestionnaireTile(questionnaire: q, l10n: l10n),
                const SizedBox(height: 8),
              ],
            ],
          ),
        );
      },
    );
  }

  Widget _sectionWithHeader(Widget content) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          l10n.healthQuestionnaires,
          style: const TextStyle(fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 8),
        content,
        const SizedBox(height: 24),
      ],
    );
  }
}

/// One row in the Health Questionnaires list: a green, tappable button while
/// [ParticipantQuestionnaire.available] is true (an open window is due now),
/// or a greyed-out, non-interactive tile once completed — answers can't be
/// changed after submission, so re-opening the form isn't offered until the
/// next occurrence becomes due.
class _QuestionnaireTile extends StatelessWidget {
  const _QuestionnaireTile({required this.questionnaire, required this.l10n});

  final ParticipantQuestionnaire questionnaire;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context) {
    if (questionnaire.available) {
      final green = Theme.of(context).colorScheme.primary;
      return OutlinedButton.icon(
        onPressed: () => context.push('/questionnaire/${questionnaire.slug}'),
        icon: const Icon(Icons.assignment),
        label: Text(questionnaire.title),
        style: OutlinedButton.styleFrom(
          minimumSize: const Size(double.infinity, 48),
          foregroundColor: green,
          side: BorderSide(color: green),
        ),
      );
    }

    final muted = Theme.of(context).colorScheme.onSurface.withAlpha(140);
    final completedAt = questionnaire.completedAt;
    final subtitle = completedAt != null
        ? l10n.questionnaireCompletedOn(_formatDate(context, completedAt))
        : l10n.questionnaireNotYetAvailable;

    return Container(
      constraints: const BoxConstraints(minHeight: 48),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        border: Border.all(color: muted),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          Icon(Icons.check_circle_outline, color: muted),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(questionnaire.title, style: TextStyle(color: muted)),
                Text(
                  subtitle,
                  style: TextStyle(color: muted, fontSize: 12),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  String _formatDate(BuildContext context, DateTime date) {
    final locale = Localizations.localeOf(context).toString();
    try {
      return DateFormat.yMMMd(locale).format(date.toLocal());
    } catch (_) {
      return date.toLocal().toString().split(' ').first;
    }
  }
}

// ---------------------------------------------------------------------------
// Study membership
// ---------------------------------------------------------------------------

/// Current-enrollment display plus "join a different study" / "leave study"
/// actions for the account screen.
///
/// Switching or leaving never deletes or re-attributes past data: habits,
/// logs, and questionnaire answers already submitted keep the studyId they
/// were stamped with at the time (see habitDonationService.js on the
/// backend) — only activity from this point on counts toward the new study.
class _StudyMembershipSection extends ConsumerStatefulWidget {
  const _StudyMembershipSection();

  @override
  ConsumerState<_StudyMembershipSection> createState() =>
      _StudyMembershipSectionState();
}

class _StudyMembershipSectionState
    extends ConsumerState<_StudyMembershipSection> {
  static const _baseUrl = AppConfig.apiBaseUrl;

  bool _loading = true;
  String? _studyName;
  String? _groupLabel;
  bool _isDefaultStudy = true;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final dio = ref.read(dioProvider);
      final res = await dio.get<Map<String, dynamic>>(
        '$_baseUrl/onboarding/enrollment',
      );
      final data = res.data ?? {};
      if (!mounted) return;
      setState(() {
        _studyName = data['studyName'] as String?;
        _groupLabel = data['groupLabel'] as String?;
        _isDefaultStudy = data['isDefaultStudy'] as bool? ?? true;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _loading = false);
    }
  }

  void _showSnack(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  /// Maps a switch/leave request's error response to a localized message.
  String _errorMessage(AppLocalizations l10n, DioException e, {required bool isJoin}) {
    final status = e.response?.statusCode;
    if (isJoin) {
      if (status == 404) return l10n.studyMembershipInvalidCode;
      if (status == 410) {
        final body = e.response?.data;
        final err = body is Map ? body['error'] as String? : null;
        return err?.contains('limit') == true
            ? l10n.studyMembershipCodeUsedUp
            : l10n.studyMembershipCodeExpired;
      }
      if (status == 409) return l10n.studyMembershipAlreadyInStudy;
      return l10n.studyMembershipJoinFailed;
    }
    return l10n.studyMembershipLeaveFailed;
  }

  Future<void> _submitJoin(String code) async {
    final l10n = AppLocalizations.of(context)!;
    setState(() => _busy = true);
    try {
      final dio = ref.read(dioProvider);
      final res = await dio.post<Map<String, dynamic>>(
        '$_baseUrl/onboarding/switch-study',
        data: {'code': code},
      );
      if (!mounted) return;
      Navigator.of(context).pop();
      final studyName = res.data?['studyName'] as String? ?? '';
      _showSnack(l10n.studyMembershipJoinSuccess(studyName));
      ref.invalidate(habitConfigProvider);
      await _load();
    } on DioException catch (e) {
      if (!mounted) return;
      _showSnack(_errorMessage(l10n, e, isJoin: true));
    } catch (_) {
      if (!mounted) return;
      _showSnack(l10n.studyMembershipJoinFailed);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _openJoinDialog() async {
    final l10n = AppLocalizations.of(context)!;
    final controller = TextEditingController();
    String? errorText;

    await showDialog<void>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (dialogContext, setDialogState) => AlertDialog(
          title: Text(l10n.studyMembershipJoinDialogTitle),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(l10n.studyMembershipJoinDialogBody),
              const SizedBox(height: 16),
              TextField(
                controller: controller,
                enabled: !_busy,
                autofocus: true,
                decoration: InputDecoration(
                  labelText: l10n.studyMembershipCodeLabel,
                  hintText: 'HHH-XXXXX',
                  border: const OutlineInputBorder(),
                  errorText: errorText,
                  errorMaxLines: 3,
                ),
                textCapitalization: TextCapitalization.characters,
                inputFormatters: [
                  TextInputFormatter.withFunction((oldValue, newValue) {
                    return newValue.copyWith(text: newValue.text.toUpperCase());
                  }),
                ],
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: _busy ? null : () => Navigator.of(dialogContext).pop(),
              child: Text(l10n.cancel),
            ),
            FilledButton(
              onPressed: _busy
                  ? null
                  : () {
                      final code = controller.text.trim();
                      if (!RegExp(r'^HHH-[A-Z0-9]{5}$').hasMatch(code)) {
                        setDialogState(
                          () => errorText = l10n.studyMembershipInvalidCode,
                        );
                        return;
                      }
                      _submitJoin(code);
                    },
              child: Text(l10n.studyMembershipJoinConfirm),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _confirmLeave() async {
    final l10n = AppLocalizations.of(context)!;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(l10n.studyMembershipLeaveConfirmTitle),
        content: Text(l10n.studyMembershipLeaveConfirmBody),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: Text(l10n.cancel),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: Text(l10n.confirm),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    setState(() => _busy = true);
    try {
      final dio = ref.read(dioProvider);
      await dio.post<void>('$_baseUrl/onboarding/leave-study');
      if (!mounted) return;
      _showSnack(l10n.studyMembershipLeaveSuccess);
      ref.invalidate(habitConfigProvider);
      await _load();
    } on DioException catch (e) {
      if (!mounted) return;
      _showSnack(_errorMessage(l10n, e, isJoin: false));
    } catch (_) {
      if (!mounted) return;
      _showSnack(l10n.studyMembershipLeaveFailed);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final cs = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;

    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_studyName == null && _isDefaultStudy) {
      // GET /enrollment failed or returned nothing usable — fail silently
      // rather than show a confusing partial section.
      return const SizedBox.shrink();
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Icon(Icons.groups_outlined, color: cs.primary, size: 22),
            const SizedBox(width: 8),
            Text(
              l10n.studyMembershipTitle,
              style: tt.titleMedium?.copyWith(fontWeight: FontWeight.w700),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: cs.surfaceContainerHighest,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                l10n.studyMembershipCurrentLabel,
                style: tt.labelSmall?.copyWith(color: cs.onSurfaceVariant),
              ),
              const SizedBox(height: 2),
              Text(
                _isDefaultStudy
                    ? l10n.studyMembershipDefaultLabel
                    : (_studyName ?? ''),
                style: tt.bodyLarge?.copyWith(fontWeight: FontWeight.w600),
              ),
              if (_groupLabel != null) ...[
                const SizedBox(height: 2),
                Text(
                  l10n.studyMembershipGroupLabel(_groupLabel!),
                  style: tt.bodySmall?.copyWith(color: cs.onSurfaceVariant),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: 12),
        OutlinedButton.icon(
          onPressed: _busy ? null : _openJoinDialog,
          icon: const Icon(Icons.qr_code, size: 16),
          label: Text(l10n.studyMembershipJoinButton),
        ),
        if (!_isDefaultStudy) ...[
          const SizedBox(height: 8),
          TextButton.icon(
            onPressed: _busy ? null : _confirmLeave,
            icon: Icon(Icons.logout, size: 16, color: cs.error),
            label: Text(
              l10n.studyMembershipLeaveButton,
              style: TextStyle(color: cs.error),
            ),
          ),
        ],
      ],
    );
  }
}

