# AI Assistant — Android APK

A fully self-contained, standalone AI chat app for Android, built with Capacitor.

## How it works

Unlike earlier versions, this app no longer loads any remote website in a WebView. All UI and logic (`www/index.html`) is bundled directly inside the APK. The **only** network calls made at runtime go straight from the device to a free, public, no-signup AI text inference endpoint (`text.pollinations.ai`) — there is no intermediary server and no external backend involved.

Chat history is kept as local memory in the device's `localStorage`, so conversations persist across app restarts without any account or cloud sync.

## Getting the APK

Every push to `main` triggers a GitHub Actions build:

1. Go to the **Actions** tab → latest successful run → download the `ai-assistant-debug-apk` artifact, **or**
2. Go to the **Releases** page and download the attached `.apk` directly.

The APK is a debug build (auto-signed with Gradle's debug keystore), so it installs directly on Android — just enable "install from unknown sources" if prompted.

## Local build

```bash
npm install
npx cap sync android
cd android
./gradlew assembleDebug
```

Output: `android/app/build/outputs/apk/debug/app-debug.apk`
