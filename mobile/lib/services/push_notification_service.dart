import 'dart:io' show Platform;

import 'package:device_info_plus/device_info_plus.dart';
import 'package:dio/dio.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config/app_config.dart';
import '../core/dio_provider.dart';
import '../providers/package_info_provider.dart';

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
  /// Creates a [PushNotificationService] using [dio]. [ref] is kept only to
  /// read [packageInfoProvider] at registration time (reusing the app's
  /// single [PackageInfo] fetch rather than requesting it again here).
  PushNotificationService({required Dio dio, required Ref ref})
    : _dio = dio,
      _ref = ref;

  final Dio _dio;
  final Ref _ref;

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
    // Registered first and unconditionally, before any Firebase call below.
    // Local notifications (habit reminders, SRHI, praise/recovery — all
    // scheduled/shown by ReminderSchedulerService, a completely separate
    // on-device mechanism that needs no Firebase/network access at all) rely
    // solely on this callback to route a tap. Previously this ran *after*
    // the Firebase permission/presentation-options calls below — on a
    // simulator, a device with no APNs entitlement, or just a flaky network,
    // either of those can throw, and ShellScreen's caller swallows that
    // exception (`catch (_) { return; }`), which used to abort this whole
    // method before the callback was ever registered. Notifications still
    // *displayed* fine either way (show()/zonedSchedule() talk to the
    // platform channel directly, independent of initialize()), so the
    // failure mode was silent: notifications arrive, but tapping any of them
    // — including a plain habit reminder — does nothing.
    await initLocalNotifications(
      onNotificationTap: (payload) {
        if (payload != null && payload.isNotEmpty) {
          onLocalNotificationTap?.call(payload);
        }
      },
    );

    final messaging = FirebaseMessaging.instance;

    // Everything below is FCM (remote push) specific — best-effort. A
    // failure here (no APNs entitlement, simulator limitations, no network)
    // must never take the local-notification tap wiring above down with it.
    try {
      await messaging.requestPermission();

      // iOS: firebase_messaging registers its own UNUserNotificationCenter
      // delegate, which by default suppresses the system alert/sound/badge
      // presentation for *any* notification — including the local ones this
      // service and ReminderSchedulerService show via
      // flutter_local_notifications — while the app is in the foreground.
      // Without this call, both FCM pushes and local habit/SRHI reminders
      // silently produce no visible banner whenever the app happens to be
      // open. No-op on Android.
      await messaging.setForegroundNotificationPresentationOptions(
        alert: true,
        badge: true,
        sound: true,
      );

      final token = await messaging.getToken();
      if (token != null) {
        try {
          await _registerToken(token);
        } catch (e) {
          debugPrint(
            '[PushNotificationService] Initial token registration failed: $e',
          );
        }
      }

      messaging.onTokenRefresh.listen((newToken) async {
        try {
          await _registerToken(newToken);
        } catch (e) {
          debugPrint(
            '[PushNotificationService] Token refresh registration failed: $e',
          );
        }
      });

      FirebaseMessaging.onMessage.listen(showForegroundNotification);

      FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
    } catch (e) {
      debugPrint('[PushNotificationService] FCM setup failed: $e');
    }
  }

  /// POSTs the [token] to `POST /api/v1/participant/register-token`, along
  /// with this device's id/platform/model and the app version — so the
  /// admin portal can show a participant's actual devices instead of just
  /// an anonymous Keycloak login session. Device info gathering is
  /// best-effort: if it fails for any reason (unsupported platform, plugin
  /// error), token registration still proceeds with just the token, since
  /// push delivery must never depend on this.
  Future<void> _registerToken(String token) async {
    final deviceInfo = await _tryGatherDeviceInfo();
    await _dio.post<void>(
      '${AppConfig.apiBaseUrl}/participant/register-token',
      data: {'token': token, ...?deviceInfo},
    );
  }

  /// Returns `{deviceId, platform, model, appVersion}` or `null` if
  /// gathering any of it fails.
  Future<Map<String, String>?> _tryGatherDeviceInfo() async {
    try {
      final packageInfo = await _ref.read(packageInfoProvider.future);
      final appVersion = '${packageInfo.version}+${packageInfo.buildNumber}';
      final deviceInfoPlugin = DeviceInfoPlugin();

      if (Platform.isIOS) {
        final info = await deviceInfoPlugin.iosInfo;
        return {
          'deviceId': info.identifierForVendor ?? '',
          'platform': 'ios',
          // No human-readable model name is available from this plugin
          // without an external lookup table (e.g. "iPhone16,1" rather than
          // "iPhone 15 Pro") — utsname.machine is the raw hardware
          // identifier, used as-is.
          'model': info.utsname.machine,
          'appVersion': appVersion,
        };
      }
      if (Platform.isAndroid) {
        final info = await deviceInfoPlugin.androidInfo;
        return {
          'deviceId': info.id,
          'platform': 'android',
          'model': info.model,
          'appVersion': appVersion,
        };
      }
      return null;
    } catch (_) {
      return null;
    }
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
  return PushNotificationService(dio: ref.watch(dioProvider), ref: ref);
});
