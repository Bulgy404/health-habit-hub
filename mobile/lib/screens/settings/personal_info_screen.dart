import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../config/app_config.dart';
import '../../core/dio_provider.dart';
import '../onboarding/profile_fields.dart';

class PersonalInfoScreen extends ConsumerStatefulWidget {
  const PersonalInfoScreen({super.key});

  @override
  ConsumerState<PersonalInfoScreen> createState() => _PersonalInfoScreenState();
}

class _PersonalInfoScreenState extends ConsumerState<PersonalInfoScreen> {
  int? _age;
  String? _gender;
  bool _loading = true;
  bool _submitting = false;

  static const int _minAge = 13;
  static const int _maxAge = 100;

  List<int> get _ageOptions =>
      List<int>.generate(_maxAge - _minAge + 1, (i) => _minAge + i);

  @override
  void initState() {
    super.initState();
    _loadProfile();
  }

  Future<void> _loadProfile() async {
    try {
      final dio = ref.read(dioProvider);
      final res = await dio.get('${AppConfig.apiBaseUrl}/user-profile');
      final fields = (res.data['fields'] as List<dynamic>?) ?? [];
      int? age;
      String? gender;
      for (final f in fields) {
        if (f['questionId'] == 'age') age = (f['value'] as num?)?.toInt();
        if (f['questionId'] == 'gender') gender = f['value'] as String?;
      }
      if (mounted) {
        setState(() {
          _age = age;
          _gender = gender;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _showAgePicker() async {
    if (_submitting) return;
    final options = _ageOptions;
    int tempAge = _age ?? 25;
    if (tempAge < _minAge || tempAge > _maxAge) tempAge = 25;
    final initialIndex = options.indexOf(tempAge);
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
                    for (final age in options) Center(child: Text(age.toString())),
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
    final initialIndex = options.indexWhere((o) => o.$1 == tempGender);
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
                    for (final option in options) Center(child: Text(option.$2)),
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

  Future<void> _save() async {
    if (_age == null || _gender == null) return;
    if (!mounted) return;
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
              'label': profileAgeBucketLabel(_age!),
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
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Saved')),
        );
        Navigator.of(context).pop();
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not save. Please try again.')),
        );
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;
    final canSave = _age != null && _gender != null && !_submitting;

    return Scaffold(
      appBar: AppBar(title: const Text('Personal info')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(28, 24, 28, 32),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
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
                    onPressed: canSave ? _save : null,
                    child: _submitting
                        ? const SizedBox(
                            height: 20,
                            width: 20,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Text('Save'),
                  ),
                ],
              ),
            ),
    );
  }
}
