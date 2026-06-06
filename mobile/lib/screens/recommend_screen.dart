import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/recommendation.dart';
import '../providers/auth_provider.dart';
import '../services/recommendation_service.dart';
import '../services/recommendation_ws_service.dart';
import '../widgets/recommendation_card.dart';

/// Screen that lists personalized habit recommendations with staggered
/// entry animations, an [AnimatedList] for card removal/insertion, and a
/// live WebSocket feed with automatic polling fallback.
class RecommendScreen extends ConsumerStatefulWidget {
  /// Creates a [RecommendScreen].
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
  bool _wsConnected = false;

  // WS subscriptions — cancelled in dispose.
  StreamSubscription<Recommendation>? _recSub;
  StreamSubscription<WsConnectionStatus>? _statusSub;

  @override
  void initState() {
    super.initState();
    _fetch();
  }

  // ---------------------------------------------------------------------------
  // Initial fetch + WS setup
  // ---------------------------------------------------------------------------

  Future<void> _fetch() async {
    setState(() {
      _loading = true;
      _error = null;
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

      // Wire up the WS service now that we have a userId.
      _initWs(userId, recs.map((r) => r.id));
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.toString();
      });
    }
  }

  void _initWs(String userId, Iterable<String> initialIds) {
    final wsService = ref.read(recommendationWsServiceProvider(userId));
    // Pre-populate seen IDs so polling doesn't re-emit initial batch.
    wsService.markSeen(initialIds);

    _recSub?.cancel();
    _statusSub?.cancel();

    _recSub = wsService.recommendations.listen(_insertAtTop);
    _statusSub = wsService.status.listen((s) {
      if (mounted) {
        setState(() => _wsConnected = s == WsConnectionStatus.connected);
      }
    });

    // Reflect the current (synchronous) status immediately.
    if (mounted) {
      setState(
        () => _wsConnected =
            wsService.currentStatus == WsConnectionStatus.connected,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Live insertion at top of list
  // ---------------------------------------------------------------------------

  void _insertAtTop(Recommendation rec) {
    if (!mounted) return;
    final controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 300),
    );
    setState(() {
      _recommendations.insert(0, rec);
      _controllers.insert(0, controller);
    });
    _listKey.currentState?.insertItem(
      0,
      duration: const Duration(milliseconds: 300),
    );
    controller.forward();
  }

  // ---------------------------------------------------------------------------
  // Accept / Dismiss
  // ---------------------------------------------------------------------------

  Future<void> _accept(int index) async {
    final rec = _recommendations[index];
    final service = ref.read(recommendationServiceProvider);
    try {
      await service.acceptRecommendation(rec.id);
    } catch (e, st) {
      debugPrint('ERROR in RecommendScreen._accept: $e\n$st');
    }
    _removeItem(index);
  }

  Future<void> _dismiss(int index) async {
    final rec = _recommendations[index];
    final service = ref.read(recommendationServiceProvider);
    try {
      await service.dismissRecommendation(rec.id);
    } catch (e, st) {
      debugPrint('ERROR in RecommendScreen._dismiss: $e\n$st');
    }
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
        -1,
        removing: true,
      ),
      duration: const Duration(milliseconds: 200),
    );
    removedController.dispose();
  }

  // ---------------------------------------------------------------------------
  // Card builder
  // ---------------------------------------------------------------------------

  Widget _buildCard(
    Recommendation rec,
    Animation<double> listAnimation,
    int index, {
    bool removing = false,
  }) {
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

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  @override
  void dispose() {
    _recSub?.cancel();
    _statusSub?.cancel();
    for (final c in _controllers) {
      c.dispose();
    }
    super.dispose();
  }

  // ---------------------------------------------------------------------------
  // Build
  // ---------------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    // Re-fetch (and re-init WS) when userId changes so old subscriptions are
    // cancelled and new ones are wired to the correct user stream.
    ref.listen<AsyncValue<String?>>(userIdProvider, (previous, next) {
      final prevId = previous?.whenOrNull(data: (v) => v);
      final nextId = next.whenOrNull(data: (v) => v);
      if (prevId != nextId) {
        _fetch();
      }
    });

    return Scaffold(
      appBar: AppBar(
        title: const Text('Recommendations'),
        actions: [_ConnectionDot(connected: _wsConnected)],
      ),
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
// Connection status dot
// ---------------------------------------------------------------------------

/// Small indicator dot shown in the AppBar.
/// Green when the WebSocket is live, grey when falling back to polling.
class _ConnectionDot extends StatelessWidget {
  const _ConnectionDot({required this.connected});

  final bool connected;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(right: 16),
      child: Tooltip(
        message: connected ? 'Live' : 'Polling',
        child: Container(
          width: 10,
          height: 10,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: connected ? Colors.green : Colors.grey,
          ),
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
