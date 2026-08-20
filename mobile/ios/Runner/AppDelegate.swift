import Flutter
import UIKit
import UserNotifications

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    // Required by flutter_local_notifications (see its own example
    // AppDelegate.swift) — without this, UNUserNotificationCenter has no
    // delegate at all, so tapping a notification still launches/foregrounds
    // the app (that's default OS behavior) but no
    // userNotificationCenter(_:didReceive:) callback ever reaches Flutter.
    // That silently breaks *every* local-notification tap route — habit
    // reminders, SRHI, praise/recovery — while delivery/display keeps
    // working fine, since showing a notification doesn't need a delegate.
    UNUserNotificationCenter.current().delegate = self as UNUserNotificationCenterDelegate
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
  }
}
