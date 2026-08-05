import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../config/app_config.dart';
import '../core/dio_provider.dart';
import '../features/my_habits/my_habits_provider.dart';
import '../features/my_habits/my_habits_service.dart';
import '../l10n/app_localizations.dart';
import '../providers/bubble_graph_provider.dart';
import '../providers/show_in_graph_provider.dart';
import '../services/consent_service.dart';
import '../services/habit_service.dart';
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
    // §7.5 — this is the main place badge changes actually get noticed: most
    // badges are earned/lost days or weeks after habit creation (the other
    // check, right after creating a habit, mostly only ever sees First Step).
    try {
      final g = await MyHabitsService(dio: ref.read(dioProvider))
          .fetchGamification();
      final earnedKeys = g.newlyEarned.map((b) => b.badgeKey).toList();
      if (earnedKeys.isNotEmpty) {
        await service.showPraiseNotifications(earnedKeys);
      }
      final lostKeys = g.newlyLost.map((b) => b.badgeKey).toList();
      if (lostKeys.isNotEmpty) {
        await service.showGetBackOnTrackNotifications(lostKeys);
      }
    } catch (_) {
      // Non-fatal: rechecked on next app start.
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

class _ShellScreenState extends ConsumerState<ShellScreen>
    with WidgetsBindingObserver {
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
  DateTime? _pausedAt;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _checkConsentVersion();
      _initNotifications();
      _syncHabitReminders();
      _watchConnectivity();
      // _watchConnectivity only fires on a connectivity *change*, so a cold
      // start that's already online would otherwise leave anything queued
      // from a previous offline session stuck until the next transition.
      _drainOfflineQueueIfOnline();
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _connectivitySubscription?.cancel();
    super.dispose();
  }

  // Requests made just before/during backgrounding can be left stuck (the OS
  // suspends the isolate mid-flight, or the socket goes stale while idle) with
  // no error and no retry — the screen that started them is stuck loading
  // forever, since a FutureProvider only runs once and caches its Future.
  // Refreshing every network-backed provider on resume, after a long enough
  // idle period that a stuck/stale request is actually likely, self-heals
  // that instead of requiring the user to notice and manually pull-to-refresh
  // every screen. A short app-switch (e.g. checking a notification) is below
  // the threshold and does not trigger a refetch.
  static const _idleRefreshThreshold = Duration(seconds: 60);

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.inactive) {
      _pausedAt ??= DateTime.now();
      return;
    }
    if (state != AppLifecycleState.resumed) return;
    final pausedAt = _pausedAt;
    _pausedAt = null;
    if (pausedAt == null) return;
    if (DateTime.now().difference(pausedAt) < _idleRefreshThreshold) return;

    ref.invalidate(bubbleGraphProvider);
    ref.invalidate(myStatsProvider);
    ref.invalidate(habitStatsProvider);
    ref.invalidate(myAnnotationsProvider);
    ref.invalidate(habitConfigProvider);
    ref.invalidate(intentionsProvider);
    ref.invalidate(dueSrhiProvider);
    ref.invalidate(allHabitsActivityProvider);
    _drainOfflineQueueIfOnline();
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

  Future<void> _drainOfflineQueueIfOnline() async {
    final results = await Connectivity().checkConnectivity();
    if (results.any((r) => r != ConnectivityResult.none)) {
      await _drainOfflineQueue();
    }
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
      await service.initialize(
        onLocalNotificationTap: (route) {
          if (mounted) context.go(route);
        },
      );
    } catch (_) {
      // Firebase not configured or unavailable — silently skip.
      return;
    }

    // Handle a local notification (e.g. a habit reminder) that launched the
    // app from a cold start.
    final localLaunchRoute = await getInitialLocalNotificationPayload();
    if (localLaunchRoute != null && localLaunchRoute.isNotEmpty && mounted) {
      context.go(localLaunchRoute);
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

  DateTime? _lastSessionExpiredPromptAt;

  void _showSessionExpiredPrompt(AppLocalizations l10n) {
    // A single dead session typically fails several in-flight requests at
    // once (e.g. logs + trajectory both refetching), each bumping
    // [sessionExpiredProvider] — debounce so that doesn't stack up several
    // identical snackbars.
    final now = DateTime.now();
    final last = _lastSessionExpiredPromptAt;
    if (last != null && now.difference(last) < const Duration(seconds: 5)) {
      return;
    }
    _lastSessionExpiredPromptAt = now;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(l10n.sessionExpiredMessage),
        duration: const Duration(seconds: 8),
        action: SnackBarAction(
          label: l10n.signInAction,
          onPressed: () =>
              context.go('/signing-out', extra: '/onboarding/restore'),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    ref.listen<int>(sessionExpiredProvider, (previous, next) {
      if (previous != null && next > previous) {
        _showSessionExpiredPrompt(l10n);
      }
    });
    // Study-level feature flag: hide the recommender tab when the participant's
    // study disables it. Defaults to enabled while the config loads / on error.
    final recommenderEnabled = ref.watch(recommenderEnabledProvider);
    // Study-level feature flag: hide the My Habits tab when the participant's
    // study disables habit creation entirely — there's no other way for such
    // a participant to ever have a habit, so the tab would only ever show a
    // permanently-empty screen.
    final habitCreationEnabled = ref.watch(habitCreationEnabledProvider);

    // Filter tabs by capability. `branch` carries the real router branch index,
    // so visible-index → branch mapping works regardless of which tabs are hidden.
    final visibleTabs = _allTabs(l10n).where((t) {
      if (t.path == '/recommend') return recommenderEnabled;
      if (t.path == '/habits') return habitCreationEnabled;
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
        child: DefaultTextStyle.merge(
          textAlign: TextAlign.center,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
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
