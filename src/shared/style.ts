import { Chess, type Move, type PieceSymbol } from 'chess.js'
import { PLAYER_BOOK_LINES } from './player-book-data'
import type { Persona, PersonaKey } from './players'

const VALUE: Record<PieceSymbol, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 0,
}

export type Candidate = { uci: string; cp: number }

/**
 * How often each player puts a given piece on a given square, counted from the
 * opening lines in their own games. Keyed by ply so "Black's first move" and
 * "White's fourth move" are separate habits; the board position decides which
 * of those habits are legal here.
 */
type Habits = {
  byPly: Map<number, Map<string, number>>
  plyTotals: Map<number, number>
  overall: Map<string, number>
  overallTotal: number
}

const HABITS = new Map<PersonaKey, Habits>()
// What the field plays, as a mean share per ply, so a habit can be scored by
// how much more often this player plays it than everybody else does. A move
// everybody plays (1.e4) says nothing; a move only one player reaches for does.
const FIELD = new Map<number, Map<string, number>>()
const FIELD_OVERALL = new Map<string, number>()

for (const [key, book] of Object.entries(PLAYER_BOOK_LINES)) {
  const habits: Habits = {
    byPly: new Map(),
    plyTotals: new Map(),
    overall: new Map(),
    overallTotal: 0,
  }
  for (const colour of ['w', 'b'] as const)
    for (const [line, count] of book[colour]) {
      const chess = new Chess()
      for (const [ply, uci] of line.split(' ').entries()) {
        let move: Move | null
        try {
          move = chess.move({
            from: uci.slice(0, 2),
            to: uci.slice(2, 4),
            promotion: uci.slice(4, 5) || undefined,
          })
        } catch {
          break
        }
        if (!move) break
        const habit = `${move.piece}${move.to}`
        const at = habits.byPly.get(ply) ?? new Map<string, number>()
        at.set(habit, (at.get(habit) ?? 0) + count)
        habits.byPly.set(ply, at)
        habits.plyTotals.set(ply, (habits.plyTotals.get(ply) ?? 0) + count)
        habits.overall.set(habit, (habits.overall.get(habit) ?? 0) + count)
        habits.overallTotal += count
      }
    }
  HABITS.set(key as PersonaKey, habits)
}

const SMOOTH = 0.02

for (const habits of HABITS.values()) {
  for (const [ply, at] of habits.byPly) {
    const total = habits.plyTotals.get(ply) ?? 0
    if (!total) continue
    const field = FIELD.get(ply) ?? new Map<string, number>()
    for (const [habit, count] of at)
      field.set(habit, (field.get(habit) ?? 0) + count / total)
    FIELD.set(ply, field)
  }
  for (const [habit, count] of habits.overall)
    FIELD_OVERALL.set(
      habit,
      (FIELD_OVERALL.get(habit) ?? 0) +
        count / (habits.overallTotal || 1),
    )
}

for (const field of FIELD.values())
  for (const [habit, share] of field)
    field.set(habit, share / HABITS.size)
for (const [habit, share] of FIELD_OVERALL)
  FIELD_OVERALL.set(habit, share / HABITS.size)

/** How much more (or less) often this player plays the move than the field. */
const unusual = (share: number, field: number) =>
  Math.log((share + SMOOTH) / (field + SMOOTH))

/**
 * How typical this move is of the player, in centipawns of pure flavour. It is
 * what keeps a persona recognisable once the opponent leaves the exact lines
 * its book was built from: Gukesh still reaches for ...c5, Karpov for ...Nf6
 * and ...e5, because those are the moves their own games are made of.
 */
function habitScore(persona: Persona, chess: Chess, move: Move): number {
  const habits = HABITS.get(persona.key)
  if (!habits) return 0
  // Only the opening needs this; later on the engine's own judgement leads.
  const ply = chess.history().length
  if (ply > 20) return 0
  const habit = `${move.piece}${move.to}`
  const at = habits.byPly.get(ply)
  const total = habits.plyTotals.get(ply) ?? 0
  const share = at && total ? (at.get(habit) ?? 0) / total : 0
  const overall = habits.overallTotal
    ? (habits.overall.get(habit) ?? 0) / habits.overallTotal
    : 0
  const score =
    60 * unusual(share, FIELD.get(ply)?.get(habit) ?? 0) +
    20 * unusual(overall, FIELD_OVERALL.get(habit) ?? 0)
  return Math.max(-80, Math.min(80, score))
}

/**
 * How much a persona likes a move, in centipawns of pure flavour. This does
 * not judge the move's strength; the engine's own score does that. It only
 * decides which of several good moves the player would be drawn to.
 */
export function taste(chess: Chess, move: Move, persona: Persona): number {
  const a = persona.aggression,
    c = persona.complexity
  let score = 0
  if (move.san.includes('#')) score += 140 * a
  if (chess.inCheck()) score += 48 * a
  if (move.captured) score += 24 * a
  if (move.promotion) score += 40 * a
  // A piece offered to a cheaper attacker is the signature of a human
  // attacker, and a habit of the engines' play it.
  const offered = VALUE[move.piece] - (move.captured ? VALUE[move.captured] : 0)
  if (offered > 150 && chess.isAttacked(move.to, chess.turn())) score += 75 * a
  const rank = Number(move.to[1])
  if (move.piece === 'p' && (rank >= 5 || rank <= 4)) score += 14 * a
  if (move.san === 'O-O' || move.san === 'O-O-O') score += 20 * (1 - a)
  const back =
    move.piece === 'n' || move.piece === 'b' ? Number(move.from[1]) : 0
  if (!move.captured && (back === 1 || back === 8)) score += 12 * (1 - a)
  if (!move.captured) score += 8 * c
  return score
}

/**
 * Pick among engine candidates, favouring the persona's tastes without
 * discarding the engine's judgement: only moves within a small window of the
 * best one are eligible, and their weight decays with the centipawns they give
 * up.
 */
export function chooseStyled(
  candidates: Candidate[],
  chess: Chess,
  persona: Persona,
  roll = Math.random(),
): string | null {
  if (!candidates.length) return null
  const best = Math.max(...candidates.map((candidate) => candidate.cp))
  const window = 25 + 55 * persona.aggression
  const weighted: { uci: string; weight: number }[] = []
  for (const candidate of candidates) {
    if (candidate.cp < best - window) continue
    const board = new Chess(chess.fen())
    let flavour = 0
    let habit = 0
    try {
      const move = board.move({
        from: candidate.uci.slice(0, 2),
        to: candidate.uci.slice(2, 4),
        promotion: candidate.uci.slice(4, 5) || undefined,
      })
      if (move) {
        flavour = taste(board, move, persona)
        habit = habitScore(persona, chess, move)
      }
    } catch {
      continue
    }
    // Habits get a sharper scale than taste: the point of them is to make two
    // players answer the same position differently, not to nudge a coin flip.
    weighted.push({
      uci: candidate.uci,
      weight: Math.exp(
        (flavour + (candidate.cp - best) * 1.4) / 90 + habit / 50,
      ),
    })
  }
  if (!weighted.length) return candidates[0].uci
  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0)
  let target = roll * total
  for (const entry of weighted) {
    target -= entry.weight
    if (target <= 0) return entry.uci
  }
  return weighted[weighted.length - 1].uci
}
