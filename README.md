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
