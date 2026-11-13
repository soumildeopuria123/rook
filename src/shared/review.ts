import { Chess, type Color, type Square } from 'chess.js'

// Point values matter only for the sacrifice test: a knight or better landing
// on a square a cheaper piece can take is what a beginner reads as a mistake.
const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }
const MATE = 100000
// The engine's mate scores sit just inside this, so a forced mate is always a
// bigger swing than any amount of material.
const MATING = MATE - 5000
// Centipawn differences this small are search noise between two positions the
// engine looked at separately, not something the player did wrong.
const NOISE = 12
// Candidates this close to the engine's first choice are equally best.
const TIE = 10

export type Verdict =
  | 'brilliant'
  | 'great'
  | 'best'
  | 'excellent'
  | 'good'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder'

export const VERDICTS: readonly Verdict[] = [
  'brilliant',
  'great',
  'best',
  'excellent',
  'good',
  'inaccuracy',
  'mistake',
  'blunder',
]

export const LABELS: Record<Verdict, string> = {
  brilliant: 'Brilliant',
  great: 'Great',
  best: 'Best',
  excellent: 'Excellent',
  good: 'Good',
  inaccuracy: 'Inaccuracy',
  mistake: 'Mistake',
  blunder: 'Blunder',
}

/** The shorthand a chess player recognises next to the move. */
export const MARKS: Record<Verdict, string> = {
  brilliant: '!!',
  great: '!',
  best: '★',
  excellent: '',
  good: '',
  inaccuracy: '?!',
  mistake: '?',
  blunder: '??',
}

export type Scored = { uci: string; cp: number }

export type PlyInput = {
  san: string
  /** Position before the move, with the mover to move. */
  fenBefore: string
  /** Position after the move. */
  fenAfter: string
  /** The move that was played, in UCI. */
  played: string
  /**
   * The engine's score for that move alone, searched on this position to the
   * same depth as the best move. The most accurate way to grade, when available.
   */
  playedScore?: number
  /** The engine's ranked moves before the move, from the mover's side. */
  before: Scored[]
  /** The engine's ranked moves after the move, from the opponent's side. */
  after: Scored[]
}

export type MoveReview = {
  san: string
  color: Color
  verdict: Verdict
  label: string
  /** Centipawns given up, from the mover's point of view. */
  loss: number
  /** How closely the move matched the engine's first choice, as a percentage. */
  accuracy: number
  /** The engine's choice in SAN, when it differs from what was played. */
  best: string | null
}

export type SideReview = {
  accuracy: number
  averageLoss: number
  counts: Record<Verdict, number>
  /** Mistakes and blunders together. */
  errors: number
}

export type Review = {
  moves: MoveReview[]
  white: SideReview
  black: SideReview
}

const emptyCounts = (): Record<Verdict, number> =>
  Object.fromEntries(VERDICTS.map((v) => [v, 0])) as Record<Verdict, number>

/** Winning chances from a centipawn score, using the Lichess curve. */
export function winPercent(cp: number): number {
  const capped = Math.max(-MATE + 10000, Math.min(MATE - 10000, cp))
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * capped)) - 1)
}

function accuracyOf(before: number, after: number): number {
  const value = 103.1668 * Math.exp(-0.04354 * (before - after)) - 3.1669
  return Math.max(0, Math.min(100, value))
}

function terminalScore(fen: string): number | null {
  const chess = new Chess(fen)
  if (chess.isCheckmate()) return -MATE
  if (chess.isGameOver()) return 0
  return null
}

function sanFor(fen: string, uci: string): string | null {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) return null
  try {
    return (
      new Chess(fen).move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci.slice(4, 5) || undefined,
      })?.san ?? null
    )
  } catch {
    return null
  }
}

/**
 * Whether the move leaves a knight or better on a square a cheaper piece can
 * take, which is what makes a sound sacrifice look reckless. It only tests the
 * shape; the engine's score decides whether the sacrifice works.
 */
export function sacrificesMaterial(fenBefore: string, played: string): boolean {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(played)) return false
  const chess = new Chess(fenBefore)
  let move
  try {
    move = chess.move({
      from: played.slice(0, 2) as Square,
      to: played.slice(2, 4) as Square,
      promotion: played.slice(4, 5) || undefined,
    })
  } catch {
    return false
  }
  if (!move) return false
  const value = VALUE[move.piece] ?? 0
  if (value < 3) return false
  const enemy: Color = move.color === 'w' ? 'b' : 'w'
  const attackers = chess.attackers(move.to as Square, enemy)
  if (!attackers.length) return false
  const defenders = chess.attackers(move.to as Square, move.color)
  if (!defenders.length) return true
  const cheapest = Math.min(
    ...attackers.map((square) => VALUE[chess.get(square)?.type ?? 'p'] ?? 1),
  )
  return cheapest < value
}

type Judgement = { verdict: Verdict; loss: number; best: string | null }

/** The engine's evaluation after the move, from the mover's side of the board. */
function scoreAfter(
  input: Pick<PlyInput, 'fenAfter' | 'after' | 'before'>,
): number {
  if (input.after.length > 0) return -input.after[0].cp
  // terminalScore is from the side to move, which is the opponent after the
  // move, so a checkmate we delivered reads as a win for us, not a loss.
  const terminal = terminalScore(input.fenAfter)
  if (terminal !== null) return -terminal
  return input.before[0]?.cp ?? 0
}

/**
 * The score of the move that was actually played, from the mover's side.
 *
 * When the engine listed the played move in the same search as the best one,
 * that score is the one to grade with: both numbers then come from one search,
 * at one depth, on one position. Grading from the next position instead compares
 * two searches that can differ by a few centipawns each, which is exactly the
 * noise that makes a sound move look like an inaccuracy. The next position is
 * the fallback for moves the engine did not list, and a blunder is the one case
 * where that fallback is the more honest number.
 */
function scorePlayed(
  input: Pick<
    PlyInput,
    'fenBefore' | 'fenAfter' | 'played' | 'playedScore' | 'before' | 'after'
  >,
): number {
  if (typeof input.playedScore === 'number') return input.playedScore
  const listed = input.before.find((candidate) => candidate.uci === input.played)
  return listed ? listed.cp : scoreAfter(input)
}

/** Centipawns thrown away, comparing forced mates as mates rather than numbers. */
function lostCentipawns(top: number, after: number): number {
  const wasMating = top >= MATING
  const stillMating = after >= MATING
  // Mate in five and mate in two are the same win.
  if (wasMating && stillMating) return 0
  // A forced mate that is no longer there is the worst kind of move.
  if (wasMating) return MATE
  // Finding a mate never costs anything, however far off it was.
  if (stillMating) return 0
  return Math.max(0, top - after)
}

/** Differences inside the engine's noise are not losses, and never round up. */
function soften(loss: number): number {
  return loss > NOISE ? Math.round(loss) : 0
}

/** Whether a score is level with the best one, treating mates as mates. */
function asGood(top: number, after: number): boolean {
  if (top >= MATING && after >= MATING) return true
  return after >= top - TIE
}

/** The verdict for one move, given the engine's view of both positions. */
export function judge(
  input: Pick<
    PlyInput,
    'fenBefore' | 'fenAfter' | 'played' | 'playedScore' | 'before' | 'after'
  >,
): Judgement {
  const top = input.before[0]
  const second = input.before[1]
  // Positions the engine has not scored (a resigned game, a dead engine) are
  // left unjudged rather than labelled by guesswork.
  if (!top) return { verdict: 'good', loss: 0, best: null }

  const after = scorePlayed(input)
  const loss = soften(lostCentipawns(top.cp, after))
  // A move the engine rates level with its first choice is just as good, even
  // when it was not the line printed first.
  const bestMove = input.played === top.uci || asGood(top.cp, after)
  // A move that is a long way ahead of every alternative is the only one that
  // held the position together: the "great find" a chess site rewards.
  const onlyMove = !!second && top.cp - second.cp >= 100
  // A sound sacrifice is one that keeps at least a playable game, which is why
  // the score after the move has to stay near level rather than merely "fine".
  // The tolerance covers the small drift between scoring the two positions.
  const brilliant =
    bestMove &&
    loss <= 30 &&
    after >= -20 &&
    sacrificesMaterial(input.fenBefore, input.played)

  let verdict: Verdict
  if (brilliant) verdict = 'brilliant'
  else if (bestMove && onlyMove) verdict = 'great'
  else if (bestMove || loss === 0) verdict = 'best'
  else if (loss <= 20) verdict = 'excellent'
  else if (loss <= 50) verdict = 'good'
  else if (loss <= 100) verdict = 'inaccuracy'
  else if (loss <= 250) verdict = 'mistake'
  else verdict = 'blunder'

  return {
    verdict,
    loss,
    best: bestMove ? null : sanFor(input.fenBefore, top.uci),
  }
}

function summarise(moves: MoveReview[]): SideReview {
  const counts = emptyCounts()
  let accuracy = 0
  let total = 0
  for (const move of moves) {
    counts[move.verdict] += 1
    accuracy += move.accuracy
    total += Math.min(1000, move.loss)
  }
  const count = moves.length || 1
  return {
    accuracy: Math.round((moves.length ? accuracy / count : 100) * 10) / 10,
    averageLoss: moves.length ? Math.round(total / count) : 0,
    counts,
    errors: counts.mistake + counts.blunder,
  }
}

/** Turn the engine's per-position scores into a verdict for every move. */
export function reviewGame(plies: PlyInput[]): Review {
  const moves: MoveReview[] = plies.map((ply, index) => {
    const color: Color = index % 2 === 0 ? 'w' : 'b'
    const judged = judge(ply)
    const top = ply.before[0]
    const after = scorePlayed(ply)
    const accuracy = top
      ? accuracyOf(winPercent(top.cp), winPercent(after))
      : 0
    return {
      san: ply.san,
      color,
      verdict: judged.verdict,
      label: LABELS[judged.verdict],
      loss: judged.loss,
      accuracy,
      best: judged.best,
    }
  })
  return {
    moves,
    white: summarise(moves.filter((m) => m.color === 'w')),
    black: summarise(moves.filter((m) => m.color === 'b')),
  }
}
