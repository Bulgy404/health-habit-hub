import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'screens/login_screen.dart';

void main() {
  runApp(const ProviderScope(child: HhhApp()));
}

final _router = GoRouter(
  initialLocation: '/login',
  routes: [
    GoRoute(
      path: '/login',
      builder: (context, state) {
        final user = state.uri.queryParameters['user'];
        final token = state.uri.queryParameters['token'];
        return LoginScreen(initialUsername: user, initialPassword: token);
      },
    ),
    GoRoute(
      path: '/home',
      builder: (context, state) => const _HomeShellPlaceholder(),
    ),
  ],
);

class HhhApp extends StatelessWidget {
  const HhhApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'Health Habit Hub',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.teal),
        useMaterial3: true,
      ),
      routerConfig: _router,
    );
  }
}

/// Temporary placeholder for the main navigation shell (implemented in US-017).
class _HomeShellPlaceholder extends StatelessWidget {
  const _HomeShellPlaceholder();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Health Habit Hub')),
      body: const Center(child: Text('Welcome!')),
    );
  }
}
