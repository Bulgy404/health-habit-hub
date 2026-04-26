import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/dio_provider.dart';
import '../../config/app_config.dart';

class ProfileSetupScreen extends ConsumerStatefulWidget {
  const ProfileSetupScreen({super.key});

  @override
  ConsumerState<ProfileSetupScreen> createState() => _ProfileSetupScreenState();
}

class _ProfileSetupScreenState extends ConsumerState<ProfileSetupScreen> {
  int? _age;
  String? _gender;
  bool _submitting = false;

  static const _genderOptions = [
    ('male', 'Male'),
    ('female', 'Female'),
    ('non_binary', 'Non-binary'),
    ('prefer_not_to_say', 'Prefer not to say'),
  ];

  Future<void> _submit() async {
    if (_age == null || _gender == null) return;
    setState(() => _submitting = true);
    try {
      final dio = ref.read(dioProvider);
      await dio.post(
        '${AppConfig.apiBaseUrl}/questionnaire-responses',
        data: {
          'questionnaireSlug': 'user-profile',
          'answers': {'age': _age, 'gender': _gender},
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
                  width: 72, height: 72,
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
                  child: Icon(Icons.person_outline, size: 40, color: cs.primary),
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
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final range in _ageRanges)
                    ChoiceChip(
                      label: Text(range.label),
                      selected: _age == range.value,
                      onSelected: _submitting ? null : (_) => setState(() => _age = range.value),
                      labelStyle: tt.bodyMedium?.copyWith(
                        color: _age == range.value ? cs.onPrimaryContainer : cs.onSurfaceVariant,
                        fontWeight: _age == range.value ? FontWeight.w700 : FontWeight.normal,
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 28),

              // Gender
              Text(
                'Gender',
                style: tt.titleSmall?.copyWith(fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 10),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final (code, label) in _genderOptions)
                    ChoiceChip(
                      label: Text(label),
                      selected: _gender == code,
                      onSelected: _submitting ? null : (_) => setState(() => _gender = code),
                      labelStyle: tt.bodyMedium?.copyWith(
                        color: _gender == code ? cs.onPrimaryContainer : cs.onSurfaceVariant,
                        fontWeight: _gender == code ? FontWeight.w700 : FontWeight.normal,
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 40),

              FilledButton(
                onPressed: canSubmit ? _submit : null,
                child: _submitting
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
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

class _AgeRange {
  final String label;
  final int value;
  const _AgeRange(this.label, this.value);
}

const _ageRanges = [
  _AgeRange('Under 18', 15),
  _AgeRange('18–24', 21),
  _AgeRange('25–34', 29),
  _AgeRange('35–44', 39),
  _AgeRange('45–54', 49),
  _AgeRange('55–64', 59),
  _AgeRange('65+', 67),
];
