import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../screens/onboarding/study_code_screen.dart' show kSubjectCodeKey;

/// Shows the participant's study subject code, for verified-identity studies.
///
/// The subject code is a **pseudonym, not a credential** — it identifies the
/// participant to their study site without revealing anything about them, and
/// the site needs them to be able to quote it (for an appointment, a query, or
/// a withdrawal request). Showing it is the point; there is nothing to protect
/// here that the study site does not already know.
///
/// Renders nothing at all for anonymous studies, which is every existing one.
class SubjectCodeTile extends StatefulWidget {
  const SubjectCodeTile({super.key});

  @override
  State<SubjectCodeTile> createState() => _SubjectCodeTileState();
}

class _SubjectCodeTileState extends State<SubjectCodeTile> {
  String? _code;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    String? code;
    try {
      code = await const FlutterSecureStorage().read(key: kSubjectCodeKey);
    } catch (_) {
      // Storage can legitimately fail (locked keychain, wiped device). Absent
      // is the correct fallback: it renders nothing.
      code = null;
    }
    if (mounted) setState(() => _code = code);
  }

  @override
  Widget build(BuildContext context) {
    final code = _code;
    if (code == null || code.isEmpty) return const SizedBox.shrink();

    return ListTile(
      leading: const Icon(Icons.badge_outlined, size: 20),
      title: const Text('Study subject code'),
      subtitle: Text(
        code,
        style: const TextStyle(fontFamily: 'monospace', fontSize: 16),
      ),
      trailing: IconButton(
        icon: const Icon(Icons.copy, size: 18),
        tooltip: 'Copy',
        onPressed: () async {
          await Clipboard.setData(ClipboardData(text: code));
          if (!context.mounted) return;
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Subject code copied')),
          );
        },
      ),
    );
  }
}
