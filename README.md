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
Stop both local processes when finished.

## Where things live

- `src/shared/themes.ts`: six palettes — Sage, Walnut, Slate, Marble, Ink, Blush — each moving the squares, the rim and both armies together through custom properties. The header's palette button lists them; the choice is remembered by the browser and, for a signed-in account, in D1 (`preferences`) so it follows the player to another device.
- `src/app/App.tsx` settings dialog, opened from the header gear or the sidebar: display name, a square 128 × 128 photo (cropped in the browser — drag to reframe, a zoom slider — and stored on the account as a small data URL), the board palette and the move-sound switch. Guests can change the palette and sound; those choices stay in the browser.
- `src/styles.css`: colors, typography, responsive layout, the theme picker and board animation.
- `src/app/Piece.tsx`: the original, consistently shaded Staunton vector set.
- `src/app/Board.tsx`: stable piece identities, castling/capture animations,
  pointer handling, legal destinations, keyboard buttons and promotion.
- `src/shared/game.ts`: chess.js validation, history, game outcomes and clocks.
- `src/worker/index.ts`: guest sessions, email/password accounts, D1, lobby and game APIs.
- `src/app/AuthPage.tsx`, `src/app/session.ts` and `src/shared/links.ts`: the `/login` and `/signup` pages. A successful sign-in or sign-up lands on `/dashboard` (`src/app/Dashboard.tsx`), which greets the account, counts its finished games, lists the recent ones, and links on to the board and the settings dialog; the sidebar and the account page point back to it. Accounts are this app's own: an email, a password and an optional display name, stored in D1 with the password stretched by PBKDF2-SHA256 (100k rounds, per-account salt) and never kept in the clear. The session behind the `__Host-rook` http-only cookie points the player row at the account, so games, history and the board theme follow the person across devices. Both pages are real URLs (the Worker serves the app for unknown paths). The page's decoration is the board's own vector set drifting slowly around the margins, joined on wide screens by emblems from the game rather than the board — crown, trophy, chess clock, shield, hourglass, target (`Glyph` in the same file, drawn on the pieces' 100×100 grid and lighting): `aria-hidden`, `pointer-events: none`, four pieces only on phones, and no motion at all under `prefers-reduced-motion`.
- `src/shared/bots.ts`, `src/shared/engine.ts` and `src/app/computer.ts`: eight practice bots. Up to 1500 they score every move two plies deep, then sometimes settle for less than their best. 1800 and 2100 add iterative deepening, alpha-beta pruning, a capture search and a tapered middlegame/endgame evaluation, capped by a time budget, and they go deeper when few pieces remain.
- `src/app/stockfish.ts` and `public/stockfish/`: the two strongest levels (2500 Titan, 2800 Oracle) use Stockfish 19, lite single-threaded WASM (about 1.8 MB, no cross-origin isolation needed), capped with `UCI_LimitStrength`/`UCI_Elo`. If the engine cannot load, the move falls back to the built-in search. Stockfish is **GPL v3**, unlike the rest of this template; shipping it means the deployed bundle carries that licence. Its strength is calibrated by Stockfish, not learned from human games at those ratings — a human-trained model such as Maia would be the alternative, but it needs a neural-network runtime that this static, Worker-hosted site does not have.
- `src/shared/players.ts`, `src/shared/player-books.ts` and the generated `src/shared/player-book-data.ts`: nine named players — Sindarov 2680, Tal 2700, Gukesh 2760, Karpov 2775, Fischer 2785, Anand 2790, Nakamura 2790, Carlsen 2830, Kasparov 2850. The modern five are labelled with current ratings, the retired four with their peak. Their opening books are frequency tables built from their own public tournament games by `scripts/build-player-books.ts`, which replays every game, keeps the first sixteen plies and counts identical lines. The collections used were PGNmentor's player files, plus TWIC weeks 1600–1659 for Sindarov, who has none: Carlsen 5,951 games, Nakamura 8,436, Anand 4,304, Karpov 3,525, Tal 2,428, Gukesh 2,399, Kasparov 2,124, Fischer 825, Sindarov 553. Active players are read from 2016 onwards so the book reflects how they open now; retired players are read across their whole career. Only the derived line counts ship; no game is stored. Regenerate with:

  ```sh
  bun scripts/build-player-books.ts carlsen="Carlsen,Magnus"=Carlsen.pgn \
    sindarov="Sindarov,Javokhir"=/path/to/twic*.pgn
  ```

  The engine worker is created once per session, so a reply spends its whole budget searching rather than recompiling the engine, and in an endgame the persona stops asking for alternatives and gives the single line a longer search to convert. A persona always plays its own repertoire move while the position is in its book, so two players cannot drift into the same opening because the engine happened to choose instead. Past the book the engine plays, but not always its favourite move: it asks Stockfish for its eight best and `src/shared/style.ts` chooses among them by a taste function, rewarding checks, captures, sacrifices and pawn storms in proportion to the player's aggression, and castling and quiet development in inverse proportion. The same module also records which piece each player likes to put on which square, ply by ply, from the lines in their own book, and scores a candidate by how much more often that player plays it than the field does — so Gukesh still reaches for ...c5 and Karpov for ...Nf6 and ...e5 after the exact lines have run out. This is style imitation from real repertoires and real preferences, not a model trained on the players; no neural network is involved, so it is a caricature that opens like them rather than a simulation of them.
- `src/shared/review.ts` and `analysePosition` in `src/app/stockfish.ts`: once a game is finished, "Analyse game" replays it, asks the engine about every position at full strength (no rating cap) and grades each move as brilliant, great, best, excellent, good, inaccuracy, mistake or blunder. The label comes from the centipawns the move gave up against the engine's first choice, with a sacrifice of a knight or better that keeps the game playable called brilliant and a move far ahead of every alternative called great. Each position is searched to depth 24, at full strength, with a fifteen-second ceiling and the three best lines, so a review is accurate rather than quick and the button counts its way through the game; a long game takes minutes. The move actually played is usually one of those ranked lines, and then it is graded against the best move from the same search, at the same depth, on the same position; only a move the engine did not rank is searched on its own. Either way its loss is measured on the position it was played in instead of being inferred from the next position, so two searches cannot disagree by a few centipawns and turn a sound move into an inaccuracy. The hash table is kept for the whole review instead of being wiped between positions. Scoring the moves treats a mate as a mate: delivering one is the best move rather than the worst, and giving up a forced mate is a blunder. Differences under a dozen centipawns are search noise and count as best, as does a move the engine rates level with its own first choice, so equally good alternatives are not marked as mistakes. The move list is marked with the usual `!! ! ★ ?! ? ??` shorthand, each side gets an accuracy figure from a win-probability curve, and selecting a move shows the verdict and the engine's preference. It runs only after the game ends, so it cannot be used for live hints, and it needs the Stockfish worker that the stronger bots already load.
- `src/shared/book.ts`: the opening book, keyed by position rather than move order, so it handles transpositions and answers an opponent who leaves the main lines with a search instead. Italian, Ruy Lopez, Scotch, Sicilian, French, Caro-Kann, Scandinavian, Pirc, Alekhine, Queen's Gambit, Slav, Nimzo-Indian, King's Indian, London, English and Reti systems, from both colours.

The evaluations add passed-pawn, rook-file and king-safety terms, and in a won endgame push the lone king to the edge. The labels are difficulty settings, not engine ratings.

## State and identity

The server validates every online move. A compare-and-set on the game's revision
commits the entire state, clock and outcome atomically. Concurrent joins or moves
cannot overwrite each other. Published events contain only a revision; clients
fetch authoritative state, ignore older revisions and resync after reconnect.
A four-second snapshot fallback repairs a missed publication and resolves clocks
even if realtime is unavailable. Clocks use server time; an expired clock is
settled when the game is next read or changed. Guests cannot publish game events.

D1 stores this site's games and a SHA-256 hash of each random guest credential.
The credential lives only in an HttpOnly, SameSite cookie (Secure on hosted
origins). Invites identify a game, never authorize a player's moves. Games and
stats are casual, with no matchmaking rating or anti-cheat claim.

Signing in before creating or joining a game associates that seat with the
server-verified account id. That account can resume on another device and
its wins, losses and draws persist. Guest history remains in that browser;
signing in does not retroactively claim guest results. Signing out does not
permit the guest cookie to control the account's seats.

The lobby shows up to 20 public waiting games created in the last 30 minutes.
