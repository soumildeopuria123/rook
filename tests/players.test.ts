import { describe, expect, test } from 'bun:test'
import { Chess } from 'chess.js'
import { BOTS } from '../src/shared/bots'
import { PLAYER_BOOK_LINES } from '../src/shared/player-book-data'
import {
  playerBookMove,
  playerBookMoves,
  playerBookSize,
} from '../src/shared/player-books'
import { PERSONAS, type Persona } from '../src/shared/players'
import { chooseStyled, taste } from '../src/shared/style'

const at = (moves: string[]) => {
  const chess = new Chess()
  for (const move of moves) chess.move(move)
  return chess
}
const play = (fen: string, san: string) => {
  const chess = new Chess(fen)
  const move = chess.move(san)
  return { chess, move }
}

describe('player personas', () => {
  test('each one is on the roster with its own rating', () => {
    for (const persona of PERSONAS) {
      const bot = BOTS.find((entry) => entry.persona === persona.key)
      expect(bot).toBeDefined()
      expect(bot!.elo).toBe(persona.elo)
      expect(bot!.engine).toBe('stockfish')
      // A persona never abandons its own repertoire for an engine move in the
      // opening, which is what used to make two players open identically.
      expect(bot!.book).toBe(1)
    }
  })
  test('the books were built from games with both colours', () => {
    for (const persona of PERSONAS) {
      const book = PLAYER_BOOK_LINES[persona.key]
      expect(book.w.length).toBeGreaterThan(8)
      expect(book.b.length).toBeGreaterThan(8)
      expect(playerBookSize(persona.key)).toBeGreaterThan(30)
    }
  })
  test('every generated line is legal and starts from the standard position', () => {
    for (const book of Object.values(PLAYER_BOOK_LINES))
      for (const [line] of [...book.w, ...book.b]) {
        const chess = new Chess()
        for (const uci of line.split(' '))
          chess.move({
            from: uci.slice(0, 2),
            to: uci.slice(2, 4),
            promotion: uci.slice(4, 5) || undefined,
          })
        expect(chess.history()).toHaveLength(16)
      }
  })
  test('a player replies with a move from their own games', () => {
    const start = new Chess().fen()
    for (const persona of PERSONAS)
      expect(playerBookMoves(persona.key, start).length).toBeGreaterThan(0)
    const afterE4 = at(['e4']).fen()
    for (const persona of PERSONAS)
      expect(playerBookMoves(persona.key, afterE4).length).toBeGreaterThan(0)
  })
  test('the book runs out of a position the player has never had', () => {
    expect(playerBookMove('carlsen', at(['h3']).fen())).toBeNull()
  })
})

describe('player style', () => {
  const attacking: Persona = {
    ...PERSONAS[0],
    aggression: 0.95,
    complexity: 0.8,
  }
  const solid: Persona = { ...PERSONAS[0], aggression: 0.05, complexity: 0.2 }

  test('a check is worth more to an attacker than to a positional player', () => {
    const fen = at(['e4', 'f5']).fen()
    const check = play(fen, 'Qh5+')
    const quiet = play(fen, 'Nf3')
    // How much the persona prefers the check over the quiet developing move.
    const swing = (persona: Persona) =>
      taste(check.chess, check.move, persona) -
      taste(quiet.chess, quiet.move, persona)
    expect(swing(attacking)).toBeGreaterThan(30)
    expect(swing(attacking)).toBeGreaterThan(swing(solid))
  })
  test('a positional player likes castling more than an attacker does', () => {
    const fen = at(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5']).fen()
    const castle = play(fen, 'O-O')
    const develop = play(fen, 'd3')
    const lean = (persona: Persona) =>
      taste(castle.chess, castle.move, persona) -
      taste(develop.chess, develop.move, persona)
    expect(lean(solid)).toBeGreaterThan(lean(attacking))
  })
  test('the styled choice only considers moves close to the engine best', () => {
    const chess = at(['e4', 'e5'])
    const candidates = [
      { uci: 'g1f3', cp: 40 },
      { uci: 'f1c4', cp: 30 },
      { uci: 'd2d4', cp: -250 },
    ]
    for (let i = 0; i < 30; i++)
      expect(['g1f3', 'f1c4']).toContain(
        chooseStyled(candidates, chess, attacking)!,
      )
    expect(chooseStyled([], chess, attacking)).toBeNull()
  })
  test('a clear engine favourite survives the style filter', () => {
    const chess = at(['e4', 'e5'])
    expect(
      chooseStyled(
        [
          { uci: 'd1h5', cp: 900 },
          { uci: 'g1f3', cp: 20 },
        ],
        chess,
        attacking,
      ),
    ).toBe('d1h5')
  })

  test('two players answer the same opening differently', () => {
    const chess = at(['d4'])
    const candidates = [
      { uci: 'c7c5', cp: 25 },
      { uci: 'g8f6', cp: 25 },
      { uci: 'e7e5', cp: 25 },
    ]
    const leanings = (key: string) => {
      const persona = PERSONAS.find((entry) => entry.key === key)!
      const counts = new Map<string, number>()
      for (let i = 0; i < 400; i++) {
        const uci = chooseStyled(candidates, chess, persona, i / 400)!
        counts.set(uci, (counts.get(uci) ?? 0) + 1)
      }
      return counts
    }
    const gukesh = leanings('gukesh')
    const karpov = leanings('karpov')
    // Gukesh's games are full of ...c5 here; Karpov's are ...Nf6 and ...e5, so
    // neither player's reply can collapse into the other's.
    expect(gukesh.get('c7c5')!).toBeGreaterThan(karpov.get('c7c5')! * 2)
    expect(karpov.get('g8f6')!).toBeGreaterThan(gukesh.get('g8f6')!)
  })
})
