import 'dart:async';
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

import '../models/recommendation.dart';
import '../providers/auth_provider.dart';
import '../config/app_config.dart';
import 'auth_service.dart';
import 'recommendation_service.dart';

/// Connection status of the live recommendation feed.
enum WsConnectionStatus {
  /// WebSocket is open and authenticated.
  connected,

  /// WebSocket is unavailable; falling back to periodic polling.
  polling,
}

/// Streams live [Recommendation] objects from the backend WebSocket endpoint
/// (`/ws/recommendations`).
///
/// The JWT is sent as the first message on connect (matching the server-side
/// auth protocol). If the connection fails or drops, the service automatically
/// falls back to polling [RecommendationService.fetchRecommendations] every
/// [_pollInterval] and retries the WebSocket after [_reconnectDelay].
class RecommendationWsService {
  static final _wsUrl = '${AppConfig.wsBaseUrl}/recommendations';
  static const _pollInterval = Duration(seconds: 30);
  static const _reconnectDelay = Duration(seconds: 5);

  final AuthService _authService;
  final RecommendationService _recommendationService;
  final String _userId;

  final _recommendationController =
      StreamController<Recommendation>.broadcast();
  final _statusController =
      StreamController<WsConnectionStatus>.broadcast();

  /// Stream of incoming [Recommendation] objects (WS messages or poll deltas).
  Stream<Recommendation> get recommendations => _recommendationController.stream;

  /// Stream of [WsConnectionStatus] changes.
  Stream<WsConnectionStatus> get status => _statusController.stream;

  WebSocketChannel? _channel;
  StreamSubscription<dynamic>? _channelSub;
  Timer? _pollTimer;
  Timer? _reconnectTimer;

  /// IDs of recommendations already emitted — used to deduplicate poll results.
  final _seenIds = <String>{};

  bool _disposed = false;
  WsConnectionStatus _currentStatus = WsConnectionStatus.polling;

  /// The most recently observed connection status (synchronous read).
  WsConnectionStatus get currentStatus => _currentStatus;

  RecommendationWsService({
    required AuthService authService,
    required RecommendationService recommendationService,
    required String userId,
  })  : _authService = authService,
        _recommendationService = recommendationService,
        _userId = userId {
    _connect();
  }

  // ---------------------------------------------------------------------------
  // WebSocket lifecycle
  // ---------------------------------------------------------------------------

  Future<void> _connect() async {
    if (_disposed) return;
    try {
      final token = await _authService.getAccessToken();
      if (token == null || _disposed) {
        _fallbackToPolling();
        return;
      }

      _channel = WebSocketChannel.connect(Uri.parse(_wsUrl));
      await _channel!.ready;

      if (_disposed) {
        await _channel!.sink.close();
        return;
      }

      // Send JWT as first message — server expects it within 5 s.
      _channel!.sink.add(token);

      _setStatus(WsConnectionStatus.connected);
      _stopPolling();

      _channelSub = _channel!.stream.listen(
        _onMessage,
        onError: (_) => _onDisconnect(),
        onDone: _onDisconnect,
      );
    } catch (_) {
      _fallbackToPolling();
    }
  }

  void _onMessage(dynamic data) {
    try {
      final json = jsonDecode(data as String) as Map<String, dynamic>;
      final rec = Recommendation.fromJson(json);
      if (_seenIds.add(rec.id) && !_recommendationController.isClosed) {
        _recommendationController.add(rec);
      }
    } catch (_) {
      // Ignore malformed messages.
    }
  }

  void _onDisconnect() {
    _channelSub?.cancel();
    _channelSub = null;
    _channel = null;
    if (_disposed) return;
    _fallbackToPolling();
    _reconnectTimer = Timer(_reconnectDelay, _connect);
  }

  // ---------------------------------------------------------------------------
  // Polling fallback
  // ---------------------------------------------------------------------------

  void _fallbackToPolling() {
    if (_disposed) return;
    _setStatus(WsConnectionStatus.polling);
    _pollTimer ??= Timer.periodic(_pollInterval, (_) => _poll());
  }

  void _stopPolling() {
    _pollTimer?.cancel();
    _pollTimer = null;
  }

  Future<void> _poll() async {
    if (_disposed) return;
    try {
      final recs =
          await _recommendationService.fetchRecommendations(_userId);
      for (final rec in recs) {
        if (_seenIds.add(rec.id) && !_recommendationController.isClosed) {
          _recommendationController.add(rec);
        }
      }
    } catch (_) {
      // Polling errors are silently ignored; next tick will retry.
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  void _setStatus(WsConnectionStatus s) {
    _currentStatus = s;
    if (!_statusController.isClosed) _statusController.add(s);
  }

  /// Pre-populate seen IDs so that items already displayed on screen are not
  /// re-emitted by the polling fallback.
  void markSeen(Iterable<String> ids) => _seenIds.addAll(ids);

  // ---------------------------------------------------------------------------
  // Dispose
  // ---------------------------------------------------------------------------

  void dispose() {
    _disposed = true;
    _channelSub?.cancel();
    _channel?.sink.close();
    _pollTimer?.cancel();
    _reconnectTimer?.cancel();
    _recommendationController.close();
    _statusController.close();
  }
}

/// Family provider keyed by [userId]. Disposed automatically by Riverpod when
/// the last listener detaches.
final recommendationWsServiceProvider =
    Provider.family<RecommendationWsService, String>((ref, userId) {
  final authService = ref.watch(authServiceProvider);
  final recommendationService = ref.watch(recommendationServiceProvider);
  final service = RecommendationWsService(
    authService: authService,
    recommendationService: recommendationService,
    userId: userId,
  );
  ref.onDispose(service.dispose);
  return service;
});
