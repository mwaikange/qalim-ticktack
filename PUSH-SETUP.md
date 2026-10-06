# Enable challenge push notifications

The joining player is O and takes the first move in both Classic and Bombs matches. Existing matches retain their board and turn. New challenges notify every signed-in account with an enabled device except the creator. Acceptance notifies only the creator. Tapping an alert opens the current match or lobby; saved sign-in restores the account automatically.

## 1. Enable Android sending in Expo

Your supplied Firebase configuration has been copied to `mobile/google-services.json` in both local project copies and matches `com.qalim.ticktack`. Expo generates the Google services Gradle integration from `app.json`; do not edit Gradle files or add Firebase Analytics.

In Firebase, open **Project settings → Service accounts → Generate new private key**. In the Expo dashboard, open this project's **Project settings → Credentials → Android → FCM V1 service account key**, and upload that private JSON. Use the same Firebase project as google-services.json (`qalimticktack`).

The private service-account JSON goes only into Expo credentials, never GitHub. The Android configuration is ignored by Git but included in the EAS upload through `mobile/.easignore`. A fresh GitHub download will need your google-services.json copied back into `mobile/`.

Official instructions: https://docs.expo.dev/push-notifications/fcm-credentials/

## 2. Deploy the Supabase sender and enable the database

Run in VS Code PowerShell:

```powershell
cd C:\qalim-ticktack-main
powershell -ExecutionPolicy Bypass -File .\scripts\setup-push.ps1
```

Sign in to Supabase when requested. The script deploys the `push-challenges` Edge Function, sets its private webhook secret, and writes `C:\qalim-ticktack-main\.push-setup.sql`. It does not change your database automatically.

Open that SQL file in VS Code, copy all its contents into your Supabase **SQL Editor**, and run it once. Both earlier game migrations must already be installed. This enables private device registration, the joiner-first rule, event triggers, and a once-per-minute retry/receipt check. Secrets are stored in Supabase Vault. `.env.push` and `.push-setup.sql` are ignored by Git; keep them private. Re-running the setup script reuses the same secret.

No database webhooks need to be added by hand. The SQL connects the private event queue to the Edge Function using `pg_net`, then schedules recovery through `pg_cron`. If either extension is unavailable, enable it in Supabase Database Extensions and rerun the SQL. Supabase Vault is included in hosted Supabase projects.

## 3. Build and install the new APK

```powershell
cd C:\qalim-ticktack-main\mobile
npm install --prefer-offline --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'Install failed. Build stopped.' }
if (-not (Test-Path -LiteralPath .\google-services.json)) { throw 'Firebase config is missing.' }
$env:EAS_NO_VCS = '1'
$env:EAS_PROJECT_ROOT = (Get-Location).Path
npx eas-cli@latest build --platform android --profile preview
```

Install the resulting APK and sign in. Allow the notification permission prompt. Push requires the rebuilt APK and Firebase credentials; the older APK and Expo Go cannot test this feature.

## Verify with two accounts

1. Sign in on two phones and allow notifications. Put the second app in the background.
2. Alice creates a challenge. Bob receives **“Alice has created a challenge, up for it?”**; Alice receives no invitation to her own challenge.
3. Bob accepts and immediately sees **Your move** as O. Alice receives **“Bob has accepted your challenge, log in and play!”**.
4. Bob plays first without waiting for Alice to reopen the app. Alice can then play X.
5. Repeat with Bombs mode. Ordinary moves, cancellations and completed matches do not send push invitations.
6. Sign out on Bob's device. It no longer receives challenge alerts until signed in again. Disabling phone notification permission is detected when the app returns to the foreground.

In Supabase, `push_devices` should contain one row per enabled device, `push_events` records dispatch progress, and `push_receipts` holds Expo delivery receipts until checked. These tables are private to the server; users cannot read other people's tokens. Multiple devices per account are supported. Unregistered devices are removed using Expo tickets and receipts.

Transient sends retry three times, then the maintenance job retries failed work. Invitation jobs expire after five minutes and acceptance jobs after fifteen minutes; stale or cancelled games are skipped. Processed batches retain a cursor, and duplicate webhook claims are ignored. Expo/APNs/FCM delivery is best effort; a rare crash between a successful send and its database acknowledgement can still repeat an alert.

For failures, inspect Supabase **Edge Functions → push-challenges → Logs** and `push_events.error`. Receipt errors such as `InvalidCredentials` mean the Expo FCM key still needs attention. Expo ticket acceptance alone does not prove delivery to a phone. Physical delivery must be checked on the rebuilt app.
