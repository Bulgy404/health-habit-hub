// Widget tests for HelpSupportScreen.
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hhh/config/app_config.dart';
import 'package:hhh/l10n/app_localizations.dart';
import 'package:hhh/screens/help_support_screen.dart';

Widget _buildSubject({required Future<bool> Function(Uri) launcher}) {
  return MaterialApp(
    localizationsDelegates: const [
      AppLocalizations.delegate,
      GlobalMaterialLocalizations.delegate,
      GlobalWidgetsLocalizations.delegate,
      GlobalCupertinoLocalizations.delegate,
    ],
    supportedLocales: const [Locale('en')],
    home: HelpSupportScreen(launcher: launcher),
  );
}

void main() {
  testWidgets('shows AppBar title and FAQ questions', (tester) async {
    await tester.pumpWidget(_buildSubject(launcher: (_) async => true));
    await tester.pump();

    expect(find.text('Help & Support'), findsWidgets);
    expect(
      find.text('I lost my recovery passphrase — what do I do?'),
      findsOneWidget,
    );
  });

  testWidgets('expanding an FAQ tile reveals its answer', (tester) async {
    await tester.pumpWidget(_buildSubject(launcher: (_) async => true));
    await tester.pump();

    expect(
      find.textContaining('Habit check-ins you submit while offline'),
      findsNothing,
    );

    await tester.tap(
      find.text('What happens if I lose connection while using the app?'),
    );
    await tester.pumpAndSettle();

    expect(
      find.textContaining('Habit check-ins you submit while offline'),
      findsOneWidget,
    );
  });

  testWidgets('tapping Send email launches a mailto: URI to the support address',
      (tester) async {
    Uri? launched;
    await tester.pumpWidget(
      _buildSubject(
        launcher: (uri) async {
          launched = uri;
          return true;
        },
      ),
    );
    await tester.pump();

    await tester.tap(find.text('Send email'));
    await tester.pump();

    expect(launched, isNotNull);
    expect(launched!.scheme, 'mailto');
    expect(launched!.path, AppConfig.supportEmail);
  });

  testWidgets(
      'shows a fallback message when no email app can be launched',
      (tester) async {
    await tester.pumpWidget(
      _buildSubject(launcher: (_) async => false),
    );
    await tester.pump();

    await tester.tap(find.text('Send email'));
    await tester.pump();

    expect(
      find.textContaining(AppConfig.supportEmail),
      findsOneWidget,
    );
  });

  testWidgets(
      'shows a fallback message when launching the mail app throws',
      (tester) async {
    await tester.pumpWidget(
      _buildSubject(launcher: (_) async => throw Exception('no mail app')),
    );
    await tester.pump();

    await tester.tap(find.text('Send email'));
    await tester.pump();

    expect(
      find.textContaining(AppConfig.supportEmail),
      findsOneWidget,
    );
  });
}
