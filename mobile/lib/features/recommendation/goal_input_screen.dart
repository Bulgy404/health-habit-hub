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
              const Text(
                "What's your health goal?",
                style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: Color(0xFF111827), height: 1.2),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              Text(
                l10n.healthGoalPrompt,
                style: const TextStyle(fontSize: 14, color: Color(0xFF6B7280), height: 1.5),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 20),
              // Text input
              TextFormField(
                controller: _controller,
                maxLines: 3,
                style: const TextStyle(fontSize: 14),
                decoration: InputDecoration(
                  hintText: 'e.g. I want to sleep better and reduce stress…',
                  hintStyle: const TextStyle(color: Color(0xFF9CA3AF)),
                  filled: true,
                  fillColor: Colors.white,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(14),
                    borderSide: const BorderSide(color: Color(0xFFE5E7EB)),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(14),
                    borderSide: const BorderSide(color: Color(0xFFE5E7EB)),
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
              const SizedBox(height: 20),
              // Popular goal chips
              const Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  'POPULAR GOALS',
                  style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 0.8, color: Color(0xFF6B7280)),
                ),
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  _GoalChip(label: 'Sleep better', highlight: true, onTap: (l) => _controller.text = l),
                  _GoalChip(label: 'Reduce stress',   onTap: (l) => _controller.text = l),
                  _GoalChip(label: 'More active',      onTap: (l) => _controller.text = l),
                  _GoalChip(label: 'Eat healthier',    onTap: (l) => _controller.text = l),
                ],
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

class _GoalChip extends StatelessWidget {
  const _GoalChip({required this.label, required this.onTap, this.highlight = false});
  final String label;
  final void Function(String) onTap;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => onTap(label),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
        decoration: BoxDecoration(
          color: highlight ? const Color(0xFFFCE4F0) : Colors.white,
          border: Border.all(
            color: highlight ? const Color(0xFFE679AB) : const Color(0xFFE5E7EB),
          ),
          borderRadius: BorderRadius.circular(100),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: highlight ? const Color(0xFFE679AB) : const Color(0xFF6B7280),
          ),
        ),
      ),
    );
  }
}
