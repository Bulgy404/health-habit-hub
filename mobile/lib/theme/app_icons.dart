/// Shared icon vocabulary so recurring states (a flow finished successfully,
/// an item is the current selection, "add one more") render the same glyph
/// everywhere instead of each screen separately picking between a tick, a
/// filled/outline check circle, or a plus.
///
/// Pair with `context.appColors.primary` (see app_colors.dart) rather than a
/// hardcoded hex, so the color side of the language stays unified too.
library;

import 'package:flutter/material.dart';

class AppIcons {
  const AppIcons._();

  /// A definitive success/completion state — a flow finished (habit shared,
  /// questionnaire submitted, implementation intention confirmed).
  static const IconData success = Icons.check_circle;

  /// Marks the currently-selected option in a list/picker (language,
  /// appearance mode, a confirmed checkbox-style item).
  static const IconData selected = Icons.check;

  /// "Add one more" affordance (another cue, another shared habit).
  static const IconData addMore = Icons.add_circle_outline;
}
