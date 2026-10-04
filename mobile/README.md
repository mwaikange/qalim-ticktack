# QALIM tickTack Android app

This small Expo app opens https://qalim-ticktack.vercel.app/ in a native WebView. It uses the live Supabase game and needs an internet connection. Web changes appear after Vercel deploys; changes to native code or icons need another APK build.

The Expo project is already linked to `f4a131a8-75d5-42d2-927b-9086901c3d57` in `app.json`. The preview profile in `eas.json` produces an installable APK rather than a store bundle.

Paste these commands into the VS Code PowerShell terminal:

```powershell
cd C:\qalim-ticktack-main\mobile
npm ci
npx eas-cli@latest login
$env:EAS_NO_VCS = '1'
npx eas-cli@latest build --platform android --profile preview
```

Sign in with the Expo account that owns the linked project. `EAS_NO_VCS` allows building from this downloaded folder without initializing Git. If asked to generate a new Android keystore, choose yes. When the build finishes, open the download link and install the APK on your phone. Do not run create-expo-app again; this wrapper is ready to build.

The 1024 x 1024 icon is `assets/app-icon.png`. Android's adaptive foreground and monochrome icons are beside it and are referenced by `app.json`.

The native launch splash is configured in `app.json` through `expo-splash-screen`: dark green background and the lime XO icon. The loading view carries the QALIM tickTack wording until the live game opens. Rebuild the APK to include the native splash; web game effects and rules update when Vercel deploys. Test the actual splash in the release APK, since Expo Go does not show the same launch screen.

Local preview (Expo Go with compatible SDK):

```powershell
npx expo start
```

Verify before building:

```powershell
npx tsc --noEmit
npx expo lint
```

The APK itself has not been built or tested on a physical device here. The first EAS build requires your Expo login and Android signing setup.
