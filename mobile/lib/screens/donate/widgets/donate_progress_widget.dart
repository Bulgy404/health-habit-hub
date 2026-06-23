/// Progress and success display widgets for the habit donation flow.
///
/// [DonateProgressWidget] renders a pinned submit button that shows a spinner
/// while a submission is in flight.  [DonateSuccessWidget] is the full-screen
/// success state shown after a successful donation.
library;

import 'package:flutter/material.dart';

import '../../../l10n/app_localizations.dart';

// ---------------------------------------------------------------------------
// Submit button
// ---------------------------------------------------------------------------

/// A bottom-pinned submit button that becomes a spinner while [submitting].
///
/// Wrap inside a [Stack] at the bottom of the form scaffold.
class DonateProgressWidget extends StatelessWidget {
  /// Whether a submission is currently in progress.
  final bool submitting;

  /// Called when the user taps the submit button.
  final VoidCallback onSubmit;

  /// Creates a [DonateProgressWidget].
  const DonateProgressWidget({
    super.key,
    required this.submitting,
    required this.onSubmit,
  });

  @override
  Widget build(BuildContext context) {
    return Positioned(
      bottom: 0,
      left: 0,
      right: 0,
      child: Container(
        color: Theme.of(context).scaffoldBackgroundColor,
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
        child: FilledButton(
          onPressed: submitting ? null : onSubmit,
          child: submitting
              ? const SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Colors.white,
                  ),
                )
              : const Text('Donate habit'),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Success screen body
// ---------------------------------------------------------------------------

/// Full-screen success state displayed after a habit has been donated.
///
/// Shows a confirmation icon, success message, and a button to donate another
/// habit (calls [onReset]).
class DonateSuccessWidget extends StatelessWidget {
  /// Called when the user chooses to donate another habit.
  final VoidCallback onReset;

  /// Creates a [DonateSuccessWidget].
  const DonateSuccessWidget({super.key, required this.onReset});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 72,
              height: 72,
              decoration: BoxDecoration(
                color: const Color(0xFFEDF7E5),
                borderRadius: BorderRadius.circular(22),
              ),
              child: const Icon(
                Icons.check_circle,
                size: 44,
                color: Color(0xFF45B700),
              ),
            ),
            const SizedBox(height: 24),
            Text(
              l10n.habitSharedSuccess,
              style: const TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.w900,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              'Your habit is being analyzed and will appear in the community shortly.',
              style: TextStyle(fontSize: 14, color: Colors.grey.shade600),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 28),
            FilledButton(
              onPressed: onReset,
              child: const Text('Share another habit'),
            ),
          ],
        ),
      ),
    );
  }
}
