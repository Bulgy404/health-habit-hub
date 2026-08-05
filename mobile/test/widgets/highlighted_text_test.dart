import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hhh/widgets/highlighted_text.dart';

void main() {
  testWidgets('renders plain text when highlight is empty', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: HighlightedText(text: 'I meditate at the gym', highlight: ''),
      ),
    );

    final richText = tester.widget<Text>(find.byType(Text));
    expect(richText.textSpan, isNull);
    expect(find.text('I meditate at the gym'), findsOneWidget);
  });

  testWidgets('renders plain text when highlight is not found', (
    tester,
  ) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: HighlightedText(
          text: 'I meditate at the gym',
          highlight: 'in the morning',
        ),
      ),
    );

    expect(find.text('I meditate at the gym'), findsOneWidget);
  });

  testWidgets('bolds the matched phrase case-insensitively', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: HighlightedText(
          text: 'I meditate at the gym',
          highlight: 'AT THE GYM',
        ),
      ),
    );

    final rich = tester.widget<Text>(find.byType(Text));
    final span = rich.textSpan! as TextSpan;
    final children = span.children!;

    expect((children[0] as TextSpan).text, 'I meditate ');
    expect((children[1] as TextSpan).text, 'at the gym');
    expect((children[1] as TextSpan).style?.fontWeight, FontWeight.w800);
  });

  testWidgets('bolds a match at the very start of the text', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: HighlightedText(text: 'At the gym I meditate', highlight: 'At the gym'),
      ),
    );

    final rich = tester.widget<Text>(find.byType(Text));
    final span = rich.textSpan! as TextSpan;
    final children = span.children!;

    expect(children.length, 2);
    expect((children[0] as TextSpan).style?.fontWeight, FontWeight.w800);
    expect((children[0] as TextSpan).text, 'At the gym');
    expect((children[1] as TextSpan).text, ' I meditate');
  });
}
