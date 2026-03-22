// Unit tests for push notification route extraction logic.
//
// FirebaseMessaging is not testable without a real Firebase project;
// these tests cover the pure-Dart routeFromNotificationPayload helper.
import 'package:flutter_test/flutter_test.dart';
import 'package:hhh/services/push_notification_service.dart';

void main() {
  group('routeFromNotificationPayload', () {
    test('questionnaire screen navigates to /profile', () {
      final route = routeFromNotificationPayload({'screen': 'questionnaire'});
      expect(route, '/profile');
    });

    test('explore screen navigates to /explore', () {
      final route = routeFromNotificationPayload({'screen': 'explore'});
      expect(route, '/explore');
    });

    test('home screen navigates to /donate', () {
      final route = routeFromNotificationPayload({'screen': 'home'});
      expect(route, '/donate');
    });

    test('unknown screen value navigates to /donate (default)', () {
      final route = routeFromNotificationPayload({'screen': 'unknown_screen'});
      expect(route, '/donate');
    });

    test('missing screen field navigates to /donate (default)', () {
      final route = routeFromNotificationPayload({});
      expect(route, '/donate');
    });
  });
}
