import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../config/app_config.dart';
import '../core/dio_provider.dart';
import '../providers/auth_provider.dart';
import '../services/consent_service.dart';
import '../services/offline_queue_service.dart';
import '../services/push_notification_service.dart';
import '../services/reminder_scheduler_service.dart';

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
  static const _allTabs = [
    _TabConfig(label: 'Share',   icon: Icons.volunteer_activism,    path: '/share'),
    _TabConfig(label: 'Explore', icon: Icons.hub,                   path: '/explore'),
    _TabConfig(label: 'Habits',  icon: Icons.self_improvement,      path: '/habits'),
    _TabConfig(label: 'Recs',    icon: Icons.lightbulb,             path: '/recommend'),
    _TabConfig(label: 'Account', icon: Icons.manage_accounts,       path: '/settings'),
    _TabConfig(label: 'Admin',   icon: Icons.admin_panel_settings,  path: '/admin'),
  ];

  static const int _adminBranchIndex = 5;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _checkConsentVersion();
      _initNotifications();
      _syncHabitReminders();
      _watchConnectivity();
    });
  }

  /// UC-33: refresh the adaptive local habit reminders from the latest
  /// backend plan (frequency fades as SRHI / adherence rise).
  Future<void> _syncHabitReminders() async {
    try {
      await ReminderSchedulerService(dio: ref.read(dioProvider))
          .syncReminders();
    } catch (_) {
      // Offline or no active intentions — retried on next start.
    }
  }

  /// UC-31: when the informed-consent document version was bumped since this
  /// participant last accepted it, route to the mandatory re-consent screen.
  Future<void> _checkConsentVersion() async {
    final locale = mounted
        ? Localizations.localeOf(context).languageCode
        : 'en';
    final required = await isReconsentRequired(ref.read(dioProvider), locale);
    if (required && mounted) context.go('/consent-update');
  }

  void _watchConnectivity() {
    Connectivity().onConnectivityChanged.listen((results) {
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

    for (final payload in items) {
      try {
        await dio.post<Map<String, dynamic>>(
          '${AppConfig.apiBaseUrl}/habits/share',
          data: payload,
        );
        succeeded++;
      } catch (_) {
        await offlineQueueService.requeue(payload);
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
    final rolesAsync = ref.watch(userRolesProvider);
    final roles = rolesAsync.value ?? <String>[];
    final isAdminOrResearcher =
        roles.contains('admin') || roles.contains('researcher');

    final visibleTabs = isAdminOrResearcher
        ? _allTabs
        : _allTabs.where((t) => t.path != '/admin').toList();

    // Map visible-tab index → branch index (admin branch is always #4).
    int currentVisibleIndex = widget.navigationShell.currentIndex;
    if (!isAdminOrResearcher &&
        widget.navigationShell.currentIndex >= _adminBranchIndex) {
      currentVisibleIndex = _adminBranchIndex - 1;
    }

    return Scaffold(
      body: widget.navigationShell,
      bottomNavigationBar: DecoratedBox(
        decoration: BoxDecoration(
          border: Border(top: BorderSide(color: Theme.of(context).colorScheme.outlineVariant, width: 1)),
        ),
        child: NavigationBar(
          selectedIndex: currentVisibleIndex,
          onDestinationSelected: (visibleIndex) {
            int branchIndex = visibleIndex;
            if (!isAdminOrResearcher && visibleIndex >= _adminBranchIndex) {
              branchIndex = visibleIndex + 1;
            }
            widget.navigationShell.goBranch(
              branchIndex,
              initialLocation: branchIndex == widget.navigationShell.currentIndex,
            );
          },
          destinations: visibleTabs
              .map((tab) => NavigationDestination(icon: Icon(tab.icon), label: tab.label))
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
  });

  final String label;
  final IconData icon;
  final String path;
}
