// mobile/lib/widgets/srhi_sparkline_widget.dart
import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import '../features/my_habits/my_habits_models.dart';

/// A mini line chart showing the last N SRHI scores (1–7 scale).
/// Shown on the habit card after week 2; full chart on the detail screen.
class SrhiSparklineWidget extends StatelessWidget {
  const SrhiSparklineWidget({
    required this.trajectory,
    this.height = 48,
    super.key,
  });

  final List<SrhiTrajectoryPoint> trajectory;
  final double height;

  @override
  Widget build(BuildContext context) {
    final submitted = trajectory
        .where((p) => p.score != null)
        .toList();

    if (submitted.isEmpty) return const SizedBox.shrink();

    final spots = submitted.asMap().entries.map((e) {
      return FlSpot(e.key.toDouble(), e.value.score!);
    }).toList();

    return SizedBox(
      height: height,
      child: LineChart(
        LineChartData(
          minY: 1,
          maxY: 7,
          gridData: const FlGridData(show: false),
          titlesData: const FlTitlesData(show: false),
          borderData: FlBorderData(show: false),
          lineTouchData: const LineTouchData(enabled: false),
          lineBarsData: [
            LineChartBarData(
              spots: spots,
              isCurved: true,
              color: const Color(0xFF45B700),
              barWidth: 2,
              dotData: FlDotData(
                show: submitted.length <= 8,
                getDotPainter: (spot, percent, bar, index) =>
                    FlDotCirclePainter(
                  radius: 3,
                  color: const Color(0xFF45B700),
                  strokeWidth: 0,
                  strokeColor: Colors.transparent,
                ),
              ),
              belowBarData: BarAreaData(
                show: true,
                color: const Color(0xFF45B700).withAlpha(26),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
