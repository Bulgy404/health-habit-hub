import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../l10n/app_localizations.dart';

/// Screen where the user types a health goal and triggers recommendation
/// generation. Navigates to [RecommendationLoadingScreen] on submit.
class GoalInputScreen extends StatefulWidget {
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
              // Pink icon box
              Center(
                child: Container(
                  width: 72, height: 72,
                  decoration: BoxDecoration(
                    color: const Color(0xFFFCE4F0),
                    borderRadius: BorderRadius.circular(22),
                    boxShadow: const [BoxShadow(color: Color(0x2EE679AB), blurRadius: 20, offset: Offset(0, 6))],
                  ),
                  child: const Icon(Icons.lightbulb, size: 36, color: Color(0xFFE679AB)),
                ),
              ),
              const SizedBox(height: 20),
              Text(
                "What's your health goal?",
                style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: Theme.of(context).colorScheme.onSurface, height: 1.2),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              Text(
                'The more context you share — your lifestyle, what you\'ve tried, and what gets in the way — the better your recommendation will be.',
                style: TextStyle(fontSize: 14, color: Theme.of(context).colorScheme.onSurfaceVariant, height: 1.5),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 20),
              // Text input
              TextFormField(
                controller: _controller,
                maxLines: 5,
                style: const TextStyle(fontSize: 14),
                decoration: InputDecoration(
                  hintText:
                      'e.g. I\'m 34 and work long hours at a desk job. I struggle to fall asleep before midnight and wake up exhausted. I\'ve tried evening runs but give up after a week. I want a realistic routine that helps me wind down and feel more rested.',
                  hintStyle: const TextStyle(color: Color(0xFF9CA3AF), height: 1.5),
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
                  if (v == null || v.trim().isEmpty) return 'Please describe your goal';
                  return null;
                },
              ),
              const SizedBox(height: 28),
              FilledButton(
                onPressed: _submit,
                child: Text(l10n.getRecommendations),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

