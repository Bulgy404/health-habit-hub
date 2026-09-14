import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:go_router/go_router.dart';

import 'consent_screen.dart';

/// Study-specific consent, for verified-identity studies.
///
/// Reached only via the router's consent gate AFTER enrolment, never as a step
/// in the onboarding chain: the study — and therefore which document is owed —
/// is unknown until the enrolment code has been redeemed. Reordering onboarding
/// to ask for the code first would be a far larger change to a well-tested
/// flow, so this is a gate instead.
///
/// It resolves the pending slug from secure storage and delegates rendering to
/// [ConsentScreen], reusing its document fetch, offline handling and
/// accept/decline behaviour rather than duplicating them.
class StudyConsentScreen extends StatefulWidget {
  const StudyConsentScreen({super.key});

  @override
  State<StudyConsentScreen> createState() => _StudyConsentScreenState();
}

class _StudyConsentScreenState extends State<StudyConsentScreen> {
  late final Future<String?> _slug;

  @override
  void initState() {
    super.initState();
    _slug = const FlutterSecureStorage()
        .read(key: kPendingStudyConsentSlugKey)
        // Storage can legitimately fail (a locked keychain, a wiped device).
        // Treat that as "nothing pending" rather than trapping the participant
        // on a screen that can never resolve.
        .catchError((_) => null);
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<String?>(
      future: _slug,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const Scaffold(
            body: Center(child: CircularProgressIndicator()),
          );
        }
        final slug = snapshot.data;
        if (slug == null || slug.isEmpty) {
          // Already accepted, or a stale deep link. Send them on rather than
          // showing an empty consent screen they cannot dismiss.
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (context.mounted) context.go('/share');
          });
          return const Scaffold(
            body: Center(child: CircularProgressIndicator()),
          );
        }
        return ConsentScreen(documentSlug: slug);
      },
    );
  }
}
