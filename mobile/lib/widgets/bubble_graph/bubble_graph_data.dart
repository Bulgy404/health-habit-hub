/// Data model and layout algorithm for the bubble graph widget.
///
/// Contains the internal [BubbleNode] data class and the [packBubbles]
/// circle-packing layout function used by [BubbleGraphWidget].
library;

import 'dart:math' as math;

import 'package:flutter/material.dart';

// ---------------------------------------------------------------------------
// Dimension colours
// ---------------------------------------------------------------------------

/// Maps behaviour-dimension IDs to their brand colours.
const kDimensionColors = {
  'TIME': Color(0xFF3B82F6),
  'BEHAVIOR': Color(0xFF22C55E),
  'PHYSICAL_SETTING': Color(0xFFF97316),
  'PRIOR_BEHAVIOR': Color(0xFFA855F7),
  'OTHER_PEOPLE': Color(0xFF06B6D4),
  'INTERNAL_STATE': Color(0xFFEC4899),
  'REASONING': Color(0xFF64748B),
};

/// Returns the brand [Color] for [dimensionId], falling back to a neutral grey.
Color colorFor(String dimensionId) =>
    kDimensionColors[dimensionId] ?? const Color(0xFF94A3B8);

// ---------------------------------------------------------------------------
// Internal data model for a single rendered bubble
// ---------------------------------------------------------------------------

/// Immutable data describing a single rendered bubble in the graph.
class BubbleNode {
  /// Unique identifier matching the backing model object.
  final String id;

  /// Primary label displayed inside the bubble.
  final String label;

  /// Optional secondary label (e.g. habit count for dimension bubbles).
  final String? sublabel;

  /// Radius in logical pixels.
  final double radius;

  /// Fill colour of the bubble.
  final Color color;

  /// Backing model object — either a [DimensionBubble] or [HabitBubble].
  final dynamic payload;

  /// When `true`, the bubble plays a scale-and-glow entrance animation.
  final bool pulse;

  /// Creates an immutable bubble descriptor.
  const BubbleNode({
    required this.id,
    required this.label,
    this.sublabel,
    required this.radius,
    required this.color,
    required this.payload,
    this.pulse = false,
  });
}

// ---------------------------------------------------------------------------
// Circle-packing layout (force-directed, 250 iterations)
// ---------------------------------------------------------------------------

/// Packs [radii] into a tight circle layout using a force-directed simulation.
///
/// Returns a tuple of `(positions, canvasSize)`.  Each position is the centre
/// of the corresponding circle, offset by [padding] from the canvas edges.
(List<Offset>, Size) packBubbles(List<double> radii, {double padding = 56}) {
  final n = radii.length;
  if (n == 0) return ([], Size.zero);
  if (n == 1) {
    return (
      [Offset(radii[0] + padding, radii[0] + padding)],
      Size(radii[0] * 2 + padding * 2, radii[0] * 2 + padding * 2),
    );
  }

  // Initial positions: spread on a circle proportional to total circumference.
  final totalR = radii.fold(0.0, (s, r) => s + r);
  final initR = totalR / math.pi;
  final xs = List<double>.generate(
    n,
    (i) => initR * math.cos(2 * math.pi * i / n),
  );
  final ys = List<double>.generate(
    n,
    (i) => initR * math.sin(2 * math.pi * i / n),
  );

  // Each iteration is an O(n^2) pass over every circle pair, so iterations
  // are scaled down as n grows to keep total work roughly bounded — without
  // this, a busy dimension (community graphs can accumulate hundreds of
  // donated habits) made this synchronous main-thread simulation take long
  // enough to visibly freeze the UI for a frame or more whenever the bubble
  // list changed (drilling into a dimension, annotating a habit, ...).
  const workBudget = 2000000;
  final iterations = (workBudget / (n * n)).round().clamp(30, 250);
  for (int iter = 0; iter < iterations; iter++) {
    final alpha = 1.0 - iter / iterations;

    // Repulsion: push overlapping circles apart.
    for (int i = 0; i < n; i++) {
      for (int j = i + 1; j < n; j++) {
        final ddx = xs[i] - xs[j];
        final ddy = ys[i] - ys[j];
        final dist = math.sqrt(ddx * ddx + ddy * ddy);
        final minDist = radii[i] + radii[j] + 6;
        if (dist < minDist && dist > 0.01) {
          final push = (minDist - dist) / 2 * alpha;
          final nx = ddx / dist;
          final ny = ddy / dist;
          xs[i] += nx * push;
          ys[i] += ny * push;
          xs[j] -= nx * push;
          ys[j] -= ny * push;
        }
      }
    }

    // Gentle pull to origin.
    final centerStrength = 0.012 * alpha;
    for (int i = 0; i < n; i++) {
      xs[i] *= (1 - centerStrength);
      ys[i] *= (1 - centerStrength);
    }
  }

  // Compute bounding box.
  double minX = double.infinity, maxX = double.negativeInfinity;
  double minY = double.infinity, maxY = double.negativeInfinity;
  for (int i = 0; i < n; i++) {
    minX = math.min(minX, xs[i] - radii[i]);
    maxX = math.max(maxX, xs[i] + radii[i]);
    minY = math.min(minY, ys[i] - radii[i]);
    maxY = math.max(maxY, ys[i] + radii[i]);
  }

  final positions = List<Offset>.generate(
    n,
    (i) => Offset(xs[i] - minX + padding, ys[i] - minY + padding),
  );
  final size = Size(maxX - minX + padding * 2, maxY - minY + padding * 2);
  return (positions, size);
}
