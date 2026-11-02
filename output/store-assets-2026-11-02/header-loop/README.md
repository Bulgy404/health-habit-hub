# Health Habit Hub — header motion proof

`health-habit-hub-header-loop-8s.mp4` is an 8-second silent looping brand header, based on the approved v4 green banner. This is a header creative proof, not an app preview or recording of the application.

The heart and outlined wordmark are copied verbatim from the source SVG and stay fixed. Only the background graph moves: a slow sinusoidal drift of ±16 pixels horizontally and ±10 pixels vertically across one 8-second cycle. The graph is rendered with 32 pixels of overflow on each side to prevent exposed edges. The last-to-first transition follows the same continuous periodic motion.

Validated output: 3840 × 1646 pixels, 30 fps, 240 frames, 8.000 seconds, H.264, opaque yuv420p, no audio stream. Full FFmpeg decode succeeded. Metadata is recorded in `validation.json`; `header-loop-midpoint.png` was extracted at 4 seconds and visually inspected.

Rebuild using `python3 build_header_loop.py`. Layer SVGs and PNGs are included for further editing. Original v4 assets remain unchanged. Nothing has been uploaded or synced.
