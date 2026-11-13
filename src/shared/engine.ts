import { Chess, type Color, type Move, type PieceSymbol } from 'chess.js'
import { BOTS, type Bot } from './bots'
import { bookMove } from './book'

const VALUES: Record<PieceSymbol, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 0,
}
const MATE = 100000
// Most advanced passed pawns are worth far more than a knight.
const PASSED = [0, 8, 18, 38, 68, 110, 160]

// Piece-square tables from White's side of the board, indexed a8 to h1.
// Black reads the same table mirrored across the board.
const PAWNS = [
  0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30,
  20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10,
  0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0,
]
const KNIGHTS = [
  -50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30,
  0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20,
  20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20,
  -40, -50, -40, -30, -30, -30, -30, -40, -50,
]
const BISHOPS = [
  -20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0,
  5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10,
  0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20,
  -10, -10, -10, -10, -10, -10, -20,
]
const ROOKS = [
  0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0,
  -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0,
  0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0,
]
const QUEENS = [
  -20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5,
  5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5,
  5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10,
  -10, -20,
]
const KING_MIDDLE = [
  -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40,
  -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40,
  -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20,
  -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20,
]
const KING_END = [
  -50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30,
  -30, -10, 20, 30, 30, 20, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30,
  -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -30,
  0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50,
]
const TABLES: Record<Exclude<PieceSymbol, 'k'>, readonly number[]> = {
  p: PAWNS,
  n: KNIGHTS,
  b: BISHOPS,
  r: ROOKS,
  q: QUEENS,
}

class Timeout extends Error {}

const file = (square: string) => square.charCodeAt(0) - 97
const rankOf = (square: string) => Number(square[1])
const whiteIndex = (square: string) => (8 - rankOf(square)) * 8 + file(square)
const blackIndex = (square: string) => (rankOf(square) - 1) * 8 + file(square)

/** Centipawns from White's perspective. */
function evaluate(chess: Chess): number {
  const board = chess.board()
  let heavy = 0
  const bishops: Record<Color, number> = { w: 0, b: 0 }
  const pawns: Record<Color, number[]> = {
    w: [0, 0, 0, 0, 0, 0, 0, 0],
    b: [0, 0, 0, 0, 0, 0, 0, 0],
  }
  // Most advanced pawn per file, used to spot passed pawns.
  const advanced: Record<Color, number[]> = {
    w: [9, 9, 9, 9, 9, 9, 9, 9],
    b: [0, 0, 0, 0, 0, 0, 0, 0],
  }
  const kings: Record<Color, string | null> = { w: null, b: null }
  for (const row of board)
    for (const piece of row) {
      if (!piece) continue
      if (piece.type !== 'p' && piece.type !== 'k')
        heavy += VALUES[piece.type]
      if (piece.type === 'k') kings[piece.color] = piece.square
      if (piece.type === 'b') bishops[piece.color] += 1
      if (piece.type === 'p') {
        const f = file(piece.square),
          r = rankOf(piece.square)
        pawns[piece.color][f] += 1
        if (piece.color === 'w') advanced.w[f] = Math.min(advanced.w[f], r)
        else advanced.b[f] = Math.max(advanced.b[f], r)
      }
    }
  // 1 with the full army still on the board, 0 in a bare endgame.
  const phase = Math.min(1, heavy / 3200)
  let score = 0
  for (const row of board)
    for (const piece of row) {
      if (!piece) continue
      const f = file(piece.square),
        r = rankOf(piece.square)
      const index =
        piece.color === 'w' ? whiteIndex(piece.square) : blackIndex(piece.square)
      let value = VALUES[piece.type]
      if (piece.type === 'k')
        value += Math.round(
          KING_MIDDLE[index] * phase + KING_END[index] * (1 - phase),
        )
      else value += TABLES[piece.type][index]
      if (piece.type === 'p') {
        let passed = true
        for (let d = -1; d <= 1 && passed; d++) {
          const next = f + d
          if (next < 0 || next > 7) continue
          if (piece.color === 'w' ? advanced.b[next] > r : advanced.w[next] < r)
            passed = false
        }
        if (passed) {
          const steps = piece.color === 'w' ? r - 2 : 7 - r
          value += Math.round(PASSED[Math.max(0, steps)] * (1 + (1 - phase)))
        }
        if (pawns[piece.color][f] > 1) value -= 12
      }
      if (piece.type === 'r') {
        const own = pawns[piece.color][f],
          other = pawns[piece.color === 'w' ? 'b' : 'w'][f]
        if (!own) value += other ? 10 : 20
      }
      score += piece.color === 'w' ? value : -value
    }
  if (bishops.w >= 2) score += 30
  if (bishops.b >= 2) score -= 30
  // An exposed king is a middlegame problem; in the endgame it is a target.
  if (phase > 0.25) {
    for (const color of ['w', 'b'] as Color[]) {
      const king = kings[color]
      if (!king) continue
      let shield = 0
      for (let d = -1; d <= 1; d++) {
        const next = file(king) + d
        if (next >= 0 && next <= 7 && pawns[color][next] > 0) shield += 1
      }
      const penalty = Math.round((3 - shield) * 12 * phase)
      score += color === 'w' ? -penalty : penalty
    }
  }
  // Converting a won endgame: drive the lone king to the edge and bring ours.
  if (phase < 0.4 && Math.abs(score) > 250) {
    const strong: Color = score > 0 ? 'w' : 'b'
    const weakColor: Color = strong === 'w' ? 'b' : 'w'
    const mine = kings[strong]
    const theirs = kings[weakColor]
    if (mine && theirs) {
      const edge = Math.max(
        Math.abs(file(theirs) - 3.5),
        Math.abs(rankOf(theirs) - 3.5),
      )
      const close =
        14 -
        (Math.abs(file(mine) - file(theirs)) +
