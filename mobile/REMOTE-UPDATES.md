# Remote updates for QALIM tickTack

## What is configured

The existing Expo SDK 57 project `f4a131a8-75d5-42d2-927b-9086901c3d57` uses SDK-compatible `expo-updates`. Its update URL is `https://u.expo.dev/f4a131a8-75d5-42d2-927b-9086901c3d57`.

- `preview` builds use the **preview** channel and EAS environment.
- `production` builds use the **production** channel and EAS environment.
- `runtimeVersion.policy = fingerprint` automatically separates incompatible native runtimes. Do not change this policy to force an update onto an older build.
- `checkAutomatically = ON_LOAD` checks and downloads at native app startup. `fallbackToCacheTimeout = 0` starts the cached or embedded app immediately; a downloaded update is used on a later cold restart.
- The embedded update and Expo's error-recovery safeguards remain enabled. Offline starts continue to use the cached or embedded wrapper; the hosted game itself still needs internet.
- There is no `reloadAsync()` or forced restart, and simply returning from the background does not restart a match. Cold launch checks are provided by the native update controller rather than another JavaScript polling loop.

This is a managed/CNG app: there are no committed `android/` or `ios/` directories. EAS generates the native project, Android update manifest settings and module linking from `app.json` and installed packages. Keep it that way unless deliberately switching workflows. No signing credentials, Firebase configuration, notification settings, splash settings, package name or production version-increment rules were replaced.

**Existing APK/AAB installations cannot gain this module through a remote update. Users must install the next Play Store release containing this configuration first.** This change configures the next build; it does not create a build, upload a release or publish an update.

## Three delivery paths

| Change | Delivery |
| --- | --- |
| Hosted game screens, rules, sounds and web assets | Commit/push to the game repo; Vercel deploys them. The WebView loads the hosted game. EAS Update does not deploy the website or SQL. |
| Wrapper JavaScript/TypeScript, copy, React Native layout and compatible bundled images | EAS Update, for an installed build on the matching channel and fingerprint. |
| Expo/React Native upgrades, native dependencies, permissions, plugins, Firebase/native config, signing/package identifiers, launcher/adaptive icons or native splash configuration | New Android AAB/store release. The changed fingerprint prevents delivery to incompatible installations. |

Store listing changes and database migrations are handled separately. A remote update must still follow Google Play's policies; it is not a way to bypass review for changes requiring a store release.

## Local checks (do not publish)

Use the VS Code PowerShell terminal:

```powershell
cd C:\qalim-ticktack-main\mobile
npm install
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
npx expo install --check
npx expo lint
npx tsc --noEmit
npx expo config --type public
npx expo-modules-autolinking resolve --platform android
```

`expo-updates` must appear in Android autolinking. The configuration must show the project URL above, fingerprint policy, enabled updates, `ON_LOAD` and zero launch wait. Expo Go and a normal Metro development session do not verify production OTA behavior.

## Test after an update-enabled preview build exists

These are future operator steps, **not commands run by the agent during setup**. A preview build containing `expo-updates` must be created and installed separately with your existing signing setup before OTA testing is possible. Do not use an old APK to judge this setup.

1. Sign into the Expo account owning the linked project. Run the commands from `mobile/`, never the Next.js repository root.
2. Check channel mappings with `npx eas-cli@latest channel:list`. If absent, create them once: `npx eas-cli@latest channel:create preview --branch preview` and `npx eas-cli@latest channel:create production --branch production`. Keep preview and production mapped to different branches.
3. Make a small visible **wrapper-only** JavaScript change with no native dependency/config change. Check the fingerprint with `npx expo-updates fingerprint:generate --platform android`; compare it with the installed build's runtime on the EAS dashboard. Use the same lockfile, Firebase config and EAS environment as that build.
4. Once explicitly authorized to publish, send the test update:

```powershell
npx eas-cli@latest update --channel preview --platform android --environment preview --message "Preview: wrapper update test"
```

5. Cold-open the preview app online, allow the download to finish, and confirm it does not reload or interrupt play. Fully close and reopen it: the new wrapper should now appear. Verify sign-in/session persistence, WebView navigation, push permissions, notification opening, sound and splash behavior. Test airplane mode and failed downloads too.
6. Confirm a production build does not receive that preview update, and a build with a different runtime does not receive it. An offline first launch still needs connectivity for the hosted game.

For a folder downloaded from GitHub without Git, retain your existing `$env:EAS_NO_VCS = '1'` and `$env:EAS_PROJECT_ROOT = (Get-Location).Path` settings. Do not create a new Expo project or replace its keystore.

## Publish to production later

After testing and separate authorization, publish from the approved checkout. EAS environment selection is explicit for SDK 57:

```powershell
npx eas-cli@latest update --channel production --platform android --environment production --message "Describe the tested wrapper change"
```

For the same source and environment, fingerprint-compatible builds on that channel can download it. Native changes require a newly installed store build instead. Check runtime/channel details and update adoption in the linked project's EAS dashboard before widening a release. These commands upload a remote update; do not run them merely to verify configuration.

## Roll back a bad update

Use Expo's interactive rollback command from `mobile/`:

```powershell
npx eas-cli@latest update:rollback
```

Select the affected branch/channel and runtime, then choose a known-good published update or the update embedded in that build. Verify the selected runtime and channel before confirming; a rollback is a remote publication too. Online clients receive the rollback on their next check and use it after a later restart. Already-running or offline users are not instantly restarted or recalled. A known-good web game deployment requires a separate Vercel rollback.

## Verification limits

Local dependency checks, configuration introspection, lint, typechecking and Android module resolution can validate setup without producing an APK/AAB. Generated Android metadata can be inspected without compiling. They do not prove Gradle compilation, signing, device downloads, update adoption or rollback on a physical device. Those require an authorized update-enabled release build and a future test publication. No such build/publication is part of this setup task.

Android configuration introspection confirmed `ENABLED=true`, the existing project URL, `CHECK_ON_LAUNCH=ALWAYS`, zero launch wait and `EXPO_RUNTIME_VERSION=@string/expo_runtime_version` with the fingerprint placeholder resolved by the build workflow. Android autolinking resolved the installed `expo-updates` native module. No native folders were generated or committed. Remote channel/branch mappings have not been inspected or created; the profiles select separate channels, and the operator should check their mappings before publishing.

Official guidance: [SDK 57 updates](https://docs.expo.dev/versions/v57.0.0/sdk/updates/), [runtime compatibility](https://docs.expo.dev/eas-update/runtime-versions/), [background downloads](https://docs.expo.dev/eas-update/download-updates/), [rollbacks](https://docs.expo.dev/eas-update/rollbacks/).
