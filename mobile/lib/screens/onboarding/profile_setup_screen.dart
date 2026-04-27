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
  int? _age;
  String? _gender;
  bool _submitting = false;
  static const int _minAge = 13;
  static const int _maxAge = 100;

  List<int> get _ageOptions =>
      List<int>.generate(_maxAge - _minAge + 1, (index) => _minAge + index);

  Future<void> _showAgePicker() async {
    if (_submitting) return;
    final options = _ageOptions;
    int tempAge = _age ?? 25;
    if (tempAge < _minAge || tempAge > _maxAge) {
      tempAge = 25;
    }
    final initialIndex = options.indexOf(tempAge);
    final controller = FixedExtentScrollController(
      initialItem: initialIndex < 0 ? 0 : initialIndex,
    );

    await showModalBottomSheet<void>(
      context: context,
      builder: (context) {
        return SafeArea(
          child: SizedBox(
            height: 320,
            child: Column(
              children: [
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton(
                    onPressed: () {
                      setState(() => _age = tempAge);
                      Navigator.of(context).pop();
                    },
                    child: const Text('Done'),
                  ),
                ),
                Expanded(
                  child: CupertinoPicker(
                    itemExtent: 36,
                    scrollController: controller,
                    onSelectedItemChanged: (index) {
                      tempAge = options[index];
                    },
                    children: [
                      for (final age in options)
                        Center(child: Text(age.toString())),
                    ],
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
    controller.dispose();
  }

  String? get _selectedGenderLabel {
    for (final (code, label) in profileGenderOptions) {
      if (code == _gender) return label;
    }
    return null;
  }

  Future<void> _showGenderPicker() async {
    if (_submitting) return;
    final options = profileGenderOptions;
    String tempGender = _gender ?? options.first.$1;
    final initialIndex = options.indexWhere(
      (option) => option.$1 == tempGender,
    );
    final controller = FixedExtentScrollController(
      initialItem: initialIndex < 0 ? 0 : initialIndex,
    );

    await showModalBottomSheet<void>(
      context: context,
      builder: (context) {
        return SafeArea(
          child: SizedBox(
            height: 320,
            child: Column(
              children: [
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton(
                    onPressed: () {
                      setState(() => _gender = tempGender);
                      Navigator.of(context).pop();
                    },
                    child: const Text('Done'),
                  ),
                ),
                Expanded(
                  child: CupertinoPicker(
                    itemExtent: 36,
                    scrollController: controller,
                    onSelectedItemChanged: (index) {
                      tempGender = options[index].$1;
                    },
                    children: [
                      for (final option in options)
                        Center(child: Text(option.$2)),
                    ],
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
    controller.dispose();
  }

  Future<void> _submit() async {
    if (_age == null || _gender == null) return;
    setState(() => _submitting = true);
    try {
      final dio = ref.read(dioProvider);
      await dio.post(
        '${AppConfig.apiBaseUrl}/user-profile',
        data: {
          'fields': [
            {
              'questionId': 'age',
              'questionText': 'Age',
              'value': _age,
              'label': profileAgeLabel(_age) ?? '',
            },
            {
              'questionId': 'gender',
              'questionText': 'Gender',
              'value': _gender,
              'label': profileGenderLabel(_gender) ?? '',
            },
          ],
        },
      );
    } catch (_) {
      // Best-effort — profile data missing is recoverable
    }
    if (mounted) context.go('/onboarding/study-code');
  }

  void _skip() => context.go('/onboarding/study-code');

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;
    final canSubmit = _age != null && _gender != null && !_submitting;

    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(28, 24, 28, 32),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Align(
                alignment: Alignment.topRight,
                child: TextButton(onPressed: _skip, child: const Text('Skip')),
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
                style: tt.headlineSmall?.copyWith(fontWeight: FontWeight.w900),
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

              // Age
              Text(
                'Age',
                style: tt.titleSmall?.copyWith(fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 10),
              InkWell(
                onTap: _showAgePicker,
                borderRadius: BorderRadius.circular(14),
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 14,
                  ),
                  decoration: BoxDecoration(
                    color: cs.surfaceContainerHighest,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: cs.outlineVariant),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          _age == null ? 'Select age' : _age.toString(),
                          style: tt.bodyLarge?.copyWith(
                            color: _age == null
                                ? cs.onSurfaceVariant
                                : cs.onSurface,
                            fontWeight: _age == null
                                ? FontWeight.w500
                                : FontWeight.w700,
                          ),
                        ),
                      ),
                      Icon(
                        Icons.unfold_more_rounded,
                        color: cs.onSurfaceVariant,
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 28),

              // Gender
              Text(
                'Gender',
                style: tt.titleSmall?.copyWith(fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 10),
              InkWell(
                onTap: _showGenderPicker,
                borderRadius: BorderRadius.circular(14),
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 14,
                  ),
                  decoration: BoxDecoration(
                    color: cs.surfaceContainerHighest,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: cs.outlineVariant),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          _selectedGenderLabel ?? 'Select gender',
                          style: tt.bodyLarge?.copyWith(
                            color: _selectedGenderLabel == null
                                ? cs.onSurfaceVariant
                                : cs.onSurface,
                            fontWeight: _selectedGenderLabel == null
                                ? FontWeight.w500
                                : FontWeight.w700,
                          ),
                        ),
                      ),
                      Icon(
                        Icons.unfold_more_rounded,
                        color: cs.onSurfaceVariant,
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 40),

              FilledButton(
                onPressed: canSubmit ? _submit : null,
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
