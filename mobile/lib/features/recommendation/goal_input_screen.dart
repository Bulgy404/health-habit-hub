import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../l10n/app_localizations.dart';
import '../../theme/app_colors.dart';

/// Screen where the user types a health goal and triggers recommendation
/// generation. Navigates to [RecommendationLoadingScreen] on submit.
class GoalInputScreen extends StatefulWidget {
  /// Creates a [GoalInputScreen].
  const GoalInputScreen({super.key});

  @override
  State<GoalInputScreen> createState() => _GoalInputScreenState();
}

class _GoalInputScreenState extends State<GoalInputScreen> {
  final _controller = TextEditingController();
  final _formKey = GlobalKey<FormState>();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _submit() {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    final goal = _controller.text.trim();
    context.push('/recommend/loading', extra: goal);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.getRecommendations)),
      body: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 24, 20, 32),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 20),
              Text(
                l10n.healthGoalPrompt,
                style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: Theme.of(context).colorScheme.onSurface, height: 1.2),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              Text(
                l10n.goalInputSubtitle,
                style: TextStyle(fontSize: 14, color: Theme.of(context).colorScheme.onSurfaceVariant, height: 1.5),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 20),
              // Text input
              TextFormField(
                controller: _controller,
                maxLines: 5,
                style: TextStyle(fontSize: 14, color: Theme.of(context).colorScheme.onSurface),
                decoration: InputDecoration(
                  hintText: l10n.goalInputHint,
                  hintStyle: TextStyle(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                    height: 1.5,
                  ),
                  filled: true,
                  fillColor: Theme.of(context).colorScheme.surface,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(14),
                    borderSide: BorderSide(color: Theme.of(context).colorScheme.outline),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(14),
                    borderSide: BorderSide(color: Theme.of(context).colorScheme.outline),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(14),
                    borderSide: const BorderSide(color: Color(0xFF45B700), width: 1.5),
                  ),
                  contentPadding: const EdgeInsets.all(14),
                ),
                validator: (v) {
                  if (v == null || v.trim().isEmpty) {
                    return l10n.goalInputValidationError;
                  }
                  return null;
                },
              ),
              const SizedBox(height: 28),
              FilledButton(
                onPressed: _submit,
                child: Text(l10n.getRecommendations),
              ),
              const SizedBox(height: 24),
              _RecommendWhyCard(l10n: l10n),
            ],
          ),
        ),
      ),
    );
  }
}

/// A short explainer + link into the "About the Health Habit Hub" page's
/// how-recommendations-work section, mirroring the donate screen's "Why
/// share?" card so the two primary flows explain themselves consistently.
class _RecommendWhyCard extends StatelessWidget {
  const _RecommendWhyCard({required this.l10n});
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Container(
      decoration: BoxDecoration(
        color: colorScheme.surface,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: const Color(0x14000000),
            blurRadius: 20,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                Icons.help_outline,
                size: 18,
                color: context.appColors.primary,
              ),
              const SizedBox(width: 8),
              Text(
                l10n.recommendWhyCardTitle,
                style: Theme.of(
                  context,
                ).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            l10n.recommendWhyCardBody,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(height: 1.45),
          ),
          const SizedBox(height: 8),
          InkWell(
            onTap: () => context.push('/about-project'),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  l10n.recommendWhyCardLink,
                  style: TextStyle(
                    color: context.appColors.primary,
                    fontWeight: FontWeight.w700,
                    fontSize: 13,
                  ),
                ),
                const SizedBox(width: 4),
                Icon(
                  Icons.arrow_forward,
                  size: 14,
                  color: context.appColors.primary,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

