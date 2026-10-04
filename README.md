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

## Checks

```sh
npm test
npm run typecheck
npm run build
npm start
```

Tests cover every winning line, draws, invalid/occupied squares, turn order, outsiders, finished games, authentication, cancellation, duplicate joins, single active games, private history, resignation and rollback. A PGlite PostgreSQL integration test runs the actual Supabase migration and verifies RPC validation, RLS and private results with simulated Auth roles. Live Supabase Auth/Realtime and Vercel verification still require your configured project. No chat, rankings, tournaments or payments are included.
