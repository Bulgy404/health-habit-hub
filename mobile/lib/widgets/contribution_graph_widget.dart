/// GitHub-style contribution/activity calendar graph.
///
/// Renders weeks as columns (Sunday at the top of each column, like GitHub's
/// own contribution graph and the `contributions_chart` package this mirrors:
/// https://pub.dev/packages/contributions_chart), with month labels above and
/// weekday labels on the left. Colour intensity scales with the count for
/// that day; an all-zero grid (e.g. before any habit has been logged) still
/// renders — every cell simply shows as "empty".
///
/// Colours are theme-aware: the empty-cell colour and the intensity scale
/// both derive from [ColorScheme]/[baseColor] so the graph reads correctly
/// in light and dark mode. Month and weekday labels are localised to the
/// active [Locale] rather than hardcoded English. The widget starts scrolled
/// to today; scrolling left towards the oldest currently-rendered week
/// lazily reveals more history.
library;

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

class ContributionGraphWidget extends StatefulWidget {
  /// Creates a [ContributionGraphWidget].
  const ContributionGraphWidget({
    required this.counts,
    this.weeks = 20,
    this.cellSize = 12,
    this.maxLevel,
    this.baseColorLight = const Color(0xFFB7E6A0),
    this.baseColor = const Color(0xFF2E8C00),
    super.key,
  });

  /// Activity count per day, keyed by a date normalised to midnight.
  /// Days absent from the map are treated as zero (empty).
  final Map<DateTime, int> counts;

  /// How many weeks of history to render initially, ending on the current
  /// week. Scrolling towards the start of the graph loads more.
  final int weeks;

  /// Side length of one day cell, in logical pixels.
  final double cellSize;

  /// The count that maps to the most saturated colour. Defaults to the
  /// highest value present in [counts] (minimum 1), so a single-habit graph
  /// (values are always 0 or 1) renders as a clean two-tone grid, while a
  /// multi-habit aggregate graph scales its shades to the busiest day.
  final int? maxLevel;

  /// Cell colour for the lowest non-zero activity level.
  final Color baseColorLight;

  /// Cell colour for the highest activity level.
  final Color baseColor;

  /// Additional weeks revealed each time the user scrolls near the start.
  static const int _weeksChunk = 12;

  /// Upper bound on total rendered weeks, so lazy-loading can't grow
  /// unboundedly (roughly 3 years).
  static const int _maxWeeks = 156;

  @override
  State<ContributionGraphWidget> createState() =>
      _ContributionGraphWidgetState();
}

class _ContributionGraphWidgetState extends State<ContributionGraphWidget> {
  late int _visibleWeeks;
  final _scrollController = ScrollController();

  static DateTime _atMidnight(DateTime d) => DateTime(d.year, d.month, d.day);

  @override
  void initState() {
    super.initState();
    _visibleWeeks = widget.weeks;
    _scrollController.addListener(_onScroll);
    WidgetsBinding.instance.addPostFrameCallback((_) => _jumpToToday());
  }

  @override
  void dispose() {
    _scrollController.removeListener(_onScroll);
    _scrollController.dispose();
    super.dispose();
  }

  void _jumpToToday() {
    if (!mounted || !_scrollController.hasClients) return;
    _scrollController.jumpTo(_scrollController.position.maxScrollExtent);
  }

  double get _columnWidth => widget.cellSize + 2;

  void _onScroll() {
    if (!_scrollController.hasClients) return;
    if (_visibleWeeks >= ContributionGraphWidget._maxWeeks) return;
    // Close to the left edge (the oldest currently-loaded week) — reveal
    // more history and keep the visual scroll position stable by shifting
    // the offset forward by exactly the width the new columns add on the
    // left, so the graph doesn't visibly jump when more weeks load.
    if (_scrollController.position.pixels <= 24) {
      const addedWeeks = ContributionGraphWidget._weeksChunk;
      setState(() {
        _visibleWeeks = (_visibleWeeks + addedWeeks).clamp(
          0,
          ContributionGraphWidget._maxWeeks,
        );
      });
      final addedWidth = addedWeeks * _columnWidth;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted || !_scrollController.hasClients) return;
        _scrollController.jumpTo(_scrollController.offset + addedWidth);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final localeName = Localizations.localeOf(context).toString();
    final today = _atMidnight(DateTime.now());

    return LayoutBuilder(
      builder: (context, constraints) {
        // Always render enough weeks to overflow the available width by at
        // least one column. A fixed week count can otherwise fit entirely
        // within wide viewports, leaving the graph looking static — with
        // no scrollable overflow, the user can never drag it, and the
        // lazy-load-more-history trigger in _onScroll (which only fires
        // when scrolled near the left edge) could never be reached either.
        final minWeeksForOverflow =
            (constraints.maxWidth / _columnWidth).ceil() + 1;
        final effectiveWeeks = _visibleWeeks < minWeeksForOverflow
            ? minWeeksForOverflow.clamp(0, ContributionGraphWidget._maxWeeks)
            : _visibleWeeks;
        return _buildGrid(
          context,
          colorScheme,
          localeName,
          today,
          effectiveWeeks,
        );
      },
    );
  }

  Widget _buildGrid(
    BuildContext context,
    ColorScheme colorScheme,
    String localeName,
    DateTime today,
    int visibleWeeks,
  ) {
    // Start on the Sunday on/before (today - weeks*7 + 1 days), so the grid
    // always ends with the current, possibly-partial week.
    final daysBack = visibleWeeks * 7 - 1;
    final rangeStart = today.subtract(Duration(days: daysBack));
    final gridStart = rangeStart.subtract(
      Duration(days: rangeStart.weekday % 7),
    );

    final resolvedMax =
        widget.maxLevel ??
        widget.counts.values.fold<int>(1, (a, b) => a > b ? a : b);

    final columns = <List<DateTime?>>[];
    var cursor = gridStart;
    while (!cursor.isAfter(today)) {
      final column = <DateTime?>[];
      for (var i = 0; i < 7; i++) {
        column.add(cursor.isAfter(today) ? null : cursor);
        cursor = cursor.add(const Duration(days: 1));
      }
      columns.add(column);
    }

    Color colorFor(DateTime? day) {
      if (day == null) return Colors.transparent;
      final count = widget.counts[_atMidnight(day)] ?? 0;
      if (count <= 0) {
        return colorScheme.surfaceContainerHighest;
      }
      final level = (count / resolvedMax).clamp(0.25, 1.0);
      // Blend from a light tint up to a saturated one, so "some activity"
      // and "a lot of activity" stay visually distinct.
      return Color.lerp(widget.baseColorLight, widget.baseColor, level)!;
    }

    String? monthLabelFor(int columnIndex) {
      final firstDayOfColumn = columns[columnIndex].firstWhere(
        (d) => d != null,
        orElse: () => null,
      );
      if (firstDayOfColumn == null) return null;
      // Only label the first column of each month.
      if (columnIndex > 0) {
        final prevColumn = columns[columnIndex - 1].firstWhere(
          (d) => d != null,
          orElse: () => null,
        );
        if (prevColumn != null && prevColumn.month == firstDayOfColumn.month) {
          return null;
        }
      }
      return _monthAbbreviation(firstDayOfColumn, localeName);
    }

    // Row 0 of each column is always a Sunday (see gridStart above). Label
    // Monday/Wednesday/Friday using the locale's short weekday name, instead
    // of the hardcoded English abbreviations used previously.
    String weekdayLabelFor(int row) {
      if (row != 1 && row != 3 && row != 5) return '';
      return _weekdayAbbreviation(row, localeName);
    }

    final labelStyle = TextStyle(
      fontSize: 10,
      color: colorScheme.onSurfaceVariant,
    );
    // Tall enough to fit a rotated month label (e.g. "September") without
    // clipping, across every supported locale.
    const monthLabelHeight = 48.0;

    return SingleChildScrollView(
      controller: _scrollController,
      scrollDirection: Axis.horizontal,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Weekday labels (Mon/Wed/Fri, GitHub-style sparse labelling).
            Padding(
              padding: EdgeInsets.only(top: monthLabelHeight + 2),
              child: Column(
                children: List.generate(7, (i) {
                  return SizedBox(
                    width: 28,
                    height: widget.cellSize + 2,
                    child: Text(weekdayLabelFor(i), style: labelStyle),
                  );
                }),
              ),
            ),
            const SizedBox(width: 4),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: List.generate(columns.length, (i) {
                    final label = monthLabelFor(i);
                    return SizedBox(
                      width: _columnWidth,
                      height: monthLabelHeight,
                      child: label == null
                          ? null
                          : Align(
                              alignment: Alignment.topCenter,
                              child: RotatedBox(
                                // quarterTurns counts clockwise; 3 == 90°
                                // counter-clockwise, as requested, and lets
                                // the label run the full label height
                                // instead of wrapping in a narrow column.
                                quarterTurns: 3,
                                child: Text(
                                  label,
                                  style: labelStyle,
                                  softWrap: false,
                                  overflow: TextOverflow.visible,
                                ),
                              ),
                            ),
                    );
                  }),
                ),
                const SizedBox(height: 2),
                Row(
                  children: columns.map((column) {
                    return Column(
                      children: column.map((day) {
                        return Padding(
                          padding: const EdgeInsets.all(1),
                          child: Tooltip(
                            message: day == null
                                ? ''
                                : '${day.year}-${day.month.toString().padLeft(2, '0')}-'
                                    '${day.day.toString().padLeft(2, '0')}: '
                                    '${widget.counts[_atMidnight(day)] ?? 0}',
                            child: Container(
                              width: widget.cellSize,
                              height: widget.cellSize,
                              decoration: BoxDecoration(
                                color: colorFor(day),
                                borderRadius: BorderRadius.circular(2),
                              ),
                            ),
                          ),
                        );
                      }).toList(),
                    );
                  }).toList(),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

const _kFallbackMonths = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
const _kFallbackWeekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/// Locale-aware abbreviated month name, degrading to a hardcoded English
/// fallback if intl's locale data hasn't been initialised (e.g. a widget
/// test that renders this widget without calling `initializeDateFormatting`,
/// which the real app always does on startup — see main.dart).
String _monthAbbreviation(DateTime date, String locale) {
  try {
    return DateFormat.MMM(locale).format(date);
  } catch (_) {
    return _kFallbackMonths[date.month - 1];
  }
}

/// Locale-aware abbreviated weekday name for grid [row] (0 = Sunday), with
/// the same fallback as [_monthAbbreviation].
String _weekdayAbbreviation(int row, String locale) {
  try {
    // 2023-01-01 was a Sunday; any Sunday-anchored week is a valid stand-in
    // reference date for resolving the locale's weekday name for this row.
    return DateFormat.E(
      locale,
    ).format(DateTime(2023, 1, 1).add(Duration(days: row)));
  } catch (_) {
    return _kFallbackWeekdays[row];
  }
}
