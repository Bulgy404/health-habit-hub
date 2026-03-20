import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/auth_provider.dart';

/// The persistent bottom-navigation shell for the app.
///
/// Uses [StatefulNavigationShell] from go_router to preserve navigation state
/// across tab switches. The Admin tab is shown only when the user has the
/// `admin` or `researcher` Keycloak realm role.
class ShellScreen extends ConsumerWidget {
  const ShellScreen({required this.navigationShell, super.key});

  final StatefulNavigationShell navigationShell;

  static const _allTabs = [
    _TabConfig(label: 'Donate', icon: Icons.volunteer_activism, path: '/donate'),
    _TabConfig(label: 'Explore', icon: Icons.hub, path: '/explore'),
    _TabConfig(label: 'Recommend', icon: Icons.recommend, path: '/recommend'),
    _TabConfig(label: 'Profile', icon: Icons.person, path: '/profile'),
    _TabConfig(label: 'Settings', icon: Icons.settings, path: '/settings'),
    _TabConfig(label: 'Admin', icon: Icons.admin_panel_settings, path: '/admin'),
  ];

  /// Branch indices in the StatefulShellRoute match _allTabs order.
  static const int _adminBranchIndex = 5;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final rolesAsync = ref.watch(userRolesProvider);
    final roles = rolesAsync.valueOrNull ?? [];
    final isAdminOrResearcher =
        roles.contains('admin') || roles.contains('researcher');

    final visibleTabs = isAdminOrResearcher
        ? _allTabs
        : _allTabs.where((t) => t.path != '/admin').toList();

    // Map visible-tab index → branch index (admin branch is always #4).
    int currentVisibleIndex = navigationShell.currentIndex;
    if (!isAdminOrResearcher && navigationShell.currentIndex >= _adminBranchIndex) {
      currentVisibleIndex = _adminBranchIndex - 1;
    }

    final colorScheme = Theme.of(context).colorScheme;

    return Scaffold(
      body: navigationShell,
      bottomNavigationBar: NavigationBar(
        selectedIndex: currentVisibleIndex,
        indicatorColor: colorScheme.primaryContainer,
        onDestinationSelected: (visibleIndex) {
          // Map visible index back to branch index.
          int branchIndex = visibleIndex;
          if (!isAdminOrResearcher && visibleIndex >= _adminBranchIndex) {
            branchIndex = visibleIndex + 1;
          }
          navigationShell.goBranch(
            branchIndex,
            initialLocation: branchIndex == navigationShell.currentIndex,
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
