# Releasing the mobile app

Two release channels, both via `.github/workflows/mobile-release.yml` and
`fastlane` (`mobile/fastlane/Fastfile`). Neither runs automatically — both
are triggered by hand from the Actions tab (`Run workflow`), so nothing ever
ships to Apple as a side effect of pushing code or tags.

- **`beta` lane** — builds the app and uploads it to TestFlight. Trigger from
  the Actions tab (`Run workflow` → lane: `beta`).
- **`release` lane** — submits the latest processed TestFlight build for
  public App Store review. Trigger from the Actions tab
  (`Run workflow` → lane: `release`) once you've checked the TestFlight
  build.

Backend/admin releases use a separate `v*` tag + `release.yml`, which only
cuts a GitHub Release and never touches Apple — the two pipelines don't
collide.

## One-time setup

You need to do this once (and again whenever a certificate/profile expires,
typically yearly). Everything below except the API key can be done either in
Xcode or the [Apple Developer portal](https://developer.apple.com/account)
and [App Store Connect](https://appstoreconnect.apple.com).

### 1. Create the app record in App Store Connect

fastlane can build and upload builds, but the _app itself_ (bundle ID
`de.felixreinsch.healthhabithub`) needs to exist as an app record in App
Store Connect before the first upload — create it manually once
(My Apps → **+** → New App) if it isn't there already.

### 2. Create an App Store Connect API key

This lets CI authenticate without your Apple ID password or 2FA.

1. App Store Connect → **Users and Access** → **Integrations** → **App Store
   Connect API**.
2. **Generate API Key**, name it (e.g. "GitHub Actions"), role **App
   Manager**.
3. Download the `.p8` file — **you can only download it once**, so save it
   somewhere safe immediately.
4. Note the **Key ID** and **Issuer ID** shown next to it.

### 3. Create + export the iOS Distribution certificate

If you already have one in Keychain Access you can skip to the export step.

1. Xcode → Settings → Accounts → select your team → **Manage Certificates**
   → **+** → **Apple Distribution**.
2. Open **Keychain Access**, find the new certificate under "My
   Certificates", right-click → **Export** → save as `dist_certificate.p12`,
   set a password when prompted (you'll need this password again below).

### 4. Create the App Store provisioning profile

1. [Apple Developer portal](https://developer.apple.com/account/resources/profiles/list)
   → Profiles → **+** → **App Store Connect** (distribution) → App ID
   `de.felixreinsch.healthhabithub` → select the distribution certificate
   from step 3.
2. Give it a name you'll remember — you'll need the **exact name** again
   below (e.g. `HHH App Store`).
3. Download the `.mobileprovision` file.

### 5. Base64-encode the binary/text assets

Run these locally, once per asset:

```bash
base64 -i dist_certificate.p12 -o dist_certificate.p12.b64
base64 -i profile.mobileprovision -o profile.mobileprovision.b64
base64 -i AuthKey_XXXXXXXXXX.p8 -o AuthKey.p8.b64
base64 -i mobile/ios/Runner/GoogleService-Info.plist -o GoogleService-Info.plist.b64
base64 -i mobile/lib/firebase_options.dart -o firebase_options.dart.b64
```

(`GoogleService-Info.plist` and `firebase_options.dart` are the real,
gitignored Firebase config — the same files described in
`mobile/lib/firebase_options.dart.example`. Release builds need the real
ones; regular CI runs stub them.)

### 6. Add GitHub repository secrets

Repo → **Settings** → **Secrets and variables** → **Actions** → **New
repository secret**. Add each `.b64` file's _contents_ (open it in a text
editor and paste the whole base64 blob) under these names, plus the two
plain-text values from step 2:

| Secret                                 | Value                                                     |
| -------------------------------------- | --------------------------------------------------------- |
| `IOS_DIST_CERTIFICATE_BASE64`          | contents of `dist_certificate.p12.b64`                    |
| `IOS_DIST_CERTIFICATE_PASSWORD`        | the `.p12` export password from step 3                    |
| `IOS_PROVISIONING_PROFILE_BASE64`      | contents of `profile.mobileprovision.b64`                 |
| `IOS_PROVISIONING_PROFILE_NAME`        | the exact profile name from step 4 (e.g. `HHH App Store`) |
| `APP_STORE_CONNECT_API_KEY_ID`         | Key ID from step 2                                        |
| `APP_STORE_CONNECT_API_ISSUER_ID`      | Issuer ID from step 2                                     |
| `APP_STORE_CONNECT_API_KEY_CONTENT`    | contents of `AuthKey.p8.b64`                              |
| `IOS_GOOGLE_SERVICE_INFO_PLIST_BASE64` | contents of `GoogleService-Info.plist.b64`                |
| `FIREBASE_OPTIONS_DART_BASE64`         | contents of `firebase_options.dart.b64`                   |

Delete the local `.p8`/`.p12`/`.mobileprovision`/`.b64` files once they're in
GitHub secrets — you don't need them lying around afterwards, and the `.p8`
in particular can't be re-downloaded if lost (just generate a new API key if
that happens).

## Cutting a release

1. Bump the version in `mobile/pubspec.yaml` (the `versionName` part, e.g.
   `1.0.0+1` → `1.0.1+1` — the build number after the `+` is informational
   only; the `beta` lane overrides it at build time with
   `latest_testflight_build_number + 1`, since Apple requires strictly
   increasing build numbers and this repo doesn't track what's already on
   TestFlight).
2. Commit, push to `main`, wait for the normal CI to pass.
3. Tag it and push the tag (optional — purely for version bookkeeping/git
   history, does not trigger anything):
   ```bash
   git tag mobile-v1.0.1
   git push origin mobile-v1.0.1
   ```
4. Trigger the build by hand: Actions tab → **Mobile Release** →
   **Run workflow** → lane **`beta`**. On success the build appears in App
   Store Connect → TestFlight within a few minutes (Apple's own processing
   step, not part of this pipeline).
5. Test it via TestFlight.
6. When ready for the public App Store: Actions tab → **Mobile Release** →
   **Run workflow** → lane **`release`**. This submits the TestFlight build
   you just tested for Apple's review — it does not build a new one.

   Note: the very first submission may also require you to answer a few
   things once in App Store Connect that `deliver` doesn't automate here
   (export compliance / encryption declaration, age rating, screenshots) —
   fill those in via the App Store Connect UI if `deliver` complains about
   missing metadata.

## Rotating expired certificates/profiles

Distribution certificates and provisioning profiles both expire (~1 year).
When the `beta` lane starts failing with a signing error, redo steps 3–6
above and update the corresponding secrets — nothing else in this pipeline
needs to change.
