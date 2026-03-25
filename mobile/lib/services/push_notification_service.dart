import 'package:dio/dio.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config/app_config.dart';
import '../core/dio_provider.dart';

// ---------------------------------------------------------------------------
// Background message handler — must be a top-level function.
// ---------------------------------------------------------------------------

/// No-op background handler.  Foreground display is handled by
/// [PushNotificationService.initialize].  Navigation from a background
/// notification tap is resolved via [getInitialMessage] / [onMessageOpenedApp]
/// on the next app resume.
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  // Background processing handled on next foreground resume.
}

// ---------------------------------------------------------------------------
// Route extraction helper (pure Dart — fully testable)
// ---------------------------------------------------------------------------

/// Converts an FCM notification payload's `screen` field into a GoRouter
/// path string.
///
/// Supported values: `'questionnaire'`, `'explore'`, `'home'` (and the
/// default for any unrecognised value).
String routeFromNotificationPayload(Map<String, dynamic> data) {
  final screen = data['screen'] as String? ?? '';
  return switch (screen) {
    'questionnaire' => '/profile',
    'explore' => '/explore',
    _ => '/share',
  };
}

// ---------------------------------------------------------------------------
// Local notifications channel
// ---------------------------------------------------------------------------

const _kAndroidChannelId = 'hhh_push';
const _kAndroidChannelName = 'Health Habit Hub';
const _kAndroidChannelDescription = 'Study notifications from your researcher';

final _localNotifications = FlutterLocalNotificationsPlugin();

/// Initialises [FlutterLocalNotificationsPlugin] and creates the Android
/// high-importance notification channel.
Future<void> initLocalNotifications() async {
  const android = AndroidInitializationSettings('@mipmap/ic_launcher');
  const darwin = DarwinInitializationSettings();
  await _localNotifications.initialize(
    settings: const InitializationSettings(android: android, iOS: darwin),
  );

  await _localNotifications
      .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin>()
      ?.createNotificationChannel(
        const AndroidNotificationChannel(
          _kAndroidChannelId,
          _kAndroidChannelName,
          description: _kAndroidChannelDescription,
          importance: Importance.high,
        ),
      );
}

/// Displays a local notification for an FCM [message] received in the
/// foreground.
Future<void> showForegroundNotification(RemoteMessage message) async {
  final notification = message.notification;
  if (notification == null) return;

  await _localNotifications.show(
    id: notification.hashCode,
    title: notification.title,
    body: notification.body,
    notificationDetails: const NotificationDetails(
      android: AndroidNotificationDetails(
        _kAndroidChannelId,
        _kAndroidChannelName,
        channelDescription: _kAndroidChannelDescription,
        importance: Importance.high,
        priority: Priority.high,
      ),
      iOS: DarwinNotificationDetails(),
    ),
  );
}

// ---------------------------------------------------------------------------
// PushNotificationService
// ---------------------------------------------------------------------------

/// Manages FCM permission, token registration, and foreground notification
/// display.
///
/// Inject with [Riverpod] via [pushNotificationServiceProvider].
class PushNotificationService {
  PushNotificationService({required Dio dio}) : _dio = dio;

  final Dio _dio;

  /// Initialises Firebase Messaging:
  /// 1. Requests notification permission (iOS prompt, Android 13+ prompt).
  /// 2. Registers the FCM token with the backend.
  /// 3. Listens for token refreshes and re-registers.
  /// 4. Shows foreground notifications via [flutter_local_notifications].
  Future<void> initialize() async {
    final messaging = FirebaseMessaging.instance;

    await messaging.requestPermission();

    await initLocalNotifications();

    final token = await messaging.getToken();
    if (token != null) {
      await _registerToken(token);
    }

    messaging.onTokenRefresh.listen((newToken) async {
      try {
        await _registerToken(newToken);
      } catch (e) {
        debugPrint('[PushNotificationService] Token refresh registration failed: $e');
      }
    });

    FirebaseMessaging.onMessage.listen(showForegroundNotification);

    FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
  }

  /// POSTs the [token] to `POST /api/v1/participant/register-token`.
  Future<void> _registerToken(String token) async {
    await _dio.post<void>(
      '${AppConfig.apiBaseUrl}/participant/register-token',
      data: {'token': token},
    );
  }

  /// Returns the GoRouter route extracted from [message.data], or `null` if
  /// the message carries no data payload.
  String? routeForMessage(RemoteMessage message) {
    if (message.data.isEmpty) return null;
    return routeFromNotificationPayload(message.data);
  }
}

// ---------------------------------------------------------------------------
// Riverpod provider
// ---------------------------------------------------------------------------

final pushNotificationServiceProvider = Provider<PushNotificationService>((ref) {
  return PushNotificationService(dio: ref.watch(dioProvider));
});
