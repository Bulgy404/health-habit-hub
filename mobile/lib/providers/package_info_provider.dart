import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:package_info_plus/package_info_plus.dart';

/// Provides the app's version/build metadata (from the platform package
/// manifest — pubspec.yaml's `version:` on the build that produced this
/// binary), for display in Settings.
final packageInfoProvider = FutureProvider<PackageInfo>((ref) {
  return PackageInfo.fromPlatform();
});
