import 'package:flutter/material.dart';
import '../l10n/app_localizations.dart';

/// Offline state banner with a retry button.
///
/// Shows a top orange no-connection bar, a centred cloud-off icon with
/// a configurable [message], and a retry button.
class OfflineBanner extends StatelessWidget {
  /// Creates an [OfflineBanner] with the given [message] and [onRetry] callback.
  const OfflineBanner({
    super.key,
    required this.message,
    required this.onRetry,
  });

  /// Body message shown below the cloud-off icon.
  final String message;

  /// Called when the user taps the retry button.
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Column(
      children: [
        Container(
          width: double.infinity,
          color: Colors.orange,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Row(
            children: [
              const Icon(Icons.wifi_off, color: Colors.white),
              const SizedBox(width: 8),
              Text(
                l10n.noConnection,
                style: const TextStyle(color: Colors.white, fontSize: 15),
              ),
            ],
          ),
        ),
        Expanded(
          child: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.cloud_off, size: 64, color: Colors.grey),
                const SizedBox(height: 16),
                Text(
                  message,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.grey),
                ),
                const SizedBox(height: 24),
                ElevatedButton.icon(
                  onPressed: onRetry,
                  icon: const Icon(Icons.refresh),
                  label: Text(l10n.retry),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
