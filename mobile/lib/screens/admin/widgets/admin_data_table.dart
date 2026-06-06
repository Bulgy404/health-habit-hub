/// Reusable paginated data table for admin list views.
library;

import 'package:flutter/material.dart';

/// A generic scrollable data table for admin screens.
///
/// Displays [rows] under [columns] headers with optional [onRowTap] callback.
/// Wraps [DataTable] in a [SingleChildScrollView] so wide tables scroll
/// horizontally on narrow viewports.
class AdminDataTable<T> extends StatelessWidget {
  /// Column header labels.
  final List<String> columns;

  /// Row data items.
  final List<T> rows;

  /// Builds the cells for a single row from its data item.
  final List<DataCell> Function(T item) cellBuilder;

  /// Called when the user taps a row.
  final void Function(T item)? onRowTap;

  /// Optional colour applied to the heading row.
  final Color? headingRowColor;

  /// Creates an [AdminDataTable].
  const AdminDataTable({
    super.key,
    required this.columns,
    required this.rows,
    required this.cellBuilder,
    this.onRowTap,
    this.headingRowColor,
  });

  @override
  Widget build(BuildContext context) {
    final resolvedHeadingColor = headingRowColor ??
        Theme.of(context).colorScheme.surfaceContainerHighest;

    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: DataTable(
        headingRowColor: WidgetStateProperty.all(resolvedHeadingColor),
        columns: columns.map((c) => DataColumn(label: Text(c))).toList(),
        rows: rows
            .map(
              (item) => DataRow(
                cells: cellBuilder(item),
                onSelectChanged:
                    onRowTap != null ? (_) => onRowTap!(item) : null,
              ),
            )
            .toList(),
      ),
    );
  }
}
