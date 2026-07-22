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
/// Supported values: `'questionnaire'`, `'habits'`, `'explore'`, `'home'`
/// (and the default for any unrecognised value).
String routeFromNotificationPayload(Map<String, dynamic> data) {
  final screen = data['screen'] as String? ?? '';
  return switch (screen) {
    'questionnaire' => '/settings/profile',
    'habits' => '/habits',
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
///
/// [onNotificationTap] fires with the tapped notification's `payload` (a
/// GoRouter path, e.g. `/habits` for a habit reminder) whenever the app is
/// running (foreground or background) when the user taps a local
/// notification. For a tap that launches the app from a cold start, read
/// [getInitialLocalNotificationPayload] instead once initialisation
/// completes.
Future<void> initLocalNotifications({
  void Function(String? payload)? onNotificationTap,
}) async {
  const android = AndroidInitializationSettings('@mipmap/ic_launcher');
  const darwin = DarwinInitializationSettings();
  await _localNotifications.initialize(
    settings: const InitializationSettings(android: android, iOS: darwin),
    onDidReceiveNotificationResponse: (response) {
      onNotificationTap?.call(response.payload);
    },
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

/// Returns the payload of the local notification that launched the app from
/// a cold start (e.g. a tapped habit reminder), or `null` if the app wasn't
/// launched that way. Call once, after [initLocalNotifications] completes.
Future<String?> getInitialLocalNotificationPayload() async {
  final details = await _localNotifications.getNotificationAppLaunchDetails();
  if (details?.didNotificationLaunchApp ?? false) {
    return details?.notificationResponse?.payload;
  }
  return null;
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
  /// Creates a [PushNotificationService] using [dio].
  PushNotificationService({required Dio dio}) : _dio = dio;

  final Dio _dio;

  /// Initialises Firebase Messaging:
  /// 1. Requests notification permission (iOS prompt, Android 13+ prompt).
  /// 2. Registers the FCM token with the backend.
  /// 3. Listens for token refreshes and re-registers.
  /// 4. Shows foreground notifications via [flutter_local_notifications].
  ///
  /// [onLocalNotificationTap] fires with the GoRouter path to navigate to
  /// when a local notification (e.g. a habit reminder) is tapped while the
  /// app is running. Cold-start taps are not covered here — check
  /// [getInitialLocalNotificationPayload] separately once this completes.
  Future<void> initialize({
    void Function(String route)? onLocalNotificationTap,
  }) async {
    final messaging = FirebaseMessaging.instance;

    await messaging.requestPermission();

    await initLocalNotifications(
      onNotificationTap: (payload) {
        if (payload != null && payload.isNotEmpty) {
          onLocalNotificationTap?.call(payload);
        }
      },
    );

    final token = await messaging.getToken();
    if (token != null) {
      try {
        await _registerToken(token);
      } catch (e) {
        debugPrint('[PushNotificationService] Initial token registration failed: $e');
      }
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

/// Provides the singleton [PushNotificationService] instance.
final pushNotificationServiceProvider = Provider<PushNotificationService>((ref) {
  return PushNotificationService(dio: ref.watch(dioProvider));
});
