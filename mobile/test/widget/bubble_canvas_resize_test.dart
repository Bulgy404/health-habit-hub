import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hhh/widgets/bubble_graph/bubble_graph_data.dart';
import 'package:hhh/widgets/bubble_graph/bubble_graph_gesture_handler.dart';

void main() {
  testWidgets('graph fits a resized viewport and still permits manual zoom', (
    tester,
  ) async {
    final bubbles = List.generate(
      7,
      (i) => BubbleNode(
        id: '$i',
        label: 'Habit $i',
        radius: 100,
        color: Colors.green,
        payload: null,
      ),
    );
    Widget subject(Size size) => MaterialApp(
      home: Center(
        child: SizedBox(
          width: size.width,
          height: size.height,
          child: BubbleCanvasWidget(bubbles: bubbles, onTap: (_) {}),
        ),
      ),
    );
    await tester.pumpWidget(subject(const Size(300, 280)));
    await tester.pumpAndSettle();
    final controller = tester
        .widget<InteractiveViewer>(find.byType(InteractiveViewer))
        .transformationController!;
    final compactScale = controller.value.storage[0];
    expect(compactScale, lessThan(1));
    await tester.pumpWidget(subject(const Size(780, 500)));
    await tester.pumpAndSettle();
    expect(controller.value.storage[0], greaterThan(compactScale));
    controller.value = Matrix4.identity()..scaleByDouble(2, 2, 1, 1);
    await tester.pump();
    expect(controller.value.storage[0], 2);
    expect(tester.takeException(), isNull);
  });
}
