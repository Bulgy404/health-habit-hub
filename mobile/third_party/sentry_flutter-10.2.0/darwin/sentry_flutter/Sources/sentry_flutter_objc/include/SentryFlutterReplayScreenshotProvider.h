@import Sentry;

// Compatibility bridge: the Flutter SDK still exposes these channel methods.
// Preserve their behavior while keeping legacy Cocoa calls out of Swift.
FOUNDATION_EXPORT void HHHPauseAppHangTracking(void);
FOUNDATION_EXPORT void HHHResumeAppHangTracking(void);

#if SENTRY_TARGET_REPLAY_SUPPORTED
@class SentryRRWebEvent;
@class FlutterMethodChannel;

@interface SentryFlutterReplayScreenshotProvider
    : NSObject <SentryViewScreenshotProvider>

- (instancetype _Nonnull)initWithChannel:(FlutterMethodChannel *_Nonnull)channel
                replayIdProvider:
                    (NSString *_Nullable (^_Nonnull)(void))replayIdProvider;

@end
#endif
