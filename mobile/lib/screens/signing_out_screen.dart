/// Full-screen progress indicator shown while sign-out is in progress.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../l10n/app_localizations.dart';
import '../providers/auth_provider.dart';

/// Runs [AuthService.logout] (a network call to revoke the Keycloak session,
/// plus clearing local secure storage) and shows progress while it's
/// in-flight, then routes to onboarding once done.
///
/// Without this, tapping "Sign out" fired an un-awaited [Future] with no
/// visible feedback — the screen just sat there until GoRouter's
/// `refreshListenable` happened to notice the auth state had changed.
class SigningOutScreen extends ConsumerStatefulWidget {
  /// Creates a [SigningOutScreen].
  const SigningOutScreen({super.key, this.nextRoute = '/onboarding/welcome'});

  /// Route to land on once sign-out completes. Defaults to the welcome
  /// screen (get-started/restore choice) for an explicit manual sign-out;
  /// pass '/onboarding/restore' when routing here because a session died
  /// and the user already has an account to restore into.
  final String nextRoute;

  @override
  ConsumerState<SigningOutScreen> createState() => _SigningOutScreenState();
}

class _SigningOutScreenState extends ConsumerState<SigningOutScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _signOut());
  }

  Future<void> _signOut() async {
    await ref.read(authServiceProvider).logout();
    if (mounted) context.go(widget.nextRoute);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return PopScope(
      canPop: false,
      child: Scaffold(
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const CircularProgressIndicator(),
              const SizedBox(height: 16),
              Text(l10n.signingOut),
            ],
          ),
        ),
      ),
    );
  }
}
