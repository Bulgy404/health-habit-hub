// Unit tests for packBubbles (the bubble graph's circle-packing layout).
//
// Pure algorithm — no widget tree needed. Covers correctness (finite,
// non-overlapping-ish output for a range of sizes) and a performance
// regression guard for the bounded-iteration fix that keeps this
// synchronous, main-thread simulation from janking the Explore page when a
// dimension has many bubbles.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hhh/widgets/bubble_graph/bubble_graph_data.dart';

void main() {
  group('packBubbles — edge cases', () {
    test('empty radii list returns empty positions and zero size', () {
      final (positions, size) = packBubbles(const []);
      expect(positions, isEmpty);
      expect(size, Size.zero);
    });

    test('a single radius returns exactly one centred position', () {
      const radius = 40.0;
      final (positions, size) = packBubbles(const [radius]);

      expect(positions, hasLength(1));
      expect(positions.single, const Offset(radius + 56, radius + 56));
      expect(size.width, radius * 2 + 56 * 2);
      expect(size.height, radius * 2 + 56 * 2);
    });

    test('a custom padding is honoured for a single radius', () {
      const radius = 20.0;
      const padding = 10.0;
      final (positions, size) = packBubbles(
        const [radius],
        padding: padding,
      );

      expect(positions.single, const Offset(radius + padding, radius + padding));
      expect(size.width, radius * 2 + padding * 2);
    });
  });

  group('packBubbles — correctness across sizes', () {
    for (final n in [2, 5, 20, 50, 300]) {
      test('n=$n: returns one finite position per radius, finite canvas size', () {
        final radii = List<double>.generate(n, (i) => 18.0 + (i % 5) * 8.0);
        final (positions, size) = packBubbles(radii);

        expect(positions, hasLength(n));
        for (final p in positions) {
          expect(p.dx.isFinite, isTrue, reason: 'dx must be finite for n=$n');
          expect(p.dy.isFinite, isTrue, reason: 'dy must be finite for n=$n');
        }
        expect(size.width.isFinite, isTrue);
        expect(size.height.isFinite, isTrue);
        expect(size.width, greaterThan(0));
        expect(size.height, greaterThan(0));
      });
    }

    test('circles settle without significant overlap for a moderate n', () {
      const n = 20;
      final radii = List<double>.generate(n, (i) => 18.0 + (i % 4) * 10.0);
      final (positions, _) = packBubbles(radii);

      // The simulation is a physics approximation, not an exact packer, so
      // allow a small tolerance rather than requiring zero overlap.
      const tolerance = 4.0;
      for (var i = 0; i < n; i++) {
        for (var j = i + 1; j < n; j++) {
          final dist = (positions[i] - positions[j]).distance;
          final minDist = radii[i] + radii[j];
          expect(
            dist,
            greaterThanOrEqualTo(minDist - tolerance),
            reason: 'circles $i and $j overlap beyond tolerance',
          );
        }
      }
    });

    test('bounding box tightly contains every circle (padding on all sides)',
        () {
      const n = 10;
      final radii = List<double>.generate(n, (i) => 20.0 + i * 3.0);
      const padding = 56.0;
      final (positions, size) = packBubbles(radii, padding: padding);

      for (var i = 0; i < n; i++) {
        final p = positions[i];
        final r = radii[i];
        expect(p.dx - r, greaterThanOrEqualTo(padding - 0.5));
        expect(p.dy - r, greaterThanOrEqualTo(padding - 0.5));
        expect(p.dx + r, lessThanOrEqualTo(size.width - padding + 0.5));
        expect(p.dy + r, lessThanOrEqualTo(size.height - padding + 0.5));
      }
    });
  });

  group('packBubbles — bounded-work performance regression guard', () {
    // Each iteration is an O(n^2) pass; iterations scale down as n grows
    // (workBudget / n^2, clamped to [30, 250]) specifically so a busy
    // dimension (community graphs can accumulate hundreds of donated
    // habits) can't block the UI thread for an unbounded amount of time.
    // Without that bound, n=300 would run the full 250 iterations
    // (300^2 * 250 = 22.5M inner-loop passes); the fix caps total work to
    // roughly workBudget (2,000,000) regardless of n.
    test('large n (300) completes within a generous time budget', () {
      final radii = List<double>.generate(300, (i) => 18.0 + (i % 5) * 8.0);
      final stopwatch = Stopwatch()..start();
      final (positions, _) = packBubbles(radii);
      stopwatch.stop();

      expect(positions, hasLength(300));
      // Generous margin for CI variance — this is a regression guard against
      // unbounded quadratic blowup, not a tight performance benchmark.
      expect(stopwatch.elapsedMilliseconds, lessThan(500));
    });

    test('very large n (800) still completes quickly', () {
      final radii = List<double>.generate(800, (i) => 18.0 + (i % 6) * 7.0);
      final stopwatch = Stopwatch()..start();
      final (positions, _) = packBubbles(radii);
      stopwatch.stop();

      expect(positions, hasLength(800));
      expect(stopwatch.elapsedMilliseconds, lessThan(1000));
    });
  });
}
