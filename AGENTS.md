# Working on QALIM tickTack

- Keep things simple. Take the fastest, most efficient route that delivers a working result.
- Prefer small, direct changes and reuse the current stack and components.
- Do not add unnecessary abstractions, dependencies, features, or approval steps.
- Prioritize a working end-to-end app. Do not substitute a mockup for real multiplayer.
- Preserve database-authoritative move validation, atomic challenge joining, authentication, and match history.
- Run checks relevant to the change; avoid repeating checks without a reason.
- Keep explanations concise and practical.
- Use the shared notification provider for feedback: slide in from the top right, stay five seconds, then slide out.
- Use the branded selection menu for popup choices; keep colors, touch targets and keyboard behavior consistent.
- This project uses Next.js, TypeScript, React, Tailwind and Supabase for hosted multiplayer. SQLite mode is for localhost only; Vercel must use Supabase.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
