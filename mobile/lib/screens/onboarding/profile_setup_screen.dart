import 'package:flutter/material.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/dio_provider.dart';
import '../../config/app_config.dart';
import 'profile_fields.dart';

class ProfileSetupScreen extends ConsumerStatefulWidget {
  const ProfileSetupScreen({super.key});

  @override
  ConsumerState<ProfileSetupScreen> createState() => _ProfileSetupScreenState();
}

class _ProfileSetupScreenState extends ConsumerState<ProfileSetupScreen> {
  List<ProfileFieldDefinition> _definitions = [];
  final Map<String, dynamic> _values = {};
  final Map<String, TextEditingController> _controllers = {};
  bool _loading = true;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _fetchDefinitions();
  }

  @override
  void dispose() {
    for (final c in _controllers.values) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _fetchDefinitions() async {
    try {
      final dio = ref.read(dioProvider);
      final response = await dio.get(
        '${AppConfig.apiBaseUrl}/profile-field-definitions',
      );
      final List<dynamic> data = response.data as List<dynamic>;
      setState(() {
        _definitions = data
            .map((e) => ProfileFieldDefinition.fromJson(e as Map<String, dynamic>))
            .toList()
          ..sort((a, b) => a.order.compareTo(b.order));
        _loading = false;
      });
    } catch (_) {
      setState(() => _loading = false);
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
      builder: (context) => SafeArea(
        child: SizedBox(
          height: 320,
          child: Column(
            children: [
              Align(
                alignment: Alignment.centerRight,
                child: TextButton(
                  onPressed: () {
                    setState(() => _values[def.fieldId] = temp);
                    Navigator.of(context).pop();
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
    final controller = FixedExtentScrollController(
      initialItem: initialIndex < 0 ? 0 : initialIndex,
    );

    await showModalBottomSheet<void>(
      context: context,
      builder: (context) => SafeArea(
        child: SizedBox(
          height: 320,
          child: Column(
            children: [
              Align(
                alignment: Alignment.centerRight,
                child: TextButton(
                  onPressed: () {
                    setState(() => _values[def.fieldId] = temp);
                    Navigator.of(context).pop();
                  },
                  child: const Text('Done'),
                ),
              ),
              Expanded(
                child: CupertinoPicker(
                  itemExtent: 36,
                  scrollController: controller,
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
    controller.dispose();
  }

  String _displayValue(ProfileFieldDefinition def) {
    final val = _values[def.fieldId];
    if (val == null) return '';
    if (def.type == 'date' && val is DateTime) return formatDate(val);
    return val.toString();
  }

  List<Map<String, dynamic>> _buildFields() {
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
    final fields = _buildFields();
    if (fields.isEmpty) {
      if (mounted) context.go('/onboarding/study-code');
      return;
    }
    setState(() => _submitting = true);
    try {
      final dio = ref.read(dioProvider);
      await dio.post(
        '${AppConfig.apiBaseUrl}/user-profile',
        data: {'fields': fields},
      );
    } catch (_) {
      // Best-effort — profile missing is recoverable
    }
    if (mounted) context.go('/onboarding/study-code');
  }

  void _skip() => context.go('/onboarding/study-code');

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

    // text or number
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
          if (n != null) {
            setState(() => _values[def.fieldId] = n);
          } else {
            setState(() => _values.remove(def.fieldId));
          }
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
    final cs = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;

    return Scaffold(
      body: SafeArea(
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(28, 24, 28, 32),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Align(
                      alignment: Alignment.topRight,
                      child: TextButton(
                        onPressed: _skip,
                        child: const Text('Skip'),
                      ),
                    ),
                    const SizedBox(height: 12),
                    Center(
                      child: Container(
                        width: 72,
                        height: 72,
                        decoration: BoxDecoration(
                          color: cs.primaryContainer,
                          borderRadius: BorderRadius.circular(22),
                          boxShadow: [
                            BoxShadow(
                              color: cs.primary.withAlpha(0x2E),
                              blurRadius: 20,
                              offset: const Offset(0, 6),
                            ),
                          ],
                        ),
                        child: Icon(
                          Icons.person_outline,
                          size: 40,
                          color: cs.primary,
                        ),
                      ),
                    ),
                    const SizedBox(height: 24),
                    Text(
                      'Tell us about yourself',
                      style: tt.headlineSmall
                          ?.copyWith(fontWeight: FontWeight.w900),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'This helps personalise your habit recommendations. You can skip and update later.',
                      style: tt.bodyMedium?.copyWith(
                        color: cs.onSurfaceVariant,
                        height: 1.5,
                      ),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 32),
                    for (final def in _definitions) ...[
                      Text(
                        def.label,
                        style: tt.titleSmall
                            ?.copyWith(fontWeight: FontWeight.w700),
                      ),
                      const SizedBox(height: 10),
                      _buildFieldInput(def),
                      const SizedBox(height: 28),
                    ],
                    const SizedBox(height: 12),
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
                          : const Text('Continue'),
                    ),
                  ],
                ),
              ),
      ),
    );
  }
}
