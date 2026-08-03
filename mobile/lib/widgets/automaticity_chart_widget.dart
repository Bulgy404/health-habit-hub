/// Automaticity trajectory chart with labelled axes, shown below the SRHI
/// "habit strength" chart on the habit detail screen.
library;

// mobile/lib/widgets/automaticity_chart_widget.dart
import 'dart:math' as math;

import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import '../features/my_habits/my_habits_models.dart';
import '../l10n/app_localizations.dart';

/// A line chart of a habit's automaticity index (0-100%) over time — the same
/// composite of SRHI score, adherence and streak that drives reminder
/// fading (see reminderPlanService.computeAutonomyScore on the backend),
/// replayed retrospectively at each weekly SRHI checkpoint.
///
/// Mirrors [SrhiChartWidget]'s layout (pinned y-axis, horizontally scrolling
/// timeline) so the two charts read as one consistent system stacked
/// vertically, with a distinct accent color to tell them apart at a glance.
class AutomaticityChartWidget extends StatelessWidget {
  /// Creates an [AutomaticityChartWidget].
  const AutomaticityChartWidget({
    required this.trajectory,
    this.height = 220,
    super.key,
  });

  /// SRHI trajectory data points to plot. Points without an autonomy score
  /// (not yet submitted) are ignored.
  final List<SrhiTrajectoryPoint> trajectory;

  /// Height of the chart in logical pixels.
  final double height;

  static const double _pxPerWeek = 60;
  static const double _yAxisWidth = 44;
  static const double _xLabelSize = 24;
  static const double _xNameSize = 22;
  static const int _minTimelineWeeks = 4;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    final submitted =
        trajectory.where((p) => p.autonomyScore != null).toList()
          ..sort((a, b) => a.weekNumber.compareTo(b.weekNumber));

    if (submitted.isEmpty) return const SizedBox.shrink();

    final firstWeek = submitted.first.weekNumber;
    final lastWeek = submitted.last.weekNumber;
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
          minY: 0,
          maxY: 1,
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
                l10n.automaticityChartScoreAxis,
                style: axisTitleStyle,
              ),
              sideTitles: SideTitles(
                showTitles: true,
                interval: 0.25,
                reservedSize: 30,
                getTitlesWidget: (value, meta) {
                  final rounded = (value * 100).round();
                  if (rounded % 25 != 0) return const SizedBox.shrink();
                  return Text('$rounded%', style: axisLabelStyle);
                },
              ),
            ),
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

  Widget _plot({
    required BuildContext context,
    required ThemeData theme,
    required List<SrhiTrajectoryPoint> submitted,
    required double domainStart,
    required double domainEnd,
    required int firstWeek,
    required Color gridColor,
    required Color axisColor,
  }) {
    final l10n = AppLocalizations.of(context)!;
    final lineColor = theme.colorScheme.tertiary;
    final axisLabelStyle = theme.textTheme.labelSmall?.copyWith(
      color: axisColor,
    );

    final spots = submitted
        .map((p) => FlSpot(p.weekNumber.toDouble(), p.autonomyScore!))
        .toList();

    return Padding(
      padding: const EdgeInsets.only(top: 8, right: 12),
      child: LineChart(
        LineChartData(
          minX: domainStart,
          maxX: domainEnd,
          minY: 0,
          maxY: 1,
          gridData: FlGridData(
            show: true,
            drawVerticalLine: true,
            horizontalInterval: 0.25,
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
                style: theme.textTheme.labelMedium?.copyWith(
                  color: axisColor,
                  fontWeight: FontWeight.w600,
                ),
              ),
              sideTitles: SideTitles(
                showTitles: true,
                interval: 1,
                reservedSize: _xLabelSize,
                getTitlesWidget: (value, meta) {
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
                  l10n.automaticityChartTooltip(
                    s.x.toInt(),
                    (s.y * 100).toStringAsFixed(0),
                  ),
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

Widget _blankTitle(double value, TitleMeta meta) => const SizedBox.shrink();
