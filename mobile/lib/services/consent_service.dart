import 'package:dio/dio.dart';

import '../config/app_config.dart';

/// Compares two semver strings. Returns a negative number when [a] < [b],
/// zero when equal, positive when [a] > [b]. Non-numeric segments count as 0.
int compareSemver(String a, String b) {
  List<int> parse(String v) => v
      .split('.')
      .map((p) => int.tryParse(p.trim()) ?? 0)
      .toList(growable: true);
  final pa = parse(a);
  final pb = parse(b);
  while (pa.length < 3) {
    pa.add(0);
  }
  while (pb.length < 3) {
    pb.add(0);
  }
  for (var i = 0; i < 3; i++) {
    if (pa[i] != pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

/// Checks whether the participant must (re-)accept the informed-consent
/// document (UC-31): true when no consent is recorded server-side or the
/// recorded version is older than the currently served document version.
///
/// Fails open (returns false) on network errors so a flaky connection never
/// locks participants out — the check re-runs on every app start.
Future<bool> isReconsentRequired(Dio dio, String locale) async {
  try {
    final docRes = await dio.get<Map<String, dynamic>>(
      '${AppConfig.appBaseUrl}/$locale/consent',
    );
    final currentVersion =
        (docRes.data?['document'] as Map<String, dynamic>?)?['version']
            ?.toString();
    if (currentVersion == null) return false;

    final recRes = await dio.get<Map<String, dynamic>>(
      '${AppConfig.apiBaseUrl}/users/me/consent',
      options: Options(
        validateStatus: (s) => s != null && (s == 200 || s == 404),
      ),
    );
    if (recRes.statusCode == 404) return true; // account predates consent flow
    final recordedVersion = recRes.data?['consentVersion']?.toString();
    if (recordedVersion == null) return true;

    return compareSemver(recordedVersion, currentVersion) < 0;
  } catch (_) {
    return false;
  }
}
