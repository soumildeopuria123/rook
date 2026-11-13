import { Chess } from 'chess.js'

/**
 * Opening lines in coordinate notation, from both sides of the board. The book
 * is built by replaying them, so it answers a position rather than a move
 * order: an opponent who deviates leaves the book and meets the search.
 */
export const OPENING_LINES: string[] = [
  // 1. e4 e5 — Italian, Ruy Lopez, Scotch and the two knights.
  'e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 c2c3 g8f6 d2d3 d7d6 e1g1 e8g8',
  'e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 d2d3 g8f6 c2c3 d7d6',
  'e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4 g8f6 e1g1 f8e7 f1e1 b7b5 a4b3 d7d6 c2c3 e8g8',
  'e2e4 e7e5 g1f3 b8c6 f1b5 g8f6 e1g1 f6e4 d2d4 e4d6 b5c6 d7c6 d4e5 d6f5',
  'e2e4 e7e5 g1f3 b8c6 d2d4 e5d4 f3d4 g8f6 d4c6 b7c6 e4e5 d8e7',
  'e2e4 e7e5 g1f3 b8c6 f1c4 g8f6 f3g5 d7d5 e4d5 f6d5',
  // 1. e4 c5 — the Sicilian, both Najdorf and Sveshnikov shapes.
  'e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 a7a6',
  'e2e4 c7c5 g1f3 b8c6 d2d4 c5d4 f3d4 g8f6 b1c3 e7e5',
  'e2e4 c7c5 b1c3 b8c6 g2g3 g7g6 f1g2 f8g7 d2d3 d7d6',
  // 1. e4 e6, c6, d5, d6 and Nf6.
  'e2e4 e7e6 d2d4 d7d5 b1c3 g8f6',
  'e2e4 e7e6 d2d4 d7d5 e4e5 c7c5 c2c3 b8c6',
  'e2e4 c7c6 d2d4 d7d5 b1c3 d5e4 c3e4 c8f5 e4g3 f5g6 h2h4 h7h6',
  'e2e4 d7d5 e4d5 d8d5 b1c3 d5a5 d2d4 g8f6 g1f3 c7c6',
  'e2e4 d7d6 d2d4 g8f6 b1c3 g7g6 g1f3 f8g7 f1e2 e8g8',
  'e2e4 g8f6 e4e5 f6d5 d2d4 d7d6 g1f3 g7g6',
  // 1. d4 — Queen's Gambit, Slav, Nimzo-Indian, King's Indian and London.
  'd2d4 d7d5 c2c4 e7e6 b1c3 g8f6 c1g5 f8e7 e2e3 e8g8 g1f3 h7h6',
  'd2d4 d7d5 c2c4 c7c6 g1f3 g8f6 b1c3 d5c4 a2a4 c8f5',
  'd2d4 g8f6 c2c4 e7e6 b1c3 f8b4 e2e3 e8g8 f1d3 d7d5 g1f3 c7c5',
  'd2d4 g8f6 c2c4 g7g6 b1c3 f8g7 e2e4 d7d6 g1f3 e8g8 f1e2 e7e5',
  'd2d4 d7d5 c1f4 g8f6 e2e3 e7e6 g1f3 c7c5 c2c3 b8c6',
  'd2d4 f7f5 g2g3 g8f6 f1g2 e7e6 g1f3 f8e7',
  // 1. c4 and 1. Nf3.
  'c2c4 e7e5 b1c3 g8f6 g2g3 d7d5 c4d5 f6d5 f1g2 d5b6',
  'g1f3 d7d5 d2d4 g8f6 c2c4 e7e6',
]

const BOOK = new Map<string, string[]>()
// En passant does not change what is playable here, so it is not part of the
// key: a transposition should still find its book move.
const key = (fen: string) => fen.split(' ').slice(0, 3).join(' ')

for (const line of OPENING_LINES) {
  const chess = new Chess()
  let valid = true
  for (const uci of line.split(' ')) {
    const from = uci.slice(0, 2)
    const to = uci.slice(2, 4)
    const promotion = uci.slice(4) || undefined
    const before = key(chess.fen())
    try {
      const move = chess.move({ from, to, promotion })
      const replies = BOOK.get(before) ?? []
      if (!replies.includes(move.san)) replies.push(move.san)
      BOOK.set(before, replies)
    } catch {
      // A malformed line is dropped rather than breaking the page; the tests
      // replay every line and fail on the typo.
      valid = false
      break
    }
  }
  if (!valid) continue
}

/** Book replies for this exact position, ready to play (SAN). */
export function bookMoves(fen: string): string[] {
  return BOOK.get(key(fen)) ?? []
}

export function bookMove(fen: string): string | null {
  const replies = bookMoves(fen)
  if (!replies.length) return null
  return replies[Math.floor(Math.random() * replies.length)]
}
