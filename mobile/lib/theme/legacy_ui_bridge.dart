import 'package:material_ui/material_ui.dart';

/// Temporary compatibility for fl_chart 1.3 and third-party SDK Material UI.
/// Remove when those packages use the standalone libraries themselves.
class LegacyUiBridge extends StatelessWidget {
  const LegacyUiBridge({super.key, required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    // This is the migration utility recommended by material_ui for old packages.
    // ignore: deprecated_member_use
    return MaterialUiCompatibilityBridge(child: child);
  }
}
