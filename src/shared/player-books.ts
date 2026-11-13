import { Chess } from 'chess.js'
import { PLAYER_BOOK_LINES } from './player-book-data'
import type { PersonaKey } from './players'

// En passant is left out of the key: it only matters for the single move right
// after a double push, while leaving it in hides transpositions that a book
// should still answer.
const key = (fen: string) => fen.split(' ').slice(0, 3).join(' ')

/**
 * Position → replies, per player, weighted by how often that player chose each
 * reply in their own games. Built once from the generated line table.
 */
const BOOKS = new Map<string, Map<string, Map<string, number>>>()

for (const [persona, book] of Object.entries(PLAYER_BOOK_LINES)) {
  const positions = new Map<string, Map<string, number>>()
  for (const colour of ['w', 'b'] as const)
    for (const [line, count] of book[colour]) {
      const chess = new Chess()
      for (const uci of line.split(' ')) {
        const before = key(chess.fen())
        let san: string
        try {
          san = chess.move({
            from: uci.slice(0, 2),
            to: uci.slice(2, 4),
            promotion: uci.slice(4, 5) || undefined,
          }).san
        } catch {
          break
        }
        const replies = positions.get(before) ?? new Map<string, number>()
        replies.set(san, (replies.get(san) ?? 0) + count)
        positions.set(before, replies)
      }
    }
  BOOKS.set(persona, positions)
}

/** The moves this player has actually played here, most common first. */
export function playerBookMoves(persona: PersonaKey, fen: string): string[] {
  const replies = BOOKS.get(persona)?.get(key(fen))
  if (!replies) return []
  return [...replies.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([san]) => san)
}

/** A reply chosen the way the player chose it, by frequency in their games. */
export function playerBookMove(persona: PersonaKey, fen: string): string | null {
  const replies = BOOKS.get(persona)?.get(key(fen))
  if (!replies) return null
  let total = 0
  for (const count of replies.values()) total += count
  let target = Math.random() * total
  for (const [san, count] of replies) {
    target -= count
    if (target <= 0) return san
  }
  return replies.keys().next().value ?? null
}

/** How many positions this player's book covers, for the tests and the docs. */
export function playerBookSize(persona: PersonaKey): number {
  return BOOKS.get(persona)?.size ?? 0
}
