import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../l10n/app_localizations.dart';

/// Side-nav shell for the admin panel.
///
/// Wraps each admin sub-screen with a [NavigationRail] so admins can jump
/// between Participants, Surveys, Habits, Devices, and Settings.
class AdminShellScreen extends StatelessWidget {
  /// Creates an [AdminShellScreen] with the given [child] sub-screen.
  const AdminShellScreen({required this.child, super.key});

  /// The currently active admin sub-screen.
  final Widget child;

  static const _sections = [
    _SectionConfig(icon: Icons.group, path: '/admin/participants'),
    _SectionConfig(icon: Icons.assignment, path: '/admin/surveys'),
    _SectionConfig(icon: Icons.quiz_outlined, path: '/admin/questionnaires'),
    _SectionConfig(icon: Icons.psychology, path: '/admin/habits'),
    _SectionConfig(icon: Icons.devices, path: '/admin/devices'),
    _SectionConfig(icon: Icons.settings, path: '/admin/settings'),
  ];

  /// Localized nav labels, in the same order as [_sections].
  List<String> _sectionLabels(AppLocalizations l10n) => [
    l10n.adminShellNavParticipants,
    l10n.adminShellNavSurveys,
    l10n.adminShellNavQuestionnaires,
    l10n.adminShellNavHabits,
    l10n.adminShellNavDevices,
    l10n.adminShellNavSettings,
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
    final l10n = AppLocalizations.of(context)!;
    final labels = _sectionLabels(l10n);
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
            destinations: [
              for (var i = 0; i < _sections.length; i++)
                NavigationRailDestination(
                  icon: Icon(_sections[i].icon),
                  label: Text(labels[i]),
                ),
            ],
          ),
          const VerticalDivider(width: 1, thickness: 1),
          Expanded(child: child),
        ],
      ),
    );
  }
}

class _SectionConfig {
  const _SectionConfig({required this.icon, required this.path});

  final IconData icon;
  final String path;
}
