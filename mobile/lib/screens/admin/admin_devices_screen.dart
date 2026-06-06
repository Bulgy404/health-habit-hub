// Admin screen for device/session management.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../l10n/app_localizations.dart';
import '../../models/admin_session.dart';
import '../../services/admin_service.dart';
import 'widgets/admin_data_table.dart';

/// Admin screen that lists all active device sessions and allows revoking them.
///
/// Features:
///  - Summary row at top: Android N, iOS N, Web N
///  - DataTable: Participant ID, Device Type, App Version, Last Seen, Session ID (truncated)
///  - Revoke button per row with confirmation dialog
///  - Refresh button in AppBar
class AdminDevicesScreen extends ConsumerStatefulWidget {
  /// Creates an [AdminDevicesScreen].
  const AdminDevicesScreen({super.key});

  @override
  ConsumerState<AdminDevicesScreen> createState() =>
      _AdminDevicesScreenState();
}

class _AdminDevicesScreenState extends ConsumerState<AdminDevicesScreen> {
  List<AdminSession> _sessions = [];
  bool _loading = true;
  bool _error = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = false;
    });
    try {
      final service = ref.read(adminServiceProvider);
      final sessions = await service.fetchSessions();
      if (mounted) {
        setState(() {
          _sessions = sessions;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = true;
        });
      }
    }
  }

  Future<void> _revokeSession(AdminSession session) async {
    final l10n = AppLocalizations.of(context)!;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l10n.adminRevokeSessionTitle),
        content: Text(
          l10n.adminRevokeSessionContent(session.participantId),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text(l10n.cancel),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(l10n.adminRevoke),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await ref.read(adminServiceProvider).revokeSession(session.id);
      if (mounted) {
        setState(() {
          _sessions = _sessions.where((s) => s.id != session.id).toList();
        });
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(AppLocalizations.of(context)!.adminSessionRevoked)),
        );
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(AppLocalizations.of(context)!.adminFailedToRevokeSession)),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.adminDeviceSessions),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: l10n.refresh,
            onPressed: _load,
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error
              ? _ErrorView(onRetry: _load)
              : _SessionsBody(
                  sessions: _sessions,
                  onRevoke: _revokeSession,
                ),
    );
  }
}

// ---------------------------------------------------------------------------
// Summary + table body
// ---------------------------------------------------------------------------

class _SessionsBody extends StatelessWidget {
  const _SessionsBody({
    required this.sessions,
    required this.onRevoke,
  });

  final List<AdminSession> sessions;
  final void Function(AdminSession) onRevoke;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final androidCount =
        sessions.where((s) => s.deviceType.toLowerCase() == 'android').length;
    final iosCount =
        sessions.where((s) => s.deviceType.toLowerCase() == 'ios').length;
    final webCount =
        sessions.where((s) => s.deviceType.toLowerCase() == 'web').length;

    if (sessions.isEmpty) {
      return Center(child: Text(l10n.adminNoActiveSessions));
    }

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _SummaryRow(
            androidCount: androidCount,
            iosCount: iosCount,
            webCount: webCount,
          ),
          const SizedBox(height: 16),
          _SessionsTable(sessions: sessions, onRevoke: onRevoke),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Summary row
// ---------------------------------------------------------------------------

class _SummaryRow extends StatelessWidget {
  const _SummaryRow({
    required this.androidCount,
    required this.iosCount,
    required this.webCount,
  });

  final int androidCount;
  final int iosCount;
  final int webCount;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      children: [
        _SummaryChip(
          icon: Icons.android,
          label: 'Android $androidCount',
          color: Colors.green,
          textTheme: theme.textTheme,
        ),
        const SizedBox(width: 8),
        _SummaryChip(
          icon: Icons.apple,
          label: 'iOS $iosCount',
          color: Colors.grey,
          textTheme: theme.textTheme,
        ),
        const SizedBox(width: 8),
        _SummaryChip(
          icon: Icons.web,
          label: 'Web $webCount',
          color: Colors.blue,
          textTheme: theme.textTheme,
        ),
      ],
    );
  }
}

class _SummaryChip extends StatelessWidget {
  const _SummaryChip({
    required this.icon,
    required this.label,
    required this.color,
    required this.textTheme,
  });

  final IconData icon;
  final String label;
  final Color color;
  final TextTheme textTheme;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: color.withAlpha(24),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: color),
          const SizedBox(width: 4),
          Text(label, style: textTheme.bodySmall?.copyWith(color: color)),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// DataTable
// ---------------------------------------------------------------------------

class _SessionsTable extends StatelessWidget {
  const _SessionsTable({
    required this.sessions,
    required this.onRevoke,
  });

  final List<AdminSession> sessions;
  final void Function(AdminSession) onRevoke;

  static String _fmtDate(DateTime dt) {
    final local = dt.toLocal();
    final y = local.year.toString().padLeft(4, '0');
    final mo = local.month.toString().padLeft(2, '0');
    final d = local.day.toString().padLeft(2, '0');
    final h = local.hour.toString().padLeft(2, '0');
    final mi = local.minute.toString().padLeft(2, '0');
    return '$y-$mo-$d $h:$mi';
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return AdminDataTable<AdminSession>(
      columns: [
        l10n.adminColParticipantId,
        l10n.adminColDeviceType,
        l10n.adminColAppVersion,
        l10n.adminColLastSeen,
        l10n.adminColSessionId,
        l10n.adminColActions,
      ],
      rows: sessions,
      cellBuilder: (s) {
        final truncatedId =
            s.id.length > 12 ? '${s.id.substring(0, 12)}…' : s.id;
        return [
          DataCell(Text(s.participantId)),
          DataCell(Text(s.deviceType)),
          DataCell(Text(s.appVersion.isNotEmpty ? s.appVersion : '—')),
          DataCell(Text(s.lastSeen.year == 0 ? '—' : _fmtDate(s.lastSeen))),
          DataCell(Tooltip(message: s.id, child: Text(truncatedId))),
          DataCell(
            TextButton(
              onPressed: () => onRevoke(s),
              child: Text(l10n.adminRevoke),
            ),
          ),
        ];
      },
    );
  }
}

// ---------------------------------------------------------------------------
// Error view
// ---------------------------------------------------------------------------

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(l10n.adminFailedToLoadSessions),
          const SizedBox(height: 8),
          ElevatedButton(onPressed: onRetry, child: Text(l10n.retry)),
        ],
      ),
    );
  }
}
