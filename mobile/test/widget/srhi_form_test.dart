// mobile/test/widget/srhi_form_test.dart
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hhh/features/my_habits/my_habits_models.dart';
import 'package:hhh/features/my_habits/my_habits_service.dart';
import 'package:hhh/features/my_habits/srhi_form_screen.dart';
import 'package:hhh/l10n/app_localizations.dart';

final _fakeDio = Dio();

class _FakeMyHabitsService extends MyHabitsService {
  _FakeMyHabitsService() : super(dio: _fakeDio);

  @override
  Future<SrhiTrajectoryPoint> submitSrhi({
    required String intentionId,
    required int weekNumber,
    required Map<String, int> items,
  }) async =>
      SrhiTrajectoryPoint(weekNumber: weekNumber, score: 5.0);
}

Widget _buildSubject(List<SrhiItem> items) {
  return ProviderScope(
    overrides: [
      myHabitsServiceProvider.overrideWithValue(_FakeMyHabitsService()),
    ],
    child: MaterialApp(
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      home: SrhiFormScreen(
        intentionId: 'intent-1',
        weekNumber: 1,
        behaviorLabel: 'Walking',
        srhiItems: items,
      ),
    ),
  );
}

final _twelveItems = List.generate(
  12,
  (i) => SrhiItem(
    id: 'srhi_${i + 1}',
    en: 'I do item ${i + 1}',
    de: 'Artikel ${i + 1}',
  ),
);

void main() {
  testWidgets('Submit button is disabled until all 12 items answered',
      (tester) async {
    await tester.pumpWidget(_buildSubject(_twelveItems));
    await tester.pump();

    // Submit button should be disabled initially.
    final submitButton = tester.widget<FilledButton>(
      find.widgetWithText(FilledButton, 'Submit'),
    );
    expect(submitButton.onPressed, isNull);
  });

  testWidgets('Submit button enabled after all 12 sliders are moved',
      (tester) async {
    // Use a tall surface so all 12 slider rows are laid out (the form scrolls),
    // making each Slider reliably draggable.
    tester.view.physicalSize = const Size(1000, 2400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(_buildSubject(_twelveItems));
    await tester.pump();

    // Drag each slider far enough to cross at least one of its 6 divisions so
    // onChanged fires and the item is marked answered.
    final sliders = find.byType(Slider);
    for (int i = 0; i < 12; i++) {
      await tester.drag(sliders.at(i), const Offset(300, 0));
      await tester.pump();
    }

    final submitButton = tester.widget<FilledButton>(
      find.widgetWithText(FilledButton, 'Submit'),
    );
    expect(submitButton.onPressed, isNotNull);
  });
}
