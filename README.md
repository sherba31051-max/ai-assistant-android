# AI Assistant — Android APK

Android wrapper (Capacitor WebView) for the [AI Assistant](https://ai-assistant-poreq51.adaptive.ai) web app — a universal AI chat assistant with live web search and persistent memory.

## How it works

This is a Capacitor Android project configured to load the live web app URL (`https://ai-assistant-poreq51.adaptive.ai`) inside a native WebView shell, producing a real installable `.apk`.

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
