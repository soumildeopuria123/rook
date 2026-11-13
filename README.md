# Rook

**Play it:** <https://site-a570e0f8545243a3b34078e4d5f7dd87.freebuff.page/login> — that link opens the sign-in page. Sign in, or create an account, and you land on your dashboard.

A standalone chess template. Original SVG pieces, a responsive
board, drag or click moves, four time controls, public games, private invite links
and codes, move replay, a post-game review that grades every move, game exports,
a small practice opponent and optional email accounts, with their own sign-in
(`/login`) and sign-up (`/signup`) pages. No account is required to play another
person.

## Run

```sh
bun install
# Terminal 1: local managed realtime helper
bun run dev:realtime
# Terminal 2: app + local D1, at http://127.0.0.1:5184
bun run dev
```

Use two different browser profiles to play both sides. Two tabs in one profile
are the same guest. The computer is available without a second player, as white
or as black, and runs in a browser Worker so its search does not block board
interaction.

```sh
bun run typecheck
bunx bun@1.3.14 test tests
bun scripts/smoke.ts http://127.0.0.1:5184
bun run build
```

The smoke test creates a disposable game and plays it to checkmate. It verifies
simultaneous seat claims, legal moves, stale revisions, same-origin protection,
nonmember rejection, a real WebSocket update, reload persistence and history.
Run it only against a local database or a dedicated preview.

## Deploy to Preview

Follow the repository's Sites workflow: create the site, attach its Preview D1
database as `DB`, then deploy `deploy.json`. Its `realtime: true` provisions the
managed realtime helper. The platform injects `APP_ORIGIN`; accounts need no
other configuration or external provider.
Local `wrangler.jsonc` values and database ids are never deployed as platform
configuration. No API key, session secret or external chess service is needed.

The hosted demo is at
https://site-9026a518791f45bbb3fe07b01ec05260.freebuff.page.
It has its own isolated database and realtime helper. Projects created from
this template provision their own resources; they do not share the demo's games
or accounts. Publishing the starter catalog does not promote the demo's data.

The generated `freebuff-realtime/worker.js` is **local development only**. Sites
deploys its own managed helper. Never upload the local helper as an app Worker.
