/// Formats [date] as an ISO 8601 calendar date string (`YYYY-MM-DD`) using
/// its local year/month/day components — no time-zone conversion is applied.
///
/// This is the single shared implementation for the `YYYY-MM-DD` formatting
/// previously duplicated across several screens/widgets (habit detail, my
/// habits list, donate screen, day strip, contribution graph, profile
/// fields). Keeping one implementation avoids subtle drift (e.g. one copy
/// forgetting to zero-pad the year) and makes date-key formats easy to
/// grep for.
String formatDateYmd(DateTime date) {
  final y = date.year.toString().padLeft(4, '0');
  final m = date.month.toString().padLeft(2, '0');
  final d = date.day.toString().padLeft(2, '0');
  return '$y-$m-$d';
}
