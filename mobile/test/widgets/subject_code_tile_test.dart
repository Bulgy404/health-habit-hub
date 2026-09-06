import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/services.dart';
import 'package:hhh/widgets/subject_code_tile.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  /// Stub the secure-storage platform channel, which has no implementation in
  /// a widget test.
  void stubStorage(Map<String, String> values) {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
      const MethodChannel('plugins.it_nomads.com/flutter_secure_storage'),
      (call) async {
        if (call.method == 'read') {
          return values[call.arguments['key'] as String];
        }
        return null;
      },
    );
    // Clipboard.setData goes through the platform too; without this the copy
    // action throws and the snackbar never appears.
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
      SystemChannels.platform,
      (call) async => null,
    );
  }

  Future<void> pump(WidgetTester tester) async {
    await tester.pumpWidget(
      const MaterialApp(home: Scaffold(body: SubjectCodeTile())),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('renders NOTHING for an anonymous study', (tester) async {
    // Every existing study. The tile must add nothing at all for them.
    stubStorage({});
    await pump(tester);
    expect(find.byType(ListTile), findsNothing);
    expect(find.text('Study subject code'), findsNothing);
  });

  testWidgets('shows the subject code for a verified study', (tester) async {
    stubStorage({'subject_code': 'TUD-DFG01-0042'});
    await pump(tester);
    expect(find.text('TUD-DFG01-0042'), findsOneWidget);
    expect(find.text('Study subject code'), findsOneWidget);
  });

  testWidgets('offers a copy action, so it can be quoted to the study site',
      (tester) async {
    stubStorage({'subject_code': 'TUD-DFG01-0042'});
    await pump(tester);
    expect(find.byIcon(Icons.copy), findsOneWidget);

    await tester.tap(find.byIcon(Icons.copy));
    await tester.pump();
    expect(find.text('Subject code copied'), findsOneWidget);
  });

  testWidgets('renders nothing when storage returns an empty string',
      (tester) async {
    stubStorage({'subject_code': ''});
    await pump(tester);
    expect(find.byType(ListTile), findsNothing);
  });
}
