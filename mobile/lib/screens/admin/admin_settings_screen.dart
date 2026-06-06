// Admin screen for configuring token card format and other admin settings.
import 'package:flutter/material.dart';
import '../../l10n/app_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../services/admin_service.dart';

/// Admin screen that allows configuring the token card format.
///
/// Features:
///  - Loads current settings from GET /api/v1/admin/settings on open
///  - Radio buttons for token card format: QR only / Print only / Both
///  - Save button calls PUT /api/v1/admin/settings/token_card_format
///  - Success snackbar on save
///  - Refresh in AppBar
class AdminSettingsScreen extends ConsumerStatefulWidget {
  /// Creates an [AdminSettingsScreen].
  const AdminSettingsScreen({super.key});

  @override
  ConsumerState<AdminSettingsScreen> createState() =>
      _AdminSettingsScreenState();
}

class _AdminSettingsScreenState extends ConsumerState<AdminSettingsScreen> {
  bool _loading = true;
  bool _saving = false;
  bool _error = false;
  String _tokenCardFormat = 'both';

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
      final settings = await service.fetchSettings();
      if (mounted) {
        setState(() {
          _tokenCardFormat =
              (settings['token_card_format'] as String?) ?? 'both';
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

  Future<void> _save() async {
    setState(() => _saving = true);
    final l10n = AppLocalizations.of(context)!;
    try {
      final service = ref.read(adminServiceProvider);
      await service.updateSetting('token_card_format', _tokenCardFormat);
      if (mounted) {
        setState(() => _saving = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l10n.settingsSaved)),
        );
      }
    } catch (_) {
      if (mounted) {
        setState(() => _saving = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l10n.failedToSaveSettings)),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.settings),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: l10n.refresh,
            onPressed: _loading ? null : _load,
          ),
        ],
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    final l10n = AppLocalizations.of(context)!;
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(l10n.failedToLoadSettings),
            const SizedBox(height: 12),
            ElevatedButton(onPressed: _load, child: Text(l10n.retry)),
          ],
        ),
      );
    }
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(
          l10n.tokenCardFormat,
          style: Theme.of(context).textTheme.titleMedium,
        ),
        const SizedBox(height: 4),
        Text(
          l10n.tokenCardFormatDescription,
          style: const TextStyle(color: Colors.grey),
        ),
        const SizedBox(height: 8),
        _FormatRadioGroup(
          value: _tokenCardFormat,
          onChanged: _saving ? null : (v) => setState(() => _tokenCardFormat = v),
        ),
        const SizedBox(height: 24),
        SizedBox(
          width: double.infinity,
          child: FilledButton(
            onPressed: _saving ? null : _save,
            child: _saving
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : Text(l10n.save),
          ),
        ),
      ],
    );
  }
}

class _FormatRadioGroup extends StatelessWidget {
  const _FormatRadioGroup({
    required this.value,
    required this.onChanged,
  });

  final String value;
  final ValueChanged<String>? onChanged;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final options = [
      ('qr', l10n.qrOnly, l10n.qrOnlyDescription),
      ('print', l10n.printOnly, l10n.printOnlyDescription),
      ('both', l10n.both, l10n.bothDescription),
    ];
    return Card(
      margin: EdgeInsets.zero,
      child: RadioGroup<String>(
        groupValue: value,
        onChanged: (String? v) {
          if (v != null && onChanged != null) onChanged!(v);
        },
        child: Column(
          children: options.map(((String, String, String) opt) {
            final (val, label, subtitle) = opt;
            return RadioListTile<String>(
              title: Text(label),
              subtitle: Text(subtitle),
              value: val,
            );
          }).toList(),
        ),
      ),
    );
  }
}
