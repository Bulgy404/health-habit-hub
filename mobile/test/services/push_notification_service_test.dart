// Unit tests for push notification route extraction logic.
//
// FirebaseMessaging is not testable without a real Firebase project;
// these tests cover the pure-Dart routeFromNotificationPayload helper.
import 'package:flutter_test/flutter_test.dart';
import 'package:hhh/services/push_notification_service.dart';

void main() {
  group('routeFromNotificationPayload', () {
    test('questionnaire notification navigates to /settings/profile', () {
      final route = routeFromNotificationPayload({'screen': 'questionnaire'});
      expect(route, '/settings/profile');
    });

    test('habits screen navigates to /habits', () {
      final route = routeFromNotificationPayload({'screen': 'habits'});
      expect(route, '/habits');
    });

    test('explore screen navigates to /explore', () {
      final route = routeFromNotificationPayload({'screen': 'explore'});
      expect(route, '/explore');
    });

    test('home screen navigates to /share', () {
      final route = routeFromNotificationPayload({'screen': 'home'});
      expect(route, '/share');
    });

    test('unknown screen value navigates to /share (default)', () {
      final route = routeFromNotificationPayload({'screen': 'unknown_screen'});
      expect(route, '/share');
    });

    test('missing screen field navigates to /share (default)', () {
      final route = routeFromNotificationPayload({});
      expect(route, '/share');
    });
  });
}
