import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../config/app_config.dart';
import '../core/dio_provider.dart';
import '../features/my_habits/my_habits_provider.dart';
import '../l10n/app_localizations.dart';
import '../services/consent_service.dart';
import '../services/offline_queue_service.dart';
import '../services/push_notification_service.dart';
import '../services/reminder_scheduler_service.dart';

/// Checks whether re-consent is required for the current locale.
///
/// Exposed as a provider so widget tests can keep [ShellScreen] focused on
/// navigation without starting real network requests.
final reconsentRequiredProvider = Provider<Future<bool> Function(String)>((
  ref,
) {
  return (locale) => isReconsentRequired(ref.read(dioProvider), locale);
});

/// Fetches the slug of a currently-due study questionnaire, or `null` if
/// none is due (or the request fails, e.g. offline).
///
/// Exposed as a provider so [ShellScreen] can be tested without making a
/// real network request — see [habitReminderSyncProvider] for the same
/// pattern.
final dueQuestionnaireProvider = Provider<Future<String?> Function()>((ref) {
  return () async {
    try {
      final response = await ref
          .read(dioProvider)
          .get<Map<String, dynamic>>(
            '${AppConfig.apiBaseUrl}/questionnaires/due',
          );
      final items = (response.data?['questionnaires'] as List<dynamic>? ?? [])
          .whereType<Map<String, dynamic>>();
      final due = items.firstWhere(
        (it) => it['isDue'] == true,
        orElse: () => const {},
      );
      return due['questionnaireSlug']?.toString();
    } catch (_) {
      return null;
    }
  };
});

/// Synchronizes adaptive habit reminders and study-questionnaire reminders.
///
/// Exposed as a single provider so all reminder-related startup side effects
/// can be replaced with a no-op in widget tests (avoids real network + local
/// notification platform-channel calls). Each sync is isolated so a failure in
/// one does not prevent the other.
final habitReminderSyncProvider = Provider<Future<void> Function()>((ref) {
  return () async {
    final service = ReminderSchedulerService(dio: ref.read(dioProvider));
    try {
      await service.syncReminders();
    } catch (_) {
      // Offline or no active intentions — retried on next start.
    }
    try {
      await service.syncQuestionnaireReminders();
    } catch (_) {
      // Non-fatal: rescheduled on next app start.
    }
    try {
      await service.syncEndOfStudyNotification();
    } catch (_) {
      // Non-fatal: rescheduled on next app start.
    }
  };
});

/// The persistent bottom-navigation shell for the app.
///
/// Uses [StatefulNavigationShell] from go_router to preserve navigation state
/// across tab switches. The Admin tab is shown only when the user has the
/// `admin` or `researcher` Keycloak realm role.
///
/// Also bootstraps push-notification permission, token registration, and
/// navigation from tapped notifications.
class ShellScreen extends ConsumerStatefulWidget {
  /// Creates a [ShellScreen] wrapping [navigationShell].
  const ShellScreen({required this.navigationShell, super.key});

  /// The GoRouter navigation shell providing per-tab navigation state.
  final StatefulNavigationShell navigationShell;

  @override
  ConsumerState<ShellScreen> createState() => _ShellScreenState();
}

class _ShellScreenState extends ConsumerState<ShellScreen> {
  // `branch` is the index of the matching StatefulShellBranch in app_router.dart.
  // Keep these in sync with the branch order there.
  List<_TabConfig> _allTabs(AppLocalizations l10n) => [
    _TabConfig(
      label: l10n.navTabShare,
      icon: Icons.volunteer_activism,
      path: '/share',
      branch: 0,
    ),
    _TabConfig(
      label: l10n.navTabExplore,
      icon: Icons.hub,
      path: '/explore',
      branch: 1,
    ),
    _TabConfig(
      label: l10n.myHabitsTab,
      icon: Icons.self_improvement,
      path: '/habits',
      branch: 2,
    ),
    _TabConfig(
      label: l10n.navTabRecommend,
      icon: Icons.lightbulb,
      path: '/recommend',
      branch: 3,
    ),
    _TabConfig(
      label: l10n.navTabAccount,
      icon: Icons.manage_accounts,
      path: '/settings',
      branch: 4,
    ),
  ];

  StreamSubscription<List<ConnectivityResult>>? _connectivitySubscription;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _checkConsentVersion();
      _initNotifications();
      _syncHabitReminders();
      _watchConnectivity();
      _remindDueQuestionnaires();
    });
  }

  @override
  void dispose() {
    _connectivitySubscription?.cancel();
    super.dispose();
  }

  /// UC-33: refresh the adaptive local habit reminders from the latest backend
  /// plan (frequency fades as SRHI / adherence rise) and reschedule upcoming
  /// study-questionnaire reminders. Both run via [habitReminderSyncProvider] so
  /// they can be stubbed out in tests.
  Future<void> _syncHabitReminders() async {
    try {
      await ref.read(habitReminderSyncProvider)();
    } catch (_) {
      // Offline / plugins unavailable — retried on next start.
    }
  }

  /// Surfaces an in-app reminder right after startup when a study
  /// questionnaire is currently due, in addition to the local push
  /// notification [ReminderSchedulerService.syncQuestionnaireReminders]
  /// schedules for later. Silently does nothing when offline or when no
  /// questionnaire is due — this is a courtesy nudge, not a hard requirement.
  Future<void> _remindDueQuestionnaires() async {
    final slug = await ref.read(dueQuestionnaireProvider)();
    if (slug == null || !mounted) return;

    final l10n = AppLocalizations.of(context)!;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(l10n.questionnaireReminderMessage),
        action: SnackBarAction(
          label: l10n.questionnaireReminderAction,
          onPressed: () {
            if (mounted) context.push('/questionnaire/$slug');
          },
        ),
        duration: const Duration(seconds: 8),
      ),
    );
  }

  /// UC-31: when the informed-consent document version was bumped since this
  /// participant last accepted it, route to the mandatory re-consent screen.
  Future<void> _checkConsentVersion() async {
    final locale = mounted
        ? Localizations.localeOf(context).languageCode
        : 'en';
    final required = await ref.read(reconsentRequiredProvider)(locale);
    if (required && mounted) context.go('/consent-update');
  }

  void _watchConnectivity() {
    _connectivitySubscription = Connectivity().onConnectivityChanged.listen((
      results,
    ) {
      if (results.any((r) => r != ConnectivityResult.none)) {
        _drainOfflineQueue();
      }
    });
  }

  Future<void> _drainOfflineQueue() async {
    final items = await offlineQueueService.drain();
    if (items.isEmpty) return;

    final dio = ref.read(dioProvider);
    var succeeded = 0;

    for (final item in items) {
      try {
        await dio.post<Map<String, dynamic>>(
          '${AppConfig.apiBaseUrl}/habits/share',
          data: item.payload,
        );
        succeeded++;
      } catch (_) {
        await offlineQueueService.requeue(item);
      }
    }

    if (succeeded > 0 && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            '$succeeded habit${succeeded == 1 ? '' : 's'} submitted from offline queue',
          ),
        ),
      );
    }
  }

  Future<void> _initNotifications() async {
    try {
      final service = ref.read(pushNotificationServiceProvider);
      await service.initialize();
    } catch (_) {
      // Firebase not configured or unavailable — silently skip.
      return;
    }

    // Handle notification tapped while app was terminated.
    final initial = await FirebaseMessaging.instance.getInitialMessage();
    if (initial != null && mounted) {
      final route = ref
          .read(pushNotificationServiceProvider)
          .routeForMessage(initial);
      if (route != null) context.go(route);
    }

    // Handle notification tapped while app was in background.
    FirebaseMessaging.onMessageOpenedApp.listen((message) {
      if (!mounted) return;
      final route = ref
          .read(pushNotificationServiceProvider)
          .routeForMessage(message);
      if (route != null) context.go(route);
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    // Study-level feature flag: hide the recommender tab when the participant's
    // study disables it. Defaults to enabled while the config loads / on error.
    final recommenderEnabled = ref.watch(recommenderEnabledProvider);

    // Filter tabs by capability. `branch` carries the real router branch index,
    // so visible-index → branch mapping works regardless of which tabs are hidden.
    final visibleTabs = _allTabs(l10n).where((t) {
      if (t.path == '/recommend') return recommenderEnabled;
      return true;
    }).toList();

    // Highlight the tab matching the current branch; fall back to the first tab
    // when the current branch is hidden (e.g. landed on /recommend then disabled).
    final currentBranch = widget.navigationShell.currentIndex;
    final matchedIndex = visibleTabs.indexWhere(
      (t) => t.branch == currentBranch,
    );
    final currentVisibleIndex = matchedIndex >= 0 ? matchedIndex : 0;

    return Scaffold(
      body: widget.navigationShell,
      bottomNavigationBar: DecoratedBox(
        decoration: BoxDecoration(
          border: Border(
            top: BorderSide(
              color: Theme.of(context).colorScheme.outlineVariant,
              width: 1,
            ),
          ),
        ),
        child: NavigationBar(
          selectedIndex: currentVisibleIndex,
          onDestinationSelected: (visibleIndex) {
            final branchIndex = visibleTabs[visibleIndex].branch;
            widget.navigationShell.goBranch(
              branchIndex,
              initialLocation:
                  branchIndex == widget.navigationShell.currentIndex,
            );
          },
          destinations: visibleTabs
              .map(
                (tab) => NavigationDestination(
                  icon: Icon(tab.icon),
                  label: tab.label,
                ),
              )
              .toList(),
        ),
      ),
    );
  }
}

class _TabConfig {
  const _TabConfig({
    required this.label,
    required this.icon,
    required this.path,
    required this.branch,
  });

  final String label;
  final IconData icon;
  final String path;

  /// Index of the matching StatefulShellBranch in app_router.dart.
  final int branch;
}
