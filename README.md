# QALIM tickTack

A real two-player tic-tac-toe web app. Register, create or join challenges, play in real time, and review saved match history showing winners, losers, draws, the final board, and a short match story.

## Run on localhost

Requires **Node.js 24+**.

```sh
npm install
npm run dev
```

Open **http://127.0.0.1:3000**. With Supabase environment variables absent, the app automatically uses its working localhost backend: SQLite database, password-hashed accounts, HttpOnly sessions, and server-sent events. Data persists in `.data/qalim.sqlite` (ignored by Git).

For two-player testing, register one account in a normal browser window and another in an incognito window or a different browser. Create a challenge in the first window and join in the second. Two tabs in the same browser profile share one account. Refresh either window to restore the game. Completed games appear in both players' Match history. Resignation also saves a result.

The localhost server binds to 127.0.0.1. This development backend is intended for a single local server, **not Vercel or multi-instance hosting**.

## Host on Vercel with Supabase

1. Create a Supabase project.
2. Open its SQL Editor and run `supabase/migrations/202610040001_ticktack.sql` once. Alternatively, link the Supabase CLI to your project and run `supabase db push`.
3. In Supabase Auth, enable email/password sign-in. Under **Authentication → URL Configuration**, set **Site URL** to `https://qalim-ticktack.vercel.app` (or your actual production origin). Add `https://qalim-ticktack.vercel.app/auth/confirm` to **Redirect URLs**. For development also add `http://127.0.0.1:3000/auth/confirm` and `http://localhost:3000/auth/confirm`. Keep the default Confirm signup email template's `{{ .ConfirmationURL }}` link. New signups explicitly return to the current site's `/auth/confirm` page, which validates the session and offers a button to play. Expired links show a helpful message; the sign-in form can resend verification emails. The profile is created automatically by the database trigger, and the migration backfills existing Auth accounts.
4. Copy `.env.example` to `.env.local` for local Supabase testing. Set:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

The publishable key (or legacy anon key) is safe for browser use with the included row-level security. **Do not use a service-role key.** No secrets are hard-coded.

5. Import this GitHub repository in Vercel. Framework: Next.js; root directory: repository root. Add both variables to the Vercel project environment and deploy. Changing these `NEXT_PUBLIC_` variables requires a new build/deployment.
6. Test with two real accounts/browser sessions. Verify authentication, joining, turn enforcement, real-time updates, reload recovery and both users' history.

On Vercel the app fails closed if Supabase is not configured; it will not attempt to store live games in ephemeral SQLite files.

If `/rest/v1/profiles` returns `404` with `PGRST205`, the app schema has not been created or is not visible to the API schema cache. Run the complete initial SQL migration in the same Supabase project used by Vercel, then execute `NOTIFY pgrst, 'reload schema';`. The initial migration is for an uninitialized app schema; do not rerun it if the app tables already exist. Creating a Supabase project or Auth user alone does not create the app tables. If a previous verification link already confirmed your email but redirected to localhost, try signing in on the production site after fixing the database; otherwise use Resend verification email after correcting URL Configuration.

## Stack and architecture

Next.js App Router, TypeScript, React, Tailwind CSS, and Lucide icons. Supabase provides hosted Auth, PostgreSQL and Realtime. The localhost backend uses Node's built-in SQLite.

- `src/components/`: authentication, lobby/game interface, board and history.
- `src/hooks/use-game-room.ts`: authenticated state, subscriptions, reconciliation on reconnect/focus, action/loading/error state.
- `src/lib/backend.ts`: one interface selecting Supabase or localhost.
- `src/lib/game.ts`: pure move validation, win/draw detection and match narration.
- `src/lib/local-store.ts` and `src/app/api/local/route.ts`: localhost persistence, validated transactions, sessions and real-time events.
- `supabase/migrations/`: `profiles` and `games`, RLS, profile trigger and validated RPCs.
- `tests/`: core game logic and challenge lifecycle/security tests.
- `AGENTS.md`: keep implementation simple and take the fastest effective route.

## Correctness and security

Clients cannot write Supabase games directly. RPC functions check the authenticated caller, game status, turn and square; row locks serialize joining, moves and cancellation. A per-user transaction advisory lock prevents conflicting active games when creating/joining. RLS limits game reads to open challenges and participants. History contains only your games; aggregate stats cover all your completed games, while the history list displays the most recent 100.

Local mode uses transactional SQLite with equivalent validation, scrypt password hashing, token hashes at rest, HttpOnly/SameSite cookies, same-origin mutation checks and basic rate limiting. No email verification is performed in local mode.

Realtime notifications trigger a fresh read of authoritative state. Ten-second reconciliation and focus/online refresh also catch stale challenges and missed notifications. Opponent presence is advisory; an absent player does not automatically lose. They can reconnect, and either player may resign. An open challenge remains until cancelled.

## Supabase email links

In Supabase Authentication → URL Configuration, set Site URL to `https://qalim-ticktack.vercel.app` and allow both `https://qalim-ticktack.vercel.app/auth/confirm` and `https://qalim-ticktack.vercel.app/auth/reset-password` as Redirect URLs. Keep `{{ .ConfirmationURL }}` as the link in the confirmation and reset-password email templates. Send a new email after changing settings; old emails can still contain localhost links.

The login form sends password reset emails through Supabase. The reset page verifies the email session, lets the player choose a new password, then tells them to return to the app. Dashboard recovery links landing at the Site URL are forwarded to that reset page. Confirmation emails also tell players to return to the app, without a web play button. All app-generated email links use the live Vercel domain, including when testing with Supabase on localhost.

## Splash and Bombs mode

Classic 3×3 matches remain available. Choose **Bombs · 4×4** before creating a challenge to play four in a row with two invisible, randomly placed, one-use bombs. Rival reset clears up to two of the opponent's oldest active marks. Double reset clears up to two oldest active marks from each player. Explosions happen before victory is checked. The turn still passes normally; cleared squares can be played again. Bomb events and total moves are saved with the result.

To enable Bombs online, run `supabase/migrations/202610040002_bombs.sql` in the existing Supabase project's SQL editor after the initial setup. Secret bomb positions are in a separate table without player read permissions and never included in snapshots or Realtime. Existing classic matches and histories are preserved.

Winners get five seconds of confetti and balloons; losers get brief, slow red ring pulses. Draws do not trigger these effects, and viewing an old result does not replay them. Effects respect reduced motion and never block controls.

Each confirmed move plays a short wooden-piece sound, including opponent moves after the player interacts with the app. The sound toggle remembers its setting on the device. Reloading a saved board or polling unchanged data does not replay moves. Sounds are generated locally without audio downloads.

The branded web loading screen updates with Vercel. The native Expo splash uses `expo-splash-screen` and needs a **new APK build**; see `mobile/README.md`.

## App icon and Android APK

The downloadable XO icon is `assets/app-icon.png` (1024 x 1024), with an editable SVG and Android adaptive versions alongside it. It is also served at `/app-icon.png`.

The `mobile/` folder is a small Expo WebView wrapper for the live Vercel game. Its icon and EAS project ID are configured. See `mobile/README.md` for the exact APK build commands. Run them inside `mobile`, not the Next.js project root.

Before pushing updates, stage the project files and run `powershell -ExecutionPolicy Bypass -File scripts/sync-vscode.ps1` to sync the user's VS Code copy at `C:\qalim-ticktack-main`. The sync preserves previous versions of changed files under `.codex-sync-backups` and leaves secrets, dependencies, and other local-only files alone.

## Checks

```sh
npm test
npm run typecheck
npm run build
npm start
```

Tests cover every winning line, draws, invalid/occupied squares, turn order, outsiders, finished games, authentication, cancellation, duplicate joins, single active games, private history, resignation and rollback. A PGlite PostgreSQL integration test runs the actual Supabase migration and verifies RPC validation, RLS and private results with simulated Auth roles. Live Supabase Auth/Realtime and Vercel verification still require your configured project. No chat, rankings, tournaments or payments are included.

## Challenger total

Login and signup show the total registered players beneath the logo, refreshed every minute and when the app returns to the foreground. Run `supabase/migrations/202610090005_challenger_count.sql` in the existing project's SQL Editor to enable this count online. The public function returns only a number; account details stay protected. Until the count is available, the label stays hidden rather than showing a made-up total. Localhost counts its own registered users.
