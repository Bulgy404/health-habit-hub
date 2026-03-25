import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/auth_provider.dart';
import '../services/push_notification_service.dart';

/// The persistent bottom-navigation shell for the app.
///
/// Uses [StatefulNavigationShell] from go_router to preserve navigation state
/// across tab switches. The Admin tab is shown only when the user has the
/// `admin` or `researcher` Keycloak realm role.
///
/// Also bootstraps push-notification permission, token registration, and
/// navigation from tapped notifications.
class ShellScreen extends ConsumerStatefulWidget {
  const ShellScreen({required this.navigationShell, super.key});

  final StatefulNavigationShell navigationShell;

  @override
  ConsumerState<ShellScreen> createState() => _ShellScreenState();
}

class _ShellScreenState extends ConsumerState<ShellScreen> {
  static const _allTabs = [
    _TabConfig(label: 'Donate', icon: Icons.volunteer_activism, path: '/donate'),
    _TabConfig(label: 'Explore', icon: Icons.hub, path: '/explore'),
    _TabConfig(label: 'Recommend', icon: Icons.recommend, path: '/recommend'),
    _TabConfig(label: 'Profile', icon: Icons.person, path: '/profile'),
    _TabConfig(label: 'Settings', icon: Icons.settings, path: '/settings'),
    _TabConfig(label: 'Admin', icon: Icons.admin_panel_settings, path: '/admin'),
  ];

  static const int _adminBranchIndex = 5;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _initNotifications());
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

    final colorScheme = Theme.of(context).colorScheme;

    return Scaffold(
      body: widget.navigationShell,
      bottomNavigationBar: NavigationBar(
        selectedIndex: currentVisibleIndex,
        indicatorColor: colorScheme.primaryContainer,
        onDestinationSelected: (visibleIndex) {
          // Map visible index back to branch index.
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
            .map(
              (tab) => NavigationDestination(
                icon: Icon(tab.icon),
                label: tab.label,
              ),
            )
            .toList(),
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
