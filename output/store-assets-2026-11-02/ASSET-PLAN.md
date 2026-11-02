# Health Habit Hub — store assets

Checked November 2, 2026. Proposed production quantities below are recommendations, not store minimums. No store submissions or YouTube uploads have been made.

## Saved and created

- Approved v4 header PNG and editable SVG copied and hash-verified in OneDrive: `Promo_Material/04_Quelldateien/assets/app-store/headers/`.
- `header-loop/health-habit-hub-header-loop-8s.mp4`: motion proof, 3840 × 1646, H.264, 30 fps, 8 seconds, silent. Logo stays fixed while graph elements drift. Intended for the creative header placement; not the separate app-preview slot.
- `header-loop-v2/health-habit-hub-header-loop-8s-v2.mp4`: updated motion proof with approximately seven times the background travel, requested after reviewing the first loop. Same format and static foreground; earlier version preserved.
- `header-loop-v3/health-habit-hub-growing-graph-8s-v3.mp4`: new graph-growth version with ten emerging nodes, twelve drawn connections, traveling signals, and a seamless eight-second loop. Brand area stays fixed. This is the latest animation revision.
- `mockup-concept/iphone-habit-strength-concept-en.png` and `.svg`: iPhone layout proof from an existing real screen. Requires current-build and example-data review before submission.
- `capture/raw/`: 36 NEW November 2 current-app Xcode simulator originals, in English/German at iPhone medium, iPhone large, and iPad native sizes. These supersede the August sources for this batch.
- `mockups-current/`: 36 matching branded PNG/SVG mockups, plus a contact sheet and source manifest.
- `capture/recordings/`: two real-UI app-preview recordings, English/German, exactly 25 seconds at 886 × 1920 / 30 fps. Both fully decoded and checked.
- `brand-package/`: Apple universal/search creatives, transparent identity exports, and an opaque full-square 512px Play icon derived from the existing icon.
- `play-concepts/`: English/German 1024 × 500 feature graphic and 1080 × 1920, 25-second teaser concepts. Android parity review and replacement with native Android footage remain pending.

## Apple formats

| Asset | Selected production size | Status / condition |
|---|---|---|
| iPhone medium screenshots | 1206 × 2622 | Currently required display category |
| iPhone large screenshots | 1320 × 2868 | Additional set; existing originals available |
| Duo outer screenshots | 1398 × 2034 | Required from April 2027 for iOS 27.1 SDK+ apps |
| Duo inner screenshots | 2007 × 2853 | Same condition; capture actual adaptive UI |
| iPad screenshots | 2064 × 2752 | Required if iPadOS supported |

Use 1–10 screenshots per size, JPEG/PNG without alpha. Apple offers scaling for consistent layouts; provide genuine Duo layouts rather than stretching narrow captures. [Screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/)

Optional app preview: 15–30 seconds, at most 30 fps and 500 MB, with actual app screen recordings. Selected portrait exports: iPhone 886 × 1920; iPad 1200 × 1600. Device mockup animation does not replace this deliverable. [Preview specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/app-preview-specifications), [preview production](https://developer.apple.com/app-store/app-previews/)

Optional creative assets: header 3840 × 1646; search image 1920 × 1280 through 3840 × 2560; universal static PNG 5244 × 2950. Header videos run 5–30 seconds at 30/60 fps. Check template safe areas and actual crops. [Creative specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/creative-assets-specifications), [templates](https://developer.apple.com/app-store/asset-best-practices/)

## Google Play formats

Required graphics: 512 × 512 PNG icon; opaque 1024 × 500 feature graphic; at least two screenshots. Recommended phone production set: six 1080 × 1920 screenshots, exceeding the four-image recommendation. Use genuine Android screens. The feature graphic should show the experience and retain the graph motifs, rather than duplicate the large icon. Optional preview: public/unlisted, embeddable, ad-free YouTube video; aim for 20–30 seconds, app experience from the start and about 80% of the running time. [Preview asset guidance](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en), [icon specifications](https://developer.android.com/distribute/google-play/resources/icon-design-specifications)

## Local source audit

OneDrive `Screenshots/iPhone/01_Originale` contains 20 original iPhone 17 Pro Max PNGs at 1320 × 2868; `Screenshots/iPad` contains 15 iPad captures at 2064 × 2752. Both are dated August 6, 2026 and need comparison with the current build. No original Android capture folder was found.

The new November 2 batch now contains fresh originals from the current 1.3.1+7 app running on dedicated Xcode simulators. Fictional fixtures replace backend data; the actual views and translations are preserved. Current-app review notes, including two English labels on the German New Habit screen and the phone graph's default zoom, are recorded in `capture/README.md`.

Repository `docs/assets/screenshots/participant` images are placeholders, not product screenshots. Existing `DeviceMockups` images and social videos can support marketing concepts but do not prove current UI or device compatibility.

Tooling rechecked after the update: full Xcode is now 27.2 (27B52), and the isolated capture app has been rebuilt successfully. The installed iOS 27.2 runtime (24B8117) does not list Duo as a supported device. The Duo-compatible iOS 27.1 runtime (24A94425) is being installed, following Apple's Xcode 27.2 release-note guidance. [Xcode release notes](https://developer.apple.com/documentation/xcode-release-notes/xcode-27_2-release-notes), [Duo tools](https://developer.apple.com/iphone-duo/)

## Recommended next production batch

1. Finish installing the Duo-compatible iOS 27.1 runtime, then capture the actual outer/inner layouts using the updated Xcode 27.2 tooling.
2. Add an Android virtual device/system image or an authorized physical Android device, then capture Android originals and finalize the Google feature graphics and teaser.
3. Review the completed iPhone/iPad mockups and English/German app previews. Resolve current-app localization issues before selecting store-final screenshots.
4. Review sample content, device crops, and storefront previews, then submit separately. Nothing has been submitted or published.
