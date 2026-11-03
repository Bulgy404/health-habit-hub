// The SDK Material import deliberately represents an unmigrated dependency.
import 'package:flutter/material.dart' as legacy;
import 'package:material_ui/material_ui.dart';
import 'package:cupertino_ui/cupertino_ui.dart' as cupertino;
import 'package:flutter_test/flutter_test.dart';
import 'package:hhh/l10n/ui_localizations.dart';
import 'package:hhh/theme/legacy_ui_bridge.dart';

void main() {
  for (final language in ['en', 'de', 'ja', 'fr', 'nl']) {
    for (final brightness in Brightness.values) {
      testWidgets(
        '$language $brightness bridges theme and localizes both UI libraries',
        (tester) async {
          late BuildContext probe;
          final theme = ThemeData(
            brightness: brightness,
            colorScheme: ColorScheme.fromSeed(
              seedColor: const Color(0xFF2E8C00),
              brightness: brightness,
            ),
            textTheme: const TextTheme(
              bodyMedium: TextStyle(fontFamily: 'Figtree'),
            ),
          );
          await tester.pumpWidget(
            MaterialApp(
              theme: theme,
              locale: Locale(language),
              supportedLocales: [Locale(language)],
              localizationsDelegates: appLocalizationDelegates,
              builder: (context, child) => LegacyUiBridge(child: child!),
              home: Scaffold(
                body: Builder(
                  builder: (context) {
                    probe = context;
                    return cupertino.CupertinoSwitch(
                      value: true,
                      onChanged: (_) {},
                    );
                  },
                ),
              ),
            ),
          );
          await tester.pumpAndSettle();
          expect(
            Theme.of(probe).colorScheme.primary,
            theme.colorScheme.primary,
          );
          expect(
            legacy.Theme.of(probe).colorScheme.primary,
            theme.colorScheme.primary,
          );
          expect(legacy.Theme.of(probe).brightness, brightness);
          expect(
            legacy.Theme.of(probe).textTheme.bodyMedium!.fontFamily,
            'Figtree',
          );
          expect(Localizations.localeOf(probe).languageCode, language);
          expect(
            MaterialLocalizations.of(probe).cancelButtonLabel,
            legacy.MaterialLocalizations.of(probe).cancelButtonLabel,
          );
          if (language != 'en') {
            expect(
              MaterialLocalizations.of(probe).cancelButtonLabel,
              isNot('Cancel'),
            );
          }
          expect(
            cupertino.CupertinoLocalizations.of(probe).cancelButtonLabel,
            isNotEmpty,
          );
          showDatePicker(
            context: probe,
            initialDate: DateTime(2026, 11, 3),
            firstDate: DateTime(2020),
            lastDate: DateTime(2030),
          );
          await tester.pumpAndSettle();
          expect(find.byType(DatePickerDialog), findsOneWidget);
          expect(
            find.text(MaterialLocalizations.of(probe).cancelButtonLabel),
            findsOneWidget,
          );
          expect(tester.takeException(), isNull);
        },
      );
    }
  }
}
