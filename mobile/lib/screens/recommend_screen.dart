import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/recommendation.dart';
import '../providers/auth_provider.dart';
import '../services/recommendation_service.dart';
import '../widgets/recommendation_card.dart';

/// Screen that lists personalized habit recommendations with staggered
/// entry animations and an [AnimatedList] for card removal.
class RecommendScreen extends ConsumerStatefulWidget {
  const RecommendScreen({super.key});

  @override
  ConsumerState<RecommendScreen> createState() => _RecommendScreenState();
}

class _RecommendScreenState extends ConsumerState<RecommendScreen>
    with TickerProviderStateMixin {
  final _listKey = GlobalKey<AnimatedListState>();
  final List<Recommendation> _recommendations = [];
  final List<AnimationController> _controllers = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _fetch();
  }

  Future<void> _fetch() async {
    setState(() {
      _loading = true;
      _error = null;
      // Clear existing items and dispose controllers.
      for (final c in _controllers) {
        c.dispose();
      }
      _controllers.clear();
      _recommendations.clear();
    });

    try {
      final userId = await ref.read(userIdProvider.future);
      if (userId == null) {
        if (!mounted) return;
        setState(() {
          _loading = false;
          _error = 'Not authenticated';
        });
        return;
      }
      final service = ref.read(recommendationServiceProvider);
      final recs = await service.fetchRecommendations(userId);
      if (!mounted) return;

      setState(() {
        _loading = false;
        _recommendations.addAll(recs);
        _controllers.addAll(
          List.generate(
            recs.length,
            (_) => AnimationController(
              vsync: this,
              duration: const Duration(milliseconds: 300),
            ),
          ),
        );
      });

      // Stagger entry animations — 80 ms between each card.
      for (var i = 0; i < _controllers.length; i++) {
        if (i > 0) await Future.delayed(const Duration(milliseconds: 80));
        if (mounted) _controllers[i].forward();
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.toString();
      });
    }
  }

  // -------------------------------------------------------------------------
  // Accept / Dismiss
  // -------------------------------------------------------------------------

  Future<void> _accept(int index) async {
    final rec = _recommendations[index];
    final service = ref.read(recommendationServiceProvider);
    try {
      await service.acceptRecommendation(rec.id);
    } catch (_) {}
    _removeItem(index);
  }

  Future<void> _dismiss(int index) async {
    final rec = _recommendations[index];
    final service = ref.read(recommendationServiceProvider);
    try {
      await service.dismissRecommendation(rec.id);
    } catch (_) {}
    _removeItem(index);
  }

  void _removeItem(int index) {
    if (index < 0 || index >= _recommendations.length) return;
    final removed = _recommendations[index];
    final removedController = _controllers[index];
    _recommendations.removeAt(index);
    _controllers.removeAt(index);
    _listKey.currentState?.removeItem(
      index,
      (context, animation) => _buildCard(
        removed,
        animation,
        -1, // index irrelevant during removal
        removing: true,
      ),
      duration: const Duration(milliseconds: 200),
    );
    removedController.dispose();
  }

  // -------------------------------------------------------------------------
  // Card builder
  // -------------------------------------------------------------------------

  Widget _buildCard(
    Recommendation rec,
    Animation<double> listAnimation,
    int index, {
    bool removing = false,
  }) {
    // During removal use the AnimatedList animation (1→0).
    // For live items use our manually-driven staggered controller (0→1).
    final Animation<double> driver =
        (!removing && index >= 0 && index < _controllers.length)
            ? _controllers[index].view
            : listAnimation;

    final fade = CurvedAnimation(parent: driver, curve: Curves.easeOut);
    final slide = Tween<Offset>(
      begin: const Offset(0, 0.3),
      end: Offset.zero,
    ).animate(CurvedAnimation(parent: driver, curve: Curves.easeOut));

    return FadeTransition(
      opacity: fade,
      child: SlideTransition(
        position: slide,
        child: RecommendationCard(
          recommendation: rec,
          onAccept: removing ? () {} : () => _accept(index),
          onDismiss: removing ? () {} : () => _dismiss(index),
        ),
      ),
    );
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  @override
  void dispose() {
    for (final c in _controllers) {
      c.dispose();
    }
    super.dispose();
  }

  // -------------------------------------------------------------------------
  // Build
  // -------------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Recommendations')),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_loading) return _buildSkeleton();
    if (_error != null) return _buildError();
    if (_recommendations.isEmpty) return _buildEmpty();

    return AnimatedList(
      key: _listKey,
      initialItemCount: _recommendations.length,
      padding: const EdgeInsets.symmetric(vertical: 8),
      itemBuilder: (context, index, animation) =>
          _buildCard(_recommendations[index], animation, index),
    );
  }

  Widget _buildSkeleton() {
    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      itemCount: 4,
      itemBuilder: (context, i) => const _SkeletonCard(),
    );
  }

  Widget _buildEmpty() {
    return const Center(
      child: Padding(
        padding: EdgeInsets.all(32),
        child: Text(
          'No recommendations yet \u2014 complete your profile first',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 16),
        ),
      ),
    );
  }

  Widget _buildError() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(_error!, textAlign: TextAlign.center),
            const SizedBox(height: 16),
            ElevatedButton(onPressed: _fetch, child: const Text('Retry')),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Loading skeleton card
// ---------------------------------------------------------------------------

class _SkeletonCard extends StatelessWidget {
  const _SkeletonCard();

  @override
  Widget build(BuildContext context) {
    final color = Theme.of(context).colorScheme.surfaceContainerHighest;
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(height: 20, width: 180, color: color),
            const SizedBox(height: 8),
            Container(height: 14, width: 90, color: color),
            const SizedBox(height: 8),
            Container(height: 8, width: double.infinity, color: color),
            const SizedBox(height: 8),
            Container(height: 12, width: double.infinity, color: color),
            const SizedBox(height: 4),
            Container(height: 12, width: 220, color: color),
          ],
        ),
      ),
    );
  }
}
