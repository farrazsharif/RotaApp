# Caremid Carer — native app (iOS App Store) runbook

The carer app is now wrapped with **Capacitor** so the exact same React web app
runs as a real native app. The web code, config and icon source are set up in
this repo. The steps below **must be run on a Mac with Xcode** — iOS apps can
only be built, signed and submitted from macOS.

- **App name:** Caremid Carer
- **Bundle ID:** `uk.co.caremid.carer`  ← must match App Store Connect exactly
- **What's bundled:** the built web app (`dist/`). It talks to the live API at
  `https://api.caremid.co.uk/api` over HTTPS, so it works as a self-contained app.
- **Updating later:** change code → `npm run build` → `npx cap sync ios` → bump the
  build number → Archive → upload. (No app-store resubmission is needed for
  *backend* changes — only for changes to the app's own screens.)

---

## 0. One-time prerequisites (on the Mac)

1. **Xcode** (latest from the App Store) — open it once to install components.
2. **CocoaPods:** `sudo gem install cocoapods` (or `brew install cocoapods`).
3. **Node 20+** and this repo cloned/pulled.
4. **Apple Developer Program** membership (paid) — you have this.

## 1. Generate the iOS project

From `carer-app/` on the Mac:

```bash
npm install
npm run build
npx cap add ios
npx cap sync ios
```

This creates `carer-app/ios/` (the Xcode project). `cap sync` copies the latest
web build in and installs the native plugins.

> On Windows this step is skipped on purpose — `cap add ios` needs CocoaPods/Xcode.

## 2. App icon & splash screen

From `carer-app/` (uses `assets/logo.png`, already the Caremid icon):

```bash
npx @capacitor/assets generate --ios --iconBackgroundColor '#FFFFFF' --splashBackgroundColor '#1E3A5F'
```

This fills in all iOS icon sizes and the launch screen. (Alternatively, drag
`public/icon-1024.png` onto the AppIcon slot in Xcode's asset catalog.)

## 3. Open in Xcode and set signing

```bash
npx cap open ios
```

In Xcode → select the **App** target → **Signing & Capabilities**:
- **Team:** your Apple Developer team.
- **Bundle Identifier:** `uk.co.caremid.carer`.
- **Automatically manage signing:** ON (Xcode registers the App ID for you).

## 4. Permissions (Info.plist)

The app lets carers attach a **receipt photo** (camera / photo library), so add
these keys to `ios/App/App/Info.plist` (Xcode: right-click Info.plist → Open As
→ Source, or add rows in the editor):

```xml
<key>NSCameraUsageDescription</key>
<string>Take a photo of a receipt to attach to a financial transaction record.</string>
<key>NSPhotoLibraryUsageDescription</key>
<string>Attach a receipt photo from your library to a financial transaction record.</string>
```

No location permission is needed (the app doesn't use geolocation). If push
notifications are added later (see §8), the Push Notifications capability and an
`aps-environment` entitlement get added then.

## 5. Create the app in App Store Connect

1. [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → **Apps** → **+** → New App.
2. Platform **iOS**, Name **Caremid Carer**, primary language, **Bundle ID**
   `uk.co.caremid.carer` (register it first under Certificates, IDs & Profiles →
   Identifiers if it isn't offered), and an SKU (e.g. `caremid-carer`).

## 6. Build and upload

In Xcode:
1. Set the **Version** (e.g. `1.0.0`) and **Build** (e.g. `1`) on the General tab.
2. Choose destination **Any iOS Device (arm64)** (top bar).
3. **Product → Archive**.
4. When the Organizer opens: **Distribute App → App Store Connect → Upload**.

The build appears in App Store Connect after a few minutes of processing.

## 7. TestFlight, then submit for review

1. **TestFlight** tab → add the build to internal testing → install on your own
   iPhone via the TestFlight app and check clock-in, call logs, receipts, etc.
2. On the **App Store** tab, fill the listing: screenshots (6.7" and 5.5" sizes),
   description, keywords, **support URL**, **privacy policy URL** (required), and
   the **App Privacy** data-collection questionnaire (the app sends name, rota and
   care data to your own server — declare accordingly).
3. **Add for Review → Submit**. First review is usually 24–48h.

> Apple can reject "just a website" wrappers (Guideline 4.2). This app uses
> native capabilities (camera for receipts, offline shell, native app lifecycle)
> and is a staff tool, which is fine — but describe it clearly in the review notes
> as an internal staff/rota app and provide a **demo carer login** for the reviewer.

## 8. Push notifications (follow-up phase)

The current web push (VAPID) does **not** fire inside the native WebView. Native
push needs:
- `@capacitor/push-notifications` plugin,
- an **APNs Auth Key** from the Apple Developer portal,
- the **Push Notifications** capability in Xcode,
- backend support to send APNs (store device tokens, send via APNs/FCM).

Tell me when you want this and I'll wire the plugin + backend device-token
handling.

## 9. Optional: live reload while developing

To test on a device against a dev server, temporarily add to `capacitor.config.ts`:

```ts
server: { url: 'http://<your-mac-LAN-ip>:5174', cleartext: true },
```

then `npx cap sync ios`. **Remove this before building a release** (releases must
bundle `dist/`, not point at a URL).

---

### What's committed in this repo
- `capacitor.config.ts` — app id, name, splash config.
- Capacitor deps in `package.json`.
- `assets/logo.png`, `assets/icon-only.png` — icon source for `@capacitor/assets`.
- Service-worker registration is skipped on native (see `src/main.tsx`).

The `ios/` (and later `android/`) folders are generated on the Mac in step 1.
Recommended: commit `ios/` so builds are reproducible (Capacitor's generated
`.gitignore` already excludes `ios/App/Pods/` and build output).
