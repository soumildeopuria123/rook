import { Chess } from 'chess.js'
import type { Bot } from '../shared/bots'
import { parseBestMove, parseInfo, uciToSan } from '../shared/uci'
import type { Candidate } from '../shared/style'

// Stockfish 19, lite single-threaded build. No SharedArrayBuffer, so the host
// needs no cross-origin isolation; the .wasm sits next to it in public/.
// Absolute, because this module also runs inside a dedicated worker where a
// root-relative path is not resolvable.
const ENGINE_URL = new URL(
  '/stockfish/stockfish-19-lite-single.js',
  self.location.origin,
).href
const LOAD_TIMEOUT = 20000
// Stockfish's calibrated strength range.
const MIN_ELO = 1320
const MAX_ELO = 3190

let engine: Worker | null = null
let booting: Promise<boolean> | null = null
let pending: {
  resolve: (candidates: Candidate[] | null) => void
  timer: ReturnType<typeof setTimeout>
  lines: Map<number, Candidate>
} | null = null
let chain: Promise<unknown> = Promise.resolve()

function boot(): Promise<boolean> {
  if (booting) return booting
  booting = new Promise<boolean>((resolve) => {
    try {
      engine = new Worker(ENGINE_URL)
    } catch {
      resolve(false)
      return
    }
    const worker = engine
    let settled = false
    const done = (ok: boolean) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(ok)
    }
    const timer = setTimeout(() => done(false), LOAD_TIMEOUT)
    worker.onerror = () => done(false)
    worker.onmessage = (event: MessageEvent) => {
      const line = String(event.data)
      if (line === 'uciok') {
        // Set once for the session. Re-sending Hash on every search would wipe
        // the transposition table, so each review position would start from
        // nothing instead of building on the position before it.
        worker.postMessage('setoption name Threads value 1')
        worker.postMessage('setoption name Hash value 128')
        worker.postMessage('setoption name Skill Level value 20')
        done(true)
      }
      const search = pending
      if (!search) return
      if (line.startsWith('info')) {
        const info = parseInfo(line)
        if (info) search.lines.set(info.multipv, { uci: info.uci, cp: info.cp })
      } else if (line.startsWith('bestmove')) {
        pending = null
        clearTimeout(search.timer)
        const ranked = [...search.lines.values()].sort((a, b) => b.cp - a.cp)
        const best = parseBestMove(line)
        if (!ranked.length && best) search.resolve([{ uci: best, cp: 0 }])
        else search.resolve(ranked)
      }
    }
    worker.postMessage('uci')
  })
  return booting
}

/**
 * The engine's ranked moves for this position, or null so the caller can fall
 * back. `multipv` asks for that many candidates, which is what lets a player
 * persona choose by taste instead of always taking the top line.
 */
export async function stockfishMoves(
  pgn: string,
  bot: Bot,
  multipv = 1,
  movetime = bot.budgetMs,
): Promise<Candidate[] | null> {
  const run = async (): Promise<Candidate[] | null> => {
    if (!(await boot()) || !engine) return null
    const worker = engine
    const chess = new Chess()
    if (pgn) chess.loadPgn(pgn)
    if (chess.isGameOver()) return null
    const elo = Math.max(MIN_ELO, Math.min(MAX_ELO, bot.elo))
    return new Promise<Candidate[] | null>((resolve) => {
      const timer = setTimeout(() => {
        pending = null
        worker.postMessage('stop')
        resolve(null)
      }, movetime + 5000)
      pending = {
        timer,
        lines: new Map(),
        resolve: (candidates) => {
          clearTimeout(timer)
          resolve(candidates)
        },
      }
      worker.postMessage('setoption name UCI_LimitStrength value true')
      worker.postMessage(`setoption name UCI_Elo value ${elo}`)
      worker.postMessage(`setoption name MultiPV value ${Math.max(1, multipv)}`)
      worker.postMessage(`position fen ${chess.fen()}`)
      worker.postMessage(`go movetime ${movetime}`)
    })
  }
  chain = chain.then(run, run)
  return (await chain) as Candidate[] | null
}

/**
 * How hard the after-game review works. The review runs once a game is over, so
 * it is allowed all the time it needs: the depth ceiling sits far past what the
 * search reaches in its time budget, and the time ceiling exists only so a
 * tactical position cannot search for ever. Both sides of every comparison are
 * then searched to the same depth, which is what makes a few centipawns mean
 * the same thing on move 3 and on move 40.
 */
export const REVIEW_DEPTH = 24
export const REVIEW_MOVETIME = 15000
/** Lines kept per position: enough for "only move" and equally-good checks. */
export const REVIEW_LINES = 3

/**
 * One position scored at full strength with no rating cap, which is what the
 * after-game review needs.
 *
 * A fixed depth makes every position in the game comparable, and the ranked
 * lines mean the move that was actually played is usually among the scored
 * ones, so it can be graded against the best move from the very same search,
 * at the same depth, with the same transposition table. The time limit is only
 * a ceiling for tactical positions that would otherwise search for ever.
 */
export async function analysePosition(
  fen: string,
  movetime = REVIEW_MOVETIME,
  depth = REVIEW_DEPTH,
  multipv = REVIEW_LINES,
): Promise<Candidate[]> {
  const run = async (): Promise<Candidate[]> => {
    if (!(await boot()) || !engine) return []
    const worker = engine
    return new Promise<Candidate[]>((resolve) => {
      const timer = setTimeout(() => {
        pending = null
        worker.postMessage('stop')
        resolve([])
      }, movetime + 8000)
      pending = {
        timer,
        lines: new Map(),
        resolve: (candidates) => {
          clearTimeout(timer)
          resolve(candidates ?? [])
        },
      }
      worker.postMessage('setoption name UCI_LimitStrength value false')
      worker.postMessage('setoption name Skill Level value 20')
      worker.postMessage(
        `setoption name MultiPV value ${Math.max(1, multipv)}`,
      )
      worker.postMessage(`position fen ${fen}`)
      // Depth first, with a time ceiling, so quality is consistent across the
      // game rather than whatever happened to fit in a fixed slice of time.
      worker.postMessage(`go depth ${depth} movetime ${movetime}`)
    })
  }
  chain = chain.then(run, run)
  return (await chain) as Candidate[]
}

/**
 * The score of one particular move, searched on the position it was played in.
 *
 * This is the number a review should grade with. Comparing the position before
 * the move with the position after it means comparing two searches that can
 * easily differ by a handful of centipawns, and that difference is what makes a
 * perfectly good move read as an inaccuracy. Scoring the move itself, to the
 * same depth as the engine's favourite, gives a loss that is actually the
 * move's own cost.
 *
 * Stockfish answers a restricted search with that move as its principal
 * variation. If a build ignores the restriction, the first line is some other
 * move; that is detected here and reported as "no score" so the caller falls
 * back rather than grading against the wrong move.
 */
export async function analyseMove(
  fen: string,
  uci: string,
  movetime = REVIEW_MOVETIME,
  depth = REVIEW_DEPTH,
): Promise<number | null> {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) return null
  const run = async (): Promise<number | null> => {
    if (!(await boot()) || !engine) return null
    const worker = engine
    return new Promise<number | null>((resolve) => {
      const timer = setTimeout(() => {
        pending = null
        worker.postMessage('stop')
        resolve(null)
      }, movetime + 8000)
      pending = {
        timer,
        lines: new Map(),
        resolve: (candidates) => {
          clearTimeout(timer)
          const only = candidates?.[0]
          resolve(only && only.uci === uci ? only.cp : null)
        },
      }
      worker.postMessage('setoption name UCI_LimitStrength value false')
      worker.postMessage('setoption name MultiPV value 1')
      worker.postMessage(`position fen ${fen}`)
      worker.postMessage(
        `go searchmoves ${uci} depth ${depth} movetime ${movetime}`,
      )
    })
  }
  chain = chain.then(run, run)
  return (await chain) as number | null
}

/** A single move in SAN, kept for callers that do not care about style. */
export async function stockfishMove(
  pgn: string,
  bot: Bot,
): Promise<string | null> {
  const candidates = await stockfishMoves(pgn, bot, 1)
  const best = candidates?.[0]?.uci
  return best ? uciToSan(pgn, best) : null
}
