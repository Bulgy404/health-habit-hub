# Current Xcode simulator captures

Captured November 2, 2026 from an isolated copy of the current Health Habit Hub 1.3.1+7 app, built with Flutter 3.47.4 and Xcode 27.0 for iOS 27.0. The actual app's widgets, theme, routes, and translations are used. The shipping app sources were not changed.

Fictional local examples supply the walking, water, and reading habits, logs, scores, and graph contents. They are illustrative, not participant records or app-wide usage metrics. Capture-only providers disable telemetry, backend requests, and notification prompts. The entrypoint refuses release mode and is not part of a shipping build.

## Screens

Six screens in English and German for three actual simulator device layouts:

| Folder | Device | Native resolution |
|---|---|---|
| `raw/iphone-medium` | iPhone 18 Pro | 1206 × 2622 |
| `raw/iphone-large` | iPhone 18 Pro Max | 1320 × 2868 |
| `raw/ipad` | iPad Pro 13-inch (M5) | 2064 × 2752 |

The six views are My Habits, habit detail/strength, Explore, Share, New Habit, and Recommendations input. `capture-manifest.json` records route, locale, device, resolution, and a SHA-256 checksum for all 36 originals.

## App preview recordings

`recordings/health-habit-hub-iphone-app-preview-{en,de}-25s.mp4` are actual simulator recordings showing My Habits → habit detail → Explore → Share → Recommendations. They are exported at 886 × 1920, H.264 yuv420p, 30 fps, exactly 750 frames / 25 seconds, without audio. Native recorder timestamp gaps are filled using repeated actual frames; there is no synthetic UI or device animation. Native `.mov` recordings are retained as sources. See `preview-validation.json`.

## Review notes and pending devices

- The current German New Habit screen still includes two English choice labels. Captures preserve the app as it is; do not treat that screen as a fully localized store final.
- The phone Explore screen preserves its actual default zoom, which shows part of the pannable graph. The iPad captures show the complete graph at that viewport size.
- No Duo device type/runtime is available in the installed full Xcode 27.0. Standalone Command Line Tools 27.2 do not add it. Duo originals and mockups remain pending full Xcode 27.1+ and its simulator support.
- No Android virtual device or system image is installed. None of these originals is labeled as an Android capture.

All capture devices are dedicated to this task and were shut down after the batch. Source helpers are in `source/`; the actual native build is in `/private/tmp/hhh-store-capture-20261102/mobile`.
