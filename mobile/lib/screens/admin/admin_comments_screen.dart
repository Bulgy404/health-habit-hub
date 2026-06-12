// Admin screen for moderating participant comments on habits.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../l10n/app_localizations.dart';
import '../../services/admin_service.dart';

/// Researcher moderation view: every participant comment across all habits,
/// newest first, with the habit sentence for context and a delete action.
/// Comments are anonymous — deleting removes the Neo4j node and the
/// ownership mapping (see UC-34).
class AdminCommentsScreen extends ConsumerStatefulWidget {
  /// Creates an [AdminCommentsScreen].
  const AdminCommentsScreen({super.key});

  @override
  ConsumerState<AdminCommentsScreen> createState() =>
      _AdminCommentsScreenState();
}

class _AdminCommentsScreenState extends ConsumerState<AdminCommentsScreen> {
  List<AdminComment> _comments = [];
  bool _loading = true;
  bool _error = false;
  String? _deletingId;

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
      final comments =
          await ref.read(adminServiceProvider).fetchModerationComments();
      if (mounted) {
        setState(() {
          _comments = comments;
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

  Future<void> _confirmDelete(AdminComment comment) async {
    final l10n = AppLocalizations.of(context)!;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l10n.adminDeleteCommentTitle),
        content: Text('"${comment.text}"\n\n${l10n.adminDeleteCommentContent}'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text(l10n.cancel),
          ),
          TextButton(
            style: TextButton.styleFrom(
              foregroundColor: const Color(0xFFDC2626),
            ),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(l10n.delete),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    setState(() => _deletingId = comment.id);
    try {
      await ref.read(adminServiceProvider).deleteModeratedComment(comment.id);
      if (mounted) {
        setState(() => _comments =
            _comments.where((c) => c.id != comment.id).toList());
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l10n.adminFailedToDeleteComment)),
        );
      }
    } finally {
      if (mounted) setState(() => _deletingId = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.adminComments),
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
              ? Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(l10n.adminFailedToLoadComments),
                      const SizedBox(height: 8),
                      OutlinedButton(
                        onPressed: _load,
                        child: Text(l10n.retry),
                      ),
                    ],
                  ),
                )
              : _comments.isEmpty
                  ? Center(child: Text(l10n.adminNoCommentsYet))
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView.separated(
                        padding: const EdgeInsets.all(12),
                        itemCount: _comments.length,
                        separatorBuilder: (_, _) => const Divider(height: 1),
                        itemBuilder: (context, i) {
                          final c = _comments[i];
                          return ListTile(
                            contentPadding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 4,
                            ),
                            title: Text(c.text),
                            subtitle: Padding(
                              padding: const EdgeInsets.only(top: 4),
                              child: Text(
                                '${c.habitSentence}\n${c.createdAt.replaceFirst('T', ' ').split('.').first}',
                                style:
                                    Theme.of(context).textTheme.bodySmall,
                              ),
                            ),
                            isThreeLine: true,
                            trailing: _deletingId == c.id
                                ? const SizedBox(
                                    width: 18,
                                    height: 18,
                                    child: CircularProgressIndicator(
                                        strokeWidth: 2),
                                  )
                                : IconButton(
                                    icon: const Icon(
                                      Icons.delete_outline,
                                      color: Color(0xFFDC2626),
                                    ),
                                    tooltip: l10n.delete,
                                    onPressed: () => _confirmDelete(c),
                                  ),
                          );
                        },
                      ),
                    ),
    );
  }
}
