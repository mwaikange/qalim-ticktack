# QALIM tickTack Android app

This small Expo app opens https://qalim-ticktack.vercel.app/ in a native WebView. It uses the live Supabase game and needs an internet connection. Web changes appear after Vercel deploys. After users install the next store release, compatible wrapper JavaScript and bundled assets can also be delivered through EAS Update. Native modules, permissions and launcher icons still need a new store build. See [REMOTE-UPDATES.md](REMOTE-UPDATES.md) for testing, publishing, compatibility and rollback steps.

Challenge push notifications require the Firebase configuration, Expo FCM V1 credentials, and Supabase setup described in [PUSH-SETUP.md](../PUSH-SETUP.md). Follow that guide before rebuilding this version. Notification permission is requested after sign-in; signing out disconnects the device.

The Expo project is already linked to `f4a131a8-75d5-42d2-927b-9086901c3d57` in `app.json`. The preview profile in `eas.json` produces an installable APK rather than a store bundle.

Paste these commands into the VS Code PowerShell terminal:

```powershell
cd C:\qalim-ticktack-main\mobile
npm install
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed. Build stopped.' }
npx eas-cli@latest login
$env:EAS_NO_VCS = '1'
$env:EAS_PROJECT_ROOT = (Get-Location).Path
npx eas-cli@latest build --platform android --profile preview
```

Sign in with the Expo account that owns the linked project. `EAS_NO_VCS` allows building from this downloaded folder without initializing Git. If asked to generate a new Android keystore, choose yes. When the build finishes, open the download link and install the APK on your phone. Do not run create-expo-app again; this wrapper is ready to build.

The 1024 x 1024 icon is `assets/app-icon.png`. Android's adaptive foreground and monochrome icons are beside it and are referenced by `app.json`.

The native launch splash is configured in `app.json` through `expo-splash-screen`: dark green background and the lime XO icon. The loading view carries the QALIM tickTack wording until the live game opens, and the branded game splash stays visible for at least four seconds while sign-in loads in the background. Rebuild the APK to include the native splash; web game effects and rules update when Vercel deploys. Test the actual splash in the release APK, since Expo Go does not show the same launch screen.

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
