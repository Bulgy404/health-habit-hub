/// Full SRHI trajectory chart with labelled axes.
library;

// mobile/lib/widgets/srhi_chart_widget.dart
import 'dart:math' as math;

import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import '../features/my_habits/my_habits_models.dart';
import '../l10n/app_localizations.dart';

/// A line chart of a habit's SRHI scores over time, with a real coordinate
/// system: study week on the x-axis, SRHI score (1–7) on the y-axis, gridlines,
/// axis titles, and touch tooltips.
///
/// Laid out as a timeline: the y-axis stays pinned on the left while the plot
/// area scrolls horizontally, so the first check-in anchors at the start and
/// later weeks extend to the right (scroll to reveal them once the study runs
/// long). Replaces the axis-less sparkline so a single early data point reads
/// as the beginning of a timeline rather than a floating dot.
class SrhiChartWidget extends StatelessWidget {
  /// Creates an [SrhiChartWidget].
  const SrhiChartWidget({
    required this.trajectory,
    this.height = 220,
    super.key,
  });

  /// SRHI trajectory data points to plot. Points without a score are ignored.
  final List<SrhiTrajectoryPoint> trajectory;

  /// Height of the chart in logical pixels.
  final double height;

  /// Pixels of plot width allotted per study week — sets how far apart weeks
  /// sit and, past the viewport width, when the timeline starts scrolling.
  static const double _pxPerWeek = 60;

  /// Fixed width of the pinned y-axis gutter (labels + axis title).
  static const double _yAxisWidth = 44;

  /// Reserved vertical footprint of the x-axis (tick labels + axis title),
  /// shared by the plot and the y-axis gutter so their plot areas — and thus
  /// their gridline heights — line up exactly.
  static const double _xLabelSize = 24;
  static const double _xNameSize = 22;

  /// Minimum number of weeks the timeline spans, so a lone first point sits
  /// near the left with visible room for the weeks still to come.
  static const int _minTimelineWeeks = 4;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    final submitted = trajectory.where((p) => p.score != null).toList()
      ..sort((a, b) => a.weekNumber.compareTo(b.weekNumber));

    if (submitted.isEmpty) return const SizedBox.shrink();

    final firstWeek = submitted.first.weekNumber;
    final lastWeek = submitted.last.weekNumber;
    // Half-week margin on the left so the first point sits just inside the
    // axis; extend the right edge to at least _minTimelineWeeks so early
    // points anchor left instead of stretching to fill the width.
    final domainStart = firstWeek - 0.5;
    final domainEnd =
        math.max(lastWeek, firstWeek + _minTimelineWeeks) + 0.5;
    final domainSpan = domainEnd - domainStart;

    final gridColor = theme.colorScheme.onSurface.withAlpha(26);
    final axisColor = theme.colorScheme.onSurface.withAlpha(140);
    final axisTitleStyle = theme.textTheme.labelMedium?.copyWith(
      color: axisColor,
      fontWeight: FontWeight.w600,
    );

    return SizedBox(
      height: height,
      child: LayoutBuilder(
        builder: (context, constraints) {
          final viewportPlotWidth = constraints.maxWidth - _yAxisWidth;
          // Grow with the timeline; never shrink below the viewport so short
          // trajectories still fill the width instead of hugging the y-axis.
          final plotWidth = math.max(
            viewportPlotWidth,
            domainSpan * _pxPerWeek,
          );

          return Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SizedBox(
                width: _yAxisWidth,
                child: _yAxisGutter(context, theme, axisColor, axisTitleStyle),
              ),
              Expanded(
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: SizedBox(
                    width: plotWidth,
                    child: _plot(
                      context: context,
                      theme: theme,
                      submitted: submitted,
                      domainStart: domainStart,
                      domainEnd: domainEnd,
                      firstWeek: firstWeek,
                      gridColor: gridColor,
                      axisColor: axisColor,
                      axisTitleStyle: axisTitleStyle,
                    ),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  /// The pinned y-axis: score labels 1–7 and the rotated axis title. Built as a
  /// blank chart sharing the plot's y-range and x-axis footprint so its labels
  /// register with the scrolling gridlines.
  Widget _yAxisGutter(
    BuildContext context,
    ThemeData theme,
    Color axisColor,
    TextStyle? axisTitleStyle,
  ) {
    final l10n = AppLocalizations.of(context)!;
    final axisLabelStyle = theme.textTheme.labelSmall?.copyWith(
      color: axisColor,
    );
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: LineChart(
        LineChartData(
          minX: 0,
          maxX: 1,
          minY: 1,
          maxY: 7,
          gridData: const FlGridData(show: false),
          borderData: FlBorderData(
            show: true,
            border: Border(right: BorderSide(color: axisColor.withAlpha(60))),
          ),
          lineTouchData: const LineTouchData(enabled: false),
          lineBarsData: const [],
          titlesData: FlTitlesData(
            topTitles: const AxisTitles(
              sideTitles: SideTitles(showTitles: false),
            ),
            rightTitles: const AxisTitles(
              sideTitles: SideTitles(showTitles: false),
            ),
            leftTitles: AxisTitles(
              axisNameSize: 22,
              axisNameWidget: Text(
                l10n.srhiChartScoreAxis,
                style: axisTitleStyle,
              ),
              sideTitles: SideTitles(
                showTitles: true,
                interval: 1,
                reservedSize: 20,
                getTitlesWidget: (value, meta) {
                  if (value < 1 ||
                      value > 7 ||
                      value != value.roundToDouble()) {
                    return const SizedBox.shrink();
                  }
                  return Text(value.toInt().toString(), style: axisLabelStyle);
                },
              ),
            ),
            // Blank x-axis with the same footprint as the plot's, so the two
            // plot areas — and their gridlines — align vertically.
            bottomTitles: AxisTitles(
              axisNameSize: _xNameSize,
              axisNameWidget: const SizedBox.shrink(),
              sideTitles: const SideTitles(
                showTitles: true,
                reservedSize: _xLabelSize,
                getTitlesWidget: _blankTitle,
              ),
            ),
          ),
        ),
      ),
    );
  }

  /// The scrolling plot: gridlines, the SRHI line, points, week labels, and the
  /// x-axis title.
  Widget _plot({
    required BuildContext context,
    required ThemeData theme,
    required List<SrhiTrajectoryPoint> submitted,
    required double domainStart,
    required double domainEnd,
    required int firstWeek,
    required Color gridColor,
    required Color axisColor,
    required TextStyle? axisTitleStyle,
  }) {
    final l10n = AppLocalizations.of(context)!;
    final lineColor = theme.colorScheme.primary;
    final axisLabelStyle = theme.textTheme.labelSmall?.copyWith(
      color: axisColor,
    );

    final spots = submitted
        .map((p) => FlSpot(p.weekNumber.toDouble(), p.score!))
        .toList();

    return Padding(
      padding: const EdgeInsets.only(top: 8, right: 12),
      child: LineChart(
        LineChartData(
          minX: domainStart,
          maxX: domainEnd,
          minY: 1,
          maxY: 7,
          gridData: FlGridData(
            show: true,
            drawVerticalLine: true,
            horizontalInterval: 1,
            verticalInterval: 1,
            checkToShowVerticalLine: (value) => value == value.roundToDouble(),
            getDrawingHorizontalLine: (value) =>
                FlLine(color: gridColor, strokeWidth: 1),
            getDrawingVerticalLine: (value) =>
                FlLine(color: gridColor, strokeWidth: 1),
          ),
          borderData: FlBorderData(
            show: true,
            border: Border(bottom: BorderSide(color: gridColor)),
          ),
          titlesData: FlTitlesData(
            topTitles: const AxisTitles(
              sideTitles: SideTitles(showTitles: false),
            ),
            rightTitles: const AxisTitles(
              sideTitles: SideTitles(showTitles: false),
            ),
            leftTitles: const AxisTitles(
              sideTitles: SideTitles(showTitles: false),
            ),
            bottomTitles: AxisTitles(
              axisNameSize: _xNameSize,
              axisNameWidget: Text(
                l10n.srhiChartWeekAxis,
                style: axisTitleStyle,
              ),
              sideTitles: SideTitles(
                showTitles: true,
                interval: 1,
                reservedSize: _xLabelSize,
                getTitlesWidget: (value, meta) {
                  // Label every whole week from the first one onward — including
                  // the weeks still ahead of the latest entry, so the timeline
                  // reads as ongoing.
                  if (value != value.roundToDouble() || value < firstWeek) {
                    return const SizedBox.shrink();
                  }
                  return Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text(value.toInt().toString(), style: axisLabelStyle),
                  );
                },
              ),
            ),
          ),
          lineTouchData: LineTouchData(
            touchTooltipData: LineTouchTooltipData(
              getTooltipColor: (_) => theme.colorScheme.inverseSurface,
              getTooltipItems: (touchedSpots) => touchedSpots.map((s) {
                return LineTooltipItem(
                  l10n.srhiChartTooltip(s.x.toInt(), s.y.toStringAsFixed(1)),
                  theme.textTheme.labelSmall?.copyWith(
                        color: theme.colorScheme.onInverseSurface,
                        fontWeight: FontWeight.w600,
                      ) ??
                      const TextStyle(),
                );
              }).toList(),
            ),
          ),
          lineBarsData: [
            LineChartBarData(
              spots: spots,
              isCurved: spots.length > 2,
              color: lineColor,
              barWidth: 2.5,
              dotData: FlDotData(
                show: true,
                getDotPainter: (spot, percent, bar, index) =>
                    FlDotCirclePainter(
                  radius: 4,
                  color: lineColor,
                  strokeWidth: 1.5,
                  strokeColor: theme.colorScheme.surface,
                ),
              ),
              belowBarData: BarAreaData(
                show: true,
                color: lineColor.withAlpha(26),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// A zero-footprint tick label, used to reserve x-axis space in the y-axis
/// gutter without drawing anything.
Widget _blankTitle(double value, TitleMeta meta) => const SizedBox.shrink();
