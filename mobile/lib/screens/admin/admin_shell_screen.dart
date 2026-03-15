import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

// Side-nav shell for the admin panel.
// Wraps each admin sub-screen with a NavigationRail so admins can jump between
// Participants, Surveys, Habits, Devices, and Settings without leaving admin.
class AdminShellScreen extends StatelessWidget {
  const AdminShellScreen({required this.child, super.key});

  final Widget child;

  static const _sections = [
    _SectionConfig(
      label: 'Participants',
      icon: Icons.group,
      path: '/admin/participants',
    ),
    _SectionConfig(
      label: 'Surveys',
      icon: Icons.assignment,
      path: '/admin/surveys',
    ),
    _SectionConfig(
      label: 'Habits',
      icon: Icons.psychology,
      path: '/admin/habits',
    ),
    _SectionConfig(
      label: 'Devices',
      icon: Icons.devices,
      path: '/admin/devices',
    ),
    _SectionConfig(
      label: 'Settings',
      icon: Icons.settings,
      path: '/admin/settings',
    ),
  ];

  int _selectedIndex(BuildContext context) {
    final location = GoRouterState.of(context).matchedLocation;
    for (var i = 0; i < _sections.length; i++) {
      if (location.startsWith(_sections[i].path)) return i;
    }
    return 0;
  }

  @override
  Widget build(BuildContext context) {
    final selectedIndex = _selectedIndex(context);
    return Scaffold(
      body: Row(
        children: [
          NavigationRail(
            selectedIndex: selectedIndex,
            labelType: NavigationRailLabelType.all,
            onDestinationSelected: (index) {
              context.go(_sections[index].path);
            },
            destinations: _sections
                .map(
                  (s) => NavigationRailDestination(
                    icon: Icon(s.icon),
                    label: Text(s.label),
                  ),
                )
                .toList(),
          ),
          const VerticalDivider(width: 1, thickness: 1),
          Expanded(child: child),
        ],
      ),
    );
  }
}

class _SectionConfig {
  const _SectionConfig({
    required this.label,
    required this.icon,
    required this.path,
  });

  final String label;
  final IconData icon;
  final String path;
}
